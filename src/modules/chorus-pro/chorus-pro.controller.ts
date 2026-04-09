import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    ParseUUIDPipe,
    UseGuards,
    ParseIntPipe,
    NotFoundException,
} from '@nestjs/common';
import { ChorusProService } from './chorus-pro.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateChorusSettingsDto } from './dto/update-chorus-settings.dto';
import { SubmitInvoiceChorusDto } from './dto/submit-invoice-chorus.dto';
import { TestChorusConnectionDto } from './dto/test-chorus-connection.dto';
import { getSupabaseAdmin } from '../../config/supabase.config';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class ChorusProController {
    constructor(private readonly chorusProService: ChorusProService) {}

    // ─── Settings ────────────────────────────────────────

    @Get('companies/:id/chorus-pro')
    async getSettings(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) companyId: string,
    ) {
        return this.chorusProService.getSettings(userId, companyId);
    }

    @Patch('companies/:id/chorus-pro')
    async updateSettings(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) companyId: string,
        @Body() dto: UpdateChorusSettingsDto,
    ) {
        return this.chorusProService.updateSettings(userId, companyId, dto);
    }

    @Post('companies/:id/chorus-pro/test')
    async testConnection(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) companyId: string,
        @Body() dto: TestChorusConnectionDto,
    ) {
        return this.chorusProService.testConnection(userId, companyId, dto);
    }

    // ─── Structure Search ────────────────────────────────

    @Post('companies/:id/chorus-pro/search-structure')
    async searchStructure(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) companyId: string,
        @Body('identifiant') identifiant: string,
        @Body('typeIdentifiant') typeIdentifiant?: 'SIRET' | 'SIREN',
    ) {
        return this.chorusProService.rechercherStructure(
            userId, companyId, identifiant,
            typeIdentifiant || (identifiant.length === 14 ? 'SIRET' : 'SIREN'),
        );
    }

    // ─── Invoice Submission ──────────────────────────────

    @Post('invoices/:id/chorus-pro/submit')
    async submitInvoice(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) invoiceId: string,
        @Body() dto: SubmitInvoiceChorusDto,
    ) {
        const companyId = await this.getInvoiceCompanyId(invoiceId);
        return this.chorusProService.submitInvoice(userId, companyId, invoiceId, dto);
    }

    @Get('invoices/:id/chorus-pro/status')
    async getSubmissionStatus(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) invoiceId: string,
    ) {
        const companyId = await this.getInvoiceCompanyId(invoiceId);
        return this.chorusProService.getSubmissionStatus(userId, companyId, invoiceId);
    }

    private async getInvoiceCompanyId(invoiceId: string): Promise<string> {
        const supabase = getSupabaseAdmin();
        const { data: invoice } = await supabase
            .from('invoices')
            .select('company_id')
            .eq('id', invoiceId)
            .single();

        if (!invoice) {
            throw new NotFoundException('Facture non trouvée');
        }
        return invoice.company_id;
    }

    // ─── Search Invoices ─────────────────────────────────

    @Post('companies/:id/chorus-pro/search-sent')
    async searchSentInvoices(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) companyId: string,
        @Body() params: Record<string, any>,
    ) {
        return this.chorusProService.searchSentInvoices(userId, companyId, params);
    }

    @Post('companies/:id/chorus-pro/search-received')
    async searchReceivedInvoices(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) companyId: string,
        @Body() params: Record<string, any>,
    ) {
        return this.chorusProService.searchReceivedInvoices(userId, companyId, params);
    }

    @Post('companies/:id/chorus-pro/received/:idFacture')
    async getReceivedInvoiceDetail(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) companyId: string,
        @Param('idFacture', ParseIntPipe) idFacture: number,
    ) {
        return this.chorusProService.getReceivedInvoiceDetail(userId, companyId, idFacture);
    }

    @Post('companies/:id/chorus-pro/download')
    async downloadInvoices(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) companyId: string,
        @Body() body: { ids: number[]; format?: string },
    ) {
        return this.chorusProService.downloadInvoices(userId, companyId, body.ids, body.format);
    }

    // MVP: processReceivedInvoice disabled — payload non conforme, sera recodé hors MVP
    // @Post('companies/:id/chorus-pro/process-received')
    // async processReceivedInvoice(
    //     @CurrentUser('id') userId: string,
    //     @Param('id', ParseUUIDPipe) companyId: string,
    //     @Body() body: { idFacture: number; action: string },
    // ) {
    //     return this.chorusProService.processReceivedInvoice(userId, companyId, body.idFacture, body.action);
    // }
}
