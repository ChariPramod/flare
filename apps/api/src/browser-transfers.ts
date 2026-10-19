import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Response } from 'express';
import { Access } from './auth.js';
import { browserTransferSchema } from '@flare/shared';
import { parse } from './context.js';
import type { AuthRequest } from './context.js';
import { issueBrowserTransfer } from './browser-transfers-auth.js';
export { browserTransferCors } from './browser-transfers-auth.js';

@Controller('v1/browser-transfers')
export class BrowserTransfersController {
  @Access('read') @Post() async issue(
    @Req() req: RawBodyRequest<AuthRequest>,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return issueBrowserTransfer(req, parse(browserTransferSchema, body));
  }
}
