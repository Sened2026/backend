import { Module } from '@nestjs/common';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';
import { PdfModule } from '../pdf/pdf.module';
import { ReminderModule } from '../reminder/reminder.module';
import { LegalDocumentModule } from '../legal-document/legal-document.module';

@Module({
    imports: [PdfModule, ReminderModule, LegalDocumentModule],
    controllers: [QuoteController],
    providers: [QuoteService],
    exports: [QuoteService],
})
export class QuoteModule {}
