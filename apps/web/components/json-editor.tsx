'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
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
  const [theme, setTheme] = useState<'light' | 'vs-dark'>('light');
  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setTheme(root.dataset.theme === 'dark' ? 'vs-dark' : 'light');
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="json-editor">
      <Editor
        height={height}
        language={language}
        theme={theme}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          // Keep native textarea input across browsers and assistive technologies.
          editContext: false,
          minimap: { enabled: false },
          fontSize: 13,
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
