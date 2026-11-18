import Editor, { type OnMount } from "@monaco-editor/react";
import { useRef } from "react";

interface Props { language: string; value: string; onChange: (v: string) => void; onRun?: () => void; readOnly?: boolean }

export default function CodeEditor({ language, value, onChange, onRun, readOnly }: Props) {
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const mount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
    editor.focus();
  };
  return (
    <Editor
      height="100%"
      theme="codecage"
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={mount}
      options={{
        fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
        fontSize: 13.5, fontLigatures: true, minimap: { enabled: false }, readOnly,
        scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on", padding: { top: 14, bottom: 14 }, renderLineHighlight: "all",
        bracketPairColorization: { enabled: true }, automaticLayout: true, tabSize: 4,
      }}
    />
  );
}
