import { Controller, Get, Headers, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { SocialMediaFilesService } from './social-media-files.service';

// Only the signed attachment path is public. Admin actions remain on the guarded controller.
@Controller('social-media/media')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ name: 'social-media-download', limit: 120, windowMs: 60000 })
export class SocialMediaPublicController {
  constructor(private readonly files: SocialMediaFilesService) {}

  @Public()
  @Get(':owner/:file')
  async file(@Param('owner') owner: string, @Param('file') file: string, @Query('signature') signature: string,
    @Headers('range') range: string | undefined, @Req() request: Request, @Res() response: Response) {
    const object = await this.files.publicFile(owner, file, signature || '', range, request.method === 'HEAD');
    response.setHeader('Content-Type', object.contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.setHeader('Accept-Ranges', 'bytes');
    if (object.contentLength !== undefined) response.setHeader('Content-Length', object.contentLength);
    if (object.etag) response.setHeader('ETag', object.etag);
    if ('contentRange' in object && object.contentRange) { response.status(206); response.setHeader('Content-Range', object.contentRange); }
    if (!('stream' in object)) { response.end(); return; }
    object.stream.on('error', () => response.destroy());
    response.on('close', () => object.stream.destroy());
    object.stream.pipe(response);
  }
}
