import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox, emitAgentEvent } from '@deepseek-ai/dsh-agent'
import type {
  Agent,
  AgentFactory,
  AgentHandle,
  AgentOptions,
  AgentStatus,
  CancelOptions,
  CreateAgentOptions,
  InboxTarget,
} from '@deepseek-ai/dsh-agent'
import {
  BlockAssembler,
  createAssistantMessage,
  createUserMessage,
  LlmAdapter,
  LlmRuntime,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { AgentCancelCause, Session, UserMessage } from '@deepseek-ai/dsh-session'

class DeterministicAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const prompt = options.messages
      .flatMap(message => message.content)
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join(' ')
    const text = `deterministic reply: ${prompt}`

    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** A deliberately small driver: one follow-up, one model call, no tools or resume. */
class SingleTurnAgent implements Agent {
  readonly inbox: Inbox
  readonly ctx: Context
  private state: AgentStatus = 'idle'
  private activity: Promise<void> = Promise.resolve()
  private abort: AbortController | undefined

  constructor(
    private readonly rootCtx: Context,
    readonly id: SessionId,
    readonly options: AgentOptions,
    readonly session: Session,
    ownerCtx: Context,
  ) {
    this.ctx = ownerCtx.extend({ agent: this })
    this.inbox = new Inbox(session, {
      inserted: message => emitAgentEvent(rootCtx, this, 'agent/inbox/inserted', { message }),
      discarded: message => emitAgentEvent(rootCtx, this, 'agent/inbox/discarded', { message }),
      claimed: (message, turn) => emitAgentEvent(rootCtx, this, 'agent/inbox/claimed', { message, turn }),
    })
  }

  get status(): AgentStatus {
    return this.state
  }

  private setStatus(status: AgentStatus): void {
    if (this.state === status) return
    this.state = status
    emitAgentEvent(this.rootCtx, this, 'agent/status', { status })
  }

  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void {
    this.inbox.append(target, message)
    if (wakeup && this.status === 'idle') this.start()
  }

  followup(message: UserMessage): void {
    this.send(message, 'next-turn', true)
  }

  steer(message: UserMessage): void {
    this.send(message, 'next-step', true)
  }

  inject(message: UserMessage): void {
    this.send(message, 'next-step', false)
  }

  cancel(cause: AgentCancelCause, options: CancelOptions = {}): void {
    if (!options.keepInbox) this.inbox.clear()
    this.abort?.abort(cause)
  }

  whenIdle(): Promise<void> {
    return this.activity
  }

  runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.status !== 'idle') throw new Error('single-turn agent is busy')
    const abort = new AbortController()
    this.abort = abort
    const result = task(abort.signal)
    this.activity = result.then(() => undefined, () => undefined)
    return result.finally(() => { this.abort = undefined })
  }

  private start(): void {
    const abort = new AbortController()
    this.abort = abort
    this.setStatus('running')
    this.activity = this.rootCtx.agents.withInitiator(this, async () => {
      try {
        await this.runOneTurn(abort.signal)
      } finally {
        this.abort = undefined
        this.setStatus('idle')
      }
    })
  }

  private async runOneTurn(signal: AbortSignal): Promise<void> {
    const turn = 1
    const step = 1
    this.session.append('turn/start', { turn })
    try {
      const messages = this.inbox.claim('next-turn', turn)
      this.session.append('step/start', { turn, step })
      try {
        for (const message of messages) {
          this.session.append('user/message', message, { surfaceOp: 'append' })
        }

        const assembler = new BlockAssembler()
        const sourceEventSeqs: number[] = []
        const request: GenerateOptions = {
          provider: this.options.provider ?? 'deterministic',
          model: this.options.model ?? 'fixture-model',
          messages: this.session.deriveMessages(),
          sessionId: this.id,
          signal,
        }
        for await (const chunk of this.rootCtx.llm.stream(request)) {
          sourceEventSeqs.push(this.session.append('assistant/chunk', { turn, step, chunk }).seq)
          assembler.push(chunk)
        }
        if (assembler.finish.kind !== 'stop') {
          throw new Error(`unexpected finish: ${assembler.finish.kind}`)
        }
        this.session.append('assistant/message', {
          turn,
          step,
          message: createAssistantMessage({
            content: assembler.blocks(),
            source: { provider: request.provider, model: request.model },
          }),
          ...(assembler.usage === undefined ? {} : { usage: assembler.usage }),
        }, { surfaceOp: 'append', sourceEventSeqs })
      } finally {
        this.session.append('step/end', { turn, step })
      }
      this.session.append('turn/end', { turn, reason: { kind: 'completed' } })
    } catch (error) {
      this.session.append('turn/end', {
        turn,
        reason: signal.aborted
          ? { kind: 'aborted', reason: signal.reason as AgentCancelCause }
          : { kind: 'error', error: { code: 'EXPERIMENT', message: String(error) } },
      })
      throw error
    }
  }
}

class SingleTurnFactory implements AgentFactory {
  constructor(private readonly ctx: Context) {}

  async createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> {
    const session = this.ctx.sessions.create(options.sessionId, {
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    })
    const agent = new SingleTurnAgent(
      this.ctx,
      options.sessionId,
      options.agentOptions ?? {},
      session,
      ownerCtx,
    )
    const setupCommit = await options.setup?.(agent.ctx)
    setupCommit?.commit()
    const unregister = this.ctx.agents.register(agent)
    emitAgentEvent(this.ctx, agent, 'agent/session-start', { source: 'startup' })
    return {
      agent,
      dispose: async () => {
        agent.cancel({ kind: 'disposed' })
        await agent.whenIdle()
        unregister()
      },
    }
  }

  resume(): Promise<AgentHandle> {
    return Promise.reject(new Error('resume is outside this experiment'))
  }
}

const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(SessionStore)
await ctx.plugin(AgentRegistry)

const adapter = new DeterministicAdapter()
ctx.llm.registerAdapter(['deterministic'], adapter)
ctx.agents.setFactory(new SingleTurnFactory(ctx))

const { agent, dispose } = await ctx.agents.create({
  sessionId: SessionId('minimal-loop-demo'),
  agentOptions: { provider: 'deterministic', model: 'fixture-model' },
})

agent.followup(createUserMessage({
  content: [{ type: 'text', text: 'hello plugin loop' }],
  source: { kind: 'user' },
}))
await agent.whenIdle()

const finalMessage = agent.session.deriveMessages().at(-1)
const finalText = finalMessage?.content
  .filter(block => block.type === 'text')
  .map(block => block.text)
  .join('')

console.log(JSON.stringify({
  factory: 'SingleTurnFactory',
  defaultLoopLoaded: ctx.get('agentLoop') !== undefined,
  adapterCalls: adapter.requests.length,
  finalText,
  eventTypes: agent.session.events.map(event => event.type),
}, null, 2))

await dispose()
await ctx.fiber.dispose()
