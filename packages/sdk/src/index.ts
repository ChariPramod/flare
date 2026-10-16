import { reconcileWorkflows } from './reconciliation.js';
import type {
  ReconciliationOptions,
  WorkflowInventory,
  WorkflowInspection,
} from './reconciliation.js';
export type {
  ReconciliationOptions,
  WorkflowInventory,
  WorkflowInspection,
  WorkflowReconciliation,
  WorkflowRunMetadata,
} from './reconciliation.js';
import operations from './operations.json' with { type: 'json' };
import type { paths, operations as Operations } from './schema.js';
export type { paths, Operations };
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export const operationCatalog = operations;
export class FlareError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId: string | null,
    public retryAfter: number | null,
    public details: unknown,
  ) {
    super(message);
    this.name = 'FlareError';
  }
}
export type ClientOptions = {
  baseUrl: string;
  apiKey: string;
  environmentId: string;
  orgId?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Operation<P extends keyof paths, M extends Method> = M extends keyof paths[P]
  ? NonNullable<paths[P][M]>
  : never;
type Params<O> = O extends { parameters: infer T } ? T : never;
type PathInput<O> = Params<O> extends { path: infer T } ? { path: T } : { path?: never };
type QueryInput<O> = Params<O> extends { query?: infer T } ? { query?: T } : { query?: never };
type BodyInput<O> = O extends { requestBody: { content: { 'application/json': infer T } } }
  ? { body: T }
  : { body?: never };
export type RequestInput<P extends keyof paths, M extends Method> = PathInput<Operation<P, M>> &
  QueryInput<Operation<P, M>> &
  BodyInput<Operation<P, M>> & { idempotencyKey?: string; signal?: AbortSignal };
type Content<R> = R extends { content: infer C } ? C[keyof C] : never;
export type ResponseOutput<P extends keyof paths, M extends Method> =
  Operation<P, M> extends { responses: infer R }
    ? Content<R[Extract<keyof R, 200 | 201 | 202 | 204>]>
    : never;
export type EmailInput = NonNullable<
  Operations['MailController_send']['requestBody']
>['content']['application/json'];
export type TriggerInput = NonNullable<
  Operations['WorkflowController_trigger']['requestBody']
>['content']['application/json'];
export type PublicationInput = NonNullable<
  Operations['PublicationController_create']['requestBody']
>['content']['application/json'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class FlareClient {
  private readonly options: ClientOptions;
  private readonly base: URL;
  constructor(options: ClientOptions) {
    this.base = new URL(options.baseUrl);
    if (
      !['https:', 'http:'].includes(this.base.protocol) ||
      this.base.username ||
      this.base.password ||
      this.base.search ||
      this.base.hash ||
      this.base.pathname !== '/'
    )
      throw new Error('Use an HTTP(S) API origin without credentials, path, query or fragment');
    if (
      this.base.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(this.base.hostname)
    )
      throw new Error('Remote API origins require HTTPS');
    if (!options.apiKey.startsWith('fl_') || /[\r\n]/.test(options.apiKey))
      throw new Error('A Flare API key is required');
    if (!uuid.test(options.environmentId) || (options.orgId && !uuid.test(options.orgId)))
      throw new Error('Select an explicit environment UUID and valid optional organization UUID');
    this.options = { ...options };
  }
  async request<P extends keyof paths, M extends Method>(
    method: M,
    path: P,
    input: RequestInput<P, M>,
  ): Promise<ResponseOutput<P, M>> {
    return this.operation(method.toUpperCase(), path, input as RequestOptions) as Promise<
      ResponseOutput<P, M>
    >;
  }
  // Runtime catalog validation also protects CLI and MCP callers that cannot use TypeScript.
  async operation(method: string, template: string, input: RequestOptions = {}): Promise<unknown> {
    method = method.toUpperCase();
    if (!operations.some((o) => o.method === method && o.path === template))
      throw new Error('Unsupported Flare operation');
    const path = template.replace(/\{([^}]+)\}/g, (_all, key: string) => {
      const value = input.path?.[key];
      if (value === undefined || value === '' || value === '.' || value === '..')
        throw new Error(`Missing or invalid path parameter: ${key}`);
      return encodeURIComponent(String(value));
    });
    const url = new URL(path, this.base);
    for (const [key, value] of Object.entries(input.query ?? {}))
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    if (
      input.idempotencyKey &&
      (!input.idempotencyKey.length ||
        input.idempotencyKey.length > 256 ||
        /[\r\n]/.test(input.idempotencyKey))
    )
      throw new Error('Invalid idempotency key');
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'x-environment-id': this.options.environmentId,
          ...(this.options.orgId ? { 'x-org-id': this.options.orgId } : {}),
          'Content-Type': 'application/json',
          ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
        },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        signal: input.signal
          ? AbortSignal.any([input.signal, AbortSignal.timeout(this.options.timeoutMs ?? 30000)])
          : AbortSignal.timeout(this.options.timeoutMs ?? 30000),
        redirect: 'error',
      });
    } catch {
      throw new FlareError(
        0,
        'Connection failed; an attempted mutation may have been accepted',
        null,
        null,
        null,
      );
    }
    const text = await response.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* CSV and raw responses stay text. */
    }
    if (!response.ok) {
      const raw =
        typeof data === 'object' && data !== null && 'message' in data
          ? String(data.message)
          : `Request failed (${response.status})`;
      throw new FlareError(
        response.status,
        raw.split(this.options.apiKey).join('[REDACTED]'),
        response.headers.get('x-request-id'),
        response.headers.has('retry-after') ? Number(response.headers.get('retry-after')) : null,
        JSON.parse(JSON.stringify(data).split(this.options.apiKey).join('[REDACTED]')),
      );
    }
    return data;
  }
  async *paginate<P extends keyof paths>(
    path: P,
    input: RequestInput<P, 'get'>,
    options: { maxPages?: number; limit?: number } = {},
  ) {
    const limit = options.limit ?? 25,
      max = options.maxPages ?? 1000;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(max) || max < 1)
      throw new Error('Invalid pagination bounds');
    for (let page = 1; page <= max; page++) {
      const result = await this.operation('GET', path, {
        ...input,
        query: { ...(input as RequestOptions).query, page, limit },
      } as RequestOptions);
      if (
        !result ||
        typeof result !== 'object' ||
        !('data' in result) ||
        !Array.isArray(result.data)
      )
        throw new Error('This endpoint does not support paged data');
      for (const item of result.data) yield item as PageItem<ResponseOutput<P, 'get'>>;
      if (result.data.length < limit) return;
    }
    throw new Error('Pagination reached maxPages; narrow the query or increase the bound');
  }
  sendEmail(body: EmailInput, idempotencyKey?: string) {
    return this.request('post', '/v1/emails', { body, idempotencyKey });
  }
  workflowInventory(input: {
    before: string;
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  }) {
    const { signal, ...query } = input;
    return this.operation('GET', '/v1/activity/reconciliation', {
      query,
      signal,
    }) as Promise<WorkflowInventory>;
  }
  inspectWorkflow(id: string, signal?: AbortSignal) {
    return this.operation('GET', '/v1/activity/{id}/inspection', {
      path: { id },
      signal,
    }) as Promise<WorkflowInspection>;
  }
  reconcileWorkflows(options: ReconciliationOptions) {
    return reconcileWorkflows(this, options);
  }
  sendingPolicy() {
    return this.request('get', '/v1/sending-policy', {});
  }
  trigger(body: TriggerInput, idempotencyKey?: string) {
    return this.request('post', '/v1/events/trigger', { body, idempotencyKey });
  }
  publish(body: PublicationInput) {
    return this.request('post', '/v1/publish', { body });
  }
}
type PageItem<R> = R extends { data: Array<infer T> } ? T : never;
export type RequestOptions = {
  path?: Record<string, string | number>;
  query?: Record<string, unknown>;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
export { verifyWebhook } from './webhooks.js';
