import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Headers,
  Req,
  UnauthorizedException,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { z } from 'zod';
import { NoFilesInterceptor } from '@nestjs/platform-express';
import { withTenant } from '@flare/db';
import {
  contactSchema,
  propertySchema,
  propertyValid,
  segmentSchema,
  templateSchema,
  validateTemplate,
  renderText,
  preferenceToken,
  verifyPreferenceToken,
} from '@flare/shared';
import { MailError, outbox } from '@flare/mail';
import {
  upsertContact,
  importContacts,
  contactImportSchema,
  contactImportPreviewSchema,
  importContactFile,
  previewContactFile,
  parseContactFile,
  updatePreferences,
  segmentWhere,
  scheduleBroadcast,
  cancelBroadcast,
  broadcastStats,
  campaignDraftSchema,
  createCampaign,
  updateCampaign,
  previewCampaignAudience,
  templatePreviewSchema,
  previewTemplateContent,
} from '@flare/platform';
import { Public } from './auth.js';
import { parse, sql, config } from './context.js';
import type { AuthRequest } from './context.js';
import { audit } from './identity.js';
const uuid = z.string().uuid(),
  name = z.string().trim().min(1).max(120);
const pages = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().max(120).default(''),
  segment_id: uuid.optional(),
  list_id: uuid.optional(),
});
const topicSchema = z
  .object({
    name,
    description: z.string().max(1000).default(''),
    default_opt_in: z.boolean().default(true),
  })
  .strict();
const legacyImportSchema = z
  .object({
    csv: z.string().max(2 * 1024 * 1024),
    mapping: z.record(z.string().max(120), z.string().max(100)),
  })
  .strict();
const preferencesSchema = z
  .object({
    unsubscribed: z.boolean().optional(),
    topics: z
      .record(uuid, z.boolean())
      .refine((v) => Object.keys(v).length <= 100)
      .optional(),
  })
  .strict();
const development = (req: AuthRequest) => {
  if (req.principal.production)
    throw new ForbiddenException('Edit templates in Development and publish to Production');
};
function templateInput(raw: unknown) {
  const data = parse(templateSchema, raw);
  try {
    return validateTemplate(data);
  } catch (e) {
    throw new MailError(422, (e as Error).message);
  }
}
function preferenceIdentity(token: string) {
  try {
    return verifyPreferenceToken(token, config.JWT_SECRET);
  } catch {
    throw new UnauthorizedException('Invalid or expired preference link');
  }
}
@Controller('v1')
export class AudienceController {
  @Get('contacts') async contacts(@Req() req: AuthRequest, @Query() query: unknown) {
    const q = parse(pages, query);
    return withTenant(sql, req.principal, async (tx) => {
      let match = tx`true`;
      if (q.segment_id) {
        const [segment] =
          await tx`select definition from audience_segments where id=${q.segment_id}`;
        if (!segment) throw new MailError(404, 'Segment not found');
        match = segmentWhere(tx, parse(segmentSchema, segment.definition));
      }
      if (q.list_id) {
        const [list] = await tx`select id from contact_lists where id=${q.list_id}`;
        if (!list) throw new MailError(404, 'Contact list not found');
        match = tx`(${match} and exists (select 1 from contact_list_members m where m.list_id=${q.list_id} and m.contact_id=c.id and m.org_id=c.org_id and m.environment_id=c.environment_id))`;
      }
      return {
        data: await tx`select c.* from contacts c where c.deleted_at is null and (c.email ilike ${`%${q.q}%`} or c.first_name ilike ${`%${q.q}%`} or c.last_name ilike ${`%${q.q}%`}) and ${match} order by c.created_at desc,c.id desc limit ${q.limit} offset ${(q.page - 1) * q.limit}`,
        page: q.page,
        limit: q.limit,
      };
    });
  }
  @Post('contacts') async upsert(@Req() req: AuthRequest, @Body() body: unknown) {
    return withTenant(sql, req.principal, (tx) =>
      upsertContact(tx, req.principal, parse(contactSchema, body)),
    );
  }
  @Post('contacts/import') async csv(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(z.union([legacyImportSchema, contactImportSchema]), body);
    return 'csv' in input
      ? importContacts(sql, req.principal, input.csv, input.mapping)
      : importContactFile(sql, req.principal, input);
  }
  @Post('contacts/import/preview') async importPreview(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.union([
        z.object({ csv: z.string().max(2 * 1024 * 1024) }).strict(),
        contactImportPreviewSchema,
      ]),
      body,
    );
    if (!('csv' in input)) return previewContactFile(sql, req.principal, input);
    try {
      const parsed = await parseContactFile({ format: 'csv', data: input.csv });
      return { headers: parsed.headers, sample: parsed.rows.slice(0, 3), rows: parsed.rows.length };
    } catch (e) {
      throw new MailError(422, (e as Error).message);
    }
  }
  @Get('contact-lists') async contactLists(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select l.*,count(c.id)::int as contact_count from contact_lists l left join contact_list_members m on m.list_id=l.id and m.org_id=l.org_id and m.environment_id=l.environment_id left join contacts c on c.id=m.contact_id and c.org_id=m.org_id and c.environment_id=m.environment_id and c.deleted_at is null group by l.id order by l.created_at desc,l.id desc`,
    );
  }
  @Post('template-preview') async draftPreview(@Req() req: AuthRequest, @Body() body: unknown) {
    return previewTemplateContent(sql, req.principal, parse(templatePreviewSchema, body));
  }
  @Get('contacts/:id') async contact(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`select * from contacts where id=${parse(uuid, id)} and deleted_at is null`;
      if (!row) throw new MailError(404, 'Contact not found');
      return {
        ...row,
        topics:
          await tx`select t.id,t.name,coalesce(p.enabled,t.default_opt_in) as enabled from audience_topics t left join contact_topic_preferences p on p.topic_id=t.id and p.contact_id=${id} and p.org_id=t.org_id and p.environment_id=t.environment_id`,
      };
    });
  }
  @Patch('contacts/:id') async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(contactSchema.omit({ email: true }).partial(), body);
    return withTenant(sql, req.principal, async (tx) => {
      const [old] =
        await tx`select * from contacts where id=${parse(uuid, id)} and deleted_at is null for update`;
      if (!old) throw new MailError(404, 'Contact not found');
      return upsertContact(
        tx,
        req.principal,
        parse(contactSchema, {
          email: old.email,
          first_name: old.first_name,
          last_name: old.last_name,
          properties: old.properties,
          unsubscribed: old.unsubscribed,
          ...input,
        }),
      );
    });
  }
  @Delete('contacts/:id') async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const rows =
        await tx`update contacts set deleted_at=now(),unsubscribed=true,updated_at=now() where id=${parse(uuid, id)} returning id`;
      if (!rows.length) throw new MailError(404, 'Contact not found');
      await outbox(tx, req.principal, 'contact.deleted', { id });
      return { id, deleted: true };
    });
  }
  @Patch('contacts/:id/preferences') async preferences(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return updatePreferences(sql, req.principal, parse(uuid, id), parse(preferencesSchema, body));
  }
  @Post('contacts/:id/preference-link') async link(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    await this.contact(req, id);
    const token = preferenceToken(
      {
        orgId: req.principal.orgId,
        environmentId: req.principal.environmentId,
        contactId: id,
        exp: Math.floor(Date.now() / 1000) + 365 * 86400,
      },
      config.JWT_SECRET,
    );
    return { url: `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/preferences/${token}` };
  }
  @Get('contact-properties') async properties(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from contact_properties order by name`,
    );
  }
  @Post('contact-properties') async property(@Req() req: AuthRequest, @Body() body: unknown) {
    const data = parse(propertySchema, body);
    if (!propertyValid(data.type, data.fallback))
      throw new MailError(422, 'Fallback does not match property type');
    return withTenant(sql, req.principal, async (tx) => {
      const [old] =
        await tx`select type from contact_properties where name=${data.name} for update`;
      if (old && old.type !== data.type) throw new MailError(409, 'Property types are immutable');
      const [row] =
        await tx`insert into contact_properties(org_id,environment_id,name,type,fallback) values(${req.principal.orgId},${req.principal.environmentId},${data.name},${data.type},${tx.json(data.fallback ?? null)}) on conflict(org_id,environment_id,name) do update set fallback=excluded.fallback returning *`;
      return row;
    });
  }
  @Get('audience-segments') async segments(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from audience_segments order by name`,
    );
  }
  @Post('audience-segments') async createSegment(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(z.object({ name, definition: segmentSchema }).strict(), body);
    return withTenant(
      sql,
      req.principal,
      async (tx) =>
        (
          await tx`insert into audience_segments(org_id,environment_id,name,definition) values(${req.principal.orgId},${req.principal.environmentId},${input.name},${tx.json(input.definition)}) returning *`
        )[0],
    );
  }
  @Patch('audience-segments/:id') async segment(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(z.object({ name, definition: segmentSchema }).strict(), body);
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`update audience_segments set name=${input.name},definition=${tx.json(input.definition)},updated_at=now() where id=${parse(uuid, id)} returning *`;
      if (!row) throw new MailError(404, 'Segment not found');
      return row;
    });
  }
  @Get('audience-topics') async topics(@Req() req: AuthRequest) {
    return withTenant(sql, req.principal, (tx) => tx`select * from audience_topics order by name`);
  }
  @Post('audience-topics') async createTopic(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(topicSchema, body);
    return withTenant(
      sql,
      req.principal,
      async (tx) =>
        (
          await tx`insert into audience_topics(org_id,environment_id,name,description,default_opt_in) values(${req.principal.orgId},${req.principal.environmentId},${input.name},${input.description},${input.default_opt_in}) returning *`
        )[0],
    );
  }
  @Patch('audience-topics/:id') async topic(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(topicSchema, body);
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`update audience_topics set name=${input.name},description=${input.description},default_opt_in=${input.default_opt_in} where id=${parse(uuid, id)} returning *`;
      if (!row) throw new MailError(404, 'Topic not found');
      return row;
    });
  }
  @Get('templates') async templates(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from email_templates where not archived order by updated_at desc`,
    );
  }
  @Post('templates') async createTemplate(@Req() req: AuthRequest, @Body() body: unknown) {
    development(req);
    const input = parse(
      z
        .object({
          name,
          identifier: z.string().regex(/^[a-z][a-z0-9_-]{1,99}$/),
          content: templateSchema,
        })
        .strict(),
      body,
    );
    templateInput(input.content);
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`insert into email_templates(org_id,environment_id,name,identifier) values(${req.principal.orgId},${req.principal.environmentId},${input.name},${input.identifier}) returning *`;
      await tx`insert into template_versions(org_id,environment_id,template_id,version,subject,html,text_body,variables) values(${req.principal.orgId},${req.principal.environmentId},${row!.id},1,${input.content.subject},${input.content.html},${input.content.text ?? null},${tx.json(input.content.variables)})`;
      await audit(tx, req.principal, 'template.created', String(row!.id));
      return row;
    });
  }
  @Get('templates/:id') async template(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('version') version?: string,
  ) {
    const selected = version ? parse(z.coerce.number().int().positive(), version) : null;
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`select t.*,v.version,v.subject,v.html,v.text_body,v.variables from email_templates t join template_versions v on v.template_id=t.id and v.org_id=t.org_id and v.environment_id=t.environment_id and v.version=coalesce(${selected},t.current_version) where t.id=${parse(uuid, id)}`;
      if (!row) throw new MailError(404, 'Template not found');
      return {
        ...row,
        subject: String(row.subject),
        html: String(row.html),
        text_body: row.text_body as string | null,
        variables: row.variables as Record<string, unknown>,
        versions:
          await tx`select version,created_at from template_versions where template_id=${id} order by version desc`,
      };
    });
  }
  @Post('templates/:id/versions') async version(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    development(req);
    const input = templateInput(body);
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`update email_templates set current_version=current_version+1,updated_at=now() where id=${parse(uuid, id)} and not archived returning current_version`;
      if (!row) throw new MailError(404, 'Template not found');
      await tx`insert into template_versions(org_id,environment_id,template_id,version,subject,html,text_body,variables) values(${req.principal.orgId},${req.principal.environmentId},${id},${row.current_version},${input.subject},${input.html},${input.text ?? null},${tx.json(input.variables)})`;
      await audit(tx, req.principal, 'template.version_created', id, {
        version: row.current_version,
      });
      return { id, version: row.current_version };
    });
  }
  @Post('templates/:id/preview') async preview(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          version: z.number().int().positive().optional(),
          variables: z.record(z.unknown()).default({}),
        })
        .strict(),
      body,
    );
    const row = await this.template(req, id, input.version?.toString());
    const values = { ...row.variables, ...input.variables };
    try {
      return {
        subject: renderText(String(row.subject), values),
        html: renderText(String(row.html), values, true),
        text: renderText(String(row.text_body ?? ''), values),
      };
    } catch (e) {
      throw new MailError(422, (e as Error).message);
    }
  }
  @Get('broadcasts') async broadcasts(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from broadcasts order by created_at desc limit 100`,
    );
  }
  @Post('broadcasts') async createBroadcast(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const requestKey =
      key === undefined
        ? undefined
        : parse(
            z
              .string()
              .min(1)
              .max(200)
              .regex(/^[\x21-\x7e]+$/),
            key,
          );
    return createCampaign(sql, req.principal, parse(campaignDraftSchema, body), requestKey);
  }
  @Get('broadcasts/:id') async broadcast(@Req() req: AuthRequest, @Param('id') id: string) {
    const [row] = await withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from broadcasts where id=${parse(uuid, id)}`,
    );
    if (!row) throw new MailError(404, 'Broadcast not found');
    return { ...row, stats: await broadcastStats(sql, req.principal, id) };
  }
  @Patch('broadcasts/:id') async editBroadcast(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return updateCampaign(sql, req.principal, parse(uuid, id), parse(campaignDraftSchema, body));
  }
  @Get('broadcasts/:id/audience-preview') async campaignAudience(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return previewCampaignAudience(sql, req.principal, parse(uuid, id));
  }
  @Post('broadcasts/:id/schedule') async schedule(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(z.object({ scheduled_at: z.string().max(100).optional() }).strict(), body);
    return scheduleBroadcast(sql, req.principal, parse(uuid, id), input.scheduled_at);
  }
  @Post('broadcasts/:id/cancel') async cancel(@Req() req: AuthRequest, @Param('id') id: string) {
    return cancelBroadcast(sql, req.principal, parse(uuid, id));
  }
  @Public() @Get('preferences/:token') async publicPreferences(@Param('token') token: string) {
    const identity = preferenceIdentity(token);
    return withTenant(sql, identity, async (tx) => {
      const [contact] =
        await tx`select email,unsubscribed from contacts where id=${identity.contactId} and deleted_at is null`;
      if (!contact) throw new MailError(404, 'Contact not found');
      return {
        ...contact,
        topics:
          await tx`select t.id,t.name,t.description,coalesce(p.enabled,t.default_opt_in) as enabled from audience_topics t left join contact_topic_preferences p on p.topic_id=t.id and p.contact_id=${identity.contactId} and p.org_id=t.org_id and p.environment_id=t.environment_id order by t.name`,
      };
    });
  }
  @Public() @Patch('preferences/:token') async publicUpdate(
    @Param('token') token: string,
    @Body() body: unknown,
  ) {
    const identity = preferenceIdentity(token);
    return updatePreferences(sql, identity, identity.contactId, parse(preferencesSchema, body));
  }
  @Public()
  @UseInterceptors(
    NoFilesInterceptor({ limits: { fields: 1, fieldSize: 100, files: 0, parts: 1 } }),
  )
  @Post('preferences/:token/unsubscribe')
  async oneClick(@Param('token') token: string, @Body() body: unknown) {
    parse(z.object({ 'List-Unsubscribe': z.literal('One-Click') }).strict(), body);
    const identity = preferenceIdentity(token);
    return updatePreferences(sql, identity, identity.contactId, { unsubscribed: true });
  }
}
