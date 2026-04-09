import { Module } from '@nestjs/common';
import { ImageController } from './image.controller';
import { ImageService } from './image.service';

/**
 * Module de gestion des images
 * Gère l'upload et le stockage des images dans Supabase Storage
 */
@Module({
    controllers: [ImageController],
    providers: [ImageService],
    exports: [ImageService],
})
export class ImageModule { }
