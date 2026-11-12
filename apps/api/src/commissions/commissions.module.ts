import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { MailService } from '../common/mail.service';

@Module({
  imports: [SettingsModule],
  controllers: [CommissionsController],
  providers: [CommissionsService, MailService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
