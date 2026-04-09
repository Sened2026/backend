import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import {
    stripNonDigits,
    calculateVatNumber,
    detectQueryType,
} from '../../shared/utils/business-identifiers.util';

const DEFAULT_RETRY_AFTER_SECONDS = 60;
const RESULTS_CACHE_TTL_MS = 60 * 60 * 1000;
const EMPTY_RESULTS_CACHE_TTL_MS = 10 * 60 * 1000;

export class SirenRateLimitError extends Error {
    constructor(
        public readonly retryAfterSeconds: number,
        message = `Recherche temporairement indisponible, réessayez dans ${retryAfterSeconds} s.`,
    ) {
        super(message);
        this.name = 'SirenRateLimitError';
    }
}

/**
 * Interface pour les résultats de recherche SIREN/SIRET
 */
export interface SirenSearchResult {
    siren: string;
    siret: string;
    company_name: string;
    vat_number: string;
    address: string;
    postal_code: string;
    city: string;
    country_code: string;
    legal_form: string;
    naf_code: string;
    creation_date: string;
}

/**
 * Interface pour la réponse de l'API recherche-entreprises.api.gouv.fr
 */
interface ApiRechercheEntrepriseResponse {
    results: Array<{
        siren: string;
        nom_complet: string;
        nom_raison_sociale?: string;
        nature_juridique?: string;
        date_creation?: string;
        siege: {
            siret: string;
            activite_principale?: string;
            adresse?: string;
            code_postal?: string;
            libelle_commune?: string;
            numero_voie?: string;
            type_voie?: string;
            libelle_voie?: string;
            complement_adresse?: string;
        };
    }>;
    total_results: number;
}

interface CachedLookupEntry {
    expiresAt: number;
    data: SirenSearchResult[];
}

interface UpstreamSearchResponse {
    status: number;
    data: ApiRechercheEntrepriseResponse | null;
}

@Injectable()
export class SirenService {
    private readonly API_BASE_URL = 'https://recherche-entreprises.api.gouv.fr';
    private readonly USER_AGENT = `SenedBackend/1.0 (${process.env.NODE_ENV ?? 'development'})`;
    private readonly queryCache = new Map<string, CachedLookupEntry>();
    private readonly inFlightQueries = new Map<string, Promise<SirenSearchResult[]>>();
    private cooldownUntil = 0;

    /**
     * Construit l'adresse complète à partir des composants
     */
    private buildAddress(siege: {
        numero_voie?: string;
        type_voie?: string;
        libelle_voie?: string;
        complement_adresse?: string;
        adresse?: string;
    }): string {
        // Si l'adresse complète est fournie, l'utiliser
        if (siege.adresse) {
            // Extraire juste la partie rue (avant le code postal)
            const match = siege.adresse.match(/^(.+?)\s+\d{5}/);
            if (match) {
                return match[1];
            }
            return siege.adresse;
        }

        const parts = [];
        if (siege.numero_voie) parts.push(siege.numero_voie);
        if (siege.type_voie) parts.push(siege.type_voie);
        if (siege.libelle_voie) parts.push(siege.libelle_voie);

        let address = parts.join(' ');

        if (siege.complement_adresse) {
            address += `, ${siege.complement_adresse}`;
        }

        return address;
    }

    /**
     * Transforme un résultat brut de l'API en SirenSearchResult normalisé.
     */
    private mapEntreprise(entreprise: ApiRechercheEntrepriseResponse['results'][0]): SirenSearchResult {
        const siege = entreprise.siege;
        return {
            siren: entreprise.siren,
            siret: siege.siret,
            company_name: entreprise.nom_complet || entreprise.nom_raison_sociale || '',
            vat_number: calculateVatNumber(entreprise.siren),
            address: this.buildAddress(siege),
            postal_code: siege.code_postal || '',
            city: siege.libelle_commune || '',
            country_code: 'FR',
            legal_form: entreprise.nature_juridique || '',
            naf_code: siege.activite_principale || '',
            creation_date: entreprise.date_creation || '',
        };
    }

    private getCacheKey(query: string, limit: number): string {
        return `${query.trim().toLowerCase()}::${limit}`;
    }

    private getCachedResults(cacheKey: string): SirenSearchResult[] | null {
        const cached = this.queryCache.get(cacheKey);
        if (!cached) {
            return null;
        }

        if (cached.expiresAt <= Date.now()) {
            this.queryCache.delete(cacheKey);
            return null;
        }

        return cached.data;
    }

    private setCachedResults(cacheKey: string, data: SirenSearchResult[]): void {
        this.queryCache.set(cacheKey, {
            data,
            expiresAt: Date.now() + (data.length > 0 ? RESULTS_CACHE_TTL_MS : EMPTY_RESULTS_CACHE_TTL_MS),
        });
    }

    private getRemainingCooldownSeconds(): number {
        if (this.cooldownUntil <= Date.now()) {
            return 0;
        }

        return Math.max(1, Math.ceil((this.cooldownUntil - Date.now()) / 1000));
    }

    private parseRetryAfterSeconds(retryAfter: string | null): number {
        if (!retryAfter) {
            return DEFAULT_RETRY_AFTER_SECONDS;
        }

        const parsedSeconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
            return parsedSeconds;
        }

        const parsedDate = Date.parse(retryAfter);
        if (!Number.isNaN(parsedDate)) {
            const seconds = Math.ceil((parsedDate - Date.now()) / 1000);
            if (seconds > 0) {
                return seconds;
            }
        }

        return DEFAULT_RETRY_AFTER_SECONDS;
    }

    private async fetchUpstreamSearch(query: string, limit: number): Promise<UpstreamSearchResponse> {
        const response = await fetch(
            `${this.API_BASE_URL}/search?q=${encodeURIComponent(query)}&per_page=${limit}`,
            {
                headers: {
                    'User-Agent': this.USER_AGENT,
                },
            },
        );

        if (response.status === 429) {
            const retryAfterSeconds = this.parseRetryAfterSeconds(response.headers.get('Retry-After'));
            this.cooldownUntil = Date.now() + retryAfterSeconds * 1000;
            console.warn(
                `[SIREN] upstream rate limit status=429 query="${query}" retry_after=${retryAfterSeconds}s`,
            );
            throw new SirenRateLimitError(retryAfterSeconds);
        }

        if (!response.ok) {
            return {
                status: response.status,
                data: null,
            };
        }

        return {
            status: response.status,
            data: await response.json() as ApiRechercheEntrepriseResponse,
        };
    }

    private async executeTextSearch(query: string, limit: number, cacheKey: string): Promise<SirenSearchResult[]> {
        const cached = this.getCachedResults(cacheKey);
        if (cached) {
            return cached;
        }

        const retryAfterSeconds = this.getRemainingCooldownSeconds();
        if (retryAfterSeconds > 0) {
            throw new SirenRateLimitError(retryAfterSeconds);
        }

        const upstream = await this.fetchUpstreamSearch(query.trim(), limit);
        if ([400, 404].includes(upstream.status)) {
            console.warn(
                `[SIREN] upstream lookup returned ${upstream.status} for query "${query.trim()}"`,
            );
            this.setCachedResults(cacheKey, []);
            return [];
        }

        if (upstream.status >= 400 || !upstream.data?.results) {
            throw new BadRequestException('Erreur lors de la recherche');
        }

        const results = upstream.data.results.map((entreprise) => this.mapEntreprise(entreprise));
        this.setCachedResults(cacheKey, results);
        return results;
    }

    /**
     * Recherche une entreprise par numéro SIREN ou SIRET
     */
    async search(sirenOrSiret: string): Promise<SirenSearchResult> {
        const cleanedNumber = stripNonDigits(sirenOrSiret);

        // Valider la longueur
        if (cleanedNumber.length !== 9 && cleanedNumber.length !== 14) {
            throw new BadRequestException(
                'Le numéro doit être un SIREN (9 chiffres) ou un SIRET (14 chiffres)'
            );
        }

        try {
            // Utiliser l'API recherche-entreprises avec le SIREN (9 premiers chiffres)
            const siren = cleanedNumber.substring(0, 9);
            const cacheKey = this.getCacheKey(`exact:${siren}`, 1);
            const cached = this.getCachedResults(cacheKey);
            if (cached?.[0]) {
                return cached[0];
            }

            const retryAfterSeconds = this.getRemainingCooldownSeconds();
            if (retryAfterSeconds > 0) {
                throw new SirenRateLimitError(retryAfterSeconds);
            }

            const upstream = await this.fetchUpstreamSearch(siren, 1);

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

            const result = this.mapEntreprise(data.results[0]);
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
        if (!query || query.trim().length < 3) {
            return [];
        }

        const cacheKey = this.getCacheKey(query, limit);
        const existingRequest = this.inFlightQueries.get(cacheKey);
        if (existingRequest) {
            return existingRequest;
        }

        const request = this.executeTextSearch(query, limit, cacheKey)
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
        if (!query || query.trim().length === 0) {
            return [];
        }

        const trimmed = query.trim();
        const queryType = detectQueryType(trimmed);

        if (queryType === 'siren' || queryType === 'siret') {
            try {
                const result = await this.search(trimmed);
                return [result];
            } catch (error) {
                if (error instanceof NotFoundException) {
                    return [];
                }
                throw error;
            }
        }

        if (trimmed.length < 3) {
            return [];
        }

        return this.searchByText(trimmed, limit);
    }
}
