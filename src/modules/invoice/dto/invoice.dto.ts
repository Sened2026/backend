import {
    IsString,
    IsOptional,
    IsUUID,
    IsNumber,
    IsEnum,
    IsArray,
    ValidateNested,
    IsDateString,
    Min,
    IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Enum pour le statut de la facture
 */
export enum InvoiceStatus {
    DRAFT = 'draft',
    SENT = 'sent',
    PAID = 'paid',
    OVERDUE = 'overdue',
    CANCELLED = 'cancelled',
}

/**
 * Enum pour le type de facture
 */
export enum InvoiceType {
    STANDARD = 'standard',
    DEPOSIT = 'deposit',
    FINAL = 'final',
    CREDIT_NOTE = 'credit_note',
}

/**
 * Enum pour le type de remise
 */
export enum DiscountType {
    PERCENTAGE = 'percentage',
    FIXED = 'fixed',
}

/**
 * Enum pour le profil Factur-X
 */
export enum FacturXProfile {
    MINIMUM = 'minimum',
    BASIC = 'basic',
    EN16931 = 'en16931',
}

/**
 * Enum pour la méthode de paiement
 */
export enum PaymentMethod {
    CARD = 'card',
    BANK_TRANSFER = 'bank_transfer',
    CASH = 'cash',
    CHECK = 'check',
    OTHER = 'other',
}

/**
 * DTO pour une ligne de facture
 */
export class InvoiceItemDto {
    @IsOptional()
    @IsUUID()
    id?: string;

    @IsOptional()
    @IsUUID()
    product_id?: string;

    @IsNumber()
    @Min(0)
    position: number;

    @IsOptional()
    @IsString()
    reference?: string;

    @IsString()
    description: string;

    @IsNumber()
    @Min(0)
    quantity: number;

    @IsOptional()
    @IsString()
    unit?: string;

    @IsNumber()
    @Min(0)
    unit_price: number;

    @IsNumber()
    @Min(0)
    vat_rate: number;

    @IsOptional()
    @IsEnum(DiscountType)
    discount_type?: DiscountType;

    @IsOptional()
    @IsNumber()
    @Min(0)
    discount_value?: number;
}

/**
 * DTO pour créer une facture
 */
export class CreateInvoiceDto {
    @IsUUID()
    client_id: string;

    @IsOptional()
    @IsUUID()
    quote_id?: string;

    @IsOptional()
    @IsEnum(InvoiceType)
    type?: InvoiceType;

    @IsOptional()
    @IsUUID()
    parent_invoice_id?: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    subject?: string;

    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @IsOptional()
    @IsDateString()
    due_date?: string;

    @IsOptional()
    @IsEnum(DiscountType)
    discount_type?: DiscountType;

    @IsOptional()
    @IsNumber()
    @Min(0)
    discount_value?: number;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    footer?: string;

    @IsOptional()
    @IsString()
    terms_and_conditions?: string;

    @IsOptional()
    @IsEnum(FacturXProfile)
    facturx_profile?: FacturXProfile;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvoiceItemDto)
    items: InvoiceItemDto[];
}

/**
 * DTO pour mettre à jour une facture
 */
export class UpdateInvoiceDto {
    @IsOptional()
    @IsUUID()
    client_id?: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    subject?: string;

    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @IsOptional()
    @IsDateString()
    due_date?: string;

    @IsOptional()
    @IsEnum(DiscountType)
    discount_type?: DiscountType;

    @IsOptional()
    @IsNumber()
    @Min(0)
    discount_value?: number;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    footer?: string;

    @IsOptional()
    @IsString()
    terms_and_conditions?: string;

    @IsOptional()
    @IsEnum(FacturXProfile)
    facturx_profile?: FacturXProfile;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvoiceItemDto)
    items?: InvoiceItemDto[];
}

/**
 * DTO pour les paramètres de requête
 */
export class InvoiceQueryDto {
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    page?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number;

    @IsOptional()
    @IsEnum(InvoiceStatus)
    status?: InvoiceStatus;

    @IsOptional()
    @IsEnum(InvoiceType)
    type?: InvoiceType;

    @IsOptional()
    @IsUUID()
    client_id?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsDateString()
    from_date?: string;

    @IsOptional()
    @IsDateString()
    to_date?: string;

    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    overdue_only?: boolean;
}

/**
 * DTO pour signer une facture
 */
export class SignInvoiceDto {
    @IsString()
    signer_name: string;

    @IsString()
    signer_email: string;

    @IsBoolean()
    consent_accepted: boolean;
}

/**
 * DTO pour enregistrer un paiement manuel
 */
export class RecordPaymentDto {
    @IsNumber()
    @Min(0.01)
    amount: number;

    @IsEnum(PaymentMethod)
    payment_method: PaymentMethod;

    @IsOptional()
    @IsString()
    reference?: string;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsDateString()
    paid_at?: string;
}

/**
 * DTO pour créer une facture d'acompte
 */
export class CreateDepositInvoiceDto {
    @IsNumber()
    @Min(0.01)
    amount: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    percentage?: number;

    @IsOptional()
    @IsDateString()
    due_date?: string;
}

/**
 * DTO pour créer un avoir
 */
export class CreateCreditNoteDto {
    @IsString()
    reason: string;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    amount?: number;
}

/**
 * DTO pour annuler une facture
 */
export class CancelInvoiceDto {
    @IsString()
    reason: string;

    @IsOptional()
    @IsBoolean()
    create_credit_note?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    credit_note_amount?: number;
}

/**
 * Interface pour une ligne de facture
 */
export interface InvoiceItem {
    id: string;
    invoice_id: string;
    product_id: string | null;
    position: number;
    reference: string | null;
    description: string;
    quantity: number;
    unit: string | null;
    unit_price: number;
    vat_rate: number;
    discount_type: DiscountType | null;
    discount_value: number;
    line_total: number;
    created_at: string;
}

/**
 * Interface pour un paiement
 */
export interface Payment {
    id: string;
    invoice_id: string;
    amount: number;
    payment_method: PaymentMethod;
    reference: string | null;
    paid_at: string;
    notes: string | null;
    created_by: string | null;
    created_at: string;
}

/**
 * Interface pour une facture
 */
export interface Invoice {
    id: string;
    company_id: string;
    client_id: string;
    quote_id: string | null;
    created_by: string;
    invoice_number: string;
    status: InvoiceStatus;
    type: InvoiceType;
    parent_invoice_id: string | null;
    title: string | null;
    issue_date: string;
    due_date: string;
    subtotal: number;
    total_vat: number;
    total: number;
    discount_type: DiscountType | null;
    discount_value: number;
    amount_paid: number;
    notes: string | null;
    payment_method: string | null;
    pdf_url: string | null;
    paid_at: string | null;
    signed_at: string | null;
    signature_checkbox: boolean;
    signer_name: string | null;
    signer_ip: string | null;
    signature_token: string;
    signature_token_expires_at: string | null;
    sent_at: string | null;
    viewed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    facturx_profile: FacturXProfile;
    facturx_xml: string | null;
    created_at: string;
    updated_at: string;
    has_credit_note?: boolean;
    linked_credit_note_id?: string | null;
    linked_credit_note_number?: string | null;
    items?: InvoiceItem[];
    payments?: Payment[];
    client?: any;
    company?: any;
    quote?: any;
    parent_invoice?: Invoice | null;
    deposit_invoices?: Invoice[];
}

/**
 * Interface pour la réponse de liste de factures
 */
export interface InvoiceListResponse {
    invoices: Invoice[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/**
 * Interface pour les statistiques de facturation
 */
export interface InvoiceStats {
    total_invoiced: number;
    total_paid: number;
    total_pending: number;
    total_overdue: number;
    count_draft: number;
    count_sent: number;
    count_paid: number;
    count_overdue: number;
    total_invoiced_breakdown: {
        base_amount: number;
        cancelled_deduction: number;
        credit_notes_correction: number;
        final_amount: number;
    };
    total_paid_breakdown: {
        base_amount: number;
        cancelled_deduction: number;
        credit_notes_correction: number;
        final_amount: number;
    };
}

/**
 * DTO pour envoyer une relance de paiement
 */
export class SendReminderDto {
    @IsOptional()
    @IsNumber()
    @Min(1)
    level?: number; // 1, 2, ou 3

    @IsOptional()
    @IsString()
    custom_message?: string;

    @IsOptional()
    @IsBoolean()
    include_pdf?: boolean;
}
