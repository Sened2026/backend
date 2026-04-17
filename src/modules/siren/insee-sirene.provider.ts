import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SirenRateLimitError } from './siren.types';
import type { SirenLookupPage, SirenSearchResult } from './siren.types';
import {
    buildInseeRaisonSocialeQuery,
    buildInseeTextSearchQuery,
    getNicSiegeFromUniteLegale,
    mapInseeEtablissementToResult,
    mapInseeUniteLegaleAndEtablissement,
    normalizeInseeSearchInput,
    simplifyBusinessNameForRaisonSociale,
    type InseeEtablissement,
    type InseeUniteLegale,
} from './insee-sirene.mapper';

const DEFAULT_RETRY_AFTER_SECONDS = 10;

export type InseeTextStrategy = 'raisonSociale' | 'lucene';

interface InseeCursorPayload {
    v: 1;
    strategy: InseeTextStrategy;
    upstreamCursor: string;
}

export interface InseeTextSearchDiagnostics {
    queryRaw: string;
    queryNormalized: string;
    queryPrimaryName: string;
    strategy: InseeTextStrategy;
    limitRequested: number;
    limitEffective: number;
    total: number;
    displayedCount: number;
    hasNextCursor: boolean;
    nextCursorPresent: boolean;
    fallbackTriggered: boolean;
}

export interface InseeTextSearchResponse {
    page: SirenLookupPage;
    diagnostics: InseeTextSearchDiagnostics;
}

export interface InseeTextSearchOptions {
    lightResults?: boolean;
}

interface ReponseUniteLegale {
    uniteLegale?: InseeUniteLegale;
}

interface ReponseUnitesLegales {
    header?: {
        total?: number;
        curseur?: string | null;
        curseurSuivant?: string | null;
    };
    unitesLegales?: InseeUniteLegale[];
}

interface ReponseEtablissement {
    etablissement?: InseeEtablissement;
}

export class InseeSireneProvider {
    private readonly baseUrlNormalized: string;

    constructor(
        baseUrl: string,
        private readonly apiKey: string,
        private readonly apiKeyHeader: string,
        private readonly userAgent: string,
        private readonly onRateLimited: (retryAfterSeconds: number) => void,
    ) {
        this.baseUrlNormalized = baseUrl.replace(/\/$/, '');
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

    private async requestJson(path: string): Promise<{ status: number; data: unknown }> {
        const url = `${this.baseUrlNormalized}${path.startsWith('/') ? path : `/${path}`}`;
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                [this.apiKeyHeader]: this.apiKey,
                'User-Agent': this.userAgent,
            },
        });

        if (response.status === 429) {
            const retryAfterSeconds = this.parseRetryAfterSeconds(response.headers.get('Retry-After'));
            this.onRateLimited(retryAfterSeconds);
            console.warn(
                `[SIREN/insee] upstream rate limit status=429 path="${path}" retry_after=${retryAfterSeconds}s`,
            );
            throw new SirenRateLimitError(retryAfterSeconds);
        }

        if (response.status === 401) {
            throw new BadRequestException('Clé API INSEE invalide ou refusée');
        }

        if (!response.ok) {
            return { status: response.status, data: null };
        }

        const data = await response.json();
        return { status: response.status, data };
    }

    private encodeCursor(strategy: InseeTextStrategy, upstreamCursor: string): string {
        return Buffer.from(
            JSON.stringify({
                v: 1,
                strategy,
                upstreamCursor,
            } satisfies InseeCursorPayload),
            'utf8',
        ).toString('base64url');
    }

    private decodeCursor(cursor: string): InseeCursorPayload {
        const trimmedCursor = cursor.trim();

        try {
            const decoded = Buffer.from(trimmedCursor, 'base64url').toString('utf8');
            const parsed = JSON.parse(decoded) as Partial<InseeCursorPayload>;

            if (
                parsed?.v === 1 &&
                (parsed.strategy === 'raisonSociale' || parsed.strategy === 'lucene') &&
                typeof parsed.upstreamCursor === 'string' &&
                parsed.upstreamCursor.trim().length > 0
            ) {
                return {
                    v: 1,
                    strategy: parsed.strategy,
                    upstreamCursor: parsed.upstreamCursor,
                };
            }
        } catch {
            // Support legacy cursors that directly contained the upstream INSEE cursor.
        }

        return {
            v: 1,
            strategy: 'lucene',
            upstreamCursor: trimmedCursor,
        };
    }

    private buildDiagnostics(
        query: string,
        primaryName: string,
        strategy: InseeTextStrategy,
        limitRequested: number,
        limitEffective: number,
        page: SirenLookupPage,
        fallbackTriggered: boolean,
    ): InseeTextSearchDiagnostics {
        return {
            queryRaw: query,
            queryNormalized: normalizeInseeSearchInput(query),
            queryPrimaryName: primaryName,
            strategy,
            limitRequested,
            limitEffective,
            total: page.total,
            displayedCount: page.items.length,
            hasNextCursor: page.hasMore,
            nextCursorPresent: !!page.nextCursor,
            fallbackTriggered,
        };
    }

    private async searchByTextStrategy(
        rawQuery: string,
        strategy: InseeTextStrategy,
        limit: number,
        upstreamCursor?: string | null,
        options?: InseeTextSearchOptions,
    ): Promise<SirenLookupPage> {
        const query =
            strategy === 'raisonSociale'
                ? buildInseeRaisonSocialeQuery(rawQuery)
                : buildInseeTextSearchQuery(rawQuery);
        const effectiveCursor = upstreamCursor?.trim() || '*';
        const path = `/siren?q=${encodeURIComponent(query)}&nombre=${limit}&curseur=${encodeURIComponent(
            effectiveCursor,
        )}`;
        const res = await this.requestJson(path);

        if ([400, 404].includes(res.status)) {
            console.warn(
                `[SIREN/insee] text search returned ${res.status} for strategy="${strategy}" query="${rawQuery.trim()}"`,
            );
            return {
                items: [],
                total: 0,
                limit,
                nextCursor: null,
                hasMore: false,
            };
        }

        if (res.status >= 400 || !res.data) {
            throw new BadRequestException('Erreur lors de la recherche');
        }

        const body = res.data as ReponseUnitesLegales;
        const list = body.unitesLegales;
        if (!list?.length) {
            return {
                items: [],
                total: body.header?.total ?? 0,
                limit,
                nextCursor: null,
                hasMore: false,
            };
        }

        const results: SirenSearchResult[] = [];
        for (const ul of list) {
            if (!ul?.siren) continue;
            let etab: InseeEtablissement | null = null;
            if (!options?.lightResults) {
                const nic = getNicSiegeFromUniteLegale(ul);
                if (nic) {
                    const siret = `${ul.siren}${nic}`;
                    const er = await this.requestJson(`/siret/${encodeURIComponent(siret)}`);
                    if (er.status === 200 && er.data) {
                        etab = (er.data as ReponseEtablissement).etablissement ?? null;
                    }
                }
            }
            results.push(mapInseeUniteLegaleAndEtablissement(ul, etab));
        }

        const currentCursor = body.header?.curseur ?? effectiveCursor;
        const upstreamNextCursor =
            body.header?.curseurSuivant && body.header.curseurSuivant !== currentCursor
                ? body.header.curseurSuivant
                : null;
        const nextCursor = upstreamNextCursor
            ? this.encodeCursor(strategy, upstreamNextCursor)
            : null;

        return {
            items: results,
            total: body.header?.total ?? results.length,
            limit,
            nextCursor,
            hasMore: !!nextCursor,
        };
    }

    async searchBySiren(siren: string): Promise<SirenSearchResult> {
        const res = await this.requestJson(`/siren/${encodeURIComponent(siren)}`);

        if (res.status === 404) {
            throw new NotFoundException('Entreprise non trouvée');
        }

        if (res.status >= 400 || !res.data) {
            throw new BadRequestException('Erreur lors de la recherche SIREN');
        }

        const body = res.data as ReponseUniteLegale;
        const ul = body.uniteLegale;
        if (!ul?.siren) {
            throw new NotFoundException('Entreprise non trouvée');
        }

        const nic = getNicSiegeFromUniteLegale(ul);
        let etab: InseeEtablissement | null = null;
        if (nic) {
            const siret = `${ul.siren}${nic}`;
            const er = await this.requestJson(`/siret/${encodeURIComponent(siret)}`);
            if (er.status === 200 && er.data) {
                etab = (er.data as ReponseEtablissement).etablissement ?? null;
            }
        }

        return mapInseeUniteLegaleAndEtablissement(ul, etab);
    }

    async searchBySiret(siret: string): Promise<SirenSearchResult> {
        const res = await this.requestJson(`/siret/${encodeURIComponent(siret)}`);

        if (res.status === 404) {
            throw new NotFoundException('Entreprise non trouvée');
        }

        if (res.status >= 400 || !res.data) {
            throw new BadRequestException('Erreur lors de la recherche SIREN');
        }

        const body = res.data as ReponseEtablissement;
        const etab = body.etablissement;
        if (!etab?.siret) {
            throw new NotFoundException('Entreprise non trouvée');
        }

        return mapInseeEtablissementToResult(etab);
    }

    async searchByTextWithDiagnostics(
        query: string,
        limit: number,
        cursor?: string | null,
        options?: InseeTextSearchOptions,
    ): Promise<InseeTextSearchResponse> {
        const primaryName = simplifyBusinessNameForRaisonSociale(query);
        const trimmedCursor = cursor?.trim();

        if (trimmedCursor) {
            const decodedCursor = this.decodeCursor(trimmedCursor);
            const page = await this.searchByTextStrategy(
                decodedCursor.strategy === 'raisonSociale' ? primaryName : query,
                decodedCursor.strategy,
                limit,
                decodedCursor.upstreamCursor,
                options,
            );

            return {
                page,
                diagnostics: this.buildDiagnostics(
                    query,
                    primaryName,
                    decodedCursor.strategy,
                    limit,
                    limit,
                    page,
                    false,
                ),
            };
        }

        const phaseOneLimit = Math.min(limit, 10);
        const raisonSocialePage = await this.searchByTextStrategy(
            primaryName,
            'raisonSociale',
            phaseOneLimit,
            null,
            options,
        );

        if (raisonSocialePage.items.length > 0) {
            return {
                page: raisonSocialePage,
                diagnostics: this.buildDiagnostics(
                    query,
                    primaryName,
                    'raisonSociale',
                    limit,
                    phaseOneLimit,
                    raisonSocialePage,
                    false,
                ),
            };
        }

        const lucenePage = await this.searchByTextStrategy(query, 'lucene', limit, null, options);
        return {
            page: lucenePage,
            diagnostics: this.buildDiagnostics(
                query,
                primaryName,
                'lucene',
                limit,
                limit,
                lucenePage,
                true,
            ),
        };
    }

    async searchByText(
        query: string,
        limit: number,
        cursor?: string | null,
        options?: InseeTextSearchOptions,
    ): Promise<SirenLookupPage> {
        const response = await this.searchByTextWithDiagnostics(query, limit, cursor, options);
        return response.page;
    }
}
