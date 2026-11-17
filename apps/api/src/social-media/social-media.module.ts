import { Module } from '@nestjs/common';
import { SocialMediaController } from './social-media.controller';
import { SocialMediaProvider } from './social-media.provider';
import { SocialMediaService } from './social-media.service';
import { SocialMediaFilesService } from './social-media-files.service';
import { SocialMediaPublicController } from './social-media-public.controller';

@Module({ controllers: [SocialMediaController, SocialMediaPublicController], providers: [SocialMediaProvider, SocialMediaService, SocialMediaFilesService] })
export class SocialMediaModule {}
