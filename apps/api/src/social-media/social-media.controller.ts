import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Put, SetMetadata, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '@acca-cbt/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { SocialMediaService } from './social-media.service';
import { SocialMediaFilesService } from './social-media-files.service';
import { SOCIAL_VIDEO_MAX_BYTES } from './social-media.files';

@Controller('social-media')
@SetMetadata('storage:preserve-public-urls', true)
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@Roles('ADMIN', 'SUPERADMIN')
@RateLimit({ name: 'social-media', limit: 90, windowMs: 60000 })
export class SocialMediaController {
  constructor(private readonly social: SocialMediaService, private readonly files: SocialMediaFilesService) {}
  @Get() workspace(@CurrentUser() user: AuthUser) { return this.social.workspace(user); }
  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: SOCIAL_VIDEO_MAX_BYTES, files: 1, fields: 0 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Headers('x-social-public-origin') origin: string) { return this.files.upload(user, file, origin); }
  @Get('media/storage') storage(@CurrentUser() user: AuthUser) { return this.files.usage(user); }
  @Post('media/cleanup') cleanup(@CurrentUser() user: AuthUser) { return this.files.cleanup(user); }
  @Put('settings') settings(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) { return this.social.saveSettings(user, body); }
  @Post('channels/sync') syncChannels(@CurrentUser() user: AuthUser) { return this.social.syncChannels(user); }
  @Get('channels/:id/settings') channelSettings(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.social.channelSettings(user, id); }
  @Put('channels/:id/settings') channel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.social.saveChannel(user, id, body); }
  @Put('posts/:id') save(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) { return this.social.savePost(user, id, body); }
  @Delete('posts/:id') delete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.social.deletePost(user, id); }
  @Post('posts/:id/publish') publish(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.social.publish(user, id); }
  @Post('posts/:id/sync') sync(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.social.syncPost(user, id); }
  @Put('posts/:id/reference') reference(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) { return this.social.reconcile(user, id, body); }
}
