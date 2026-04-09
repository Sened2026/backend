import { IsBoolean, IsNumber, IsString, IsUrl } from 'class-validator';

/**
 * DTO de réponse pour l'upload d'image
 */
export class ImageUploadResponseDto {
    @IsBoolean()
    success: boolean;

    @IsUrl()
    url: string;

    @IsString()
    fileName: string;

    @IsNumber()
    size: number;
}

/**
 * DTO pour une image dans la liste
 */
export class ImageListItemDto {
    @IsString()
    name: string;

    @IsUrl()
    url: string;

    @IsNumber()
    size: number;

    @IsString()
    createdAt: string;
}
