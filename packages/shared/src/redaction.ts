const sensitive =
  /^(authorization|cookie|set-cookie|password|pass|token|secret|credentials|code|mfa_code|subscriber[_-]?hash|.*api[_-]?key.*|.*cipher.*|.*secret.*|.*password.*|.*token.*|recovery[_-]?codes|private[_-]?key|dkim[_-]?private.*|uri|source|content)$/i;
export function redactText(value: string) {
  return value
    .replace(/(\/preferences\/)[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '$1[REDACTED]')
    .replace(/(?:https?|wss?):\/\/[^\s"<>]+/gi, (raw) => {
      try {
        const url = new URL(raw);
        if (url.username) url.username = 'REDACTED';
        if (url.password) url.password = 'REDACTED';
        for (const name of [...url.searchParams.keys()])
          if (sensitive.test(name)) url.searchParams.set(name, '[REDACTED]');
        return url.toString();
      } catch {
        return raw;
      }
    })
    .replace(/\b(?:fl_|whsec_)[A-Za-z0-9_+/=-]{12,}/g, '[REDACTED]')
    .replace(/\bfbt_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g, '[REDACTED]');
}
export function redact(value: unknown, budget = 32768): unknown {
  let remaining = budget;
  const visit = (input: unknown, depth: number): unknown => {
    if (remaining <= 0 || depth > 10) return '[TRUNCATED]';
    if (typeof input === 'string') {
      const clean = redactText(input),
        size = Math.min(4096, remaining);
      remaining -= Math.min(clean.length, size);
      return clean.length > size ? `${clean.slice(0, size)}[TRUNCATED]` : clean;
    }
    if (input === null || typeof input === 'boolean' || typeof input === 'number') {
      remaining -= 8;
      return input;
    }
    if (Array.isArray(input)) {
      const out = input.slice(0, 100).map((item) => visit(item, depth + 1));
      if (input.length > 100) out.push('[TRUNCATED]');
      return out;
    }
    if (input && typeof input === 'object') {
      const entries: [string, unknown][] = [];
      for (const [name, item] of Object.entries(input).slice(0, 100)) {
        if (remaining <= 0) break;
        const key = redactText(name).slice(0, Math.min(256, remaining));
        remaining -= key.length + 16;
        entries.push([key, sensitive.test(name) ? '[REDACTED]' : visit(item, depth + 1)]);
      }
      return Object.fromEntries(entries);
    }
    return null;
  };
  const result = visit(value, 0);
  return JSON.stringify(result).length > budget ? '[TRUNCATED]' : result;
}

// Use the same payload policy when persisting and reading historical request logs.
// Express routes are case insensitive; arbitrary MIME, templates and credentials
// need full suppression even when a response was captured as serialized JSON.
const inboundContent = /^\/v1\/inbound(?:\/|$)/i;
const outgoingContent =
  /^\/v1\/(?:emails|events\/(?:postal|sns|novu|trigger)|workflows|activity|templates|template-preview|layouts|translations|content|publish|publications|automations|automation-events|automation-runs|broadcasts)(?:\/|$)/i;
const contactImportContent = /^\/v1\/contacts\/import(?:\/|$)/i;
const inboxCredential = /^\/v1\/subscribers\/[^/]+\/inbox-token\/?$/i;
const logContent = /^\/v1\/logs(?:\/|$)/i;
const dashboardContent = /^(?:\/v1\/(?:browser-transfers|dashboard\/inbox)|\/socket\.io)(?:\/|$)/i;
export function redactRequestLogBodies(path: string, requestBody: unknown, responseBody: unknown) {
  // Log responses can contain older serialized credentials and recursive log copies.
  const marker = dashboardContent.test(path)
    ? '[DASHBOARD CREDENTIALS AND CONTENT REDACTED]'
    : logContent.test(path)
      ? '[LOG CONTENT REDACTED]'
      : inboxCredential.test(path)
        ? '[INBOX CREDENTIAL REDACTED]'
        : inboundContent.test(path)
          ? '[INBOUND CONTENT REDACTED]'
          : contactImportContent.test(path)
            ? '[CONTACT IMPORT CONTENT REDACTED]'
            : outgoingContent.test(path)
              ? '[EMAIL CONTENT REDACTED]'
              : undefined;
  return {
    request_body: marker ? { body: marker, query: marker } : redact(requestBody),
    response_body: marker ?? redact(responseBody),
  };
}

export function csvCell(value: unknown) {
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
