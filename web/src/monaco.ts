// Bundle Monaco locally (no CDN) so the demo works fully offline.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

monaco.editor.defineTheme("codecage", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "5b6b82", fontStyle: "italic" },
    { token: "keyword", foreground: "7ff5dd" },
    { token: "string", foreground: "fcd34d" },
    { token: "number", foreground: "f9a8d4" },
    { token: "type", foreground: "93c5fd" },
  ],
  colors: {
    "editor.background": "#0a0e14",
    "editor.lineHighlightBackground": "#121822",
    "editorLineNumber.foreground": "#33425a",
    "editorLineNumber.activeForeground": "#3fe0c0",
    "editorCursor.foreground": "#3fe0c0",
    "editor.selectionBackground": "#14c7a533",
    "editorIndentGuide.background1": "#1a2230",
    "editorGutter.background": "#0a0e14",
  },
});
