import { IsOptional, IsString, IsUrl, MaxLength, IsEmail, IsPhoneNumber } from 'class-validator';

/**
 * DTO pour la mise à jour du profil utilisateur
 */
export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    first_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    last_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsUrl()
    avatar_url?: string;

    @IsOptional()
    @IsUrl()
    signature_url?: string;
}

/**
 * DTO de réponse pour le profil utilisateur
 */
export class ProfileResponseDto {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    address: string | null;
    avatar_url: string | null;
    signature_url: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * DTO pour le profil complet avec abonnement
 */
export class ProfileWithSubscriptionDto extends ProfileResponseDto {
    subscription: {
        id: string;
        plan_name: string;
        plan_slug: string;
        status: string;
        max_companies: number | null;
        current_period_end: string | null;
    } | null;
}
