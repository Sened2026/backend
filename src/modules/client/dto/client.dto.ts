import {
    IsString,
    IsOptional,
    IsEmail,
    IsNotEmpty,
    IsEnum,
    IsUUID,
    IsIn,
    MaxLength,
    MinLength,
    IsNumber,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Types de client
 */
export enum ClientType {
    INDIVIDUAL = 'individual',
    PROFESSIONAL = 'professional',
}

/**
 * Secteur client (private = entreprise, public = organisme public)
 */
export type ClientSector = 'private' | 'public';

/**
 * Statut d'éligibilité Chorus Pro
 */
export type ChorusEligibilityStatus = 'unchecked' | 'eligible' | 'ineligible' | 'error';

/**
 * DTO pour la création d'un client
 */
export class CreateClientDto {
    @IsEnum(ClientType)
    type: ClientType = ClientType.PROFESSIONAL;

    @IsOptional()
    @IsString()
    @IsIn(['private', 'public'])
    client_sector?: ClientSector;

    // Champs pour particulier
    @IsOptional()
    @IsString()
    @MaxLength(100)
    first_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    last_name?: string;

    // Champs pour professionnel
    @IsOptional()
    @IsString()
    @MaxLength(255)
    company_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(14)
    siret?: string;

    @IsOptional()
    @IsString()
    @MaxLength(9)
    siren?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    vat_number?: string;

    // Champs de contact communs
    @IsEmail()
    @IsNotEmpty({ message: 'L’email du client est requis' })
    @MaxLength(255)
    email: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    signature_contact_first_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    signature_contact_last_name?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    signature_contact_email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    signature_contact_phone?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    city?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    postal_code?: string;

    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(2)
    country?: string = 'FR';

    @IsOptional()
    @IsString()
    notes?: string;

    // Champs Chorus Pro
    @IsOptional()
    @IsString()
    @MaxLength(50)
    chorus_pro_code_destinataire?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    chorus_pro_cadre_facturation?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    chorus_pro_code_service_executant?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    chorus_pro_numero_engagement?: string;
}

/**
 * DTO pour la mise à jour d'un client
 */
export class UpdateClientDto {
    @IsOptional()
    @IsEnum(ClientType)
    type?: ClientType;

    @IsOptional()
    @IsString()
    @IsIn(['private', 'public'])
    client_sector?: ClientSector;

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
    @MaxLength(255)
    company_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(14)
    siret?: string;

    @IsOptional()
    @IsString()
    @MaxLength(9)
    siren?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    vat_number?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    signature_contact_first_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    signature_contact_last_name?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    signature_contact_email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    signature_contact_phone?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    city?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    postal_code?: string;

    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(2)
    country?: string;

    @IsOptional()
    @IsString()
    notes?: string;

    // Champs Chorus Pro
    @IsOptional()
    @IsString()
    @MaxLength(50)
    chorus_pro_code_destinataire?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    chorus_pro_cadre_facturation?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    chorus_pro_code_service_executant?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    chorus_pro_numero_engagement?: string;
}

/**
 * DTO pour les paramètres de requête (liste des clients)
 */
export class ClientQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(ClientType)
    type?: ClientType;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    limit?: number = 20;
}

/**
 * Interface pour un client
 */
export interface Client {
    id: string;
    company_id: string;
    type: ClientType;
    client_sector?: ClientSector | null;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    siret?: string;
    siren?: string;
    vat_number?: string;
    email?: string;
    phone?: string;
    signature_contact_first_name?: string | null;
    signature_contact_last_name?: string | null;
    signature_contact_email?: string | null;
    signature_contact_phone?: string | null;
    address?: string;
    city?: string;
    postal_code?: string;
    country: string;
    notes?: string;
    // Chorus Pro: valeurs par défaut soumission
    chorus_pro_code_destinataire?: string;
    chorus_pro_cadre_facturation?: string;
    chorus_pro_code_service_executant?: string;
    chorus_pro_numero_engagement?: string;
    // Chorus Pro: éligibilité (géré par verify-chorus uniquement)
    chorus_pro_eligibility_status: ChorusEligibilityStatus;
    chorus_pro_structure_id?: number | null;
    chorus_pro_structure_label?: string | null;
    chorus_pro_service_code_required?: boolean | null;
    chorus_pro_engagement_required?: boolean | null;
    chorus_pro_services?: any[] | null;
    chorus_pro_last_checked_at?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * DTO de réponse pour un client
 */
export class ClientResponseDto implements Client {
    id: string;
    company_id: string;
    type: ClientType;
    client_sector?: ClientSector | null;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    siret?: string;
    siren?: string;
    vat_number?: string;
    email?: string;
    phone?: string;
    signature_contact_first_name?: string | null;
    signature_contact_last_name?: string | null;
    signature_contact_email?: string | null;
    signature_contact_phone?: string | null;
    address?: string;
    city?: string;
    postal_code?: string;
    country: string;
    notes?: string;
    chorus_pro_code_destinataire?: string;
    chorus_pro_cadre_facturation?: string;
    chorus_pro_code_service_executant?: string;
    chorus_pro_numero_engagement?: string;
    chorus_pro_eligibility_status: ChorusEligibilityStatus;
    chorus_pro_structure_id?: number | null;
    chorus_pro_structure_label?: string | null;
    chorus_pro_service_code_required?: boolean | null;
    chorus_pro_engagement_required?: boolean | null;
    chorus_pro_services?: any[] | null;
    chorus_pro_last_checked_at?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * DTO de réponse pour la liste des clients
 */
export class ClientListResponseDto {
    clients: Client[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
