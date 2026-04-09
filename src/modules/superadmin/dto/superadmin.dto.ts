import { IsOptional, IsUUID } from 'class-validator';
import { CompanyQueryDto } from '../../company/dto/company.dto';
import { InvoiceQueryDto, InvoiceType } from '../../invoice/dto/invoice.dto';
import { QuoteQueryDto } from '../../quote/dto/quote.dto';

export class SuperadminCompanyQueryDto extends CompanyQueryDto {}

export class SuperadminQuoteQueryDto extends QuoteQueryDto {
    @IsOptional()
    @IsUUID()
    company_id?: string;
}

export class SuperadminInvoiceQueryDto extends InvoiceQueryDto {
    @IsOptional()
    @IsUUID()
    company_id?: string;
}

export interface SuperadminCompanySummaryDto {
    id: string;
    name: string;
    legal_name: string | null;
    siren: string | null;
    city: string | null;
    country: string;
    logo_url: string | null;
    created_at: string;
}

export interface SuperadminCompanyListResponseDto {
    companies: SuperadminCompanySummaryDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export type SuperadminInvoiceDocumentType = InvoiceType | 'all';
