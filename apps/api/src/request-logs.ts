import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  redact,
  redactText,
  withRequest,
  correlation,
  requestDuration,
  requestSpan,
} from '@flare/shared';
import { toJson } from '@flare/db';
import { sql, logger } from './context.js';
import type { AuthRequest } from './context.js';
const pending = new Set<Promise<void>>();
export function requestLogs(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID(),
    start = performance.now();
  let parent = '';
  const span = withRequest(id, req.headers.traceparent, () => {
    parent = correlation()!.traceparent;
    return requestSpan();
  });
  const sc = span.spanContext();
  if (sc.traceId !== '00000000000000000000000000000000')
    parent = `00-${sc.traceId}-${sc.spanId}-0${sc.traceFlags & 1}`;
  const traceId = parent.split('-')[1]!;
  let responseBody: unknown;
  res.setHeader('x-request-id', id);
  const json = res.json.bind(res),
    send = res.send.bind(res);
  res.json = (body: unknown) => {
    responseBody = body;
    return json(body);
  };
  res.send = (body?: unknown) => {
    if (responseBody === undefined) responseBody = Buffer.isBuffer(body) ? '[BINARY]' : body;
    return send(body);
  };
  let recorded = false;
  const persist = () => {
    if (recorded) return;
    recorded = true;
    const principal = (req as AuthRequest).principal;
    const path =
      typeof req.route?.path === 'string'
        ? String(req.route.path)
        : redactText(req.path).slice(0, 1000);
    const latency = Math.round(performance.now() - start),
      status = res.writableFinished ? res.statusCode : 499;
    const route = typeof req.route?.path === 'string' ? String(req.route.path) : 'unmatched';
    requestDuration.observe(
      {
        method: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method)
          ? req.method
          : 'OTHER',
        route,
        status: String(status),
      },
      latency / 1000,
    );
    span.setAttributes({ 'http.route': route, 'http.response.status_code': status });
    span.end();
    logger.info(
      {
        requestId: id,
        traceId,
        orgId: principal?.orgId,
        environmentId: principal?.environmentId,
        method: req.method,
        path,
        status,
        latencyMs: latency,
      },
      'HTTP request',
    );
    if (pending.size >= 1000) {
      logger.error(
        { requestId: id },
        'Request log writer saturated; record available in structured logs',
      );
      return;
    }
    const inbound = /^\/v1\/inbound(?:\/|$)/.test(req.path);
    const outbound = /^\/v1\/emails(?:\/|$)/.test(req.path);
    const loggedBody = inbound
      ? '[INBOUND CONTENT REDACTED]'
      : outbound
        ? '[EMAIL CONTENT REDACTED]'
        : req.body;
    if (inbound) responseBody = '[INBOUND CONTENT REDACTED]';
    if (outbound) responseBody = '[EMAIL CONTENT REDACTED]';
    const task = (async () => {
      try {
        await sql`insert into request_logs(id,org_id,environment_id,key_id,actor_id,method,path,status,latency_ms,trace_id,request_body,response_body) values(${id},${principal?.orgId ?? null},${principal?.environmentId ?? null},${principal?.kind === 'api_key' ? principal.actorId : null},${principal?.actorId ?? null},${req.method},${path},${status},${latency},${traceId},${sql.json(toJson(redact({ body: loggedBody, query: req.query })))},${sql.json(toJson(redact(responseBody)))})`;
      } catch (error) {
        logger.error({ requestId: id, err: error }, 'Request log persistence failed');
      }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };
  res.once('finish', persist);
  res.once('close', persist);
  withRequest(id, parent, () => {
    res.setHeader('traceparent', correlation()!.traceparent);
    next();
  });
}
export async function flushRequestLogs() {
  await Promise.allSettled([...pending]);
}
