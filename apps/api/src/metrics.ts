import { Controller, Get, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { deliveryMetrics } from '@flare/platform';
import { parse, sql } from './context.js';
import type { AuthRequest } from './context.js';
@Controller('v1')
export class MetricsController {
  @Get('metrics') async metrics(@Req() req: AuthRequest, @Query() query: unknown) {
    const input = parse(
      z
        .object({
          from: z
            .string()
            .datetime({ offset: true })
            .default(() => new Date(Date.now() - 7 * 86400000).toISOString()),
          to: z
            .string()
            .datetime({ offset: true })
            .default(() => new Date().toISOString()),
          domain_id: z.string().uuid().optional(),
          tag_name: z.string().max(64).optional(),
          tag_value: z.string().max(256).optional(),
          workflow: z.string().max(128).optional(),
          channel: z.enum(['email', 'in_app', 'sms', 'push', 'chat']).optional(),
        })
        .refine(
          (value) =>
            Date.parse(value.to) > Date.parse(value.from) &&
            Date.parse(value.to) - Date.parse(value.from) <= 366 * 86400000,
          'Choose a date range between one instant and 366 days',
        ),
      query,
    );
    return deliveryMetrics(sql, req.principal, input);
  }
}
