import { Controller, Get, Post, Put, Param, Body, Req, ForbiddenException } from '@nestjs/common';
import { withTenant, toJson } from '@flare/db';
import { workflowSchema, canEditWorkflow } from '@flare/shared';
import {
  layoutSchema,
  dictionarySchema,
  localeSchema,
  contentInput,
  compileWorkflowContent,
  translationPayload,
  emptyDependencies,
} from '@flare/platform';
import type { ContentDependencies } from '@flare/platform';
import { MailError } from '@flare/mail';
import { z } from 'zod';
import { sql, parse } from './context.js';
import { Access } from './auth.js';
import type { AuthRequest } from './context.js';
import { audit } from './identity.js';
function editable(req: AuthRequest) {
  if (!canEditWorkflow(req.principal))
    throw new ForbiddenException('Edit content in Development and publish to Production');
}
const identifier = z.string().regex(/^[a-z][a-z0-9_-]{1,99}$/);
@Controller('v1')
export class ContentController {
  @Get('layouts') list(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select l.*,v.html,v.translations from layouts l join layout_versions v on v.layout_id=l.id and v.org_id=l.org_id and v.environment_id=l.environment_id and v.version=l.current_version order by l.updated_at desc`,
    );
  }
  @Get('layouts/:identifier') detail(@Req() req: AuthRequest, @Param('identifier') name: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const [row] = await tx`select * from layouts where identifier=${parse(identifier, name)}`;
      if (!row) throw new MailError(404, 'Layout not found');
      return {
        ...row,
        versions:
          await tx`select version,html,translations,created_at from layout_versions where layout_id=${row.id} order by version desc`,
      };
    });
  }
  @Post('layouts') create(@Req() req: AuthRequest, @Body() raw: unknown) {
    editable(req);
    const input = contentInput(layoutSchema, raw);
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`insert into layouts(org_id,environment_id,identifier,name) values(${req.principal.orgId},${req.principal.environmentId},${input.identifier},${input.name}) returning *`;
      await tx`insert into layout_versions(org_id,environment_id,layout_id,version,html,translations) values(${req.principal.orgId},${req.principal.environmentId},${row!.id},1,${input.html},${input.translations})`;
      await audit(tx, req.principal, 'layout.created', String(row!.id));
      return row;
    });
  }
  @Put('layouts/:identifier') update(
    @Req() req: AuthRequest,
    @Param('identifier') name: string,
    @Body() raw: unknown,
  ) {
    editable(req);
    const input = contentInput(layoutSchema, raw);
    if (input.identifier !== name) throw new MailError(422, 'Layout identifier is immutable');
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`update layouts set current_version=current_version+1,name=${input.name},updated_at=now() where identifier=${name} returning *`;
      if (!row) throw new MailError(404, 'Layout not found');
      await tx`insert into layout_versions(org_id,environment_id,layout_id,version,html,translations) values(${req.principal.orgId},${req.principal.environmentId},${row.id},${row.current_version},${input.html},${input.translations})`;
      await audit(tx, req.principal, 'layout.version_created', String(row.id));
      return row;
    });
  }
  @Get('translations/:workflow') dictionaries(
    @Req() req: AuthRequest,
    @Param('workflow') workflow: string,
  ) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select t.locale,t.current_version,v.entries from translations t join translation_versions v using(org_id,environment_id,workflow_identifier,locale) where t.workflow_identifier=${parse(identifier, workflow)} and v.version=t.current_version order by t.locale`,
    );
  }
  @Put('translations/:workflow/:locale') dictionary(
    @Req() req: AuthRequest,
    @Param('workflow') workflow: string,
    @Param('locale') rawLocale: string,
    @Body() raw: unknown,
  ) {
    editable(req);
    const entries = contentInput(dictionarySchema, raw),
      locale = parse(localeSchema, rawLocale);
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`select content_dependencies from workflows where identifier=${parse(identifier, workflow)} for update`;
      if (!row) throw new MailError(404, 'Workflow not found');
      if (locale === 'en_US')
        for (const item of (row.content_dependencies as ContentDependencies).translations)
          if (!Object.hasOwn(entries, item.key))
            throw new MailError(422, `Default dictionary requires ${item.key}`);
      const [translation] =
        await tx`insert into translations(org_id,environment_id,workflow_identifier,locale) values(${req.principal.orgId},${req.principal.environmentId},${workflow},${locale}) on conflict(org_id,environment_id,workflow_identifier,locale) do update set current_version=translations.current_version+1,updated_at=now() returning current_version`;
      await tx`insert into translation_versions(org_id,environment_id,workflow_identifier,locale,version,entries) values(${req.principal.orgId},${req.principal.environmentId},${workflow},${locale},${translation!.current_version},${tx.json(toJson(entries))})`;
      await audit(tx, req.principal, 'translation.version_created', `${workflow}/${locale}`);
      return { locale, version: translation!.current_version, entries };
    });
  }
  @Access('read') @Post('content/preview') preview(@Req() req: AuthRequest, @Body() raw: unknown) {
    const input = parse(
      z.object({ workflow: workflowSchema, locale: localeSchema.default('en_US') }).strict(),
      raw,
    );
    return withTenant(sql, req.principal, async (tx) => {
      const compiled = await compileWorkflowContent(tx, req.principal, input.workflow);
      const values = await translationPayload(
        tx,
        input.workflow.workflowId,
        compiled.dependencies ?? emptyDependencies(),
        input.locale,
      );
      return {
        definition: compiled.definition,
        resolved: values ?? {},
        dependencies: compiled.dependencies,
      };
    });
  }
}
