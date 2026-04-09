import { IsString, IsOptional } from 'class-validator';

export class SubmitInvoiceChorusDto {
    @IsString()
    codeDestinataire: string;

    @IsOptional()
    @IsString()
    codeServiceExecutant?: string;

    @IsOptional()
    @IsString()
    numeroEngagement?: string;

    @IsString()
    cadreFacturation: string;
}
