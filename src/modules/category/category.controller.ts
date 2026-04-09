import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    ParseUUIDPipe,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import {
    CreateCategoryDto,
    UpdateCategoryDto,
    CategoryQueryDto,
} from './dto/category.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Contrôleur pour la gestion des catégories de produits
 */
@Controller('companies/:companyId/categories')
@UseGuards(SupabaseAuthGuard)
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) {}

    /**
     * Crée une nouvelle catégorie
     * POST /companies/:companyId/categories
     */
    @Post()
    async create(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Body() createCategoryDto: CreateCategoryDto,
    ) {
        return this.categoryService.create(userId, companyId, createCategoryDto);
    }

    /**
     * Récupère toutes les catégories d'une entreprise
     * GET /companies/:companyId/categories
     */
    @Get()
    async findAll(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Query() query: CategoryQueryDto,
    ) {
        return this.categoryService.findAll(userId, companyId, query);
    }

    /**
     * Trouve ou crée une catégorie par son nom
     * POST /companies/:companyId/categories/find-or-create
     */
    @Post('find-or-create')
    async findOrCreate(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Body('name') name: string,
    ) {
        return this.categoryService.findOrCreate(userId, companyId, name);
    }

    /**
     * Récupère une catégorie par son ID
     * GET /companies/:companyId/categories/:categoryId
     */
    @Get(':categoryId')
    async findOne(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('categoryId', ParseUUIDPipe) categoryId: string,
    ) {
        return this.categoryService.findOne(userId, companyId, categoryId);
    }

    /**
     * Met à jour une catégorie
     * PUT /companies/:companyId/categories/:categoryId
     */
    @Put(':categoryId')
    async update(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('categoryId', ParseUUIDPipe) categoryId: string,
        @Body() updateCategoryDto: UpdateCategoryDto,
    ) {
        return this.categoryService.update(
            userId,
            companyId,
            categoryId,
            updateCategoryDto,
        );
    }

    /**
     * Supprime une catégorie
     * DELETE /companies/:companyId/categories/:categoryId
     */
    @Delete(':categoryId')
    async delete(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('categoryId', ParseUUIDPipe) categoryId: string,
    ) {
        await this.categoryService.delete(userId, companyId, categoryId);
        return { message: 'Catégorie supprimée avec succès' };
    }

    /**
     * Récupère le nombre de produits utilisant une catégorie
     * GET /companies/:companyId/categories/:categoryId/products-count
     */
    @Get(':categoryId/products-count')
    async getProductCount(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('categoryId', ParseUUIDPipe) categoryId: string,
    ) {
        const count = await this.categoryService.getProductCount(
            userId,
            companyId,
            categoryId,
        );
        return { count };
    }
}
