import {
    Controller,
    Post,
    Get,
    Delete,
    Param,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageService } from './image.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseUser } from '../../config/supabase.config';

/**
 * Contrôleur de gestion des images
 * Endpoints pour l'upload, la liste et la suppression d'images
 */
@Controller('images')
@UseGuards(SupabaseAuthGuard)
export class ImageController {
    constructor(private readonly imageService: ImageService) { }

    /**
     * Upload une image
     * Reçoit un fichier via multipart/form-data
     */
    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadImage(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: SupabaseUser,
    ) {
        if (!file) {
            throw new BadRequestException('Aucun fichier fourni');
        }

        return this.imageService.uploadImage(file, user.id, file.originalname);
    }

    /**
     * Liste toutes les images de l'utilisateur
     */
    @Get()
    async listImages(@CurrentUser() user: SupabaseUser) {
        return this.imageService.listUserImages(user.id);
    }

    /**
     * Supprime une image
     */
    @Delete(':fileName')
    async deleteImage(
        @Param('fileName') fileName: string,
        @CurrentUser() user: SupabaseUser,
    ) {
        return this.imageService.deleteImage(user.id, fileName);
    }
}
