import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";

const d2FencePattern = /^ {0,3}```[ \t]*d2(?:[ \t]+([^\n]*?))?[ \t]*\n([\s\S]*?)^ {0,3}```[ \t]*$/gm;
const maxDiagramBytes = 10 * 1024 * 1024;

const markdownRenderer = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, language) {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language }).value;
      }

      return hljs.highlight(code, { language: "plaintext" }).value;
    },
  }),
);

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function compileD2(source, options = {}) {
  const binary = options.binary || process.env.D2_BIN || "d2";
  const salt =
    options.salt ||
    createHash("sha256").update(source).digest("hex").slice(0, 16);
  const args = [
    "--layout=elk",
    "--theme=101",
    "--pad=32",
    "--no-xml-tag",
    `--salt=${salt}`,
    "-",
    "-",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;

    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        fail(
          new Error(
            "发现 D2 代码块，但系统中没有 d2 命令。请先安装 D2，或通过 D2_BIN 指定可执行文件。",
          ),
        );
        return;
      }

      fail(error);
    });

    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxDiagramBytes) {
        child.kill();
        fail(new Error("D2 图表输出超过 10 MB，已停止生成。"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));

    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(
          new Error(
            `D2 图表生成失败：${Buffer.concat(stderr).toString("utf8").trim() || `退出码 ${code}`}`,
          ),
        );
        return;
      }

      settled = true;
      resolve(Buffer.concat(stdout).toString("utf8").trim());
    });

    child.stdin.end(source);
  });
}

async function renderD2Fences(source, renderDiagram) {
  const matches = [...source.matchAll(d2FencePattern)];
  if (matches.length === 0) return { markdown: source, replacements: [] };

  const replacements = await Promise.all(
    matches.map(async ([, caption = "", diagramSource], index) => {
      const salt = createHash("sha256")
        .update(source)
        .update(`\0${index}`)
        .digest("hex")
        .slice(0, 16);
      const svg = await renderDiagram(diagramSource.trimEnd(), { salt });
      const label = caption.trim();
      const captionHtml = label
        ? `<figcaption>${escapeHtml(label)}</figcaption>`
        : "";
      const placeholder = `<div data-d2-placeholder="${index}"></div>`;

      return {
        placeholder,
        html: `<figure class="d2-diagram"${label ? ` aria-label="${escapeHtml(label)}"` : ""}>
  <div class="d2-diagram-canvas">${svg}</div>
  ${captionHtml}
</figure>`,
      };
    }),
  );

  let output = "";
  let cursor = 0;
  matches.forEach((match, index) => {
    output += source.slice(cursor, match.index) + replacements[index].placeholder;
    cursor = match.index + match[0].length;
  });

  return {
    markdown: output + source.slice(cursor),
    replacements,
  };
}

export async function renderMarkdown(source, options = {}) {
  const { markdown, replacements } = await renderD2Fences(
    source,
    options.renderD2 || compileD2,
  );
  let html = await markdownRenderer.parse(markdown, { gfm: true });

  html = html
    .replaceAll("<table>", '<div class="table-scroll"><table>')
    .replaceAll("</table>", "</table></div>");

  for (const replacement of replacements) {
    html = html.replace(replacement.placeholder, replacement.html);
  }

  return html;
}
