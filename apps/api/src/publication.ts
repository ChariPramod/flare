import { Controller, Get, Post, Body, Req, Param } from '@nestjs/common';
import { withTenant } from '@flare/db';
import { publicationDiff, createPublication } from '@flare/platform';
import { MailError } from '@flare/mail';
import { z } from 'zod';
import { Access } from './auth.js';
import { sql, parse } from './context.js';
import type { AuthRequest } from './context.js';
import { audit } from './identity.js';
@Controller('v1')
export class PublicationController {
  @Get('publish/diff') async diff(@Req() req: AuthRequest) {
    const {
      development: _dev,
      production: _prod,
      sourceId: _source,
      targetId: _target,
      ...diff
    } = await publicationDiff(sql, req.principal);
    return diff;
  }
  @Access('publish') @Post('publish') create(@Req() req: AuthRequest, @Body() body: unknown) {
    return createPublication(sql, req.principal, body);
  }
  @Get('publications') list(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select id,status,error,created_at,completed_at,target_environment_id from publication_operations order by created_at desc limit 100`,
    );
  }
  @Get('publications/:id') detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`select * from publication_operations where id=${parse(z.string().uuid(), id)}`;
      if (!row) throw new MailError(404, 'Publication not found');
      return {
        ...row,
        items:
          await tx`select id,kind,identifier,status,attempts,error,completed_at from publication_items where operation_id=${id} order by ordinal`,
      };
    });
  }
  @Access('publish') @Post('publications/:id/retry') retry(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    if (req.principal.production) throw new MailError(403, 'Retry from Development');
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`select status from publication_operations where id=${parse(z.string().uuid(), id)} for update`;
      if (!row) throw new MailError(404, 'Publication not found');
      if (row.status !== 'failed')
        throw new MailError(409, 'Only failed publications can be retried');
      await tx`update publication_items set status='pending',failures=0,next_attempt_at=now() where operation_id=${id} and status='failed'`;
      await tx`update publication_operations set status='pending',error=null where id=${id}`;
      await audit(tx, req.principal, 'publication.retried', id);
      return { id, status: 'pending' };
    });
  }
}
