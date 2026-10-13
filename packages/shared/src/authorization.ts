export type Role = 'owner' | 'admin' | 'developer' | 'viewer';
export type Action =
  'read' | 'write' | 'manage_keys' | 'manage_team' | 'publish' | 'manage_integrations';
export interface Tenant {
  orgId: string;
  environmentId: string;
}
export interface Principal extends Tenant {
  actorId: string;
  sessionId?: string;
  role: Role;
  kind: 'session' | 'api_key';
  permission?: 'full_access' | 'sending_access';
  domainId?: string | null;
  production: boolean;
  allowPublish?: boolean;
}
const grants: Record<Role, readonly Action[]> = {
  owner: ['read', 'write', 'manage_keys', 'manage_team', 'publish', 'manage_integrations'],
  admin: ['read', 'write', 'manage_keys', 'manage_team', 'publish', 'manage_integrations'],
  developer: ['read', 'write', 'manage_keys', 'manage_integrations'],
  viewer: ['read'],
};
export function can(principal: Principal, action: Action): boolean {
  if (principal.permission === 'sending_access') return false;
  if (principal.kind === 'api_key' && action === 'publish')
    return (
      principal.allowPublish === true &&
      principal.permission === 'full_access' &&
      !principal.domainId
    );
  if (principal.kind === 'api_key' && ['manage_team', 'manage_keys'].includes(action)) return false;
  return grants[principal.role].includes(action);
}
export function canSend(principal: Principal, domainId?: string): boolean {
  return principal.role !== 'viewer' && (!principal.domainId || principal.domainId === domainId);
}
export function canEditWorkflow(principal: Principal): boolean {
  return !principal.production && can(principal, 'write');
}
