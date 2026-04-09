import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';
import { NotificationService } from './notification.service';

@Module({
    imports: [ConfigModule],
    controllers: [ReminderController],
    providers: [ReminderService, NotificationService],
    exports: [ReminderService, NotificationService],
})
export class ReminderModule {}
