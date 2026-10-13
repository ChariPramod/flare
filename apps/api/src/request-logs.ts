import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { redact, redactText } from '@flare/shared';
import { toJson } from '@flare/db';
import { sql, logger } from './context.js';
import type { AuthRequest } from './context.js';
const pending = new Set<Promise<void>>();
export function requestLogs(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID(),
    start = performance.now();
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
    logger.info(
      {
        requestId: id,
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
    const task = (async () => {
      try {
        await sql`insert into request_logs(id,org_id,environment_id,key_id,actor_id,method,path,status,latency_ms,request_body,response_body) values(${id},${principal?.orgId ?? null},${principal?.environmentId ?? null},${principal?.kind === 'api_key' ? principal.actorId : null},${principal?.actorId ?? null},${req.method},${path},${status},${latency},${sql.json(toJson(redact({ body: req.body, query: req.query })))},${sql.json(toJson(redact(responseBody)))})`;
      } catch (error) {
        logger.error({ requestId: id, err: error }, 'Request log persistence failed');
      }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };
  res.once('finish', persist);
  res.once('close', persist);
  next();
}
export async function flushRequestLogs() {
  await Promise.allSettled([...pending]);
}
