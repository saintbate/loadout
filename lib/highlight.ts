import { createHighlighter, type Highlighter } from "shiki";

const SUPPORTED = new Set([
  "bash",
  "shell",
  "sh",
  "zsh",
  "python",
  "py",
  "javascript",
  "js",
  "typescript",
  "ts",
  "tsx",
  "jsx",
  "json",
  "yaml",
  "yml",
  "html",
  "css",
  "sql",
  "go",
  "rust",
  "ruby",
  "java",
  "markdown",
  "md",
]);

let _highlighter: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!_highlighter) {
    _highlighter = createHighlighter({
      themes: ["github-light"],
      langs: [
        "bash",
        "python",
        "typescript",
        "javascript",
        "tsx",
        "jsx",
        "json",
        "yaml",
        "html",
        "css",
        "sql",
        "go",
        "rust",
        "ruby",
        "java",
        "markdown",
      ],
    });
  }
  return _highlighter;
}

export async function highlight(
  code: string,
  language: string | undefined,
): Promise<string> {
  const lang = (language ?? "").toLowerCase();
  const resolved = SUPPORTED.has(lang) ? lang : "bash";
  const hl = await getHighlighter();
  return hl.codeToHtml(code, {
    lang: resolved,
    theme: "github-light",
  });
}
