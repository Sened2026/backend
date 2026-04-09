import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ProductService } from './product.service';
import {
    CreateProductDto,
    UpdateProductDto,
    ProductQueryDto,
    ProductResponseDto,
    ProductListResponseDto,
} from './dto/product.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Contrôleur pour la gestion des produits par entreprise
 * Fournit les endpoints CRUD pour les produits
 * 
 * Routes disponibles:
 * - POST   /api/companies/:companyId/products           - Créer un produit
 * - GET    /api/companies/:companyId/products           - Liste des produits de l'entreprise
 * - GET    /api/companies/:companyId/products/:id       - Récupérer un produit par ID
 * - PUT    /api/companies/:companyId/products/:id       - Mettre à jour un produit
 * - PATCH  /api/companies/:companyId/products/:id/toggle-active - Activer/désactiver un produit
 * - DELETE /api/companies/:companyId/products/:id       - Supprimer un produit
 */
@Controller('companies/:companyId/products')
@UseGuards(SupabaseAuthGuard)
export class ProductController {
    constructor(private readonly productService: ProductService) {}

    /**
     * Crée un nouveau produit pour une entreprise
     * Seuls les admins de l'entreprise peuvent créer des produits
     * 
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param createProductDto - Données de création du produit
     * @returns Le produit créé
     */
    @Post()
    @UseGuards(SubscriptionGuard)
    @HttpCode(HttpStatus.CREATED)
    async create(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Body() createProductDto: CreateProductDto,
    ): Promise<ProductResponseDto> {
        return this.productService.create(userId, companyId, createProductDto);
    }

    /**
     * Récupère la liste des produits d'une entreprise
     * Supporte la pagination, la recherche et les filtres
     * 
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param query - Paramètres de recherche et pagination
     * @returns Liste paginée des produits
     */
    @Get()
    async findAll(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Query() query: ProductQueryDto,
    ): Promise<ProductListResponseDto> {
        return this.productService.findAll(userId, companyId, query);
    }

    /**
     * Récupère un produit par son ID
     * 
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param id - ID du produit
     * @returns Le produit demandé
     */
    @Get(':id')
    async findOne(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<ProductResponseDto> {
        return this.productService.findOne(userId, companyId, id);
    }

    /**
     * Met à jour un produit
     * Seuls les admins de l'entreprise peuvent modifier les produits
     * 
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param id - ID du produit
     * @param updateProductDto - Données de mise à jour
     * @returns Le produit mis à jour
     */
    @Put(':id')
    @UseGuards(SubscriptionGuard)
    async update(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateProductDto: UpdateProductDto,
    ): Promise<ProductResponseDto> {
        return this.productService.update(userId, companyId, id, updateProductDto);
    }

    /**
     * Active ou désactive un produit
     * Seuls les admins de l'entreprise peuvent modifier le statut
     * 
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param id - ID du produit
     * @param body - Nouveau statut
     * @returns Le produit mis à jour
     */
    @Patch(':id/toggle-active')
    @UseGuards(SubscriptionGuard)
    async toggleActive(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: { is_active: boolean },
    ): Promise<ProductResponseDto> {
        return this.productService.toggleActive(userId, companyId, id, body.is_active);
    }

    /**
     * Supprime un produit
     * Seuls les admins de l'entreprise peuvent supprimer des produits
     * Le produit ne peut pas être supprimé s'il est utilisé dans des devis/factures
     * 
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param id - ID du produit
     */
    @Delete(':id')
    @UseGuards(SubscriptionGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        return this.productService.delete(userId, companyId, id);
    }

    /**
     * Duplique un produit existant
     * Seuls les admins de l'entreprise peuvent dupliquer des produits
     * 
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param id - ID du produit à dupliquer
     * @returns Le produit dupliqué
     */
    @Post(':id/duplicate')
    @UseGuards(SubscriptionGuard)
    @HttpCode(HttpStatus.CREATED)
    async duplicate(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<ProductResponseDto> {
        return this.productService.duplicate(userId, companyId, id);
    }
}
