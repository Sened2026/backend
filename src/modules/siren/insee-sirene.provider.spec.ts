import { InseeSireneProvider } from './insee-sirene.provider';
import { SirenRateLimitError } from './siren.types';

describe('InseeSireneProvider', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    function createProvider(onRateLimited: (retryAfterSeconds: number) => void): InseeSireneProvider {
        return new InseeSireneProvider(
            'https://api.insee.fr/api-sirene/3.11',
            'test-key',
            'X-INSEE-Api-Key-Integration',
            'TestAgent/1.0',
            onRateLimited,
        );
    }

    function buildUniteLegaleSearchResponse(
        siren: string,
        companyName: string,
        options?: {
            total?: number;
            cursor?: string | null;
            nextCursor?: string | null;
            nic?: string;
        },
    ): Response {
        return new Response(
            JSON.stringify({
                header: {
                    total: options?.total ?? 1,
                    curseur: options?.cursor ?? '*',
                    curseurSuivant: options?.nextCursor ?? null,
                },
                unitesLegales: [
                    {
                        siren,
                        dateCreationUniteLegale: '2024-01-01',
                        periodesUniteLegale: [
                            {
                                dateDebut: '2024-01-01',
                                denominationUniteLegale: companyName,
                                nicSiegeUniteLegale: options?.nic ?? '00010',
                            },
                        ],
                    },
                ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    }

    function buildEtablissementResponse(siren: string, siret: string, companyName: string): Response {
        return new Response(
            JSON.stringify({
                etablissement: {
                    siren,
                    siret,
                    adresseEtablissement: {
                        codePostalEtablissement: '75001',
                        libelleCommuneEtablissement: 'PARIS',
                    },
                    uniteLegale: {
                        denominationUniteLegale: companyName,
                    },
                },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    }

    it('utilise le fallback de 10s si Retry-After est absent', async () => {
        const onRateLimited = jest.fn();
        const provider = createProvider(onRateLimited);

        global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 429 })) as typeof fetch;

        await expect(provider.searchByText('acme', 5)).rejects.toBeInstanceOf(SirenRateLimitError);
        expect(onRateLimited).toHaveBeenCalledWith(10);
    });

    it('utilise le fallback de 10s si Retry-After est invalide', async () => {
        const onRateLimited = jest.fn();
        const provider = createProvider(onRateLimited);

        global.fetch = jest.fn().mockResolvedValue(
            new Response(null, { status: 429, headers: { 'Retry-After': 'oops' } }),
        ) as typeof fetch;

        await expect(provider.searchByText('acme', 5)).rejects.toBeInstanceOf(SirenRateLimitError);
        expect(onRateLimited).toHaveBeenCalledWith(10);
    });

    it('respecte Retry-After numérique amont', async () => {
        const onRateLimited = jest.fn();
        const provider = createProvider(onRateLimited);

        global.fetch = jest.fn().mockResolvedValue(
            new Response(null, { status: 429, headers: { 'Retry-After': '12' } }),
        ) as typeof fetch;

        await expect(provider.searchByText('acme', 5)).rejects.toBeInstanceOf(SirenRateLimitError);
        expect(onRateLimited).toHaveBeenCalledWith(12);
    });

    it('calcule Retry-After depuis une date HTTP future', async () => {
        const onRateLimited = jest.fn();
        const provider = createProvider(onRateLimited);
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        const retryAt = new Date(Date.now() + 12_500).toUTCString();
        const expectedSeconds = Math.ceil((Date.parse(retryAt) - Date.now()) / 1000);

        global.fetch = jest.fn().mockResolvedValue(
            new Response(null, { status: 429, headers: { 'Retry-After': retryAt } }),
        ) as typeof fetch;

        await expect(provider.searchByText('acme', 5)).rejects.toBeInstanceOf(SirenRateLimitError);
        expect(onRateLimited).toHaveBeenCalledWith(expectedSeconds);
        nowSpy.mockRestore();
    });

    it('retourne les métadonnées de pagination INSEE', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                buildUniteLegaleSearchResponse('123456789', 'ACME', {
                    total: 42,
                    cursor: '*',
                    nextCursor: 'cursor-2',
                }),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('123456789', '12345678900010', 'ACME'),
            ) as typeof fetch;

        const result = await provider.searchByText('acme', 25);

        expect(result.total).toBe(42);
        expect(result.limit).toBe(10);
        expect(result.nextCursor).not.toBe('cursor-2');
        expect(result.hasMore).toBe(true);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.siret).toBe('12345678900010');
    });

    it('désactive hasMore quand curseurSuivant est identique au curseur courant', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    header: {
                        total: 1,
                        curseur: 'cursor-2',
                        curseurSuivant: 'cursor-2',
                    },
                    unitesLegales: [],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        ) as typeof fetch;

        const result = await provider.searchByText('acme', 25, 'cursor-2');

        expect(result.hasMore).toBe(false);
        expect(result.nextCursor).toBeNull();
    });

    it('utilise raisonSociale par défaut et plafonne la première page à 10 résultats', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                buildUniteLegaleSearchResponse('123456789', 'LA FINANCIERE'),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('123456789', '12345678900010', 'LA FINANCIERE'),
            ) as typeof fetch;

        const result = await provider.searchByTextWithDiagnostics('LA FINANCIERE (LA FINANCIERE)', 25);

        const firstUrl = (global.fetch as jest.Mock).mock.calls[0]?.[0] as string;
        expect(firstUrl).toContain('q=raisonSociale%3ALA%20FINANCIERE');
        expect(firstUrl).toContain('nombre=10');
        expect(result.diagnostics.strategy).toBe('raisonSociale');
        expect(result.diagnostics.limitEffective).toBe(10);
        expect(result.diagnostics.queryPrimaryName).toBe('LA FINANCIERE');
        expect(result.diagnostics.fallbackTriggered).toBe(false);
    });

    it('bascule sur Lucene uniquement si raisonSociale ne renvoie aucun résultat', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        header: {
                            total: 0,
                            curseur: '*',
                            curseurSuivant: null,
                        },
                        unitesLegales: [],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
            )
            .mockResolvedValueOnce(
                buildUniteLegaleSearchResponse('123456789', 'LA FINANCIERE', {
                    total: 1,
                    cursor: '*',
                    nextCursor: null,
                }),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('123456789', '12345678900010', 'LA FINANCIERE'),
            ) as typeof fetch;

        const result = await provider.searchByTextWithDiagnostics('LA FINANCIERE', 25);

        const firstUrl = (global.fetch as jest.Mock).mock.calls[0]?.[0] as string;
        const secondUrl = (global.fetch as jest.Mock).mock.calls[1]?.[0] as string;
        expect(firstUrl).toContain('q=raisonSociale%3ALA%20FINANCIERE');
        expect(secondUrl).toContain('denominationUniteLegale');
        expect(result.diagnostics.strategy).toBe('lucene');
        expect(result.diagnostics.fallbackTriggered).toBe(true);
    });

    it('ne déclenche pas de fallback Lucene si raisonSociale retourne déjà des éléments', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                buildUniteLegaleSearchResponse('123456789', 'LA FINANCIERE', {
                    total: 1,
                    cursor: '*',
                    nextCursor: null,
                }),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('123456789', '12345678900010', 'LA FINANCIERE'),
            ) as typeof fetch;

        const result = await provider.searchByTextWithDiagnostics('LA FINANCIERE', 25);

        expect(result.page.items).toHaveLength(1);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('réutilise un curseur opaque raisonSociale sans relancer le choix de stratégie', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                buildUniteLegaleSearchResponse('123456789', 'LA FINANCIERE', {
                    total: 42,
                    cursor: '*',
                    nextCursor: 'cursor-2',
                }),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('123456789', '12345678900010', 'LA FINANCIERE'),
            )
            .mockResolvedValueOnce(
                buildUniteLegaleSearchResponse('987654321', 'LA FINANCIERE BIS', {
                    total: 42,
                    cursor: 'cursor-2',
                    nextCursor: null,
                }),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('987654321', '98765432100010', 'LA FINANCIERE BIS'),
            ) as typeof fetch;

        const firstPage = await provider.searchByText('LA FINANCIERE', 25);
        await provider.searchByText('LA FINANCIERE', 25, firstPage.nextCursor);

        const continuedUrl = (global.fetch as jest.Mock).mock.calls[2]?.[0] as string;
        expect(continuedUrl).toContain('q=raisonSociale%3ALA%20FINANCIERE');
        expect(continuedUrl).toContain('curseur=cursor-2');
    });

    it('réutilise un curseur opaque Lucene après un fallback', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        header: {
                            total: 0,
                            curseur: '*',
                            curseurSuivant: null,
                        },
                        unitesLegales: [],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
            )
            .mockResolvedValueOnce(
                buildUniteLegaleSearchResponse('123456789', 'LA FINANCIERE', {
                    total: 42,
                    cursor: '*',
                    nextCursor: 'cursor-2',
                }),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('123456789', '12345678900010', 'LA FINANCIERE'),
            )
            .mockResolvedValueOnce(
                buildUniteLegaleSearchResponse('987654321', 'LA FINANCIERE BIS', {
                    total: 42,
                    cursor: 'cursor-2',
                    nextCursor: null,
                }),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('987654321', '98765432100010', 'LA FINANCIERE BIS'),
            ) as typeof fetch;

        const firstPage = await provider.searchByTextWithDiagnostics('LA FINANCIERE', 25);
        await provider.searchByText('LA FINANCIERE', 25, firstPage.page.nextCursor);

        const continuedUrl = (global.fetch as jest.Mock).mock.calls[3]?.[0] as string;
        expect(continuedUrl).toContain('denominationUniteLegale');
        expect(continuedUrl).toContain('curseur=cursor-2');
    });

    it('hydrate uniquement les éléments effectivement renvoyés sur la page', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        header: {
                            total: 2,
                            curseur: '*',
                            curseurSuivant: null,
                        },
                        unitesLegales: [
                            {
                                siren: '123456789',
                                periodesUniteLegale: [
                                    {
                                        dateDebut: '2024-01-01',
                                        denominationUniteLegale: 'ACME 1',
                                        nicSiegeUniteLegale: '00010',
                                    },
                                ],
                            },
                            {
                                siren: '987654321',
                                periodesUniteLegale: [
                                    {
                                        dateDebut: '2024-01-01',
                                        denominationUniteLegale: 'ACME 2',
                                        nicSiegeUniteLegale: '00020',
                                    },
                                ],
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('123456789', '12345678900010', 'ACME 1'),
            )
            .mockResolvedValueOnce(
                buildEtablissementResponse('987654321', '98765432100020', 'ACME 2'),
            ) as typeof fetch;

        const result = await provider.searchByText('ACME', 2);

        expect(result.items).toHaveLength(2);
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('évite les appels /siret en mode lightResults pour la recherche texte', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    header: {
                        total: 2,
                        curseur: '*',
                        curseurSuivant: null,
                    },
                    unitesLegales: [
                        {
                            siren: '123456789',
                            periodesUniteLegale: [
                                {
                                    dateDebut: '2024-01-01',
                                    denominationUniteLegale: 'ACME 1',
                                    nicSiegeUniteLegale: '00010',
                                },
                            ],
                        },
                        {
                            siren: '987654321',
                            periodesUniteLegale: [
                                {
                                    dateDebut: '2024-01-01',
                                    denominationUniteLegale: 'ACME 2',
                                    nicSiegeUniteLegale: '00020',
                                },
                            ],
                        },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        ) as typeof fetch;

        const result = await provider.searchByText('ACME', 2, null, { lightResults: true });

        expect(result.items).toHaveLength(2);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toContain('/siren?');
    });

    it('conserve le flux enrichi sur recherche exacte SIREN', async () => {
        const provider = createProvider(jest.fn());

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        uniteLegale: {
                            siren: '123456789',
                            periodesUniteLegale: [
                                {
                                    dateDebut: '2024-01-01',
                                    denominationUniteLegale: 'ACME',
                                    nicSiegeUniteLegale: '00010',
                                },
                            ],
                        },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
            )
            .mockResolvedValueOnce(buildEtablissementResponse('123456789', '12345678900010', 'ACME')) as typeof fetch;

        const result = await provider.searchBySiren('123456789');

        expect(result.siret).toBe('12345678900010');
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect((global.fetch as jest.Mock).mock.calls[1]?.[0]).toContain('/siret/12345678900010');
    });
});
