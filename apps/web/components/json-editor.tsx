'use client';
import dynamic from 'next/dynamic';
const Editor = dynamic(
  async () => {
    const module = await import('@monaco-editor/react');
    module.loader.config({ paths: { vs: '/monaco/vs' } });
    return module.default;
  },
  { ssr: false, loading: () => <div className="editor-loading">Loading editor…</div> },
);
export function JsonEditor({
  value,
  onChange,
  language = 'json',
  height = 240,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  height?: number;
  readOnly?: boolean;
}) {
  return (
    <div className="json-editor">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          // Keep native textarea input across browsers and assistive technologies.
          editContext: false,
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          readOnly,
          padding: { top: 12 },
        }}
      />
    </div>
  );
}
