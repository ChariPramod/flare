'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { browserTransfer, responseJson } from './browser-transfers';
export { ApiError } from './browser-transfers';
export async function api<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  body?: unknown,
  key?: string,
  signal?: AbortSignal,
): Promise<T> {
  return apiSerialized<T>(
    path,
    method,
    body === undefined ? undefined : JSON.stringify(body),
    key,
    signal,
  );
}
async function apiSerialized<T>(
  path: string,
  method: string,
  serializedBody?: string,
  key?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response =
    (await browserTransfer(path, method, serializedBody, key, signal)) ??
    (await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      redirect: 'error',
      signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(serializedBody === undefined ? {} : { body: serializedBody }),
    }));
  return responseJson<T>(response);
}
export function useApi<T>(path: string, interval?: number) {
  return useQuery({
    queryKey: ['api', path],
    queryFn: ({ signal }) => api<T>(path, 'GET', undefined, undefined, signal),
    refetchInterval: interval,
    retry: false,
  });
}
export function useAction<T = unknown>(path: string, method = 'POST', idempotent = false) {
  const client = useQueryClient();
  const submission = useRef<{ body: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (body: unknown) => {
      const serialized = JSON.stringify(body);
      if (idempotent) {
        if (submission.current?.body !== serialized)
          submission.current = { body: serialized, key: crypto.randomUUID() };
      }
      return apiSerialized<T>(
        path,
        method,
        idempotent ? submission.current!.body : serialized,
        submission.current?.key,
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['api'] }),
  });
}
export type Session = {
  user: { id: string; name: string; email: string; mfa_enabled: boolean };
  principal: {
    orgId: string;
    environmentId: string;
    role: 'owner' | 'admin' | 'developer' | 'viewer';
    production: boolean;
  };
  organizations: {
    id: string;
    name: string;
    role: string;
    environments: { id: string; name: string }[];
  }[];
};
export type Workflow = {
  workflowId: string;
  name: string;
  description: string;
  tags: string[];
  severity: string;
  active: boolean;
  critical: boolean;
  payloadSchema: Record<string, unknown>;
  defaults: Record<string, boolean>;
  preferences: Record<string, boolean>;
  steps: { stepId: string; name: string; type: string; controlValues: Record<string, unknown> }[];
};
export type WorkflowRow = {
  id: string;
  identifier: string;
  definition: Workflow;
  source_definition?: Workflow;
  revision: number;
  updated_at: string;
};
export const date = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
export const pretty = (value: unknown) => JSON.stringify(value, null, 2);
