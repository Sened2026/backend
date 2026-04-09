import {
    IsString,
    IsNumber,
    IsOptional,
    IsUUID,
    IsEnum,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ==========================================
// ENUMS
// ==========================================

export enum PaymentMethod {
    CARD = 'card',
    BANK_TRANSFER = 'bank_transfer',
    CHECK = 'check',
    CASH = 'cash',
    OTHER = 'other',
}

export enum PaymentStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    SUCCEEDED = 'succeeded',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    REFUNDED = 'refunded',
}

// ==========================================
// DTOs
// ==========================================

/**
 * DTO pour enregistrer un paiement manuel
 */
export class RecordManualPaymentDto {
    @IsUUID()
    invoice_id: string;

    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
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
    @IsString()
    paid_at?: string;
}

/**
 * DTO pour un remboursement
 */
export class RefundPaymentDto {
    @IsUUID()
    payment_id: string;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
    amount?: number; // Si non spécifié, remboursement total

    @IsOptional()
    @IsString()
    reason?: string;
}

/**
 * DTO pour les query params de liste des paiements
 */
export class PaymentQueryDto {
    @IsOptional()
    @IsUUID()
    invoice_id?: string;

    @IsOptional()
    @IsUUID()
    client_id?: string;

    @IsOptional()
    @IsEnum(PaymentStatus)
    status?: PaymentStatus;

    @IsOptional()
    @IsEnum(PaymentMethod)
    payment_method?: PaymentMethod;

    @IsOptional()
    @IsString()
    from_date?: string;

    @IsOptional()
    @IsString()
    to_date?: string;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    @Min(1)
    limit?: number = 20;
}

// ==========================================
// INTERFACES
// ==========================================

export interface Payment {
    id: string;
    invoice_id: string;
    amount: number;
    payment_method: PaymentMethod;
    status: PaymentStatus;
    reference?: string;
    notes?: string;
    paid_at: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export interface PaymentListResponse {
    payments: Payment[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface PaymentStats {
    total_received: number;
    total_pending: number;
    total_refunded: number;
    count_by_method: Record<string, number>;
}
