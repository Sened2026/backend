import { Module, forwardRef } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { InviteController } from './invite.controller';
import { CompanyService } from './company.service';
import { ReminderModule } from '../reminder/reminder.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
    imports: [ReminderModule, forwardRef(() => SubscriptionModule)],
    controllers: [CompanyController, InviteController],
    providers: [CompanyService],
    exports: [CompanyService],
})
export class CompanyModule {}
