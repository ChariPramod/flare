import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('monaco-editor/package.json'));
await mkdir('public/monaco', { recursive: true });
await cp(join(root, 'min/vs'), 'public/monaco/vs', { recursive: true });
