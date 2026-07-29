import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";

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

export function renderMarkdown(source) {
  return markdownRenderer.parse(source, { gfm: true });
}
