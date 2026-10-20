export interface MarkdownHeading {
  level: number;
  text: string;
  source: string;
  slug: string;
  line: number;
}
export function githubSlug(text: string): string;
export function extractHeadings(markdown: string): MarkdownHeading[];
export function extractLinks(
  markdown: string,
): Array<{ href?: string; missingReference?: string; line: number }>;
export function generateCompatibility(
  sourcePath: string,
  canonicalPath: string,
  markdown: string,
): string;
export function checkDocumentation(
  root: string,
  options?: { write?: boolean; files?: string[] },
): {
  errors: string[];
  documents: number;
  redirects: number;
  historicalAnchors: number;
  links: number;
};
