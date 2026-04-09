import { IsString, IsOptional, IsEnum, IsBoolean, IsNumber, IsArray, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// ENUMS
// ============================================

export enum ReminderType {
    BEFORE_DUE = 'before_due',      // Avant échéance
    AFTER_DUE = 'after_due',        // Après échéance (retard)
    QUOTE_EXPIRING = 'quote_expiring', // Devis qui expire
}

export enum ReminderChannel {
    EMAIL = 'email',
    SMS = 'sms',
    BOTH = 'both',
}

export enum ReminderStatus {
    PENDING = 'pending',
    SENT = 'sent',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

// ============================================
// DTOs - Configuration des rappels
// ============================================

export class ReminderRuleDto {
    @IsNumber()
    @Min(-365)
    @Max(365)
    days_offset: number; // Négatif = avant, Positif = après échéance

    @IsEnum(ReminderChannel)
    channel: ReminderChannel;

    @IsOptional()
    @IsString()
    email_template_id?: string;

    @IsOptional()
    @IsString()
    sms_template?: string;
}

export class UpdateReminderSettingsDto {
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @IsOptional()
    @IsArray()
    @Type(() => ReminderRuleDto)
    invoice_rules?: ReminderRuleDto[];

    @IsOptional()
    @IsArray()
    @Type(() => ReminderRuleDto)
    quote_rules?: ReminderRuleDto[];

    @IsOptional()
    @IsString()
    sender_email?: string;

    @IsOptional()
    @IsString()
    sender_name?: string;
}

// ============================================
// DTOs - Envoi manuel
// ============================================

export class SendManualReminderDto {
    @IsUUID()
    document_id: string;

    @IsEnum(['invoice', 'quote'])
    document_type: 'invoice' | 'quote';

    @IsEnum(ReminderChannel)
    channel: ReminderChannel;

    @IsOptional()
    @IsString()
    custom_message?: string;

    @IsOptional()
    @IsString()
    custom_subject?: string;
}

// ============================================
// DTOs - Templates
// ============================================

export class CreateEmailTemplateDto {
    @IsString()
    name: string;

    @IsString()
    subject: string;

    @IsString()
    body_html: string;

    @IsOptional()
    @IsString()
    body_text?: string;

    @IsEnum(ReminderType)
    type: ReminderType;
}

export class UpdateEmailTemplateDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    subject?: string;

    @IsOptional()
    @IsString()
    body_html?: string;

    @IsOptional()
    @IsString()
    body_text?: string;
}

// ============================================
// DTOs - Query
// ============================================

export class ReminderQueryDto {
    @IsOptional()
    @IsUUID()
    invoice_id?: string;

    @IsOptional()
    @IsUUID()
    quote_id?: string;

    @IsOptional()
    @IsUUID()
    client_id?: string;

    @IsOptional()
    @IsEnum(ReminderStatus)
    status?: ReminderStatus;

    @IsOptional()
    @IsEnum(ReminderChannel)
    channel?: ReminderChannel;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number;
}

// ============================================
// INTERFACES - Réponses
// ============================================

export interface ReminderSettings {
    id: string;
    company_id: string;
    enabled: boolean;
    invoice_rules: ReminderRuleDto[];
    quote_rules: ReminderRuleDto[];
    sender_email?: string;
    sender_name?: string;
    created_at: string;
    updated_at: string;
}

export interface EmailTemplate {
    id: string;
    company_id: string;
    name: string;
    subject: string;
    body_html: string;
    body_text?: string;
    type: ReminderType;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface Reminder {
    id: string;
    company_id: string;
    invoice_id?: string;
    quote_id?: string;
    client_id: string;
    type: ReminderType;
    channel: ReminderChannel;
    status: ReminderStatus;
    level?: 1 | 2 | 3 | null;
    scheduled_at: string;
    sent_at?: string;
    error_message?: string;
    email_message_id?: string;
    sms_message_id?: string;
    created_at: string;
}

export interface ReminderListResponse {
    reminders: Reminder[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface ReminderStats {
    total_sent: number;
    total_pending: number;
    total_failed: number;
    sent_by_channel: Record<string, number>;
    sent_by_type: Record<string, number>;
}

// ============================================
// INTERFACES - Email/SMS
// ============================================

export interface EmailData {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
    attachments?: Array<{
        filename: string;
        content: Buffer | string;
        contentType?: string;
    }>;
}

export interface SmsData {
    to: string;
    body: string;
}

export interface SendResult {
    success: boolean;
    message_id?: string;
    error?: string;
}
