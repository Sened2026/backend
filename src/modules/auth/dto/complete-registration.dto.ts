import { IsString, IsEmail, IsOptional, IsNotEmpty, Length, Matches, IsIn, ValidateIf } from 'class-validator';

export class CompleteRegistrationDto {
    @IsString()
    @IsNotEmpty()
    first_name: string;

    @IsString()
    @IsNotEmpty()
    last_name: string;

    @IsEmail()
    email: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsIn(['create', 'join_only'])
    company_creation_mode?: 'create' | 'join_only';

    @ValidateIf((o) => o.company_creation_mode !== 'join_only')
    @IsString()
    @IsNotEmpty()
    company_name?: string;

    @ValidateIf((o) => o.company_creation_mode !== 'join_only')
    @IsString()
    @IsNotEmpty()
    @Length(9, 9, { message: 'Le SIREN doit contenir exactement 9 chiffres' })
    @Matches(/^\d{9}$/, { message: 'Le SIREN doit contenir uniquement des chiffres' })
    siren?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    postal_code?: string;

    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @IsString()
    country?: string;

    @IsOptional()
    @IsString()
    plan_slug?: string;

    @IsOptional()
    @IsString()
    role?: 'merchant_admin' | 'merchant_consultant' | 'accountant' | 'accountant_consultant' | 'superadmin';

    @IsOptional()
    @IsString()
    accountant_siren?: string;
}
