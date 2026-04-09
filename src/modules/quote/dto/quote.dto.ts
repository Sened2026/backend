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
 * Enum pour le statut du devis
 */
export enum QuoteStatus {
    DRAFT = 'draft',
    SENT = 'sent',
    VIEWED = 'viewed',
    ACCEPTED = 'accepted',
    SIGNED = 'signed',
    REFUSED = 'refused',
    EXPIRED = 'expired',
    CONVERTED = 'converted',
}

/**
 * Enum pour le type de remise
 */
export enum DiscountType {
    PERCENTAGE = 'percentage',
    FIXED = 'fixed',
}

export enum QuoteSignatureProvider {
    INTERNAL = 'internal',
    YOUSIGN = 'yousign',
}

/**
 * DTO pour une ligne de devis
 */
export class QuoteItemDto {
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
 * DTO pour créer un devis
 */
export class CreateQuoteDto {
    @IsUUID()
    client_id: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    subject?: string;

    @IsOptional()
    @IsString()
    introduction?: string;

    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @IsOptional()
    @IsDateString()
    validity_date?: string;

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
    terms?: string;

    @IsOptional()
    @IsString()
    terms_and_conditions?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuoteItemDto)
    items: QuoteItemDto[];
}

/**
 * DTO pour mettre à jour un devis
 */
export class UpdateQuoteDto {
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
    @IsString()
    introduction?: string;

    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @IsOptional()
    @IsDateString()
    validity_date?: string;

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
    terms?: string;

    @IsOptional()
    @IsString()
    terms_and_conditions?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuoteItemDto)
    items?: QuoteItemDto[];
}

/**
 * DTO pour les paramètres de requête
 */
export class QuoteQueryDto {
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    page?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number;

    @IsOptional()
    @IsEnum(QuoteStatus)
    status?: QuoteStatus;

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
}

/**
 * DTO pour signer un devis
 */
export class SignQuoteDto {
    @IsString()
    signer_name: string;

    @IsString()
    signer_email: string;

    @IsOptional()
    @IsBoolean()
    cgv_accepted?: boolean;

    @IsBoolean()
    consent_accepted: boolean;
}

export class SendQuoteDto {
    @IsOptional()
    @IsBoolean()
    confirm_send_without_cgv?: boolean;
}

/**
 * DTO pour refuser un devis
 */
export class RefuseQuoteDto {
    @IsOptional()
    @IsString()
    reason?: string;
}

/**
 * Interface pour une ligne de devis
 */
export interface QuoteItem {
    id: string;
    quote_id: string;
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
 * Interface pour un devis
 */
export interface Quote {
    id: string;
    company_id: string;
    client_id: string;
    created_by: string;
    quote_number: string;
    status: QuoteStatus;
    title: string | null;
    subject?: string | null;
    introduction: string | null;
    issue_date: string;
    validity_date: string;
    subtotal: number;
    total_vat: number;
    total: number;
    discount_type: DiscountType | null;
    discount_value: number;
    notes: string | null;
    terms: string | null;
    terms_and_conditions?: string | null;
    legal_document_version_id?: string | null;
    legal_document_version_number?: number | null;
    terms_checksum_sha256?: string | null;
    pdf_url: string | null;
    signature_token: string;
    signature_token_expires_at: string | null;
    signature_provider: QuoteSignatureProvider;
    yousign_signature_request_id?: string | null;
    yousign_document_id?: string | null;
    yousign_signer_id?: string | null;
    yousign_status?: string | null;
    yousign_signature_link_expires_at?: string | null;
    yousign_last_event_name?: string | null;
    yousign_last_event_at?: string | null;
    signed_at: string | null;
    signature_checkbox: boolean;
    signer_name: string | null;
    signer_ip: string | null;
    converted_to_invoice_id: string | null;
    viewed_at: string | null;
    sent_at: string | null;
    refused_at: string | null;
    refusal_reason: string | null;
    created_at: string;
    updated_at: string;
    items?: QuoteItem[];
    client?: any;
    company?: any;
}

export interface PublicQuote extends Quote {
    is_signature_link_expired: boolean;
    can_sign: boolean;
    can_refuse: boolean;
    can_start_signature: boolean;
    has_terms_snapshot: boolean;
    terms_public_url: string | null;
}

export interface PublicQuoteTerms {
    quote_number: string;
    company: {
        name: string | null;
        legal_name?: string | null;
    } | null;
    has_terms_snapshot: boolean;
    legal_document_version_number: number | null;
    terms_and_conditions: string | null;
    terms_checksum_sha256: string | null;
}

/**
 * Interface pour la réponse de liste de devis
 */
export interface QuoteListResponse {
    quotes: Quote[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface SendQuoteResponse {
    quote: Quote;
    public_url: string;
    warnings: string[];
}

export type QuoteSignatureDocumentKind = 'signed_quote' | 'audit_trail';

export interface QuoteSignatureDocument {
    id: string;
    filename: string;
    mime_type: string;
    created_at: string;
    kind: QuoteSignatureDocumentKind;
}
