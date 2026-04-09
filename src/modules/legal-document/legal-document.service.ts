import {
    BadRequestException,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { getSupabaseAdmin, SupabaseUser } from '../../config/supabase.config';
import { ADMIN_ROLES, requireRole } from '../../common/roles/roles';
import { LegalDocumentType } from './dto/legal-document.dto';

type Scope = 'platform' | 'company';

type LegalDocumentRow = {
    id: string;
    scope: Scope;
    company_id: string | null;
    document_type: LegalDocumentType;
    slug: string;
    title: string;
    is_required: boolean;
    created_at: string;
    updated_at: string;
};

type LegalDocumentVersionRow = {
    id: string;
    legal_document_id: string;
    version_number: number;
    title: string;
    content_text: string;
    content_format: 'plain_text';
    checksum_sha256: string;
    is_published: boolean;
    published_at: string | null;
    source_kind: 'manual' | 'quote_snapshot';
    quote_id: string | null;
    created_at: string;
    updated_at: string;
};

const DOCUMENT_META: Record<
    LegalDocumentType,
    { slug: string; title: string; required: boolean; defaultContent: string }
> = {
    platform_cgv: {
        slug: 'cgv',
        title: 'Conditions générales de vente',
        required: true,
        defaultContent: `SENED - Conditions générales de vente

1. Objet
Décrire ici le périmètre exact du service SENED, les utilisateurs visés et les modules couverts par l'abonnement.

2. Éditeur
Compléter avec la dénomination sociale, la forme juridique, le capital, l'adresse du siège, le numéro d'immatriculation et le contact principal.

3. Création de compte
Préciser les conditions d'ouverture d'un compte, les responsabilités de l'utilisateur et les règles de sécurité applicables aux identifiants.

4. Abonnement, prix et taxes
Lister les offres, la périodicité, les conditions tarifaires, les éléments inclus/exclus et la présentation HT/TTC selon votre cible.

5. Paiement
Décrire les moyens de paiement, la date d'exigibilité, les incidents de paiement et les effets d'un défaut de règlement.

6. Durée, renouvellement, résiliation
Préciser la durée de l'engagement, la reconduction éventuelle, les modalités de résiliation et les conséquences sur l'accès aux données.

7. Disponibilité et support
Indiquer les engagements de moyens, les maintenances, les incidents et le canal de support.

8. Données personnelles
Renvoyer vers la Politique de confidentialité et résumer la logique générale de traitement.

9. Propriété intellectuelle
Rappeler que la plateforme, son code, ses contenus et sa marque restent protégés.

10. Responsabilité
Définir les limites de responsabilité autorisées, ainsi que les exclusions liées aux contenus saisis par l'utilisateur.

11. Droit applicable et litiges
Préciser le droit applicable, les modalités de réclamation et, si besoin, la médiation ou la juridiction compétente.`,
    },
    privacy_policy: {
        slug: 'confidentialite',
        title: 'Politique de confidentialité',
        required: true,
        defaultContent: `SENED - Politique de confidentialité

1. Responsable du traitement
Identifier la société responsable et les coordonnées de contact.

2. Données collectées
Lister les catégories de données traitées dans le cadre du compte, de la facturation et de l'utilisation du service.

3. Finalités et bases légales
Décrire les usages des données et les bases légales associées.

4. Destinataires
Préciser les équipes internes et les sous-traitants susceptibles d'accéder aux données.

5. Durées de conservation
Documenter les durées principales et les critères utilisés.

6. Sécurité
Décrire les mesures organisationnelles et techniques de protection.

7. Droits des personnes
Expliquer les droits d'accès, rectification, suppression, opposition, limitation et portabilité selon les cas.

8. Contact et réclamations
Ajouter l'adresse de contact et, le cas échéant, la référence à l'autorité de contrôle compétente.`,
    },
    legal_notice: {
        slug: 'mentions-legales',
        title: 'Mentions légales',
        required: false,
        defaultContent: `SENED - Mentions légales

Éditeur du site
Compléter la dénomination sociale, la forme juridique, le capital, le siège social, le numéro d'immatriculation et le contact.

Directeur de la publication
Compléter l'identité ou la fonction de la personne responsable.

Hébergement
Compléter l'identité et les coordonnées de l'hébergeur.

Propriété intellectuelle
Décrire la protection des contenus et les conditions d'utilisation.

Contact
Préciser le canal principal de contact pour toute demande.`,
    },
    sales_terms: {
        slug: 'sales-terms',
        title: 'Conditions générales de vente',
        required: true,
        defaultContent: '',
    },
};

@Injectable()
export class LegalDocumentService {
    private normalizeContent(content: string): string {
        return content.replace(/\r\n/g, '\n').trim();
    }

    private computeChecksum(content: string): string {
        return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    }

    private getDocumentMeta(documentType: LegalDocumentType) {
        const meta = DOCUMENT_META[documentType];
        if (!meta) {
            throw new BadRequestException('Type de document légal non supporté');
        }
        return meta;
    }

    private async getDocumentByScope(
        scope: Scope,
        documentType: LegalDocumentType,
        companyId?: string,
    ): Promise<LegalDocumentRow | null> {
        const supabase = getSupabaseAdmin();
        let query = supabase
            .from('legal_documents')
            .select('*')
            .eq('scope', scope)
            .eq('document_type', documentType);

        if (scope === 'company') {
            query = query.eq('company_id', companyId);
        }

        const { data, error } = await query.maybeSingle();
        if (error && error.code !== 'PGRST116') {
            throw new BadRequestException(error.message);
        }
        return (data as LegalDocumentRow | null) || null;
    }

    private async createDocument(
        scope: Scope,
        documentType: LegalDocumentType,
        userId: string | null,
        companyId?: string,
    ): Promise<LegalDocumentRow> {
        const supabase = getSupabaseAdmin();
        const meta = this.getDocumentMeta(documentType);
        const payload = {
            scope,
            company_id: scope === 'company' ? companyId : null,
            document_type: documentType,
            slug: scope === 'platform' ? meta.slug : `${meta.slug}-${companyId}`,
            title: meta.title,
            is_required: meta.required,
            created_by: userId,
            updated_by: userId,
        };

        const { data, error } = await supabase
            .from('legal_documents')
            .insert(payload)
            .select('*')
            .single();

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data as LegalDocumentRow;
    }

    private async getOrCreateDocument(
        scope: Scope,
        documentType: LegalDocumentType,
        userId: string | null,
        companyId?: string,
    ): Promise<LegalDocumentRow> {
        const existing = await this.getDocumentByScope(scope, documentType, companyId);
        if (existing) {
            return existing;
        }
        return this.createDocument(scope, documentType, userId, companyId);
    }

    private async getVersionsForDocuments(documentIds: string[]): Promise<LegalDocumentVersionRow[]> {
        if (documentIds.length === 0) {
            return [];
        }

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('legal_document_versions')
            .select('*')
            .in('legal_document_id', documentIds)
            .order('version_number', { ascending: false });

        if (error) {
            throw new BadRequestException(error.message);
        }

        return (data || []) as LegalDocumentVersionRow[];
    }

    private buildDocumentResponse(
        document: LegalDocumentRow,
        versions: LegalDocumentVersionRow[],
    ) {
        const publishedVersion = versions.find((version) => version.is_published) || null;
        const latestDraftVersion = versions.find((version) => !version.is_published) || null;
        const latestVersion = versions[0] || null;
        const meta = this.getDocumentMeta(document.document_type);

        return {
            ...document,
            default_content: meta.defaultContent,
            published_version: publishedVersion,
            latest_draft_version: latestDraftVersion,
            latest_version: latestVersion,
        };
    }

    private async getLatestVersion(documentId: string): Promise<LegalDocumentVersionRow | null> {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('legal_document_versions')
            .select('*')
            .eq('legal_document_id', documentId)
            .order('version_number', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            throw new BadRequestException(error.message);
        }

        return (data as LegalDocumentVersionRow | null) || null;
    }

    private async getPublishedVersion(documentId: string): Promise<LegalDocumentVersionRow | null> {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('legal_document_versions')
            .select('*')
            .eq('legal_document_id', documentId)
            .eq('is_published', true)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            throw new BadRequestException(error.message);
        }

        return (data as LegalDocumentVersionRow | null) || null;
    }

    private async createVersion(
        document: LegalDocumentRow,
        contentText: string,
        userId: string,
        options?: { sourceKind?: 'manual' | 'quote_snapshot'; quoteId?: string | null; title?: string },
    ): Promise<LegalDocumentVersionRow> {
        const supabase = getSupabaseAdmin();
        const latest = await this.getLatestVersion(document.id);
        const normalizedContent = this.normalizeContent(contentText);
        const checksum = this.computeChecksum(normalizedContent);
        const versionNumber = (latest?.version_number || 0) + 1;

        const { data, error } = await supabase
            .from('legal_document_versions')
            .insert({
                legal_document_id: document.id,
                version_number: versionNumber,
                title: options?.title || document.title,
                content_text: normalizedContent,
                content_format: 'plain_text',
                checksum_sha256: checksum,
                is_published: false,
                source_kind: options?.sourceKind || 'manual',
                quote_id: options?.quoteId || null,
                created_by: userId,
            })
            .select('*')
            .single();

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data as LegalDocumentVersionRow;
    }

    private async updateVersion(
        versionId: string,
        document: LegalDocumentRow,
        contentText: string,
        userId: string,
        title?: string,
    ): Promise<LegalDocumentVersionRow> {
        const supabase = getSupabaseAdmin();
        const normalizedContent = this.normalizeContent(contentText);
        const checksum = this.computeChecksum(normalizedContent);

        const { data, error } = await supabase
            .from('legal_document_versions')
            .update({
                title: title || document.title,
                content_text: normalizedContent,
                checksum_sha256: checksum,
            })
            .eq('id', versionId)
            .eq('is_published', false)
            .select('*')
            .single();

        if (error) {
            throw new BadRequestException(error.message);
        }

        await supabase
            .from('legal_documents')
            .update({ updated_by: userId })
            .eq('id', document.id);

        return data as LegalDocumentVersionRow;
    }

    private async upsertDraftForDocument(
        document: LegalDocumentRow,
        contentText: string,
        userId: string,
        title?: string,
    ) {
        const latestDraft = (await this.getVersionsForDocuments([document.id])).find(
            (version) => !version.is_published,
        );

        let version: LegalDocumentVersionRow;
        if (latestDraft) {
            version = await this.updateVersion(
                latestDraft.id,
                document,
                contentText,
                userId,
                title,
            );
        } else {
            version = await this.createVersion(document, contentText, userId, {
                title,
            });
        }

        return version;
    }

    private async savePublishedManualVersion(
        document: LegalDocumentRow,
        contentText: string,
        userId: string,
        title?: string,
    ): Promise<LegalDocumentVersionRow> {
        const supabase = getSupabaseAdmin();
        const versions = await this.getVersionsForDocuments([document.id]);
        const editableVersion =
            versions.find((version) => version.source_kind === 'manual' && version.is_published) ||
            versions.find(
                (version) =>
                    version.source_kind === 'manual' &&
                    !version.is_published &&
                    !version.quote_id,
            ) ||
            null;
        const normalizedContent = this.normalizeContent(contentText);
        const checksum = this.computeChecksum(normalizedContent);
        const nextTitle = title || document.title;
        const publishedAt = new Date().toISOString();

        let version: LegalDocumentVersionRow;

        if (editableVersion) {
            if (!editableVersion.is_published) {
                await supabase
                    .from('legal_document_versions')
                    .update({
                        is_published: false,
                        published_at: null,
                    })
                    .eq('legal_document_id', document.id)
                    .eq('is_published', true);
            }

            const { data, error } = await supabase
                .from('legal_document_versions')
                .update({
                    title: nextTitle,
                    content_text: normalizedContent,
                    checksum_sha256: checksum,
                    is_published: true,
                    published_at: publishedAt,
                    source_kind: 'manual',
                    quote_id: null,
                })
                .eq('id', editableVersion.id)
                .select('*')
                .single();

            if (error) {
                throw new BadRequestException(error.message);
            }

            version = data as LegalDocumentVersionRow;
        } else {
            const latest = versions[0] || null;
            const versionNumber = (latest?.version_number || 0) + 1;
            const { data, error } = await supabase
                .from('legal_document_versions')
                .insert({
                    legal_document_id: document.id,
                    version_number: versionNumber,
                    title: nextTitle,
                    content_text: normalizedContent,
                    content_format: 'plain_text',
                    checksum_sha256: checksum,
                    is_published: true,
                    published_at: publishedAt,
                    source_kind: 'manual',
                    quote_id: null,
                    created_by: userId,
                })
                .select('*')
                .single();

            if (error) {
                throw new BadRequestException(error.message);
            }

            version = data as LegalDocumentVersionRow;
        }

        const manualDraftIds = versions
            .filter(
                (existingVersion) =>
                    existingVersion.id !== version.id &&
                    existingVersion.source_kind === 'manual' &&
                    !existingVersion.is_published,
            )
            .map((existingVersion) => existingVersion.id);

        if (manualDraftIds.length > 0) {
            const { error } = await supabase
                .from('legal_document_versions')
                .delete()
                .in('id', manualDraftIds);

            if (error) {
                throw new BadRequestException(error.message);
            }
        }

        await supabase
            .from('legal_documents')
            .update({
                title: nextTitle,
                updated_by: userId,
            })
            .eq('id', document.id);

        if (document.scope === 'company' && document.company_id) {
            await supabase
                .from('companies')
                .update({ terms_and_conditions: normalizedContent || null })
                .eq('id', document.company_id);
        }

        return version;
    }

    private async publishVersion(document: LegalDocumentRow, version: LegalDocumentVersionRow, userId: string) {
        const supabase = getSupabaseAdmin();

        await supabase
            .from('legal_document_versions')
            .update({
                is_published: false,
                published_at: null,
            })
            .eq('legal_document_id', document.id)
            .eq('is_published', true);

        const { data, error } = await supabase
            .from('legal_document_versions')
            .update({
                is_published: true,
                published_at: new Date().toISOString(),
            })
            .eq('id', version.id)
            .select('*')
            .single();

        if (error) {
            throw new BadRequestException(error.message);
        }

        await supabase
            .from('legal_documents')
            .update({
                title: version.title,
                updated_by: userId,
            })
            .eq('id', document.id);

        if (document.scope === 'company' && document.company_id) {
            await supabase
                .from('companies')
                .update({ terms_and_conditions: version.content_text })
                .eq('id', document.company_id);
        }

        return data as LegalDocumentVersionRow;
    }

    async listCompanyDocuments(userId: string, companyId: string) {
        await requireRole(userId, companyId, ADMIN_ROLES);
        const document = await this.getOrCreateDocument('company', 'sales_terms', userId, companyId);
        const versions = await this.getVersionsForDocuments([document.id]);

        return {
            can_manage_company: true,
            documents: [this.buildDocumentResponse(document, versions)],
        };
    }

    async saveCompanyDocument(
        userId: string,
        companyId: string,
        documentType: LegalDocumentType,
        title: string | undefined,
        contentText: string,
    ) {
        if (documentType !== 'sales_terms') {
            throw new BadRequestException('Seules les CGV entreprise sont éditables sur ce périmètre');
        }

        await requireRole(userId, companyId, ADMIN_ROLES);
        const document = await this.getOrCreateDocument('company', documentType, userId, companyId);
        const version = await this.savePublishedManualVersion(document, contentText, userId, title);
        return {
            document,
            version,
        };
    }

    async upsertCompanyDraft(
        userId: string,
        companyId: string,
        documentType: LegalDocumentType,
        title: string | undefined,
        contentText: string,
    ) {
        if (documentType !== 'sales_terms') {
            throw new BadRequestException('Seules les CGV entreprise sont éditables sur ce périmètre');
        }

        await requireRole(userId, companyId, ADMIN_ROLES);
        const document = await this.getOrCreateDocument('company', documentType, userId, companyId);
        const version = await this.upsertDraftForDocument(document, contentText, userId, title);
        return {
            document,
            version,
        };
    }

    async publishCompanyDraft(userId: string, companyId: string, documentType: LegalDocumentType) {
        if (documentType !== 'sales_terms') {
            throw new BadRequestException('Seules les CGV entreprise sont éditables sur ce périmètre');
        }

        await requireRole(userId, companyId, ADMIN_ROLES);
        const document = await this.getOrCreateDocument('company', documentType, userId, companyId);
        const latestDraft = (await this.getVersionsForDocuments([document.id])).find(
            (version) => !version.is_published,
        );

        if (!latestDraft) {
            throw new BadRequestException('Aucun brouillon à publier');
        }

        return {
            document,
            version: await this.publishVersion(document, latestDraft, userId),
        };
    }

    private normalizePlatformAcceptedAt(value: unknown): string | null {
        if (typeof value !== 'string' || value.trim().length === 0) {
            return null;
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date.toISOString();
    }

    private async getAuthUser(userId: string) {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.auth.admin.getUserById(userId);

        if (error || !data.user) {
            throw new BadRequestException(error?.message || 'Utilisateur introuvable');
        }

        return data.user;
    }

    private buildPlatformAcceptanceStatus(acceptedAt: string | null) {
        return {
            requires_acceptance: !acceptedAt,
            accepted_at: acceptedAt,
        };
    }

    async syncPlatformAcceptanceFromMetadata(_user: SupabaseUser) {
        return;
    }

    async validateCurrentPlatformAcceptanceTimestamp(acceptedAt?: string) {
        const normalizedAcceptedAt = this.normalizePlatformAcceptedAt(acceptedAt);

        if (!normalizedAcceptedAt) {
            throw new BadRequestException(
                'Vous devez accepter les CGV et la politique de confidentialité avant de continuer.',
            );
        }

        return normalizedAcceptedAt;
    }

    async recordPlatformAcceptanceForUser(
        userId: string,
        acceptedAt?: string,
    ) {
        const normalizedAcceptedAt = await this.validateCurrentPlatformAcceptanceTimestamp(
            acceptedAt,
        );
        const supabase = getSupabaseAdmin();
        const user = await this.getAuthUser(userId);

        const { error } = await supabase.auth.admin.updateUserById(userId, {
            user_metadata: {
                ...(user.user_metadata || {}),
                platform_legal_accepted_at: normalizedAcceptedAt,
            },
        });

        if (error) {
            throw new BadRequestException(error.message);
        }

        return normalizedAcceptedAt;
    }

    async getPlatformAcceptanceStatus(userId: string) {
        const user = await this.getAuthUser(userId);
        const acceptedAt = this.normalizePlatformAcceptedAt(
            user.user_metadata?.platform_legal_accepted_at,
        );

        return this.buildPlatformAcceptanceStatus(acceptedAt);
    }

    async acceptCurrentPlatformDocuments(userId: string) {
        const acceptedAt = await this.recordPlatformAcceptanceForUser(
            userId,
            new Date().toISOString(),
        );

        return this.buildPlatformAcceptanceStatus(acceptedAt);
    }

    async ensurePlatformAcceptanceCurrent(userId: string) {
        const status = await this.getPlatformAcceptanceStatus(userId);
        if (status.requires_acceptance) {
            throw new ForbiddenException(
                'Vous devez accepter les CGV et la politique de confidentialité avant de continuer.',
            );
        }
    }

    async getPublishedCompanySalesTerms(companyId: string) {
        const document = await this.getDocumentByScope('company', 'sales_terms', companyId);
        if (!document) {
            return null;
        }

        const publishedVersion = await this.getPublishedVersion(document.id);
        if (!publishedVersion) {
            return null;
        }

        return {
            document,
            version: publishedVersion,
        };
    }

    async resolveQuoteTermsVersion(
        companyId: string,
        contentText: string,
        userId: string,
        quoteId?: string,
    ) {
        const normalizedContent = this.normalizeContent(contentText || '');
        if (!normalizedContent) {
            return null;
        }

        const document = await this.getOrCreateDocument('company', 'sales_terms', userId, companyId);
        const checksum = this.computeChecksum(normalizedContent);
        const versions = await this.getVersionsForDocuments([document.id]);

        const exactMatch = versions.find(
            (version) =>
                version.checksum_sha256 === checksum &&
                this.normalizeContent(version.content_text) === normalizedContent,
        );

        if (exactMatch) {
            return {
                document,
                version: exactMatch,
                content_text: normalizedContent,
                checksum_sha256: checksum,
            };
        }

        const createdVersion = await this.createVersion(document, normalizedContent, userId, {
            sourceKind: quoteId ? 'quote_snapshot' : 'manual',
            quoteId: quoteId || null,
            title: document.title,
        });

        return {
            document,
            version: createdVersion,
            content_text: normalizedContent,
            checksum_sha256: checksum,
        };
    }
}
