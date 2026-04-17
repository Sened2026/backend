import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { LegalDocumentModule } from '../legal-document/legal-document.module';
import { CompanyModule } from '../company/company.module';

@Module({
    imports: [LegalDocumentModule, forwardRef(() => CompanyModule)],
    controllers: [SubscriptionController],
    providers: [SubscriptionService],
    exports: [SubscriptionService],
})
export class SubscriptionModule {}
