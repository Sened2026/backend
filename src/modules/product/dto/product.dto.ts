import {
    IsString,
    IsOptional,
    IsNumber,
    IsBoolean,
    IsUUID,
    MaxLength,
    Min,
    Max,
    ValidateIf,
    ValidateNested,
    ArrayMaxSize,
    IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO pour une ligne de taxe (produit multi-TVA)
 */
export class TaxLineDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    label?: string;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Type(() => Number)
    amount: number;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    @Type(() => Number)
    tax_rate: number;

    @IsNumber()
    @Min(0)
    @Type(() => Number)
    position: number;
}

/**
 * DTO pour la création d'un produit
 */
export class CreateProductDto {
    @IsOptional()
    @IsString()
    @MaxLength(50)
    reference?: string;

    @IsString()
    @MaxLength(255)
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsUUID()
    unit_id?: string;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Type(() => Number)
    unit_price: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    @Type(() => Number)
    vat_rate?: number;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    is_active?: boolean;

    @IsOptional()
    @IsUUID()
    category_id?: string;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    has_multi_tax?: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @ArrayMaxSize(4)
    @Type(() => TaxLineDto)
    tax_lines?: TaxLineDto[];
}

/**
 * DTO pour la mise à jour d'un produit
 */
export class UpdateProductDto {
    @IsOptional()
    @IsString()
    @MaxLength(50)
    reference?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @ValidateIf((o) => o.unit_id !== null)
    @IsUUID()
    unit_id?: string | null;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Type(() => Number)
    unit_price?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    @Type(() => Number)
    vat_rate?: number;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    is_active?: boolean;

    @IsOptional()
    @ValidateIf((o) => o.category_id !== null)
    @IsUUID()
    category_id?: string | null;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    has_multi_tax?: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @ArrayMaxSize(4)
    @Type(() => TaxLineDto)
    tax_lines?: TaxLineDto[];
}

/**
 * DTO pour les paramètres de requête (pagination, recherche, filtres)
 */
export class ProductQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

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

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return undefined;
    })
    is_active?: boolean;

    @IsOptional()
    @IsString()
    sort_by?: 'name' | 'reference' | 'unit_price' | 'created_at' = 'name';

    @IsOptional()
    @IsString()
    sort_order?: 'asc' | 'desc' = 'asc';
}

/**
 * Interface pour un produit avec unité
 */
export interface ProductWithUnit {
    id: string;
    company_id: string;
    reference: string | null;
    name: string;
    description: string | null;
    unit_id: string | null;
    category_id: string | null;
    unit_price: number;
    vat_rate: number;
    has_multi_tax: boolean;
    tax_lines: TaxLineDto[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
    unit?: {
        id: string;
        name: string;
        abbreviation: string;
    } | null;
    category?: {
        id: string;
        name: string;
        color: string;
    } | null;
}

/**
 * DTO de réponse pour un produit
 */
export class ProductResponseDto implements ProductWithUnit {
    id: string;
    company_id: string;
    reference: string | null;
    name: string;
    description: string | null;
    unit_id: string | null;
    category_id: string | null;
    unit_price: number;
    vat_rate: number;
    has_multi_tax: boolean;
    tax_lines: TaxLineDto[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
    unit?: {
        id: string;
        name: string;
        abbreviation: string;
    } | null;
    category?: {
        id: string;
        name: string;
        color: string;
    } | null;
}

/**
 * DTO de réponse pour la liste des produits
 */
export class ProductListResponseDto {
    products: ProductResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
