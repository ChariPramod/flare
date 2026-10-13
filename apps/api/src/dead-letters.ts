import { Controller, Get, Post, Param, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { deadLetterKind, listDeadLetters, redriveDeadLetter } from '@flare/platform';
import { parse, sql } from './context.js';
import type { AuthRequest } from './context.js';
@Controller('v1/dead-letters')
export class DeadLettersController {
  @Get() async list(@Req() req: AuthRequest, @Query() query: unknown) {
    const input = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(25),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      }),
      query,
    );
    return {
      data: await listDeadLetters(sql, req.principal, input.limit, (input.page - 1) * input.limit),
      ...input,
    };
  }
  @Post(':kind/:id/redrive') async redrive(
    @Req() req: AuthRequest,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return redriveDeadLetter(
      sql,
      req.principal,
      parse(deadLetterKind, kind),
      parse(z.string().uuid(), id),
    );
  }
}
