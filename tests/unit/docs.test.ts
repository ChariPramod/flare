import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  checkDocumentation,
  extractHeadings,
  extractLinks,
  generateCompatibility,
} from '../../scripts/docs.mjs';

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(entries: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'flare-docs-'));
  temporary.push(root);
  const put = (file: string, body: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), body);
  };
  put('docs/legacy-anchors.json', '{}');
  for (const [file, body] of Object.entries(entries)) put(file, body);
  return { root, put, files: Object.keys(entries) };
}

describe('documentation compatibility and local link guard', () => {
  it('retains ordered duplicate headings, setext headings and explicit HTML anchors', () => {
    const source =
      '# Guide\n\n## Repeated\n\n## Repeated\n\n## Repeated-1\n\n## HTTP, TLS & DNS — `test`\n\nUnderlined\n----------\n\n<a id="legacy-section"></a>\n\n```md\n# Not a heading\n```\n';
    const headings = extractHeadings(source);
    expect(headings.map(({ slug }) => slug)).toEqual([
      'guide',
      'repeated',
      'repeated-1',
      'repeated-1-1',
      'http-tls--dns--test',
      'underlined',
    ]);
    const stub = generateCompatibility('docs/old.md', 'docs/guides/current.md', source);
    expect(extractHeadings(stub)).toEqual(
      headings.map((heading, index) => ({ ...heading, line: extractHeadings(stub)[index].line })),
    );
    expect(stub).toContain('<a id="legacy-section"></a>');
    expect(stub).toContain('(guides/current.md#legacy-section)');
    expect(stub).toContain('(guides/current.md#repeated-1)');
  });

  it('checks adjacent inline, image, angle-path, explicit and shortcut reference links outside code', () => {
    const source =
      '[A](guide.md#a) and [B][bee], [bee] and [C](<space name.md> "Title"). ![Picture](asset(1).png)\n\n[bee]: other.md#b "Title"\n<a href="manual.md#legacy">manual</a>\n`[ignore](missing.md)`\n\n~~~md\n[ignore](missing.md)\n~~~\n\n    [ignore](missing.md)\n<!-- [ignore](missing.md) -->\n';
    expect(extractLinks(source).map(({ href }) => href)).toEqual([
      'guide.md#a',
      'other.md#b',
      'other.md#b',
      'space name.md',
      'asset(1).png',
      'manual.md#legacy',
    ]);
  });

  it('generates compatible pages and catches broken files, fragments, reference definitions and tampering', () => {
    const { root, put, files } = fixture({
      'docs/redirects.json': JSON.stringify({ 'docs/old.md': 'docs/guides/current.md' }),
      'docs/legacy-anchors.json': JSON.stringify({
        'docs/old.md': ['current', 'second', 'explicit'],
      }),
      'docs/README.md':
        '# Docs\n\n[Old section](old.md#second) and [New](guides/current.md#second).\n',
      'docs/guides/current.md': '# Current\n\n## Second\n\n<a id="explicit"></a>\n',
      'README.md':
        '# Project\n\n[Start](docs/old.md#second) [Legacy](docs/old.md#explicit) [External](https://example.com/missing).\n',
      'docs/memory/private.md': '[Excluded](does-not-exist.md)',
    });
    expect(checkDocumentation(root, { files, write: true }).errors).toEqual([]);
    const generated = readFileSync(join(root, 'docs/old.md'), 'utf8');
    expect(checkDocumentation(root, { files }).errors).toEqual([]);
    put('docs/old.md', `${generated}\nTampered\n`);
    expect(checkDocumentation(root, { files }).errors).toContain(
      'Stale compatibility page: docs/old.md; run node scripts/docs.mjs --write',
    );
    put(
      'README.md',
      '[Missing file](missing.md) [Missing section](docs/guides/current.md#absent) [Missing ref][unknown]',
    );
    const errors = checkDocumentation(root, { files, write: true }).errors;
    expect(errors).toHaveLength(3);
    expect(errors.join('\n')).toContain('missing local target missing.md');
    expect(errors.join('\n')).toContain('missing section #absent');
    expect(errors.join('\n')).toContain('missing reference [unknown]');
  });

  it('resolves percent-encoded filenames and anchors and supports root progress handoff anchors', () => {
    const { root, files } = fixture({
      'docs/redirects.json': '{}',
      'docs/legacy-anchors.json': JSON.stringify({ 'PROGRESS.md': ['previous-checkpoint'] }),
      'PROGRESS.md':
        '# Current\n\n<a id="previous-checkpoint"></a>\n\n[Old](docs/archive/old%20progress.md#previous-checkpoint)\n',
      'docs/archive/old progress.md':
        '# Previous checkpoint\n\n[Current](../../PROGRESS.md#previous-checkpoint)\n',
    });
    expect(checkDocumentation(root, { files }).errors).toEqual([]);
  });

  it('refuses redirect chains, traversal, memory writes and symlink escapes before writing', () => {
    const outside = mkdtempSync(join(tmpdir(), 'flare-docs-outside-'));
    temporary.push(outside);
    writeFileSync(join(outside, 'outside.md'), '# Outside\n');
    const { root, put, files } = fixture({
      'docs/redirects.json': '{}',
      'docs/legacy-anchors.json': JSON.stringify({ 'docs/second.md': ['canonical'] }),
      'docs/README.md': '# Docs\n',
      'docs/canonical.md': '# Canonical\n',
    });
    symlinkSync(join(outside, 'outside.md'), join(root, 'docs/escape.md'));
    symlinkSync(outside, join(root, 'docs/outside'));
    put(
      'docs/redirects.json',
      JSON.stringify({
        'docs/first.md': 'docs/second.md',
        'docs/second.md': 'docs/canonical.md',
        '../outside.md': 'docs/canonical.md',
        'docs/memory/story.md': 'docs/canonical.md',
        'docs/escape.md': 'docs/canonical.md',
        'docs/outside/new.md': 'docs/canonical.md',
      }),
    );
    const errors = checkDocumentation(root, { files, write: true }).errors;
    expect(errors).toHaveLength(5);
    expect(readFileSync(join(outside, 'outside.md'), 'utf8')).toBe('# Outside\n');
  });

  it('refuses to regenerate a renamed historical heading until an explicit original ID is restored', () => {
    const { root, put, files } = fixture({
      'docs/redirects.json': JSON.stringify({ 'docs/old.md': 'docs/guides/current.md' }),
      'docs/legacy-anchors.json': JSON.stringify({
        'docs/old.md': ['current', 'original-section'],
      }),
      'docs/README.md': '# Docs\n',
      'docs/guides/current.md': '# Current\n\n## Original section\n',
    });
    expect(checkDocumentation(root, { files, write: true }).errors).toEqual([]);
    const originalStub = readFileSync(join(root, 'docs/old.md'), 'utf8');
    put('docs/guides/current.md', '# Current\n\n## Renamed section\n');
    expect(checkDocumentation(root, { files, write: true }).errors.join('\n')).toContain(
      'Historical anchors missing from docs/guides/current.md: #original-section',
    );
    expect(readFileSync(join(root, 'docs/old.md'), 'utf8')).toBe(originalStub);
    put(
      'docs/guides/current.md',
      '# Current\n\n<a id="original-section"></a>\n\n## Renamed section\n',
    );
    expect(checkDocumentation(root, { files, write: true }).errors).toEqual([]);
    expect(readFileSync(join(root, 'docs/old.md'), 'utf8')).toContain(
      '<a id="original-section"></a>',
    );
    expect(checkDocumentation(root, { files }).errors).toEqual([]);
  });

  it('requires a baseline for each redirect and protects unmapped progress anchors', () => {
    const { root, put, files } = fixture({
      'docs/redirects.json': JSON.stringify({ 'docs/old.md': 'docs/current.md' }),
      'docs/legacy-anchors.json': JSON.stringify({ 'PROGRESS.md': ['historical'] }),
      'docs/README.md': '# Docs\n',
      'docs/current.md': '# Current\n',
      'PROGRESS.md': '# Progress\n',
    });
    const errors = checkDocumentation(root, { files, write: true }).errors;
    expect(errors).toContain('Missing historical-anchor baseline: docs/old.md');
    expect(errors).toContain('Historical anchors missing from PROGRESS.md: #historical');
    put(
      'docs/legacy-anchors.json',
      JSON.stringify({ 'PROGRESS.md': ['historical'], 'docs/old.md': ['current'] }),
    );
    put('PROGRESS.md', '# Progress\n\n<a id="historical"></a>\n');
    expect(checkDocumentation(root, { files, write: true }).errors).toEqual([]);
  });
});
