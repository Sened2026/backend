import {
    Controller,
    Get,
    Param,
    Query,
    Res,
    ServiceUnavailableException,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SirenRateLimitError, SirenService, SirenSearchResult } from './siren.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

/**
 * Contrôleur pour la recherche SIREN/SIRET
 * Utilise l'API entreprise.data.gouv.fr (gratuite, sans clé API)
 *
 * Routes disponibles:
 * - GET /api/siren/lookup?q=query          - Recherche unifiée (auth requise)
 * - GET /api/siren/public-lookup?q=query   - Recherche unifiée publique (max 5 résultats)
 * - GET /api/siren/search/:sirenOrSiret    - Recherche par numéro (auth requise) [legacy]
 * - GET /api/siren/search?q=query          - Recherche textuelle (auth requise) [legacy]
 * - GET /api/siren/public-search?q=query   - Recherche textuelle publique [legacy]
 */
@Controller('siren')
export class SirenController {
    constructor(private readonly sirenService: SirenService) {}

    private parseLimit(limit: string | undefined, defaultValue: number, max?: number): number {
        const parsed = limit ? Number.parseInt(limit, 10) : defaultValue;
        const safeLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
        return max ? Math.min(safeLimit, max) : safeLimit;
    }

    private rethrowRateLimit(error: unknown, response: Response): never {
        if (error instanceof SirenRateLimitError) {
            response.setHeader('Retry-After', error.retryAfterSeconds.toString());
            throw new ServiceUnavailableException({
                message: error.message,
            });
        }

        throw error;
    }

    // ─── Endpoints unifiés ───────────────────────────────────────────

    /**
     * Recherche unifiée publique (sans authentification).
     * Détecte automatiquement SIREN (9 chiffres), SIRET (14 chiffres) ou texte.
     * Limitée à 5 résultats pour éviter les abus.
     */
    @Get('public-lookup')
    async publicLookup(
        @Query('q') query: string,
        @Query('limit') limit?: string,
        @Res({ passthrough: true }) response?: Response,
    ): Promise<SirenSearchResult[]> {
        if (!query || query.trim().length < 3) {
            return [];
        }

        const maxResults = this.parseLimit(limit, 5, 5);
        try {
            return await this.sirenService.lookup(query, maxResults);
        } catch (error) {
            this.rethrowRateLimit(error, response as Response);
        }
    }

    /**
     * Recherche unifiée authentifiée.
     * Détecte automatiquement SIREN (9 chiffres), SIRET (14 chiffres) ou texte.
     */
    @Get('lookup')
    @UseGuards(SupabaseAuthGuard)
    async lookup(
        @Query('q') query: string,
        @Query('limit') limit?: string,
        @Res({ passthrough: true }) response?: Response,
    ): Promise<SirenSearchResult[]> {
        const maxResults = this.parseLimit(limit, 10);
        try {
            return await this.sirenService.lookup(query, maxResults);
        } catch (error) {
            this.rethrowRateLimit(error, response as Response);
        }
    }

    // ─── Endpoints legacy (compatibilité) ────────────────────────────

    /**
     * Recherche publique par texte (sans authentification)
     * @deprecated Utiliser GET /siren/public-lookup à la place
     */
    @Get('public-search')
    async publicSearchByText(
        @Query('q') query: string,
        @Query('limit') limit?: string,
        @Res({ passthrough: true }) response?: Response,
    ): Promise<SirenSearchResult[]> {
        const maxResults = this.parseLimit(limit, 5, 5);
        try {
            return await this.sirenService.searchByText(query, maxResults);
        } catch (error) {
            this.rethrowRateLimit(error, response as Response);
        }
    }

    /**
     * Recherche une entreprise par numéro SIREN ou SIRET
     * @deprecated Utiliser GET /siren/lookup à la place
     */
    @Get('search/:sirenOrSiret')
    @UseGuards(SupabaseAuthGuard)
    async searchByNumber(
        @Param('sirenOrSiret') sirenOrSiret: string,
        @Res({ passthrough: true }) response?: Response,
    ): Promise<SirenSearchResult> {
        try {
            return await this.sirenService.search(sirenOrSiret);
        } catch (error) {
            this.rethrowRateLimit(error, response as Response);
        }
    }

    /**
     * Recherche des entreprises par texte (nom, etc.)
     * @deprecated Utiliser GET /siren/lookup à la place
     */
    @Get('search')
    @UseGuards(SupabaseAuthGuard)
    async searchByText(
        @Query('q') query: string,
        @Query('limit') limit?: string,
        @Res({ passthrough: true }) response?: Response,
    ): Promise<SirenSearchResult[]> {
        const maxResults = this.parseLimit(limit, 10);
        try {
            return await this.sirenService.searchByText(query, maxResults);
        } catch (error) {
            this.rethrowRateLimit(error, response as Response);
        }
    }
}
