// Build API input schemas from the validators used by controllers, not duplicate DTOs.
import ts from 'typescript';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { zodToJsonSchema } from 'zod-to-json-schema';
import openapiTS, { astToString } from 'openapi-typescript';
import * as shared from '../packages/shared/dist/index.js';
import * as mail from '../packages/mail/dist/index.js';
import * as platform from '../packages/platform/dist/index.js';
import { responseFor } from './openapi-responses.mjs';
const { z } = createRequire(new URL('../packages/shared/package.json', import.meta.url))('zod');
const scalar = { type: 'string' },
  json = { type: 'object', additionalProperties: true };
function toolSchema(value) {
  if (Array.isArray(value)) return value.map(toolSchema);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toolSchema(item)]),
  );
  for (const [exclusive, bound] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ])
    if (typeof result[exclusive] === 'boolean') {
      if (result[exclusive] && typeof result[bound] === 'number') {
        result[exclusive] = result[bound];
        delete result[bound];
      } else delete result[exclusive];
    }
  if (result.nullable && result.type) {
    result.type = [result.type, 'null'];
    delete result.nullable;
  }
  return result;
}
const paths = {};
const manifest = [];
const failures = [];
const decorators = (node) => (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []);
const calls = (node) =>
  decorators(node)
    .map((d) => d.expression)
    .filter(ts.isCallExpression);
const deco = (node, name) => calls(node).find((d) => d.expression.getText() === name);
const arg = (call, index = 0) =>
  call?.arguments[index] && ts.isStringLiteral(call.arguments[index])
    ? call.arguments[index].text
    : undefined;
function evaluate(expr, scope) {
  const code = ts.transpileModule(`const value=(${expr});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return new Function(...Object.keys(scope), `${code};return value;`)(...Object.values(scope));
}
function schema(value) {
  const output = zodToJsonSchema(value, {
    target: 'openApi3',
    effectStrategy: 'input',
    $refStrategy: 'none',
  });
  delete output.$schema;
  const strip = (value) => {
    if (value && typeof value === 'object') {
      delete value.default;
      for (const child of Object.values(value)) strip(child);
    }
  };
  strip(output);
  return output;
}
const overrides = {
  MailController_send: mail.emailSchema,
  MailController_batch: z.union([
    z.array(mail.emailSchema).min(1).max(100),
    z
      .object({
        emails: z.array(mail.emailSchema).min(1).max(100),
        validation: z.enum(['strict', 'permissive']).optional(),
      })
      .strict(),
  ]),
  PublicationController_create: platform.publicationSchema,
  InboundController_createRule: platform.forwardingRuleSchema,
  InboundController_updateRule: platform.forwardingRuleSchema,
  AudienceController_createTemplate: shared.templateSchema,
  AudienceController_version: shared.templateSchema,
};
// Only publish controllers mounted by the application. This also permits staged
// implementation of new controllers without advertising unavailable routes.
const registeredControllers = new Set();
const mainSource = ts.createSourceFile(
  'main.ts',
  readFileSync('apps/api/src/main.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
function inspectRegistration(node) {
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText(mainSource) === 'controllers' &&
    ts.isArrayLiteralExpression(node.initializer)
  ) {
    for (const entry of node.initializer.elements)
      if (ts.isIdentifier(entry)) registeredControllers.add(entry.text);
  }
  ts.forEachChild(node, inspectRegistration);
}
inspectRegistration(mainSource);
for (const file of readdirSync('apps/api/src').filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'main.ts',
)) {
  const source = ts.createSourceFile(
    file,
    readFileSync(`apps/api/src/${file}`, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const scope = { ...shared, ...mail, ...platform, z };
  for (const statement of source.statements)
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name)) continue;
        const expr = declaration.initializer.getText(source);
        if (!/\bz\.|Schema\b|schema\b/.test(expr)) continue;
        try {
          const value = evaluate(expr, scope);
          if (value?._def) scope[declaration.name.text] = value;
        } catch {
          /* Report unresolved schemas only if used by a route. */
        }
      }
  for (const controller of source.statements.filter(ts.isClassDeclaration)) {
    if (!controller.name || !registeredControllers.has(controller.name.text)) continue;
    // Private protocol adapters are not public SDK/MCP resources.
    if (deco(controller, 'ApiExcludeController')) continue;
    const prefix = arg(deco(controller, 'Controller'));
    if (prefix === undefined && !deco(controller, 'Controller')) continue;
    for (const method of controller.members.filter(ts.isMethodDeclaration)) {
      const route = calls(method).find((d) =>
        ['Get', 'Post', 'Put', 'Patch', 'Delete'].includes(d.expression.getText()),
      );
      if (!route) continue;
      const variants = ts.isArrayLiteralExpression(route.arguments[0] ?? {})
        ? route.arguments[0].elements.map((node) => {
            if (!ts.isStringLiteral(node)) throw new Error('Route must be literal');
            return node.text;
          })
        : [arg(route)];
      for (const [variant, suffix] of variants.entries()) {
        const http = route.expression.getText().toLowerCase(),
          path = `/${[prefix, suffix].filter(Boolean).join('/')}`.replace(
            /:([A-Za-z0-9_]+)/g,
            '{$1}',
          );
        const id = `${controller.name.text}_${method.name.getText()}`;
        const operationId = variant ? `${id}_instance` : id;
        const operator = controller.name.text.startsWith('Operator');
        const parameters = [];
        let bodySchema;
        for (const parameter of method.parameters) {
          const body = deco(parameter, 'Body'),
            query = deco(parameter, 'Query'),
            param = deco(parameter, 'Param');
          if (!body && !query && !param) continue;
          const name = parameter.name.getText();
          let validator;
          const visit = (node) => {
            if (
              ts.isCallExpression(node) &&
              ['parse', 'contentInput'].includes(node.expression.getText()) &&
              node.arguments[1]?.getText() === name
            ) {
              try {
                validator = evaluate(node.arguments[0].getText(), scope);
              } catch (e) {
                failures.push(`${id}: ${e.message}`);
              }
            }
            ts.forEachChild(node, visit);
          };
          visit(method);
          if (body) {
            validator = overrides[id] ?? validator;
            if (!validator) {
              if (
                id === 'MailEventController_sns' ||
                id === 'MailEventController_postal' ||
                id === 'InboundController_receive' ||
                id === 'OperationsController_engineEvent'
              )
                bodySchema = {
                  ...json,
                  description: 'Signed native provider payload; see provider setup documentation.',
                };
              else failures.push(`${id}: body validator unresolved`);
            } else bodySchema = schema(validator);
          }
          if (param && path.includes(`{${arg(param)}}`))
            parameters.push({
              in: 'path',
              name: arg(param),
              required: true,
              schema: validator ? schema(validator) : scalar,
            });
          if (query) {
            const key = arg(query);
            if (key)
              parameters.push({
                in: 'query',
                name: key,
                required: !parameter.questionToken,
                schema: validator
                  ? schema(validator instanceof z.ZodOptional ? validator.unwrap() : validator)
                  : scalar,
              });
            else if (validator) {
              const s = schema(validator);
              for (const [key, value] of Object.entries(s.properties ?? {}))
                parameters.push({
                  in: 'query',
                  name: key,
                  required: s.required?.includes(key) ?? false,
                  schema: value,
                });
            } else failures.push(`${id}: query validator unresolved`);
          }
        }
        for (const match of path.matchAll(/\{([^}]+)\}/g))
          if (!parameters.some((p) => p.in === 'path' && p.name === match[1]))
            parameters.push({ in: 'path', name: match[1], required: true, schema: scalar });
        const isPublic = !operator && !!deco(method, 'Public'),
          access = operator
            ? 'operator'
            : (arg(deco(method, 'Access')) ?? (http === 'get' ? 'read' : 'write'));
        if (!isPublic && !operator)
          parameters.push(
            {
              in: 'header',
              name: 'x-environment-id',
              schema: { type: 'string', format: 'uuid' },
              description:
                'Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection.',
            },
            {
              in: 'header',
              name: 'x-org-id',
              schema: { type: 'string', format: 'uuid' },
              description: 'Required for user sessions; optional tenant assertion for API keys.',
            },
          );
        if (
          [
            'MailController_send',
            'MailController_batch',
            'WorkflowController_trigger',
            'WorkflowController_bulk',
          ].includes(id)
        )
          parameters.push({
            in: 'header',
            name: 'Idempotency-Key',
            schema: { type: 'string', minLength: 1, maxLength: 256 },
            description:
              '24-hour validated-request deduplication. Reusing a key with different content returns 409.',
          });
        if (id === 'AudienceController_createBroadcast')
          parameters.push({
            in: 'header',
            name: 'Idempotency-Key',
            schema: { type: 'string', minLength: 1, maxLength: 200, pattern: '^[\\x21-\\x7e]+$' },
            description:
              'Optional campaign creation key, retained with the campaign in this environment. Identical retries return the existing draft; different content returns 409.',
          });
        if (id === 'OperationsController_engineEvent')
          bodySchema = schema(
            z
              .object({
                type: z.string().regex(/^(workflow|message|notification)\.[a-z_.]+$/),
                data: z.record(z.unknown()),
              })
              .passthrough(),
          );
        if (id === 'InboundController_receive')
          bodySchema = schema(
            z
              .object({
                id: z.union([z.string().min(1).max(200), z.number().int().nonnegative()]),
                rcpt_to: z.string().email(),
                mail_from: z.union([z.literal(''), z.string().email()]),
                message: z.string(),
                base64: z.literal(true),
                size: z.number().int().nonnegative().max(26214400),
              })
              .passthrough(),
          );
        if (['MailEventController_postal', 'InboundController_receive'].includes(id))
          parameters.push(
            {
              in: 'header',
              name: 'x-postal-signature-256',
              required: true,
              schema: scalar,
              description:
                'Native Postal SHA-256 signature over the original body, verified against the configured public key.',
            },
            { in: 'header', name: 'x-postal-signature-kid', schema: scalar },
          );
        if (id === 'OperationsController_engineEvent')
          for (const name of ['svix-id', 'svix-timestamp', 'svix-signature'])
            parameters.push({ in: 'header', name, required: true, schema: scalar });
        const sessionOnly =
          operator ||
          controller.name.text === 'BrowserTransfersController' ||
          method.getText().includes('sessionOnly(req)') ||
          ['manage_keys', 'manage_team'].includes(access);
        const response = responseFor(id);
        const operation = {
          operationId,
          tags: [controller.name.text.replace('Controller', '')],
          summary: `${method.name.getText()} (${access})`,
          description:
            response.description ??
            'Validated inputs may have additional semantic constraints documented in the resource guide.',
          security: isPublic
            ? []
            : sessionOnly
              ? [{ Session: [] }]
              : [{ ApiKey: [] }, { Session: [] }],
          parameters,
          ...(bodySchema
            ? {
                requestBody: {
                  required: true,
                  content: { 'application/json': { schema: bodySchema } },
                },
              }
            : {}),
          responses: {
            [http === 'post' ? '201' : '200']: {
              description: 'Success',
              content: {
                [response.contentType ?? 'application/json']: { schema: response.schema ?? json },
                ...(response.binary
                  ? { [response.binary]: { schema: { type: 'string', format: 'binary' } } }
                  : {}),
              },
              headers: {
                'x-request-id': { schema: scalar },
                ...(response.binary
                  ? {
                      'Content-Disposition': {
                        schema: scalar,
                        description: 'Binary downloads use a safe attachment filename.',
                      },
                      'Cache-Control': {
                        schema: scalar,
                        description: 'Binary download responses are no-store.',
                      },
                    }
                  : {}),
                'RateLimit-Limit': { schema: { type: 'integer' } },
                'RateLimit-Remaining': { schema: { type: 'integer' } },
                'RateLimit-Reset': {
                  schema: { type: 'integer' },
                  description: 'Seconds until bucket refills',
                },
              },
            },
            ...Object.fromEntries(
              [400, 401, 403, 404, 409, 413, 422, 429, 502, 503].map((status) => [
                status,
                {
                  description:
                    status === 429
                      ? 'Rate limited'
                      : status === 503
                        ? 'Dependency unavailable'
                        : 'Request failed',
                  content: {
                    'application/json': { schema: { $ref: '#/components/schemas/Error' } },
                  },
                  headers: { 'Retry-After': { schema: scalar } },
                },
              ]),
            ),
          },
          'x-flare-access': access,
        };
        paths[path] ??= {};
        paths[path][http] = operation;
        const toolProperties = {};
        const toolRequired = [];
        for (const location of ['path', 'query']) {
          const selected = parameters.filter((p) => p.in === location);
          if (selected.length) {
            const required = selected.filter((p) => p.required).map((p) => p.name);
            toolProperties[location] = {
              type: 'object',
              properties: Object.fromEntries(selected.map((p) => [p.name, p.schema])),
              required,
              additionalProperties: false,
            };
            if (required.length) toolRequired.push(location);
          }
        }
        if (bodySchema) {
          toolProperties.body = bodySchema;
          toolRequired.push('body');
        }
        toolProperties.idempotencyKey = {
          type: 'string',
          maxLength: id === 'AudienceController_createBroadcast' ? 200 : 256,
        };
        manifest.push({
          id: operationId,
          method: http.toUpperCase(),
          path,
          access,
          public: isPublic,
          sessionOnly,
          inputSchema: {
            type: 'object',
            properties: toolSchema(toolProperties),
            required: toolRequired,
            additionalProperties: false,
          },
        });
      }
    }
  }
}
if (failures.length) throw new Error(failures.join('\n'));
const document = {
  openapi: '3.0.3',
  info: {
    title: 'Flare API',
    version: '1.0.0',
    description:
      'Tenant-isolated notification APIs. API keys select an immutable environment. Publication requires an explicitly delegated publication key or authorized user session. Provider callbacks use their native signature protocols. Production content changes use publication.',
  },
  servers: [{ url: 'http://localhost:4000' }],
  paths,
  components: {
    securitySchemes: {
      ApiKey: { type: 'http', scheme: 'bearer', description: 'fl_ API key' },
      Session: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Dashboard session. Tenant routes require organization and environment headers. Operator routes require deployment allowlisting and recent MFA instead.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          message: {
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }, json],
          },
          statusCode: { type: 'integer' },
          errors: json,
          code: scalar,
        },
        additionalProperties: true,
      },
    },
  },
};
const output = JSON.stringify(document, null, 2) + '\n';
const types = astToString(await openapiTS(document));
for (const [file, content] of [
  ['docs/api/openapi.json', output],
  ['packages/sdk/src/schema.ts', types],
  ['packages/sdk/src/operations.json', JSON.stringify(manifest, null, 2) + '\n'],
]) {
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== content)
      throw new Error(`Stale generated contract: ${file}`);
  } else writeFileSync(file, content);
}
console.log(`Generated ${manifest.length} API operations with controller-derived request schemas.`);
