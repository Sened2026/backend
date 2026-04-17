import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Logger,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stripNonDigits, detectQueryType } from '../../shared/utils/business-identifiers.util';
import { GouvRechercheEntreprisesProvider, type GouvUpstreamSearchResponse } from './gouv-recherche-entreprises.provider';
import { InseeSireneProvider, type InseeTextSearchDiagnostics } from './insee-sirene.provider';
import { normalizeInseeSearchInput, simplifyBusinessNameForRaisonSociale } from './insee-sirene.mapper';
import { SirenRateLimitError } from './siren.types';
import type { SirenLookupPage, SirenSearchResult } from './siren.types';

export { SirenRateLimitError, type SirenLookupPage, type SirenSearchResult } from './siren.types';

const RESULTS_CACHE_TTL_MS = 60 * 60 * 1000;
const EMPTY_RESULTS_CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedLookupEntry<T> {
    expiresAt: number;
    data: T;
}

@Injectable()
export class SirenService implements OnModuleInit {
    private readonly logger = new Logger(SirenService.name);
    private readonly USER_AGENT = `SenedBackend/1.0 (${process.env.NODE_ENV ?? 'development'})`;
    private readonly queryCache = new Map<string, CachedLookupEntry<unknown>>();
    private readonly inFlightQueries = new Map<string, Promise<unknown>>();
    private cooldownUntil = 0;

    private gouvProvider: GouvRechercheEntreprisesProvider | null = null;
    private inseeProvider: InseeSireneProvider | null = null;

    constructor(private readonly configService: ConfigService) {}

    onModuleInit(): void {
        if (this.isInseeProvider()) {
            const key = this.configService.get<string>('INSEE_SIRENE_API_KEY')?.trim();
            if (!key) {
                throw new Error(
                    'INSEE_SIRENE_API_KEY is required when SIREN_PROVIDER=insee',
                );
            }
            this.logger.log('SIREN provider: INSEE (API Sirene)');
        } else {
            this.logger.log('SIREN provider: recherche-entreprises (gouv)');
        }
    }

    private isInseeProvider(): boolean {
        const v = (this.configService.get<string>('SIREN_PROVIDER') ?? 'gouv').trim().toLowerCase();
        return v === 'insee';
    }

    private getGouv(): GouvRechercheEntreprisesProvider {
        if (!this.gouvProvider) {
            this.gouvProvider = new GouvRechercheEntreprisesProvider(this.USER_AGENT, (seconds) => {
                this.cooldownUntil = Date.now() + seconds * 1000;
            });
        }
        return this.gouvProvider;
    }

    private getInsee(): InseeSireneProvider {
        if (!this.inseeProvider) {
            const key = this.configService.get<string>('INSEE_SIRENE_API_KEY')?.trim();
            if (!key) {
                throw new BadRequestException(
                    'Configuration INSEE incomplète : INSEE_SIRENE_API_KEY manquante',
                );
            }
            const baseUrl =
                this.configService.get<string>('INSEE_SIRENE_BASE_URL')?.trim() ||
                'https://api.insee.fr/api-sirene/3.11';
            const header =
                this.configService.get<string>('INSEE_SIRENE_API_KEY_HEADER')?.trim() ||
                'X-INSEE-Api-Key-Integration';
            this.inseeProvider = new InseeSireneProvider(
                baseUrl,
                key,
                header,
                this.USER_AGENT,
                (seconds) => {
                    this.cooldownUntil = Date.now() + seconds * 1000;
                },
            );
        }
        return this.inseeProvider;
    }

    private getProviderCachePrefix(): string {
        return this.isInseeProvider() ? 'insee' : 'gouv';
    }

    private isInseeDiagnosticsEnabled(): boolean {
        const value = this.configService.get<string>('SIREN_INSEE_DIAGNOSTICS_ENABLED')?.trim().toLowerCase();
        return value === '1' || value === 'true' || value === 'yes' || value === 'on';
    }

    private isInseeLightResultsEnabled(): boolean {
        const value = this.configService.get<string>('SIREN_INSEE_LIGHT_RESULTS')?.trim().toLowerCase();
        if (!value) {
            return true;
        }
        return !(value === '0' || value === 'false' || value === 'no' || value === 'off');
    }

    private logInseeTextDiagnostics(
        diagnostics: InseeTextSearchDiagnostics,
        retryAfterSeconds?: number,
    ): void {
        if (!this.isInseeDiagnosticsEnabled()) {
            return;
        }

        const payload: Record<string, unknown> = {
            queryRaw: diagnostics.queryRaw,
            queryNormalized: diagnostics.queryNormalized,
            queryPrimaryName: diagnostics.queryPrimaryName,
            strategy: diagnostics.strategy,
            limitRequested: diagnostics.limitRequested,
            limitEffective: diagnostics.limitEffective,
            total: diagnostics.total,
            displayedCount: diagnostics.displayedCount,
            hasNextCursor: diagnostics.hasNextCursor,
            nextCursorPresent: diagnostics.nextCursorPresent,
            fallbackTriggered: diagnostics.fallbackTriggered,
        };

        if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
            payload.retryAfterSeconds = retryAfterSeconds;
        }

        this.logger.log(`[SIREN/insee] text-search ${JSON.stringify(payload)}`);
    }

    private buildDefaultInseeDiagnostics(
        query: string,
        limit: number,
    ): InseeTextSearchDiagnostics {
        const queryNormalized = normalizeInseeSearchInput(query);
        const queryPrimaryName = simplifyBusinessNameForRaisonSociale(query);
        const limitEffective = Math.min(limit, 10);

        return {
            queryRaw: query,
            queryNormalized,
            queryPrimaryName,
            strategy: 'raisonSociale',
            limitRequested: limit,
            limitEffective,
            total: 0,
            displayedCount: 0,
            hasNextCursor: false,
            nextCursorPresent: false,
            fallbackTriggered: false,
        };
    }

    private getCacheKey(query: string, limit: number, cursor?: string | null): string {
        const normalizedCursor = cursor?.trim() || '';
        return `${this.getProviderCachePrefix()}::${query.trim().toLowerCase()}::${limit}::${normalizedCursor}`;
    }

    private getCachedResults<T>(cacheKey: string): T | null {
        const cached = this.queryCache.get(cacheKey);
        if (!cached) {
            return null;
        }

        if (cached.expiresAt <= Date.now()) {
            this.queryCache.delete(cacheKey);
            return null;
        }

        return cached.data as T;
    }

    private setCachedResults<T>(cacheKey: string, data: T): void {
        const unknownData = data as unknown;
        const pagedItems =
            unknownData && typeof unknownData === 'object' && 'items' in unknownData
                ? (unknownData as { items?: unknown[] }).items
                : undefined;
        const itemCount = Array.isArray(unknownData)
            ? unknownData.length
            : Array.isArray(pagedItems)
                ? pagedItems.length
                : 0;

        this.queryCache.set(cacheKey, {
            data,
            expiresAt: Date.now() + (itemCount > 0 ? RESULTS_CACHE_TTL_MS : EMPTY_RESULTS_CACHE_TTL_MS),
        });
    }

    private buildLookupPage(
        items: SirenSearchResult[],
        limit: number,
        options?: {
            total?: number;
            nextCursor?: string | null;
            hasMore?: boolean;
        },
    ): SirenLookupPage {
        const nextCursor = options?.nextCursor ?? null;
        const hasMore = options?.hasMore ?? !!nextCursor;

        return {
            items,
            total: options?.total ?? items.length,
            limit,
            nextCursor: hasMore ? nextCursor : null,
            hasMore,
        };
    }

    private getRemainingCooldownSeconds(): number {
        if (this.cooldownUntil <= Date.now()) {
            return 0;
        }

        return Math.max(1, Math.ceil((this.cooldownUntil - Date.now()) / 1000));
    }

    private async executeTextSearchGouv(
        query: string,
        limit: number,
        cacheKey: string,
    ): Promise<SirenSearchResult[]> {
        const gouv = this.getGouv();
        const retryAfterSeconds = this.getRemainingCooldownSeconds();
        if (retryAfterSeconds > 0) {
            throw new SirenRateLimitError(retryAfterSeconds);
        }

        const upstream: GouvUpstreamSearchResponse = await gouv.fetchSearch(query.trim(), limit);
        if ([400, 404].includes(upstream.status)) {
            console.warn(
                `[SIREN/gouv] upstream lookup returned ${upstream.status} for query "${query.trim()}"`,
            );
            this.setCachedResults(cacheKey, []);
            return [];
        }

        if (upstream.status >= 400 || !upstream.data?.results) {
            throw new BadRequestException('Erreur lors de la recherche');
        }

        const results = upstream.data.results.map((entreprise) => gouv.mapEntreprise(entreprise));
        this.setCachedResults(cacheKey, results);
        return results;
    }

    private async executeTextSearchInsee(
        query: string,
        limit: number,
        cacheKey: string,
    ): Promise<SirenSearchResult[]> {
        const pagedResults = await this.executeTextSearchPagedInsee(query, limit, null, cacheKey);
        return pagedResults.items;
    }

    private async executeTextSearchPagedGouv(
        query: string,
        limit: number,
        cursor: string | null | undefined,
        cacheKey: string,
    ): Promise<SirenLookupPage> {
        const gouv = this.getGouv();
        const retryAfterSeconds = this.getRemainingCooldownSeconds();
        if (retryAfterSeconds > 0) {
            throw new SirenRateLimitError(retryAfterSeconds);
        }

        const page = Math.max(1, Number.parseInt(cursor ?? '1', 10) || 1);
        const upstream: GouvUpstreamSearchResponse = await gouv.fetchSearch(query.trim(), limit, page);
        if ([400, 404].includes(upstream.status)) {
            console.warn(
                `[SIREN/gouv] upstream lookup returned ${upstream.status} for query "${query.trim()}"`,
            );
            const emptyPage = this.buildLookupPage([], limit);
            this.setCachedResults(cacheKey, emptyPage);
            return emptyPage;
        }

        if (upstream.status >= 400 || !upstream.data?.results) {
            throw new BadRequestException('Erreur lors de la recherche');
        }

        const items = upstream.data.results.map((entreprise) => gouv.mapEntreprise(entreprise));
        const total = upstream.data.total_results ?? items.length;
        const hasMore = page * limit < total;
        const pagedResults = this.buildLookupPage(items, limit, {
            total,
            nextCursor: hasMore ? String(page + 1) : null,
            hasMore,
        });
        this.setCachedResults(cacheKey, pagedResults);
        return pagedResults;
    }

    private async executeTextSearchPagedInsee(
        query: string,
        limit: number,
        cursor: string | null | undefined,
        cacheKey: string,
    ): Promise<SirenLookupPage> {
        const retryAfterSeconds = this.getRemainingCooldownSeconds();
        if (retryAfterSeconds > 0) {
            this.logInseeTextDiagnostics(this.buildDefaultInseeDiagnostics(query, limit), retryAfterSeconds);
            throw new SirenRateLimitError(retryAfterSeconds);
        }

        try {
            const response = await this.getInsee().searchByTextWithDiagnostics(query, limit, cursor, {
                lightResults: this.isInseeLightResultsEnabled(),
            });
            this.logInseeTextDiagnostics(response.diagnostics);
            this.setCachedResults(cacheKey, response.page);
            return response.page;
        } catch (error) {
            if (error instanceof SirenRateLimitError) {
                this.logInseeTextDiagnostics(this.buildDefaultInseeDiagnostics(query, limit), error.retryAfterSeconds);
            }
            throw error;
        }
    }

    private async executeTextSearch(query: string, limit: number, cacheKey: string): Promise<SirenSearchResult[]> {
        const cached = this.getCachedResults<SirenSearchResult[]>(cacheKey);
        if (cached) {
            return cached;
        }

        if (this.isInseeProvider()) {
            return this.executeTextSearchInsee(query, limit, cacheKey);
        }
        return this.executeTextSearchGouv(query, limit, cacheKey);
    }

    private async executeTextSearchPaged(
        query: string,
        limit: number,
        cursor: string | null | undefined,
        cacheKey: string,
    ): Promise<SirenLookupPage> {
        const cached = this.getCachedResults<SirenLookupPage>(cacheKey);
        if (cached) {
            return cached;
        }

        if (this.isInseeProvider()) {
            return this.executeTextSearchPagedInsee(query, limit, cursor, cacheKey);
        }
        return this.executeTextSearchPagedGouv(query, limit, cursor, cacheKey);
    }

    /**
     * Recherche une entreprise par numéro SIREN ou SIRET
     */
    async search(sirenOrSiret: string): Promise<SirenSearchResult> {
        const cleanedNumber = stripNonDigits(sirenOrSiret);

        if (cleanedNumber.length !== 9 && cleanedNumber.length !== 14) {
            throw new BadRequestException(
                'Le numéro doit être un SIREN (9 chiffres) ou un SIRET (14 chiffres)',
            );
        }

        try {
            const siren = cleanedNumber.substring(0, 9);
            const cacheKey = this.getCacheKey(`exact:${cleanedNumber}`, 1);
            const cached = this.getCachedResults<SirenSearchResult[]>(cacheKey);
            if (cached?.[0]) {
                return cached[0];
            }

            const retryAfterSeconds = this.getRemainingCooldownSeconds();
            if (retryAfterSeconds > 0) {
                throw new SirenRateLimitError(retryAfterSeconds);
            }

            if (this.isInseeProvider()) {
                const result =
                    cleanedNumber.length === 14
                        ? await this.getInsee().searchBySiret(cleanedNumber)
                        : await this.getInsee().searchBySiren(cleanedNumber);
                this.setCachedResults(cacheKey, [result]);
                return result;
            }

            const gouv = this.getGouv();
            const upstream = await gouv.fetchSearch(siren, 1);

            if (upstream.status === 404) {
                throw new NotFoundException('Entreprise non trouvée');
            }

            if (upstream.status >= 400 || !upstream.data) {
                throw new BadRequestException('Erreur lors de la recherche SIREN');
            }

            const data = upstream.data;

            if (!data.results || data.results.length === 0) {
                throw new NotFoundException('Entreprise non trouvée');
            }

            const result = gouv.mapEntreprise(data.results[0]);
            this.setCachedResults(cacheKey, [result]);
            return result;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof SirenRateLimitError
            ) {
                throw error;
            }
            console.error('Error searching SIREN:', error);
            throw new BadRequestException('Erreur lors de la recherche SIREN');
        }
    }

    /**
     * Recherche des entreprises par texte (nom, SIREN, etc.)
     */
    async searchByText(query: string, limit: number = 10): Promise<SirenSearchResult[]> {
        const pagedResults = await this.searchByTextPaged(query, limit);
        return pagedResults.items;
    }

    /**
     * Recherche des entreprises par texte avec pagination.
     */
    async searchByTextPaged(
        query: string,
        limit: number = 25,
        cursor?: string | null,
    ): Promise<SirenLookupPage> {
        if (!query || query.trim().length < 3) {
            return this.buildLookupPage([], limit);
        }

        const cacheKey = this.getCacheKey(query, limit, cursor);
        const existingRequest = this.inFlightQueries.get(cacheKey);
        if (existingRequest) {
            return existingRequest as Promise<SirenLookupPage>;
        }

        const request = this.executeTextSearchPaged(query, limit, cursor, cacheKey)
            .catch((error) => {
                if (error instanceof SirenRateLimitError || error instanceof BadRequestException) {
                    throw error;
                }

                console.error('Error searching by text:', error);
                throw new BadRequestException('Erreur lors de la recherche');
            })
            .finally(() => {
                this.inFlightQueries.delete(cacheKey);
            });

        this.inFlightQueries.set(cacheKey, request);
        return request;
    }

    /**
     * Recherche unifiée : détecte automatiquement le type de requête
     * (SIREN exact, SIRET exact, ou recherche textuelle).
     */
    async lookup(query: string, limit: number = 10): Promise<SirenSearchResult[]> {
        const pagedResults = await this.lookupPaged(query, limit);
        return pagedResults.items;
    }

    /**
     * Recherche unifiée paginée : détecte automatiquement le type de requête.
     */
    async lookupPaged(
        query: string,
        limit: number = 25,
        cursor?: string | null,
    ): Promise<SirenLookupPage> {
        if (!query || query.trim().length === 0) {
            return this.buildLookupPage([], limit);
        }

        const trimmed = query.trim();
        const queryType = detectQueryType(trimmed);

        if (queryType === 'siren' || queryType === 'siret') {
            try {
                const result = await this.search(trimmed);
                return this.buildLookupPage([result], limit, {
                    total: 1,
                    nextCursor: null,
                    hasMore: false,
                });
            } catch (error) {
                if (error instanceof NotFoundException) {
                    return this.buildLookupPage([], limit);
                }
                throw error;
            }
        }

        if (trimmed.length < 3) {
            return this.buildLookupPage([], limit);
        }

        return this.searchByTextPaged(trimmed, limit, cursor);
    }
}
