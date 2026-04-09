import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PLATFORM_DOCUMENT_TYPES = [
    'platform_cgv',
    'privacy_policy',
    'legal_notice',
] as const;

export const COMPANY_DOCUMENT_TYPES = ['sales_terms'] as const;

export const LEGAL_DOCUMENT_TYPES = [
    ...PLATFORM_DOCUMENT_TYPES,
    ...COMPANY_DOCUMENT_TYPES,
] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export class UpsertLegalDocumentDraftDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    title?: string;

    @IsString()
    content_text: string;
}
