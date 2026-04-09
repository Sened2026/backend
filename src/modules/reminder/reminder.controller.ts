import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
} from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { NotificationService } from './notification.service';
import {
    UpdateReminderSettingsDto,
    SendManualReminderDto,
    CreateEmailTemplateDto,
    UpdateEmailTemplateDto,
    ReminderQueryDto,
} from './dto/reminder.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class ReminderController {
    constructor(
        private readonly reminderService: ReminderService,
        private readonly notificationService: NotificationService,
    ) {}

    // ============================================
    // PARAMÈTRES DE RAPPEL
    // ============================================

    /**
     * GET /api/companies/:companyId/reminders/settings
     * Récupère les paramètres de rappel
     */
    @Get('companies/:companyId/reminders/settings')
    async getSettings(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
    ) {
        return this.reminderService.getSettings(userId, companyId);
    }

    /**
     * PUT /api/companies/:companyId/reminders/settings
     * Met à jour les paramètres de rappel
     */
    @Put('companies/:companyId/reminders/settings')
    async updateSettings(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
        @Body() dto: UpdateReminderSettingsDto,
    ) {
        return this.reminderService.updateSettings(userId, companyId, dto);
    }

    // ============================================
    // TEMPLATES D'EMAIL
    // ============================================

    /**
     * GET /api/companies/:companyId/reminders/templates
     * Liste tous les templates d'email
     */
    @Get('companies/:companyId/reminders/templates')
    async getTemplates(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
    ) {
        return this.reminderService.getTemplates(userId, companyId);
    }

    /**
     * POST /api/companies/:companyId/reminders/templates
     * Crée un nouveau template d'email
     */
    @Post('companies/:companyId/reminders/templates')
    async createTemplate(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
        @Body() dto: CreateEmailTemplateDto,
    ) {
        return this.reminderService.createTemplate(userId, companyId, dto);
    }

    /**
     * PUT /api/companies/:companyId/reminders/templates/:id
     * Met à jour un template d'email
     */
    @Put('companies/:companyId/reminders/templates/:id')
    async updateTemplate(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
        @Param('id') templateId: string,
        @Body() dto: UpdateEmailTemplateDto,
    ) {
        return this.reminderService.updateTemplate(userId, companyId, templateId, dto);
    }

    /**
     * DELETE /api/companies/:companyId/reminders/templates/:id
     * Supprime un template d'email
     */
    @Delete('companies/:companyId/reminders/templates/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteTemplate(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
        @Param('id') templateId: string,
    ) {
        await this.reminderService.deleteTemplate(userId, companyId, templateId);
    }

    // ============================================
    // ENVOI MANUEL
    // ============================================

    /**
     * POST /api/companies/:companyId/reminders/send
     * Envoie un rappel manuel
     */
    @Post('companies/:companyId/reminders/send')
    async sendManualReminder(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
        @Body() dto: SendManualReminderDto,
    ) {
        return this.reminderService.sendManualReminder(userId, companyId, dto);
    }

    // ============================================
    // LISTE ET STATISTIQUES
    // ============================================

    /**
     * GET /api/companies/:companyId/reminders
     * Liste tous les rappels envoyés
     */
    @Get('companies/:companyId/reminders')
    async findAll(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
        @Query() query: ReminderQueryDto,
    ) {
        return this.reminderService.findAll(userId, companyId, query);
    }

    /**
     * GET /api/companies/:companyId/reminders/stats
     * Récupère les statistiques des rappels
     */
    @Get('companies/:companyId/reminders/stats')
    async getStats(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
    ) {
        return this.reminderService.getStats(userId, companyId);
    }

    // ============================================
    // STATUS DES SERVICES
    // ============================================

    /**
     * GET /api/companies/:companyId/reminders/status
     * Vérifie le status des services de notification
     */
    @Get('companies/:companyId/reminders/status')
    async getStatus(
        @CurrentUser('id') userId: string,
        @Param('companyId') companyId: string,
    ) {
        // Vérification d'accès à l'entreprise implicite via getSettings
        await this.reminderService.getSettings(userId, companyId);

        return {
            email_configured: this.notificationService.isEmailConfigured(),
            sms_configured: this.notificationService.isSmsConfigured(),
        };
    }
}
