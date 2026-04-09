import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { PdfModule } from '../pdf/pdf.module';
import { ReminderModule } from '../reminder/reminder.module';
import { ChorusProModule } from '../chorus-pro/chorus-pro.module';

@Module({
    imports: [PdfModule, ReminderModule, ChorusProModule],
    controllers: [InvoiceController],
    providers: [InvoiceService],
    exports: [InvoiceService],
})
export class InvoiceModule {}
