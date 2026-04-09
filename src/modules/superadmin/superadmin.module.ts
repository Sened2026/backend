import { Module } from '@nestjs/common';
import { RootSuperadminGuard } from '../../common/guards/root-superadmin.guard';
import { InvoiceModule } from '../invoice/invoice.module';
import { PdfModule } from '../pdf/pdf.module';
import { QuoteModule } from '../quote/quote.module';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

@Module({
    imports: [QuoteModule, InvoiceModule, PdfModule],
    controllers: [SuperadminController],
    providers: [SuperadminService, RootSuperadminGuard],
})
export class SuperadminModule {}
