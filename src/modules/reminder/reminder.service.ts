import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { NotificationService } from './notification.service';
import { getUserCompanyRole, requireRole, MERCHANT_ROLES } from '../../common/roles/roles';
import {
    UpdateReminderSettingsDto,
    SendManualReminderDto,
    CreateEmailTemplateDto,
    UpdateEmailTemplateDto,
    ReminderQueryDto,
    ReminderSettings,
    EmailTemplate,
    Reminder,
    ReminderListResponse,
    ReminderStats,
    ReminderType,
    ReminderChannel,
    ReminderStatus,
    ReminderRuleDto,
} from './dto/reminder.dto';

@Injectable()
export class ReminderService {
    constructor(private notificationService: NotificationService) {}

    private async checkCompanyAccess(userId: string, companyId: string) {
        return getUserCompanyRole(userId, companyId);
    }

    private async checkWriteAccess(userId: string, companyId: string) {
        return requireRole(userId, companyId, MERCHANT_ROLES);
    }

    // ============================================
    // PARAMÈTRES DE RAPPEL
    // ============================================

    /**
     * Récupère les paramètres de rappel d'une entreprise
     */
    async getSettings(userId: string, companyId: string): Promise<ReminderSettings> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { data: settings, error } = await supabase
            .from('reminder_settings')
            .select('*')
            .eq('company_id', companyId)
            .single();

        if (error || !settings) {
            // Créer les paramètres par défaut
            const defaultSettings: Partial<ReminderSettings> = {
                company_id: companyId,
                enabled: true,
                invoice_rules: [
                    { days_offset: -7, channel: ReminderChannel.EMAIL },
                    { days_offset: -3, channel: ReminderChannel.EMAIL },
                    { days_offset: -1, channel: ReminderChannel.BOTH },
                    { days_offset: 1, channel: ReminderChannel.EMAIL },
                    { days_offset: 7, channel: ReminderChannel.BOTH },
                    { days_offset: 14, channel: ReminderChannel.BOTH },
                    { days_offset: 30, channel: ReminderChannel.EMAIL },
                ],
                quote_rules: [
                    { days_offset: -3, channel: ReminderChannel.EMAIL },
                    { days_offset: -1, channel: ReminderChannel.EMAIL },
                ],
            };

            const { data: newSettings, error: createError } = await supabase
                .from('reminder_settings')
                .insert(defaultSettings)
                .select()
                .single();

            if (createError) {
                console.error('Error creating reminder settings:', createError);
                throw new BadRequestException('Erreur lors de la création des paramètres');
            }

            return newSettings;
        }

        return settings;
    }

    /**
     * Met à jour les paramètres de rappel
     */
    async updateSettings(
        userId: string,
        companyId: string,
        dto: UpdateReminderSettingsDto,
    ): Promise<ReminderSettings> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // S'assurer que les paramètres existent
        await this.getSettings(userId, companyId);

        const updateData: any = { updated_at: new Date().toISOString() };

        if (dto.enabled !== undefined) updateData.enabled = dto.enabled;
        if (dto.invoice_rules) updateData.invoice_rules = dto.invoice_rules;
        if (dto.quote_rules) updateData.quote_rules = dto.quote_rules;
        if (dto.sender_email) updateData.sender_email = dto.sender_email;
        if (dto.sender_name) updateData.sender_name = dto.sender_name;

        const { data: settings, error } = await supabase
            .from('reminder_settings')
            .update(updateData)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) {
            console.error('Error updating reminder settings:', error);
            throw new BadRequestException('Erreur lors de la mise à jour des paramètres');
        }

        return settings;
    }

    // ============================================
    // TEMPLATES D'EMAIL
    // ============================================

    /**
     * Récupère tous les templates d'email
     */
    async getTemplates(userId: string, companyId: string): Promise<EmailTemplate[]> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { data: templates, error } = await supabase
            .from('email_templates')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching templates:', error);
            throw new BadRequestException('Erreur lors de la récupération des templates');
        }

        return templates || [];
    }

    /**
     * Crée un nouveau template d'email
     */
    async createTemplate(
        userId: string,
        companyId: string,
        dto: CreateEmailTemplateDto,
    ): Promise<EmailTemplate> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { data: template, error } = await supabase
            .from('email_templates')
            .insert({
                company_id: companyId,
                name: dto.name,
                subject: dto.subject,
                body_html: dto.body_html,
                body_text: dto.body_text,
                type: dto.type,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating template:', error);
            throw new BadRequestException('Erreur lors de la création du template');
        }

        return template;
    }

    /**
     * Met à jour un template d'email
     */
    async updateTemplate(
        userId: string,
        companyId: string,
        templateId: string,
        dto: UpdateEmailTemplateDto,
    ): Promise<EmailTemplate> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier que le template appartient à l'entreprise
        const { data: existing, error: fetchError } = await supabase
            .from('email_templates')
            .select('id')
            .eq('id', templateId)
            .eq('company_id', companyId)
            .single();

        if (fetchError || !existing) {
            throw new NotFoundException('Template non trouvé');
        }

        const updateData: any = { updated_at: new Date().toISOString() };
        if (dto.name) updateData.name = dto.name;
        if (dto.subject) updateData.subject = dto.subject;
        if (dto.body_html) updateData.body_html = dto.body_html;
        if (dto.body_text !== undefined) updateData.body_text = dto.body_text;

        const { data: template, error } = await supabase
            .from('email_templates')
            .update(updateData)
            .eq('id', templateId)
            .select()
            .single();

        if (error) {
            console.error('Error updating template:', error);
            throw new BadRequestException('Erreur lors de la mise à jour du template');
        }

        return template;
    }

    /**
     * Supprime un template d'email
     */
    async deleteTemplate(userId: string, companyId: string, templateId: string): Promise<void> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { error } = await supabase
            .from('email_templates')
            .delete()
            .eq('id', templateId)
            .eq('company_id', companyId);

        if (error) {
            console.error('Error deleting template:', error);
            throw new BadRequestException('Erreur lors de la suppression du template');
        }
    }

    // ============================================
    // ENVOI MANUEL
    // ============================================

    /**
     * Envoie un rappel manuel
     */
    async sendManualReminder(
        userId: string,
        companyId: string,
        dto: SendManualReminderDto,
    ): Promise<{ success: boolean; email_sent?: boolean; sms_sent?: boolean; errors?: string[] }> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();
        const errors: string[] = [];
        let emailSent = false;
        let smsSent = false;

        // Récupérer le document et le client
        let document: any;
        let client: any;

        if (dto.document_type === 'invoice') {
            const { data: invoice, error } = await supabase
                .from('invoices')
                .select('*, client:clients(*)')
                .eq('id', dto.document_id)
                .eq('company_id', companyId)
                .single();

            if (error || !invoice) {
                throw new NotFoundException('Facture non trouvée');
            }

            document = invoice;
            client = invoice.client;
        } else {
            const { data: quote, error } = await supabase
                .from('quotes')
                .select('*, client:clients(*)')
                .eq('id', dto.document_id)
                .eq('company_id', companyId)
                .single();

            if (error || !quote) {
                throw new NotFoundException('Devis non trouvé');
            }

            document = quote;
            client = quote.client;
        }

        // Récupérer l'entreprise
        const { data: company } = await supabase
            .from('companies')
            .select('*')
            .eq('id', companyId)
            .single();

        // Envoyer par email
        if (dto.channel === ReminderChannel.EMAIL || dto.channel === ReminderChannel.BOTH) {
            if (!client.email) {
                errors.push('Le client n\'a pas d\'adresse email');
            } else {
                let emailContent;

                if (dto.document_type === 'invoice') {
                    emailContent = this.notificationService.generateInvoiceReminderEmail(
                        document,
                        client,
                        company,
                        0,
                        dto.custom_message,
                    );
                } else {
                    emailContent = this.notificationService.generateQuoteReminderEmail(
                        document,
                        client,
                        company,
                        dto.custom_message,
                    );
                }

                if (dto.custom_subject) {
                    emailContent.subject = dto.custom_subject;
                }

                const result = await this.notificationService.sendEmail({
                    to: client.email,
                    subject: emailContent.subject,
                    html: emailContent.html,
                    text: emailContent.text,
                });

                if (result.success) {
                    emailSent = true;

                    // Enregistrer le rappel
                    await this.recordReminder(
                        companyId,
                        dto.document_type === 'invoice' ? dto.document_id : undefined,
                        dto.document_type === 'quote' ? dto.document_id : undefined,
                        client.id,
                        ReminderType.BEFORE_DUE,
                        ReminderChannel.EMAIL,
                        ReminderStatus.SENT,
                        result.message_id,
                    );
                } else {
                    errors.push(`Email: ${result.error}`);
                }
            }
        }

        // Envoyer par SMS
        if (dto.channel === ReminderChannel.SMS || dto.channel === ReminderChannel.BOTH) {
            if (!client.phone) {
                errors.push('Le client n\'a pas de numéro de téléphone');
            } else {
                let smsContent: string;

                if (dto.document_type === 'invoice') {
                    smsContent = this.notificationService.generateInvoiceReminderSms(document, company, 0);
                } else {
                    smsContent = this.notificationService.generateQuoteReminderSms(document, company);
                }

                const result = await this.notificationService.sendSms({
                    to: client.phone,
                    body: smsContent,
                });

                if (result.success) {
                    smsSent = true;

                    // Enregistrer le rappel
                    await this.recordReminder(
                        companyId,
                        dto.document_type === 'invoice' ? dto.document_id : undefined,
                        dto.document_type === 'quote' ? dto.document_id : undefined,
                        client.id,
                        ReminderType.BEFORE_DUE,
                        ReminderChannel.SMS,
                        ReminderStatus.SENT,
                        undefined,
                        result.message_id,
                    );
                } else {
                    errors.push(`SMS: ${result.error}`);
                }
            }
        }

        return {
            success: emailSent || smsSent,
            email_sent: emailSent,
            sms_sent: smsSent,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    /**
     * Enregistre un rappel en base de données
     */
    private async recordReminder(
        companyId: string,
        invoiceId: string | undefined,
        quoteId: string | undefined,
        clientId: string,
        type: ReminderType,
        channel: ReminderChannel,
        status: ReminderStatus,
        emailMessageId?: string,
        smsMessageId?: string,
    ): Promise<void> {
        const supabase = getSupabaseAdmin();

        await supabase.from('reminders').insert({
            company_id: companyId,
            invoice_id: invoiceId,
            quote_id: quoteId,
            client_id: clientId,
            type,
            channel,
            status,
            scheduled_at: new Date().toISOString(),
            sent_at: status === ReminderStatus.SENT ? new Date().toISOString() : null,
            email_message_id: emailMessageId,
            sms_message_id: smsMessageId,
        });
    }

    // ============================================
    // LISTE ET STATISTIQUES
    // ============================================

    /**
     * Récupère la liste des rappels
     */
    async findAll(
        userId: string,
        companyId: string,
        query: ReminderQueryDto,
    ): Promise<ReminderListResponse> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();
        const page = query.page || 1;
        const limit = query.limit || 20;
        const offset = (page - 1) * limit;

        let queryBuilder = supabase
            .from('reminders')
            .select('*', { count: 'exact' })
            .eq('company_id', companyId);

        if (query.invoice_id) {
            queryBuilder = queryBuilder.eq('invoice_id', query.invoice_id);
        }

        if (query.quote_id) {
            queryBuilder = queryBuilder.eq('quote_id', query.quote_id);
        }

        if (query.client_id) {
            queryBuilder = queryBuilder.eq('client_id', query.client_id);
        }

        if (query.status) {
            queryBuilder = queryBuilder.eq('status', query.status);
        }

        if (query.channel) {
            queryBuilder = queryBuilder.eq('channel', query.channel);
        }

        queryBuilder = queryBuilder
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const { data: reminders, error, count } = await queryBuilder;

        if (error) {
            console.error('Error fetching reminders:', error);
            throw new BadRequestException('Erreur lors de la récupération des rappels');
        }

        return {
            reminders: reminders || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    /**
     * Récupère les statistiques des rappels
     */
    async getStats(userId: string, companyId: string): Promise<ReminderStats> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { data: reminders, error } = await supabase
            .from('reminders')
            .select('status, channel, type')
            .eq('company_id', companyId);

        if (error) {
            console.error('Error fetching reminder stats:', error);
            throw new BadRequestException('Erreur lors de la récupération des statistiques');
        }

        const stats: ReminderStats = {
            total_sent: 0,
            total_pending: 0,
            total_failed: 0,
            sent_by_channel: {},
            sent_by_type: {},
        };

        reminders?.forEach((r: any) => {
            if (r.status === ReminderStatus.SENT) {
                stats.total_sent++;
                stats.sent_by_channel[r.channel] = (stats.sent_by_channel[r.channel] || 0) + 1;
                stats.sent_by_type[r.type] = (stats.sent_by_type[r.type] || 0) + 1;
            } else if (r.status === ReminderStatus.PENDING) {
                stats.total_pending++;
            } else if (r.status === ReminderStatus.FAILED) {
                stats.total_failed++;
            }
        });

        return stats;
    }

    // ============================================
    // TÂCHES PLANIFIÉES (CRON)
    // ============================================

    /**
     * Tâche CRON pour envoyer les rappels automatiques
     * S'exécute tous les jours à 9h00
     */
    @Cron(CronExpression.EVERY_DAY_AT_9AM)
    async processScheduledReminders(): Promise<void> {
        console.log('Processing scheduled reminders...');

        const supabase = getSupabaseAdmin();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Récupérer toutes les entreprises avec des rappels activés
        const { data: settings, error: settingsError } = await supabase
            .from('reminder_settings')
            .select('*')
            .eq('enabled', true);

        if (settingsError || !settings) {
            console.error('Error fetching reminder settings:', settingsError);
            return;
        }

        for (const companySetting of settings) {
            await this.processCompanyReminders(companySetting, today);
        }

        console.log('Scheduled reminders processed.');
    }

    /**
     * Traite les rappels pour une entreprise
     */
    private async processCompanyReminders(settings: ReminderSettings, today: Date): Promise<void> {
        const supabase = getSupabaseAdmin();

        // Traiter les factures
        if (settings.invoice_rules && settings.invoice_rules.length > 0) {
            const { data: invoices } = await supabase
                .from('invoices')
                .select('*, client:clients(*)')
                .eq('company_id', settings.company_id)
                .in('status', ['sent', 'overdue'])
                .not('due_date', 'is', null);

            if (invoices) {
                const { data: company } = await supabase
                    .from('companies')
                    .select('*')
                    .eq('id', settings.company_id)
                    .single();

                for (const invoice of invoices) {
                    await this.processInvoiceReminders(invoice, company, settings.invoice_rules, today);
                }
            }
        }

        // Traiter les devis
        if (settings.quote_rules && settings.quote_rules.length > 0) {
            const { data: quotes } = await supabase
                .from('quotes')
                .select('*, client:clients(*)')
                .eq('company_id', settings.company_id)
                .eq('status', 'sent')
                .not('validity_date', 'is', null);

            if (quotes) {
                const { data: company } = await supabase
                    .from('companies')
                    .select('*')
                    .eq('id', settings.company_id)
                    .single();

                for (const quote of quotes) {
                    await this.processQuoteReminders(quote, company, settings.quote_rules, today);
                }
            }
        }
    }

    /**
     * Traite les rappels pour une facture
     */
    private async processInvoiceReminders(
        invoice: any,
        company: any,
        rules: ReminderRuleDto[],
        today: Date,
    ): Promise<void> {
        const supabase = getSupabaseAdmin();
        const dueDate = new Date(invoice.due_date);
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        for (const rule of rules) {
            // Vérifier si le rappel doit être envoyé aujourd'hui
            if (diffDays !== rule.days_offset) continue;

            // Vérifier si un rappel a déjà été envoyé pour cette règle
            const { data: existingReminder } = await supabase
                .from('reminders')
                .select('id')
                .eq('invoice_id', invoice.id)
                .eq('type', rule.days_offset > 0 ? ReminderType.AFTER_DUE : ReminderType.BEFORE_DUE)
                .gte('created_at', today.toISOString())
                .single();

            if (existingReminder) continue;

            // Envoyer le rappel
            const client = invoice.client;

            if (rule.channel === ReminderChannel.EMAIL || rule.channel === ReminderChannel.BOTH) {
                if (client.email) {
                    const emailContent = this.notificationService.generateInvoiceReminderEmail(
                        invoice,
                        client,
                        company,
                        rule.days_offset,
                    );

                    const result = await this.notificationService.sendEmail({
                        to: client.email,
                        subject: emailContent.subject,
                        html: emailContent.html,
                        text: emailContent.text,
                    });

                    await this.recordReminder(
                        company.id,
                        invoice.id,
                        undefined,
                        client.id,
                        rule.days_offset > 0 ? ReminderType.AFTER_DUE : ReminderType.BEFORE_DUE,
                        ReminderChannel.EMAIL,
                        result.success ? ReminderStatus.SENT : ReminderStatus.FAILED,
                        result.message_id,
                    );
                }
            }

            if (rule.channel === ReminderChannel.SMS || rule.channel === ReminderChannel.BOTH) {
                if (client.phone) {
                    const smsContent = this.notificationService.generateInvoiceReminderSms(
                        invoice,
                        company,
                        rule.days_offset,
                    );

                    const result = await this.notificationService.sendSms({
                        to: client.phone,
                        body: smsContent,
                    });

                    await this.recordReminder(
                        company.id,
                        invoice.id,
                        undefined,
                        client.id,
                        rule.days_offset > 0 ? ReminderType.AFTER_DUE : ReminderType.BEFORE_DUE,
                        ReminderChannel.SMS,
                        result.success ? ReminderStatus.SENT : ReminderStatus.FAILED,
                        undefined,
                        result.message_id,
                    );
                }
            }
        }
    }

    /**
     * Traite les rappels pour un devis
     */
    private async processQuoteReminders(
        quote: any,
        company: any,
        rules: ReminderRuleDto[],
        today: Date,
    ): Promise<void> {
        const supabase = getSupabaseAdmin();
        const validUntil = new Date(quote.validity_date);
        validUntil.setHours(0, 0, 0, 0);

        const diffDays = Math.round((today.getTime() - validUntil.getTime()) / (1000 * 60 * 60 * 24));

        for (const rule of rules) {
            // Seuls les rappels avant expiration sont pertinents pour les devis
            if (rule.days_offset > 0) continue;
            if (diffDays !== rule.days_offset) continue;

            // Vérifier si un rappel a déjà été envoyé pour cette règle
            const { data: existingReminder } = await supabase
                .from('reminders')
                .select('id')
                .eq('quote_id', quote.id)
                .eq('type', ReminderType.QUOTE_EXPIRING)
                .gte('created_at', today.toISOString())
                .single();

            if (existingReminder) continue;

            // Envoyer le rappel
            const client = quote.client;

            if (rule.channel === ReminderChannel.EMAIL || rule.channel === ReminderChannel.BOTH) {
                if (client.email) {
                    const emailContent = this.notificationService.generateQuoteReminderEmail(
                        quote,
                        client,
                        company,
                    );

                    const result = await this.notificationService.sendEmail({
                        to: client.email,
                        subject: emailContent.subject,
                        html: emailContent.html,
                        text: emailContent.text,
                    });

                    await this.recordReminder(
                        company.id,
                        undefined,
                        quote.id,
                        client.id,
                        ReminderType.QUOTE_EXPIRING,
                        ReminderChannel.EMAIL,
                        result.success ? ReminderStatus.SENT : ReminderStatus.FAILED,
                        result.message_id,
                    );
                }
            }

            if (rule.channel === ReminderChannel.SMS || rule.channel === ReminderChannel.BOTH) {
                if (client.phone) {
                    const smsContent = this.notificationService.generateQuoteReminderSms(quote, company);

                    const result = await this.notificationService.sendSms({
                        to: client.phone,
                        body: smsContent,
                    });

                    await this.recordReminder(
                        company.id,
                        undefined,
                        quote.id,
                        client.id,
                        ReminderType.QUOTE_EXPIRING,
                        ReminderChannel.SMS,
                        result.success ? ReminderStatus.SENT : ReminderStatus.FAILED,
                        undefined,
                        result.message_id,
                    );
                }
            }
        }
    }
}
