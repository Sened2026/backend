import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { RootSuperadminGuard } from '../../common/guards/root-superadmin.guard';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { InvoiceType } from '../invoice/dto/invoice.dto';
import { CompanyQueryDto } from '../company/dto/company.dto';
import { SuperadminService } from './superadmin.service';
import {
    SuperadminInvoiceQueryDto,
    SuperadminQuoteQueryDto,
} from './dto/superadmin.dto';

@Controller('superadmin')
@UseGuards(SupabaseAuthGuard, RootSuperadminGuard)
export class SuperadminController {
    constructor(private readonly superadminService: SuperadminService) {}

    @Get('companies')
    async getCompanies(@Query() query: CompanyQueryDto) {
        return this.superadminService.getCompanies(query);
    }

    @Get('quotes')
    async getQuotes(@Query() query: SuperadminQuoteQueryDto) {
        return this.superadminService.getQuotes(query);
    }

    @Get('quotes/:id')
    async getQuoteById(@Param('id', ParseUUIDPipe) id: string) {
        return this.superadminService.getQuoteById(id);
    }

    @Get('quotes/:id/pdf')
    async downloadQuotePdf(
        @Param('id', ParseUUIDPipe) id: string,
        @Res() res: Response,
    ) {
        const { fileName, buffer } = await this.superadminService.generateQuotePdf(id);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });

        res.send(buffer);
    }

    @Get('invoices')
    async getInvoices(@Query() query: SuperadminInvoiceQueryDto) {
        return this.superadminService.getInvoices(query, InvoiceType.STANDARD);
    }

    @Get('invoices/:id')
    async getInvoiceById(@Param('id', ParseUUIDPipe) id: string) {
        return this.superadminService.getInvoiceById(id);
    }

    @Get('invoices/:id/pdf')
    async downloadInvoicePdf(
        @Param('id', ParseUUIDPipe) id: string,
        @Res() res: Response,
    ) {
        const { fileName, buffer } = await this.superadminService.generateInvoicePdf(id);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });

        res.send(buffer);
    }

    @Get('credit-notes')
    async getCreditNotes(@Query() query: SuperadminInvoiceQueryDto) {
        return this.superadminService.getInvoices(query, InvoiceType.CREDIT_NOTE);
    }

    @Get('credit-notes/:id')
    async getCreditNoteById(@Param('id', ParseUUIDPipe) id: string) {
        return this.superadminService.getCreditNoteById(id);
    }

    @Get('credit-notes/:id/pdf')
    async downloadCreditNotePdf(
        @Param('id', ParseUUIDPipe) id: string,
        @Res() res: Response,
    ) {
        const { fileName, buffer } = await this.superadminService.generateInvoicePdf(
            id,
            InvoiceType.CREDIT_NOTE,
        );

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });

        res.send(buffer);
    }
}
