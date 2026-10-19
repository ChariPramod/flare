// Vercel does not use the backend Caddyfile. Keep its service-only endpoints
// outside the dashboard/proxy before authentication or backend configuration.
// /metrics is deliberately allowed: it is Flare's authenticated tenant UI/API.
export function isPrivateDashboardPath(segments: readonly string[]): boolean {
  const [first, second] = segments.map((segment) => segment.toLowerCase());
  if (!first) return false;
  if (['health', 'health-check', 'ready', 'internal'].includes(first)) return true;
  return (
    ['api', 'v1'].includes(first) &&
    ['health', 'health-check', 'ready', 'internal'].includes(second ?? '')
  );
}
