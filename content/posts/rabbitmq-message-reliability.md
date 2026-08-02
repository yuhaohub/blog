---
title: RabbitMQ 消息可靠性：从生产者到消费者
slug: rabbitmq-message-reliability
publishedAt: "2024-11-24"
date: "2024.11.24"
category: 工程实践
excerpt: 从生产者确认、消息持久化、消费者重试到业务幂等，系统梳理 RabbitMQ 消息可靠性的关键环节。
readTime: 10 分钟
---

在消息队列中，生产者、MQ 服务端和消费者的任意一个环节出现问题，都可能导致消息丢失或重复处理。要保证消息可靠性，需要分别考虑生产者可靠性、MQ 可靠性和消费者可靠性。

## 生产者可靠性

### 生产者重试

生产者发送消息时，可能因为网络故障导致与 MQ 的连接中断，因此通常需要配置重试机制。Spring AMQP 的默认重试是阻塞式重试：当前线程会等待重试完成，在高并发场景下可能造成线程阻塞和性能下降。

因此，重试次数和间隔应根据业务设置，必要时配合异步化、超时控制和失败记录，避免大量线程长时间等待。

### 生产者确认

RabbitMQ 常见的生产者确认机制包括 Publisher Confirm 和 Publisher Return。

- **Publisher Confirm**：确认消息是否成功到达 Exchange，但不关心消息是否路由到队列，解决“消息是否成功发出”的问题。
- **Publisher Return**：确认消息是否从 Exchange 成功路由到 Queue。当消息无法路由到任何队列时，RabbitMQ 会通过回调将消息返回给生产者，解决“消息是否被队列接收”的问题。

#### Publisher Confirm

通过配置文件开启 Publisher Confirm 和 Publisher Return：

```yaml
spring:
  rabbitmq:
    publisher-confirm-type: correlated
    publisher-returns: true
```

`publisher-confirm-type` 有三种模式：

- `none`：关闭 Confirm 机制；
- `simple`：同步阻塞等待 MQ 回执；
- `correlated`：通过异步回调接收 MQ 回执。

发送消息时，可以传入 `CorrelationData`，根据 MQ 返回的 ACK 或 NACK 判断消息是否成功：

```java
@Test
public void testConfirmCallback() {
    CorrelationData correlationData = new CorrelationData();
    correlationData.getFuture().addCallback(
            new ListenableFutureCallback<CorrelationData.Confirm>() {
                @Override
                public void onFailure(Throwable ex) {
                    // 异常处理逻辑
                }

                @Override
                public void onSuccess(CorrelationData.Confirm result) {
                    if (result.isAck()) {
                        // 生产者发送消息成功
                    } else {
                        // NACK：生产者发送消息失败
                        String reason = result.getReason();
                    }
                }
            }
    );

    rabbitTemplate.convertAndSend(
            "交换机", "路由键", "message", correlationData
    );
}
```

#### Publisher Return

可以为 `RabbitTemplate` 设置 ReturnsCallback，处理无法路由到队列的消息：

```java
@Configuration
public class MQConfig implements ApplicationContextAware {

    @Override
    public void setApplicationContext(ApplicationContext context)
            throws BeansException {
        RabbitTemplate rabbitTemplate = context.getBean(RabbitTemplate.class);
        rabbitTemplate.setReturnsCallback(
                returnedMessage -> {
                    // 处理无法路由的消息
                }
        );
    }
}
```

## MQ 可靠性

消息如果只保存在内存中，会有两个问题：MQ 重启后消息丢失；消息积压时内存空间有限，最终可能导致 MQ 阻塞。

### 数据持久化

需要分别关注以下三类持久化：

- **交换机持久化**；
- **队列持久化**；
- **消息持久化**。

只有三者都正确配置，消息才具备较完整的持久化保障。

### LazyQueue

LazyQueue 会尽量将消息落盘，降低大量消息积压时的内存压力，适合消息量大、消费速度相对较慢的场景。

![RabbitMQ LazyQueue 配置与工作原理](../assets/posts/rabbitmq-message-reliability/lazy-queue.png)

## 消费者可靠性

### 消息确认机制

Spring AMQP 支持通过配置文件设置 ACK 处理方式，常见模式有三种：

- `none`：不处理确认。消息投递给消费者后立即 ACK，并从 MQ 删除，安全性最低，不建议使用；
- `manual`：手动确认。业务代码显式调用 API 发送 ACK 或 Reject，存在一定业务侵入，但控制最灵活；
- `auto`：自动确认。Spring AMQP 对消息处理逻辑进行增强，业务正常执行时自动 ACK，出现异常时根据异常类型返回 NACK 或 Reject。

![RabbitMQ 消息确认模式配置](../assets/posts/rabbitmq-message-reliability/acknowledge-mode.png)

### 消费者重试

可以配置消费者失败重试的初始间隔、倍数和最大尝试次数：

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        retry:
          enabled: true
          initial-interval: 1000ms
          multiplier: 1
          max-attempts: 3
          stateless: true
```

如果业务中包含事务，可以根据事务边界考虑使用有状态重试（`stateless: false`）。

### 失败处理策略

当重试次数耗尽后，需要通过 `MessageRecoverer` 处理失败消息。常见实现包括：

- `RejectAndDontRequeueRecoverer`：直接 Reject，丢弃消息；
- `ImmediateRequeueMessageRecoverer`：返回 NACK，让消息重新入队；
- `RepublishMessageRecoverer`：将失败消息转发到指定的错误交换机。

![RabbitMQ MessageRecoverer 失败处理流程](../assets/posts/rabbitmq-message-reliability/message-recoverer.png)

例如，可以将失败消息重新发布到错误交换机和错误队列：

```java
@Configuration
@ConditionalOnProperty(
        prefix = "spring.rabbitmq.listener.simple.retry",
        name = "enabled",
        havingValue = "true"
)
public class ErrorConfigMQ {

    @Bean
    public DirectExchange errorExchange() {
        return new DirectExchange("error.direct");
    }

    @Bean
    public Queue errorQueue() {
        return new Queue("error.queue");
    }

    @Bean
    public Binding errorBinding(
            DirectExchange errorExchange,
            Queue errorQueue
    ) {
        return BindingBuilder
                .bind(errorQueue)
                .to(errorExchange)
                .with("error");
    }

    @Bean
    public MessageRecoverer messageRecoverer(
            RabbitTemplate rabbitTemplate
    ) {
        return new RepublishMessageRecoverer(
                rabbitTemplate, "error.direct", "error"
        );
    }
}
```

### 业务幂等性

幂等性是指同一个业务执行一次或多次，对业务状态产生的影响是一致的。数学上可以用 `f(x) = f(f(x))` 表示，例如绝对值函数就是幂等的。

消息系统中，重试、网络抖动或消费者确认超时都可能导致同一条消息被重复投递，因此消费端必须具备幂等处理能力。常见做法包括：

- 为消息设置唯一消息 ID，并记录处理状态；
- 结合业务主键或唯一索引判断是否已经处理；
- 将“判断是否处理过”和“更新业务状态”放入同一个本地事务。

## 总结

消息可靠性不是单个配置项能够解决的问题，而是由生产者确认、MQ 持久化、消费者确认与重试、失败消息处理以及业务幂等共同构成。只有把生产、存储、投递和消费各环节串起来，才能在消息丢失、重复和消费失败时都拥有可恢复的处理路径。
