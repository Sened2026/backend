import {
    Body,
    Controller,
    Get,
    Param,
    ParseEnumPipe,
    ParseUUIDPipe,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { SupabaseUser } from '../../config/supabase.config';
import {
    LEGAL_DOCUMENT_TYPES,
    LegalDocumentType,
    UpsertLegalDocumentDraftDto,
} from './dto/legal-document.dto';
import { LegalDocumentService } from './legal-document.service';

@Controller()
export class LegalDocumentController {
    constructor(private readonly legalDocumentService: LegalDocumentService) {}

    @Get('legal-documents/platform/status')
    @UseGuards(SupabaseAuthGuard)
    async getPlatformStatus(@CurrentUser() user: SupabaseUser) {
        await this.legalDocumentService.syncPlatformAcceptanceFromMetadata(user);
        return this.legalDocumentService.getPlatformAcceptanceStatus(user.id);
    }

    @Post('legal-documents/platform/accept-current')
    @UseGuards(SupabaseAuthGuard)
    async acceptCurrentPlatformDocuments(
        @CurrentUser() user: SupabaseUser,
    ) {
        return this.legalDocumentService.acceptCurrentPlatformDocuments(
            user.id,
        );
    }

    @Get('companies/:companyId/legal-documents')
    @UseGuards(SupabaseAuthGuard)
    async listCompanyDocuments(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
    ) {
        return this.legalDocumentService.listCompanyDocuments(userId, companyId);
    }

    @Put('companies/:companyId/legal-documents/:documentType')
    @UseGuards(SupabaseAuthGuard)
    async saveCompanyDocument(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('documentType', new ParseEnumPipe(LEGAL_DOCUMENT_TYPES)) documentType: LegalDocumentType,
        @Body() dto: UpsertLegalDocumentDraftDto,
    ) {
        return this.legalDocumentService.saveCompanyDocument(
            userId,
            companyId,
            documentType,
            dto.title,
            dto.content_text,
        );
    }

    @Put('companies/:companyId/legal-documents/:documentType/draft')
    @UseGuards(SupabaseAuthGuard)
    async upsertCompanyDraft(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('documentType', new ParseEnumPipe(LEGAL_DOCUMENT_TYPES)) documentType: LegalDocumentType,
        @Body() dto: UpsertLegalDocumentDraftDto,
    ) {
        return this.legalDocumentService.upsertCompanyDraft(
            userId,
            companyId,
            documentType,
            dto.title,
            dto.content_text,
        );
    }

    @Post('companies/:companyId/legal-documents/:documentType/publish')
    @UseGuards(SupabaseAuthGuard)
    async publishCompanyDraft(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('documentType', new ParseEnumPipe(LEGAL_DOCUMENT_TYPES)) documentType: LegalDocumentType,
    ) {
        return this.legalDocumentService.publishCompanyDraft(
            userId,
            companyId,
            documentType,
        );
    }
}
