import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.config';
import {
    CreateProductDto,
    UpdateProductDto,
    ProductQueryDto,
    ProductWithUnit,
    ProductListResponseDto,
} from './dto/product.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import {
    getUserCompanyRole,
    getUserCompanyAccessContext,
    canManageCompanyAsAdmin,
    canWriteCompanyCatalog,
} from '../../common/roles/roles';

@Injectable()
export class ProductService {
    constructor(private readonly websocketGateway: WebsocketGateway) {}

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
     * Crée un nouveau produit pour une entreprise
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param createProductDto - Données du produit à créer
     * @returns Le produit créé
     */
    async create(
        userId: string,
        companyId: string,
        createProductDto: CreateProductDto,
    ): Promise<ProductWithUnit> {
        // Vérifier que l'utilisateur est admin de l'entreprise
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier l'unicité de la référence si fournie
        if (createProductDto.reference) {
            const { data: existingProduct } = await supabase
                .from('products')
                .select('id')
                .eq('company_id', companyId)
                .eq('reference', createProductDto.reference)
                .single();

            if (existingProduct) {
                throw new BadRequestException(
                    'Un produit avec cette référence existe déjà',
                );
            }
        }

        // Vérifier que l'unité existe si fournie
        if (createProductDto.unit_id) {
            const { data: unit } = await supabase
                .from('units')
                .select('id')
                .eq('id', createProductDto.unit_id)
                .eq('company_id', companyId)
                .single();

            if (!unit) {
                throw new BadRequestException('Unité non trouvée');
            }
        }

        // Vérifier que la catégorie existe si fournie
        if (createProductDto.category_id) {
            const { data: category } = await supabase
                .from('product_categories')
                .select('id')
                .eq('id', createProductDto.category_id)
                .eq('company_id', companyId)
                .single();

            if (!category) {
                throw new BadRequestException('Catégorie non trouvée');
            }
        }

        // Validation multi-taxe
        const hasMultiTax = createProductDto.has_multi_tax ?? false;
        if (hasMultiTax && (!createProductDto.tax_lines || createProductDto.tax_lines.length === 0)) {
            throw new BadRequestException(
                'Un produit multi-TVA doit avoir au moins une ligne de taxe',
            );
        }

        // Créer le produit
        const { data: product, error } = await supabase
            .from('products')
            .insert({
                company_id: companyId,
                reference: createProductDto.reference || null,
                name: createProductDto.name,
                description: createProductDto.description || null,
                unit_id: createProductDto.unit_id || null,
                category_id: createProductDto.category_id || null,
                unit_price: createProductDto.unit_price,
                vat_rate: createProductDto.vat_rate ?? 20,
                is_active: createProductDto.is_active ?? true,
                has_multi_tax: hasMultiTax,
                tax_lines: hasMultiTax ? createProductDto.tax_lines : [],
            })
            .select(`
                *,
                unit:units (
                    id,
                    name,
                    abbreviation
                ),
                category:product_categories (
                    id,
                    name,
                    color
                )
            `)
            .single();

        if (error) {
            throw new BadRequestException(
                error.message || 'Impossible de créer le produit',
            );
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyProductCreated(companyId, product);

        return product;
    }

    /**
     * Récupère la liste des produits d'une entreprise
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param query - Paramètres de recherche et pagination
     * @returns Liste paginée des produits
     */
    async findAll(
        userId: string,
        companyId: string,
        query: ProductQueryDto,
    ): Promise<ProductListResponseDto> {
        // Vérifier l'accès à l'entreprise
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();
        const { search, page = 1, limit = 20, is_active, sort_by = 'name', sort_order = 'asc' } = query;

        // Construction de la requête de base
        let queryBuilder = supabase
            .from('products')
            .select(`
                *,
                unit:units (
                    id,
                    name,
                    abbreviation
                ),
                category:product_categories (
                    id,
                    name,
                    color
                )
            `, { count: 'exact' })
            .eq('company_id', companyId);

        // Filtre par statut actif
        if (is_active !== undefined) {
            queryBuilder = queryBuilder.eq('is_active', is_active);
        }

        // Recherche textuelle
        if (search) {
            queryBuilder = queryBuilder.or(
                `name.ilike.%${search}%,reference.ilike.%${search}%,description.ilike.%${search}%`,
            );
        }

        // Tri
        queryBuilder = queryBuilder.order(sort_by, { ascending: sort_order === 'asc' });

        // Pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        queryBuilder = queryBuilder.range(from, to);

        const { data: products, error, count } = await queryBuilder;

        if (error) {
            throw new BadRequestException(
                error.message || 'Impossible de récupérer les produits',
            );
        }

        const total = count || 0;
        const totalPages = Math.ceil(total / limit);

        return {
            products: products || [],
            total,
            page,
            limit,
            totalPages,
        };
    }

    /**
     * Récupère un produit par son ID
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param productId - ID du produit
     * @returns Le produit demandé
     */
    async findOne(
        userId: string,
        companyId: string,
        productId: string,
    ): Promise<ProductWithUnit> {
        // Vérifier l'accès à l'entreprise
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { data: product, error } = await supabase
            .from('products')
            .select(`
                *,
                unit:units (
                    id,
                    name,
                    abbreviation
                ),
                category:product_categories (
                    id,
                    name,
                    color
                )
            `)
            .eq('id', productId)
            .eq('company_id', companyId)
            .single();

        if (error || !product) {
            throw new NotFoundException('Produit non trouvé');
        }

        return product;
    }

    /**
     * Met à jour un produit
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param productId - ID du produit
     * @param updateProductDto - Données de mise à jour
     * @returns Le produit mis à jour
     */
    async update(
        userId: string,
        companyId: string,
        productId: string,
        updateProductDto: UpdateProductDto,
    ): Promise<ProductWithUnit> {
        // Vérifier que l'utilisateur est admin
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier que le produit existe et appartient à l'entreprise
        const { data: existingProduct, error: findError } = await supabase
            .from('products')
            .select('id')
            .eq('id', productId)
            .eq('company_id', companyId)
            .single();

        if (findError || !existingProduct) {
            throw new NotFoundException('Produit non trouvé');
        }

        // Vérifier l'unicité de la référence si modifiée
        if (updateProductDto.reference) {
            const { data: duplicateRef } = await supabase
                .from('products')
                .select('id')
                .eq('company_id', companyId)
                .eq('reference', updateProductDto.reference)
                .neq('id', productId)
                .single();

            if (duplicateRef) {
                throw new BadRequestException(
                    'Un produit avec cette référence existe déjà',
                );
            }
        }

        // Vérifier que l'unité existe si fournie
        if (updateProductDto.unit_id) {
            const { data: unit } = await supabase
                .from('units')
                .select('id')
                .eq('id', updateProductDto.unit_id)
                .eq('company_id', companyId)
                .single();

            if (!unit) {
                throw new BadRequestException('Unité non trouvée');
            }
        }

        // Vérifier que la catégorie existe si fournie
        if (updateProductDto.category_id) {
            const { data: category } = await supabase
                .from('product_categories')
                .select('id')
                .eq('id', updateProductDto.category_id)
                .eq('company_id', companyId)
                .single();

            if (!category) {
                throw new BadRequestException('Catégorie non trouvée');
            }
        }

        // Validation multi-taxe
        if (updateProductDto.has_multi_tax === true && (!updateProductDto.tax_lines || updateProductDto.tax_lines.length === 0)) {
            throw new BadRequestException(
                'Un produit multi-TVA doit avoir au moins une ligne de taxe',
            );
        }

        // Préparer les données de mise à jour
        const updateData: Record<string, any> = {};
        if (updateProductDto.reference !== undefined) updateData.reference = updateProductDto.reference;
        if (updateProductDto.name !== undefined) updateData.name = updateProductDto.name;
        if (updateProductDto.description !== undefined) updateData.description = updateProductDto.description;
        if (updateProductDto.unit_id !== undefined) updateData.unit_id = updateProductDto.unit_id;
        if (updateProductDto.category_id !== undefined) updateData.category_id = updateProductDto.category_id;
        if (updateProductDto.unit_price !== undefined) updateData.unit_price = updateProductDto.unit_price;
        if (updateProductDto.vat_rate !== undefined) updateData.vat_rate = updateProductDto.vat_rate;
        if (updateProductDto.is_active !== undefined) updateData.is_active = updateProductDto.is_active;
        if (updateProductDto.has_multi_tax !== undefined) updateData.has_multi_tax = updateProductDto.has_multi_tax;
        if (updateProductDto.tax_lines !== undefined) updateData.tax_lines = updateProductDto.tax_lines;

        // Mettre à jour le produit
        const { data: product, error } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', productId)
            .eq('company_id', companyId)
            .select(`
                *,
                unit:units (
                    id,
                    name,
                    abbreviation
                ),
                category:product_categories (
                    id,
                    name,
                    color
                )
            `)
            .single();

        if (error) {
            throw new BadRequestException(
                error.message || 'Impossible de mettre à jour le produit',
            );
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyProductUpdated(companyId, product);

        return product;
    }

    /**
     * Supprime un produit
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param productId - ID du produit
     */
    async delete(
        userId: string,
        companyId: string,
        productId: string,
    ): Promise<void> {
        // Vérifier que l'utilisateur est admin
        await this.checkAdminAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier que le produit existe et appartient à l'entreprise
        const { data: existingProduct, error: findError } = await supabase
            .from('products')
            .select('id')
            .eq('id', productId)
            .eq('company_id', companyId)
            .single();

        if (findError || !existingProduct) {
            throw new NotFoundException('Produit non trouvé');
        }

        // Vérifier si le produit est utilisé dans des devis ou factures
        const { count: quoteItemsCount } = await supabase
            .from('quote_items')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', productId);

        const { count: invoiceItemsCount } = await supabase
            .from('invoice_items')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', productId);

        if ((quoteItemsCount || 0) > 0 || (invoiceItemsCount || 0) > 0) {
            throw new BadRequestException(
                'Ce produit est utilisé dans des devis ou factures et ne peut pas être supprimé. Vous pouvez le désactiver à la place.',
            );
        }

        // Supprimer le produit
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', productId)
            .eq('company_id', companyId);

        if (error) {
            throw new BadRequestException(
                error.message || 'Impossible de supprimer le produit',
            );
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyProductDeleted(companyId, productId);
    }

    /**
     * Active ou désactive un produit
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param productId - ID du produit
     * @param isActive - Nouveau statut
     * @returns Le produit mis à jour
     */
    async toggleActive(
        userId: string,
        companyId: string,
        productId: string,
        isActive: boolean,
    ): Promise<ProductWithUnit> {
        return this.update(userId, companyId, productId, { is_active: isActive });
    }

    /**
     * Duplique un produit existant
     * @param userId - ID de l'utilisateur authentifié
     * @param companyId - ID de l'entreprise
     * @param productId - ID du produit à dupliquer
     * @returns Le nouveau produit dupliqué
     */
    async duplicate(
        userId: string,
        companyId: string,
        productId: string,
    ): Promise<ProductWithUnit> {
        // Vérifier que l'utilisateur est admin
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Récupérer le produit original
        const { data: originalProduct, error: findError } = await supabase
            .from('products')
            .select('*')
            .eq('id', productId)
            .eq('company_id', companyId)
            .single();

        if (findError || !originalProduct) {
            throw new NotFoundException('Produit non trouvé');
        }

        // Générer un nouveau nom et une nouvelle référence
        const newName = `${originalProduct.name} (copie)`;
        let newReference = originalProduct.reference 
            ? `${originalProduct.reference}-COPY` 
            : null;

        // Vérifier l'unicité de la référence et ajuster si nécessaire
        if (newReference) {
            let counter = 1;
            let referenceExists = true;
            
            while (referenceExists) {
                const { data: existingProduct } = await supabase
                    .from('products')
                    .select('id')
                    .eq('company_id', companyId)
                    .eq('reference', newReference)
                    .single();

                if (!existingProduct) {
                    referenceExists = false;
                } else {
                    counter++;
                    newReference = `${originalProduct.reference}-COPY${counter}`;
                }
            }
        }

        // Créer le produit dupliqué
        const { data: newProduct, error: createError } = await supabase
            .from('products')
            .insert({
                company_id: companyId,
                reference: newReference,
                name: newName,
                description: originalProduct.description,
                unit_id: originalProduct.unit_id,
                category_id: originalProduct.category_id,
                unit_price: originalProduct.unit_price,
                vat_rate: originalProduct.vat_rate,
                has_multi_tax: originalProduct.has_multi_tax ?? false,
                tax_lines: originalProduct.tax_lines ?? [],
                is_active: true, // Le produit dupliqué est actif par défaut
            })
            .select(`
                *,
                unit:units (
                    id,
                    name,
                    abbreviation
                ),
                category:product_categories (
                    id,
                    name,
                    color
                )
            `)
            .single();

        if (createError) {
            throw new BadRequestException(
                createError.message || 'Impossible de dupliquer le produit',
            );
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyProductCreated(companyId, newProduct);

        return newProduct;
    }
}
