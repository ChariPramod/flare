// Parse inside an inert template. Rebuild an allowlisted fragment before it reaches an iframe.
// CSP and the empty iframe sandbox remain independent defenses.
export function emailPreview(html: string) {
  if (typeof document === 'undefined') return '';
  const input = document.createElement('template');
  input.innerHTML = html;
  const allowed = new Set(
    'div span p br hr h1 h2 h3 h4 h5 h6 table thead tbody tfoot tr td th ul ol li b strong i em u s blockquote pre code header footer main section article a'.split(
      ' ',
    ),
  );
  const styles = new Set(
    'color background-color font-family font-size font-weight font-style text-align text-decoration line-height margin margin-top margin-bottom padding padding-top padding-bottom border border-color border-width border-style border-collapse width max-width height'.split(
      ' ',
    ),
  );
  let budget = 20000;
  const copy = (node: Node, depth: number): Node | null => {
    if (--budget < 0 || depth > 100) return null;
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');
    if (!(node instanceof HTMLElement)) return null;
    const tag = node.localName;
    if (tag === 'img') return document.createTextNode(node.getAttribute('alt') ?? '[Image hidden]');
    if (!allowed.has(tag)) return null;
    const output = document.createElement(tag);
    for (const attr of ['colspan', 'rowspan', 'title', 'dir']) {
      const value = node.getAttribute(attr);
      if (value) output.setAttribute(attr, value);
    }
    for (const property of styles) {
      const value = node.style.getPropertyValue(property);
      if (value && /^[a-zA-Z0-9#.,% ()-]+$/.test(value) && !/url\s*\(/i.test(value))
        output.style.setProperty(property, value);
    }
    for (const child of node.childNodes) {
      const result = copy(child, depth + 1);
      if (result) output.append(result);
    }
    return output;
  };
  const container = document.createElement('div');
  for (const node of input.content.childNodes) {
    const result = copy(node, 0);
    if (result) container.append(result);
  }
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>body{font-family:Arial,sans-serif;color:#20252c;background:#fff;margin:16px;overflow-wrap:anywhere}table{max-width:100%}</style></head><body>${container.innerHTML}</body></html>`;
}
