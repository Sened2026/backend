import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { ImageUploadResponseDto } from './dto/image.dto';

/**
 * Service de gestion des images
 * Upload et gestion des fichiers dans Supabase Storage
 */
@Injectable()
export class ImageService {
    private readonly publicBucket: string;
    private readonly documentsBucket: string;

    constructor(private configService: ConfigService) {
        this.publicBucket = this.configService.get('STORAGE_PUBLIC_BUCKET', 'public-images');
        this.documentsBucket = this.configService.get('STORAGE_DOCUMENTS_BUCKET', 'documents');
    }

    /**
     * Upload une image dans Supabase Storage
     * @param file - Fichier à uploader (buffer multer)
     * @param userId - ID de l'utilisateur propriétaire
     * @param originalName - Nom original du fichier
     */
    async uploadImage(
        file: Express.Multer.File,
        userId: string,
        originalName: string,
    ): Promise<ImageUploadResponseDto> {
        // Validation du type de fichier
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/avif',
            'image/svg+xml',
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestException(
                'Type de fichier non supporté. Utilisez SVG, JPEG, PNG, WebP ou AVIF.',
            );
        }

        // Validation de la taille (max 2MB)
        const maxSize = 2 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new BadRequestException('Le fichier est trop volumineux (max 2MB)');
        }

        // Génère un nom unique pour le fichier
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const extension = originalName.split('.').pop() || 'jpg';
        const fileName = `${userId}/${timestamp}-${randomString}.${extension}`;

        const supabase = getSupabaseAdmin();

        // Upload vers Supabase Storage (bucket public pour les images)
        const { data, error } = await supabase.storage
            .from(this.publicBucket)
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            throw new BadRequestException(`Erreur lors de l'upload: ${error.message}`);
        }

        // Récupère l'URL publique de l'image
        const { data: publicUrlData } = supabase.storage
            .from(this.publicBucket)
            .getPublicUrl(data.path);

        return {
            success: true,
            url: publicUrlData.publicUrl,
            fileName: data.path,
            size: file.size,
        };
    }

    /**
     * Récupère la liste des images d'un utilisateur
     */
    async listUserImages(userId: string) {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase.storage
            .from(this.publicBucket)
            .list(userId, {
                limit: 100,
                sortBy: { column: 'created_at', order: 'desc' },
            });

        if (error) {
            throw new BadRequestException(`Erreur lors de la récupération: ${error.message}`);
        }

        // Génère les URLs publiques pour chaque image
        const images = data.map((file: any) => {
            const filePath = `${userId}/${file.name}`;
            const { data: publicUrlData } = supabase.storage
                .from(this.publicBucket)
                .getPublicUrl(filePath);

            return {
                name: file.name,
                url: publicUrlData.publicUrl,
                size: file.metadata?.size || 0,
                createdAt: file.created_at,
            };
        });

        return images;
    }

    /**
     * Supprime une image
     */
    async deleteImage(userId: string, fileName: string) {
        const supabase = getSupabaseAdmin();

        // Vérifie que le fichier appartient à l'utilisateur
        const filePath = fileName.startsWith(userId) ? fileName : `${userId}/${fileName}`;

        const { error } = await supabase.storage
            .from(this.publicBucket)
            .remove([filePath]);

        if (error) {
            throw new BadRequestException(`Erreur lors de la suppression: ${error.message}`);
        }

        return { success: true, message: 'Image supprimée avec succès' };
    }

    /**
     * Upload un document (devis/facture) dans le bucket privé
     * @param file - Fichier à uploader
     * @param companyId - ID de l'entreprise
     * @param documentType - Type de document ('quotes' ou 'invoices')
     * @param documentId - ID du document
     * @param fileName - Nom du fichier (ex: 'quote.pdf', 'signature.png')
     */
    async uploadDocument(
        file: Express.Multer.File,
        companyId: string,
        documentType: 'quotes' | 'invoices',
        documentId: string,
        fileName: string,
    ): Promise<ImageUploadResponseDto> {
        const supabase = getSupabaseAdmin();
        const filePath = `${companyId}/${documentType}/${documentId}/${fileName}`;

        const { data, error } = await supabase.storage
            .from(this.documentsBucket)
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: true, // Permet d'écraser si le fichier existe
            });

        if (error) {
            throw new BadRequestException(`Erreur lors de l'upload: ${error.message}`);
        }

        // Pour les documents privés, on génère une URL signée temporaire
        const { data: signedUrlData, error: signedError } = await supabase.storage
            .from(this.documentsBucket)
            .createSignedUrl(data.path, 3600); // URL valide 1 heure

        if (signedError) {
            throw new BadRequestException(`Erreur lors de la génération de l'URL: ${signedError.message}`);
        }

        return {
            success: true,
            url: signedUrlData.signedUrl,
            fileName: data.path,
            size: file.size,
        };
    }

    /**
     * Récupère une URL signée pour un document privé
     * @param companyId - ID de l'entreprise
     * @param documentType - Type de document
     * @param documentId - ID du document
     * @param fileName - Nom du fichier
     * @param expiresIn - Durée de validité en secondes (défaut: 1 heure)
     */
    async getDocumentSignedUrl(
        companyId: string,
        documentType: 'quotes' | 'invoices',
        documentId: string,
        fileName: string,
        expiresIn: number = 3600,
    ): Promise<string> {
        const supabase = getSupabaseAdmin();
        const filePath = `${companyId}/${documentType}/${documentId}/${fileName}`;

        const { data, error } = await supabase.storage
            .from(this.documentsBucket)
            .createSignedUrl(filePath, expiresIn);

        if (error) {
            throw new BadRequestException(`Erreur lors de la génération de l'URL: ${error.message}`);
        }

        return data.signedUrl;
    }

    /**
     * Supprime un document
     */
    async deleteDocument(
        companyId: string,
        documentType: 'quotes' | 'invoices',
        documentId: string,
        fileName?: string,
    ) {
        const supabase = getSupabaseAdmin();

        if (fileName) {
            // Supprime un fichier spécifique
            const filePath = `${companyId}/${documentType}/${documentId}/${fileName}`;
            const { error } = await supabase.storage
                .from(this.documentsBucket)
                .remove([filePath]);

            if (error) {
                throw new BadRequestException(`Erreur lors de la suppression: ${error.message}`);
            }
        } else {
            // Supprime tous les fichiers du document
            const folderPath = `${companyId}/${documentType}/${documentId}`;
            const { data: files } = await supabase.storage
                .from(this.documentsBucket)
                .list(folderPath);

            if (files && files.length > 0) {
                const filePaths = files.map((f: { name: string }) => `${folderPath}/${f.name}`);
                const { error } = await supabase.storage
                    .from(this.documentsBucket)
                    .remove(filePaths);

                if (error) {
                    throw new BadRequestException(`Erreur lors de la suppression: ${error.message}`);
                }
            }
        }

        return { success: true, message: 'Document(s) supprimé(s) avec succès' };
    }
}
