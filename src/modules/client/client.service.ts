import {
    Injectable,
    Inject,
    forwardRef,
    NotFoundException,
    BadRequestException,
    Logger,
    ForbiddenException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { normalizeBusinessIdentifiers } from '../../shared/utils/business-identifiers.util';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import {
    ChorusProService,
    extractChorusStructureCodeDestinataire,
    extractChorusStructureId,
    extractChorusStructureLabel,
    extractChorusStructureRequirements,
    mapActiveChorusServices,
    selectActiveChorusStructure,
} from '../chorus-pro/chorus-pro.service';
import {
    CreateClientDto,
    UpdateClientDto,
    ClientQueryDto,
    Client,
    ClientListResponseDto,
    ClientType,
} from './dto/client.dto';
import {
    getUserCompanyRole,
    getUserCompanyAccessContext,
    canManageCompanyAsAdmin,
    canWriteCompanyCatalog,
} from '../../common/roles/roles';

@Injectable()
export class ClientService {
    private readonly logger = new Logger(ClientService.name);

    constructor(
        private readonly websocketGateway: WebsocketGateway,
        @Inject(forwardRef(() => ChorusProService))
        private readonly chorusProService: ChorusProService,
    ) {}

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
     * Valide les champs requis selon le type de client
     */
    private validateClientFields(dto: CreateClientDto | UpdateClientDto, type?: ClientType): void {
        const clientType = dto.type || type;

        if (typeof dto.email === 'string' && dto.email.trim().length === 0) {
            throw new BadRequestException("L'email du client est requis");
        }

        if (clientType === ClientType.INDIVIDUAL) {
            if (!dto.first_name && !dto.last_name) {
                throw new BadRequestException('Le prénom ou le nom est requis pour un particulier');
            }
        } else if (clientType === ClientType.PROFESSIONAL) {
            if (!dto.company_name) {
                throw new BadRequestException('La raison sociale est requise pour un professionnel');
            }
        }

        // Validation secteur public : doit être professional
        if (dto.client_sector === 'public' && clientType !== ClientType.PROFESSIONAL) {
            throw new BadRequestException('Un client public doit être de type professionnel');
        }
    }

    /**
     * Crée un nouveau client
     */
    async create(userId: string, companyId: string, dto: CreateClientDto): Promise<Client> {
        await this.checkWriteAccess(userId, companyId);
        this.validateClientFields(dto);

        if (!dto.email?.trim()) {
            throw new BadRequestException("L'email du client est requis");
        }

        const supabase = getSupabaseAdmin();

        // Normaliser les identifiants métier
        const normalized = normalizeBusinessIdentifiers({
            siren: dto.siren,
            siret: dto.siret,
            vat_number: dto.vat_number,
            country: dto.country,
        });

        const clientData = {
            company_id: companyId,
            type: dto.type,
            client_sector: dto.client_sector || null,
            first_name: dto.first_name || null,
            last_name: dto.last_name || null,
            company_name: dto.company_name || null,
            siret: normalized.siret,
            siren: normalized.siren,
            vat_number: normalized.vat_number,
            email: dto.email.trim(),
            phone: dto.phone || null,
            signature_contact_first_name: dto.signature_contact_first_name || null,
            signature_contact_last_name: dto.signature_contact_last_name || null,
            signature_contact_email: dto.signature_contact_email || null,
            signature_contact_phone: dto.signature_contact_phone || null,
            address: dto.address || null,
            city: dto.city || null,
            postal_code: dto.postal_code || null,
            country: normalized.country,
            notes: dto.notes || null,
            chorus_pro_code_destinataire: dto.chorus_pro_code_destinataire || null,
            chorus_pro_cadre_facturation: dto.chorus_pro_cadre_facturation || null,
            chorus_pro_code_service_executant: dto.chorus_pro_code_service_executant || null,
            chorus_pro_numero_engagement: dto.chorus_pro_numero_engagement || null,
        };

        const { data: client, error } = await supabase
            .from('clients')
            .insert(clientData)
            .select()
            .single();

        if (error) {
            console.error('Error creating client:', error);
            throw new BadRequestException('Erreur lors de la création du client');
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyClientCreated(companyId, client);

        return client;
    }

    /**
     * Récupère la liste des clients d'une entreprise
     */
    async findAll(userId: string, companyId: string, query: ClientQueryDto): Promise<ClientListResponseDto> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();
        const page = query.page || 1;
        const limit = query.limit || 20;
        const offset = (page - 1) * limit;

        // Requête de base
        let queryBuilder = supabase
            .from('clients')
            .select('*', { count: 'exact' })
            .eq('company_id', companyId);

        // Filtre par type
        if (query.type) {
            queryBuilder = queryBuilder.eq('type', query.type);
        }

        // Recherche textuelle
        if (query.search) {
            const searchTerm = `%${query.search}%`;
            queryBuilder = queryBuilder.or(
                `company_name.ilike.${searchTerm},first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},siret.ilike.${searchTerm},siren.ilike.${searchTerm}`
            );
        }

        // Pagination et tri
        queryBuilder = queryBuilder
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const { data: clients, error, count } = await queryBuilder;

        if (error) {
            console.error('Error fetching clients:', error);
            throw new BadRequestException('Erreur lors de la récupération des clients');
        }

        const total = count || 0;

        return {
            clients: clients || [],
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Récupère un client par son ID
     */
    async findOne(userId: string, companyId: string, clientId: string): Promise<Client> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .eq('company_id', companyId)
            .single();

        if (error || !client) {
            throw new NotFoundException('Client non trouvé');
        }

        return client;
    }

    /**
     * Met à jour un client
     */
    async update(userId: string, companyId: string, clientId: string, dto: UpdateClientDto): Promise<Client> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier que le client existe
        const { data: existingClient, error: findError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .eq('company_id', companyId)
            .single();

        if (findError || !existingClient) {
            throw new NotFoundException('Client non trouvé');
        }

        // Valider les champs
        if (dto.type || dto.first_name || dto.last_name || dto.company_name) {
            this.validateClientFields(dto, existingClient.type);
        }

        // Normaliser les identifiants métier si présents dans le DTO
        const hasIdentifiers = dto.siren !== undefined || dto.siret !== undefined || dto.vat_number !== undefined || dto.country !== undefined;
        const normalized = hasIdentifiers
            ? normalizeBusinessIdentifiers({
                siren: dto.siren ?? existingClient.siren,
                siret: dto.siret ?? existingClient.siret,
                vat_number: dto.vat_number ?? existingClient.vat_number,
                country: dto.country ?? existingClient.country,
            })
            : null;

        // Préparer les données de mise à jour
        const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (dto.type !== undefined) updateData.type = dto.type;
        if (dto.client_sector !== undefined) updateData.client_sector = dto.client_sector || null;
        if (dto.first_name !== undefined) updateData.first_name = dto.first_name || null;
        if (dto.last_name !== undefined) updateData.last_name = dto.last_name || null;
        if (dto.company_name !== undefined) updateData.company_name = dto.company_name || null;
        if (dto.siret !== undefined) updateData.siret = normalized?.siret ?? null;
        if (dto.siren !== undefined) updateData.siren = normalized?.siren ?? null;
        if (dto.vat_number !== undefined) updateData.vat_number = normalized?.vat_number ?? null;
        if (dto.email !== undefined) updateData.email = dto.email || null;
        if (dto.phone !== undefined) updateData.phone = dto.phone || null;
        if (dto.signature_contact_first_name !== undefined) updateData.signature_contact_first_name = dto.signature_contact_first_name || null;
        if (dto.signature_contact_last_name !== undefined) updateData.signature_contact_last_name = dto.signature_contact_last_name || null;
        if (dto.signature_contact_email !== undefined) updateData.signature_contact_email = dto.signature_contact_email || null;
        if (dto.signature_contact_phone !== undefined) updateData.signature_contact_phone = dto.signature_contact_phone || null;
        if (dto.address !== undefined) updateData.address = dto.address || null;
        if (dto.city !== undefined) updateData.city = dto.city || null;
        if (dto.postal_code !== undefined) updateData.postal_code = dto.postal_code || null;
        if (dto.country !== undefined) updateData.country = normalized?.country ?? 'FR';
        if (dto.notes !== undefined) updateData.notes = dto.notes || null;
        // Champs Chorus Pro par défaut (bug fix: étaient ignorés avant)
        if (dto.chorus_pro_code_destinataire !== undefined) updateData.chorus_pro_code_destinataire = dto.chorus_pro_code_destinataire || null;
        if (dto.chorus_pro_cadre_facturation !== undefined) updateData.chorus_pro_cadre_facturation = dto.chorus_pro_cadre_facturation || null;
        if (dto.chorus_pro_code_service_executant !== undefined) updateData.chorus_pro_code_service_executant = dto.chorus_pro_code_service_executant || null;
        if (dto.chorus_pro_numero_engagement !== undefined) updateData.chorus_pro_numero_engagement = dto.chorus_pro_numero_engagement || null;

        // Reset éligibilité Chorus si SIRET ou client_sector changent
        const siretChanged = dto.siret !== undefined && (dto.siret || null) !== (existingClient.siret || null);
        const sectorChanged = dto.client_sector !== undefined && (dto.client_sector || null) !== (existingClient.client_sector || null);
        if (siretChanged || sectorChanged) {
            updateData.chorus_pro_eligibility_status = 'unchecked';
            updateData.chorus_pro_structure_id = null;
            updateData.chorus_pro_structure_label = null;
            updateData.chorus_pro_service_code_required = null;
            updateData.chorus_pro_engagement_required = null;
            updateData.chorus_pro_services = null;
            updateData.chorus_pro_last_checked_at = null;
            updateData.chorus_pro_code_destinataire = null;
            updateData.chorus_pro_code_service_executant = null;
            updateData.chorus_pro_numero_engagement = null;
        }

        const { data: updatedClient, error } = await supabase
            .from('clients')
            .update(updateData)
            .eq('id', clientId)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) {
            console.error('Error updating client:', error);
            throw new BadRequestException('Erreur lors de la mise à jour du client');
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyClientUpdated(companyId, updatedClient);

        return updatedClient;
    }

    /**
     * Supprime un client
     */
    async delete(userId: string, companyId: string, clientId: string): Promise<void> {
        await this.checkAdminAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier que le client existe
        const { data: existingClient, error: findError } = await supabase
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .eq('company_id', companyId)
            .single();

        if (findError || !existingClient) {
            throw new NotFoundException('Client non trouvé');
        }

        // TODO: Vérifier si le client est utilisé dans des devis/factures
        // Pour l'instant, on permet la suppression

        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', clientId)
            .eq('company_id', companyId);

        if (error) {
            console.error('Error deleting client:', error);
            throw new BadRequestException('Erreur lors de la suppression du client');
        }

        // Notifier via WebSocket
        this.websocketGateway.notifyClientDeleted(companyId, clientId);
    }

    /**
     * Duplique un client existant
     */
    async duplicate(userId: string, companyId: string, clientId: string): Promise<Client> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Récupérer le client original
        const { data: originalClient, error: findError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .eq('company_id', companyId)
            .single();

        if (findError || !originalClient) {
            throw new NotFoundException('Client non trouvé');
        }

        // Créer une copie avec un nom modifié
        const duplicateData = {
            company_id: companyId,
            type: originalClient.type,
            first_name: originalClient.first_name,
            last_name: originalClient.last_name,
            company_name: originalClient.company_name 
                ? `${originalClient.company_name} (copie)` 
                : null,
            siret: null, // Ne pas dupliquer le SIRET car il doit être unique
            siren: null, // Ne pas dupliquer le SIREN car il doit être unique
            vat_number: null, // Ne pas dupliquer le numéro TVA
            email: originalClient.email,
            phone: originalClient.phone,
            signature_contact_first_name: originalClient.signature_contact_first_name,
            signature_contact_last_name: originalClient.signature_contact_last_name,
            signature_contact_email: originalClient.signature_contact_email,
            signature_contact_phone: originalClient.signature_contact_phone,
            address: originalClient.address,
            city: originalClient.city,
            postal_code: originalClient.postal_code,
            country: originalClient.country,
            notes: originalClient.notes,
        };

        // Si c'est un particulier, modifier le nom
        if (originalClient.type === ClientType.INDIVIDUAL && originalClient.last_name) {
            duplicateData.last_name = `${originalClient.last_name} (copie)`;
        }

        const { data: newClient, error } = await supabase
            .from('clients')
            .insert(duplicateData)
            .select()
            .single();

        if (error) {
            console.error('Error duplicating client:', error);
            throw new BadRequestException('Erreur lors de la duplication du client');
        }

        return newClient;
    }

    // ─── Chorus Pro Eligibility ──────────────────────────

    /**
     * Vérifie l'éligibilité Chorus Pro d'un client public.
     * Flow: rechercherStructure → consulterStructure → rechercherServiceStructure
     */
    async verifyChorusEligibility(userId: string, companyId: string, clientId: string): Promise<Client> {
        await this.checkWriteAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const { data: client, error: findError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .eq('company_id', companyId)
            .single();

        if (findError || !client) {
            throw new NotFoundException('Client non trouvé');
        }

        if (client.type !== ClientType.PROFESSIONAL) {
            throw new BadRequestException('La vérification Chorus Pro est réservée aux clients professionnels');
        }

        if (client.client_sector !== 'public') {
            throw new BadRequestException('La vérification Chorus Pro est réservée aux clients du secteur public');
        }

        const identifiant = client.siret || client.siren;
        if (!identifiant) {
            throw new BadRequestException('Un SIRET ou SIREN est requis pour la vérification Chorus Pro');
        }

        const typeIdentifiant = client.siret ? 'SIRET' : 'SIREN';

        try {
            // 1. Rechercher la structure
            const searchResult = await this.chorusProService.rechercherStructure(
                userId, companyId, identifiant, typeIdentifiant,
            );

            // Parser la réponse pour trouver une structure active
            const activeStructure = selectActiveChorusStructure(searchResult, identifiant);

            if (!activeStructure) {
                // Pas de structure publique active → ineligible (refus métier clair)
                const { data: updated, error: updateError } = await supabase
                    .from('clients')
                    .update({
                        chorus_pro_eligibility_status: 'ineligible',
                        chorus_pro_structure_id: null,
                        chorus_pro_structure_label: null,
                        chorus_pro_service_code_required: null,
                        chorus_pro_engagement_required: null,
                        chorus_pro_services: null,
                        chorus_pro_last_checked_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', clientId)
                    .eq('company_id', companyId)
                    .select()
                    .single();

                if (updateError) throw new BadRequestException('Erreur mise à jour client');
                return updated;
            }

            const idStructureCpp = extractChorusStructureId(activeStructure);
            if (!idStructureCpp) {
                throw new BadRequestException('idStructureCPP introuvable pour la structure Chorus Pro active');
            }

            // 2. Consulter la structure pour les obligations
            let serviceCodeRequired = false;
            let engagementRequired = false;
            try {
                const consultResult = await this.chorusProService.consulterStructure(companyId, idStructureCpp);
                const requirements = extractChorusStructureRequirements(consultResult);
                serviceCodeRequired = requirements.serviceCodeRequired;
                engagementRequired = requirements.engagementRequired;
            } catch (consultError: any) {
                this.logger.warn(`consulterStructure failed for ${idStructureCpp}: ${consultError.message}`);
                // Continue quand même, on a la structure
            }

            // 3. Rechercher les services de la structure
            let services: any[] = [];
            try {
                const servicesResult = await this.chorusProService.rechercherServiceStructure(companyId, idStructureCpp);
                services = mapActiveChorusServices(servicesResult);
            } catch (servicesError: any) {
                this.logger.warn(`rechercherServiceStructure failed for ${idStructureCpp}: ${servicesError.message}`);
                // Continue quand même
            }

            // Persister le résultat
            const codeDestinataire = extractChorusStructureCodeDestinataire(activeStructure, identifiant) || identifiant;

            const { data: updated, error: updateError } = await supabase
                .from('clients')
                .update({
                    chorus_pro_eligibility_status: 'eligible',
                    chorus_pro_structure_id: idStructureCpp,
                    chorus_pro_structure_label: extractChorusStructureLabel(activeStructure),
                    chorus_pro_service_code_required: serviceCodeRequired,
                    chorus_pro_engagement_required: engagementRequired,
                    chorus_pro_services: services.length > 0 ? services : null,
                    chorus_pro_code_destinataire: codeDestinataire,
                    chorus_pro_last_checked_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', clientId)
                .eq('company_id', companyId)
                .select()
                .single();

            if (updateError) throw new BadRequestException('Erreur mise à jour client');
            return updated;

        } catch (error: any) {
            // Distinguer erreur technique vs refus métier
            if (error instanceof BadRequestException && error.message.includes('ineligible')) {
                throw error;
            }

            // Si c'est une erreur réseau/auth/PISTE → marquer error, ne pas toucher aux métadonnées
            if (
                error.message?.includes('Erreur OAuth') ||
                error.message?.includes('non configuré') ||
                error.message?.includes('fetch') ||
                error.name === 'TypeError' // fetch network error
            ) {
                const { data: updated, error: updateError } = await supabase
                    .from('clients')
                    .update({
                        chorus_pro_eligibility_status: 'error',
                        chorus_pro_last_checked_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', clientId)
                    .eq('company_id', companyId)
                    .select()
                    .single();

                if (updateError) throw new BadRequestException('Erreur mise à jour client');
                throw new BadRequestException(`Erreur de vérification Chorus Pro: ${error.message}`);
            }

            // Réponse Chorus mais pas de structure → ineligible
            const { data: updated } = await supabase
                .from('clients')
                .update({
                    chorus_pro_eligibility_status: 'ineligible',
                    chorus_pro_structure_id: null,
                    chorus_pro_structure_label: null,
                    chorus_pro_service_code_required: null,
                    chorus_pro_engagement_required: null,
                    chorus_pro_services: null,
                    chorus_pro_last_checked_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', clientId)
                .eq('company_id', companyId)
                .select()
                .single();

            throw error;
        }
    }
}
