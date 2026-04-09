import {
    IsString,
    IsOptional,
    IsUUID,
    MaxLength,
    MinLength,
    Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO pour la création d'une catégorie de produit
 */
export class CreateCategoryDto {
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsString()
    @Matches(/^#[0-9A-Fa-f]{6}$/, {
        message: 'La couleur doit être au format hexadécimal (ex: #6366f1)',
    })
    color?: string;
}

/**
 * DTO pour la mise à jour d'une catégorie
 */
export class UpdateCategoryDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @Matches(/^#[0-9A-Fa-f]{6}$/, {
        message: 'La couleur doit être au format hexadécimal (ex: #6366f1)',
    })
    color?: string;
}

/**
 * DTO pour les paramètres de requête
 */
export class CategoryQueryDto {
    @IsOptional()
    @IsString()
    search?: string;
}

/**
 * Interface pour une catégorie
 */
export interface ProductCategory {
    id: string;
    company_id: string;
    name: string;
    color: string;
    created_at: string;
    updated_at: string;
}

/**
 * DTO de réponse pour une catégorie
 */
export class CategoryResponseDto implements ProductCategory {
    id: string;
    company_id: string;
    name: string;
    color: string;
    created_at: string;
    updated_at: string;
}

/**
 * DTO de réponse pour la liste des catégories
 */
export class CategoryListResponseDto {
    categories: CategoryResponseDto[];
    total: number;
}
