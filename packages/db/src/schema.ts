import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: createdAt(),
});
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  createdAt: createdAt(),
});
export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(),
  },
  (table) => [primaryKey({ columns: [table.orgId, table.userId] })],
);
export const environments = pgTable(
  'environments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    novuKeyCipher: text('novu_key_cipher'),
    novuApplicationId: text('novu_application_id'),
    bridgeUrl: text('bridge_url'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('environment_org_name').on(table.orgId, table.name)],
);
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  environmentId: uuid('environment_id').notNull(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  permission: text('permission').notNull(),
  domainId: uuid('domain_id'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
});
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  environmentId: uuid('environment_id'),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: createdAt(),
});
