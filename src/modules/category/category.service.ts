import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.config';
import {
    CreateCategoryDto,
    UpdateCategoryDto,
    CategoryQueryDto,
    ProductCategory,
    CategoryListResponseDto,
} from './dto/category.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import {
    getUserCompanyRole,
    getUserCompanyAccessContext,
    canManageCompanyAsAdmin,
    canWriteCompanyCatalog,
} from '../../common/roles/roles';

@Injectable()
export class CategoryService {
    constructor(
        private readonly websocketGateway: WebsocketGateway,
    ) {}

    private normalizeCategoryName(name: string) {
        return name.trim();
    }

    private isUniqueConstraintError(error: { code?: string } | null | undefined) {
        return error?.code === '23505';
    }

    private async findExistingCategoryByNormalizedName(
        companyId: string,
        rawName: string,
        excludeCategoryId?: string,
    ): Promise<ProductCategory | null> {
        const supabase = getSupabaseAdmin();
        const normalizedName = this.normalizeCategoryName(rawName).toLocaleLowerCase('fr-FR');

        const { data: categories, error } = await supabase
            .from('product_categories')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });

        if (error) {
            throw new BadRequestException(
                error.message || 'Impossible de récupérer les catégories',
            );
        }

        return (
            categories?.find((category: ProductCategory) => {
                if (excludeCategoryId && category.id === excludeCategoryId) {
                    return false;
                }

                return this.normalizeCategoryName(category.name).toLocaleLowerCase('fr-FR') === normalizedName;
            }) || null
        );
    }

    private async checkCompanyAccess(userId: string, companyId: string) {
        return getUserCompanyRole(userId, companyId);
    }

    private async checkWriteAccess(userId: string, companyId: string) {
        const accessContext = await getUserCompanyAccessContext(userId, companyId);

        if (!canWriteCompanyCatalog(accessContext.role, accessContext.companyOwnerRole)) {
            throw new ForbiddenException(
                "Vous n'avez pas les permissions nécessaires pour cette action",
            );
        }

        return accessContext.role;
    }

    private async checkAdminAccess(userId: string, companyId: string) {
        const accessContext = await getUserCompanyAccessContext(userId, companyId);

        if (!canManageCompanyAsAdmin(accessContext.role, accessContext.companyOwnerRole)) {
            throw new ForbiddenException(
                "Vous n'avez pas les permissions nécessaires pour cette action",
            );
        }

        return accessContext.role;
    }

    /**
     * Crée une nouvelle catégorie
     */
    async create(
        userId: string,
        companyId: string,
        createCategoryDto: CreateCategoryDto,
    ): Promise<ProductCategory> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();
        const normalizedName = this.normalizeCategoryName(createCategoryDto.name);

        // Vérifier si une catégorie avec ce nom existe déjà
        const existing = await this.findExistingCategoryByNormalizedName(
            companyId,
            normalizedName,
        );
        if (existing) {
            throw new BadRequestException(
                'Une catégorie avec ce nom existe déjà',
            );
        }

        const { data: category, error } = await supabase
            .from('product_categories')
            .insert({
                company_id: companyId,
                name: normalizedName,
                color: createCategoryDto.color || '#6366f1',
            })
            .select()
            .single();

        if (error) {
            if (this.isUniqueConstraintError(error)) {
                throw new BadRequestException(
                    'Une catégorie avec ce nom existe déjà',
                );
            }

            throw new BadRequestException(
                error.message || 'Impossible de créer la catégorie',
            );
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyCategoryCreated(companyId, category);

        return category;
    }

    /**
     * Récupère toutes les catégories d'une entreprise
     */
    async findAll(
        userId: string,
        companyId: string,
        query: CategoryQueryDto,
    ): Promise<CategoryListResponseDto> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        let queryBuilder = supabase
            .from('product_categories')
            .select('*', { count: 'exact' })
            .eq('company_id', companyId)
            .order('name', { ascending: true });

        // Recherche par nom
        if (query.search) {
            queryBuilder = queryBuilder.ilike('name', `%${query.search}%`);
        }

        const { data: categories, error, count } = await queryBuilder;

        if (error) {
            throw new BadRequestException(
                error.message || 'Impossible de récupérer les catégories',
            );
        }

        return {
            categories: categories || [],
            total: count || 0,
        };
    }

    /**
     * Récupère une catégorie par son ID
     */
    async findOne(
        userId: string,
        companyId: string,
        categoryId: string,
    ): Promise<ProductCategory> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { data: category, error } = await supabase
            .from('product_categories')
            .select('*')
            .eq('id', categoryId)
            .eq('company_id', companyId)
            .single();

        if (error || !category) {
            throw new NotFoundException('Catégorie non trouvée');
        }

        return category;
    }

    /**
     * Trouve ou crée une catégorie par son nom
     * Utile pour la création à la volée depuis le formulaire produit
     */
    async findOrCreate(
        userId: string,
        companyId: string,
        name: string,
    ): Promise<ProductCategory> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();
        const normalizedName = this.normalizeCategoryName(name);

        // Chercher une catégorie existante (insensible à la casse)
        const existing = await this.findExistingCategoryByNormalizedName(
            companyId,
            normalizedName,
        );
        if (existing) {
            return existing;
        }

        // Créer la catégorie si elle n'existe pas
        const { data: category, error } = await supabase
            .from('product_categories')
            .insert({
                company_id: companyId,
                name: normalizedName,
                color: '#6366f1',
            })
            .select()
            .single();

        if (error) {
            if (this.isUniqueConstraintError(error)) {
                const concurrentCategory = await this.findExistingCategoryByNormalizedName(
                    companyId,
                    normalizedName,
                );

                if (concurrentCategory) {
                    return concurrentCategory;
                }
            }

            throw new BadRequestException(
                error.message || 'Impossible de créer la catégorie',
            );
        }

        return category;
    }

    /**
     * Met à jour une catégorie
     */
    async update(
        userId: string,
        companyId: string,
        categoryId: string,
        updateCategoryDto: UpdateCategoryDto,
    ): Promise<ProductCategory> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier que la catégorie existe
        const { data: existing, error: findError } = await supabase
            .from('product_categories')
            .select('id')
            .eq('id', categoryId)
            .eq('company_id', companyId)
            .single();

        if (findError || !existing) {
            throw new NotFoundException('Catégorie non trouvée');
        }

        // Vérifier l'unicité du nom si modifié
        if (updateCategoryDto.name) {
            const duplicate = await this.findExistingCategoryByNormalizedName(
                companyId,
                updateCategoryDto.name,
                categoryId,
            );
            if (duplicate) {
                throw new BadRequestException(
                    'Une catégorie avec ce nom existe déjà',
                );
            }
        }

        const updateData: Record<string, any> = {};
        if (updateCategoryDto.name) {
            updateData.name = this.normalizeCategoryName(updateCategoryDto.name);
        }
        if (updateCategoryDto.color) updateData.color = updateCategoryDto.color;

        const { data: category, error } = await supabase
            .from('product_categories')
            .update(updateData)
            .eq('id', categoryId)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) {
            if (this.isUniqueConstraintError(error)) {
                throw new BadRequestException(
                    'Une catégorie avec ce nom existe déjà',
                );
            }

            throw new BadRequestException(
                error.message || 'Impossible de mettre à jour la catégorie',
            );
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyCategoryUpdated(companyId, category);

        return category;
    }

    /**
     * Supprime une catégorie
     */
    async delete(
        userId: string,
        companyId: string,
        categoryId: string,
    ): Promise<void> {
        await this.checkAdminAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier que la catégorie existe
        const { data: existing, error: findError } = await supabase
            .from('product_categories')
            .select('id')
            .eq('id', categoryId)
            .eq('company_id', companyId)
            .single();

        if (findError || !existing) {
            throw new NotFoundException('Catégorie non trouvée');
        }

        // Supprimer la catégorie (les produits auront category_id = NULL grâce à ON DELETE SET NULL)
        const { error } = await supabase
            .from('product_categories')
            .delete()
            .eq('id', categoryId)
            .eq('company_id', companyId);

        if (error) {
            throw new BadRequestException(
                error.message || 'Impossible de supprimer la catégorie',
            );
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyCategoryDeleted(companyId, categoryId);
    }

    /**
     * Compte le nombre de produits utilisant une catégorie
     */
    async getProductCount(
        userId: string,
        companyId: string,
        categoryId: string,
    ): Promise<number> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { count, error } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('category_id', categoryId);

        if (error) {
            return 0;
        }

        return count || 0;
    }
}
