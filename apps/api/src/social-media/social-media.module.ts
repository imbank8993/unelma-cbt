import { Module } from '@nestjs/common';
import { SocialMediaController } from './social-media.controller';
import { SocialMediaProvider } from './social-media.provider';
import { SocialMediaService } from './social-media.service';

@Module({ controllers: [SocialMediaController], providers: [SocialMediaProvider, SocialMediaService] })
export class SocialMediaModule {}
