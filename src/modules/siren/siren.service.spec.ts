import { SirenService } from './siren.service';
import type { SirenLookupPage, SirenSearchResult } from './siren.types';

function createConfigServiceMock(
    provider: 'insee' | 'gouv' = 'insee',
    diagnosticsEnabled = false,
    lightResultsEnabled = true,
) {
    return {
        get: jest.fn((key: string, defaultValue?: string) => {
            if (key === 'SIREN_PROVIDER') {
                return provider;
            }
            if (key === 'INSEE_SIRENE_API_KEY') {
                return 'test-key';
            }
            if (key === 'INSEE_SIRENE_BASE_URL') {
                return 'https://api.insee.fr/api-sirene/3.11';
            }
            if (key === 'INSEE_SIRENE_API_KEY_HEADER') {
                return 'X-INSEE-Api-Key-Integration';
            }
            if (key === 'SIREN_INSEE_DIAGNOSTICS_ENABLED') {
                return diagnosticsEnabled ? 'true' : 'false';
            }
            if (key === 'SIREN_INSEE_LIGHT_RESULTS') {
                return lightResultsEnabled ? 'true' : 'false';
            }

            return defaultValue;
        }),
    };
}

function buildLookupPage(items: SirenSearchResult[], cursor: string | null = null): SirenLookupPage {
    return {
        items,
        total: items.length,
        limit: 25,
        nextCursor: cursor,
        hasMore: !!cursor,
    };
}

describe('SirenService.lookupPaged', () => {
    it('enveloppe une recherche exacte SIREN dans une réponse paginée', async () => {
        const service = new SirenService(createConfigServiceMock() as any);
        const result: SirenSearchResult = {
            siren: '123456789',
            siret: '12345678900010',
            company_name: 'ACME',
            vat_number: 'FR00123456789',
            address: '1 rue Exemple',
            postal_code: '75001',
            city: 'PARIS',
            country_code: 'FR',
            legal_form: '5710',
            naf_code: '62.01Z',
            creation_date: '2024-01-01',
        };

        jest.spyOn(service, 'search').mockResolvedValue(result);

        await expect(service.lookupPaged('123456789', 25)).resolves.toEqual({
            items: [result],
            total: 1,
            limit: 25,
            nextCursor: null,
            hasMore: false,
        });
    });
});

describe('SirenService.searchByTextPaged', () => {
    it('met en cache chaque curseur séparément', async () => {
        const service = new SirenService(createConfigServiceMock() as any);
        const searchByTextWithDiagnostics = jest
            .fn()
            .mockResolvedValueOnce(
                {
                    page: buildLookupPage([
                        {
                            siren: '123456789',
                            siret: '12345678900010',
                            company_name: 'ACME 1',
                            vat_number: 'FR00123456789',
                            address: '',
                            postal_code: '',
                            city: '',
                            country_code: 'FR',
                            legal_form: '',
                            naf_code: '',
                            creation_date: '',
                        },
                    ], 'cursor-2'),
                    diagnostics: {
                        queryRaw: 'acme',
                        queryNormalized: 'acme',
                        queryPrimaryName: 'acme',
                        strategy: 'raisonSociale',
                        limitRequested: 25,
                        limitEffective: 10,
                        total: 1,
                        displayedCount: 1,
                        hasNextCursor: true,
                        nextCursorPresent: true,
                        fallbackTriggered: false,
                    },
                },
            )
            .mockResolvedValueOnce(
                {
                    page: buildLookupPage([
                        {
                            siren: '987654321',
                            siret: '98765432100010',
                            company_name: 'ACME 2',
                            vat_number: 'FR00987654321',
                            address: '',
                            postal_code: '',
                            city: '',
                            country_code: 'FR',
                            legal_form: '',
                            naf_code: '',
                            creation_date: '',
                        },
                    ]),
                    diagnostics: {
                        queryRaw: 'acme',
                        queryNormalized: 'acme',
                        queryPrimaryName: 'acme',
                        strategy: 'lucene',
                        limitRequested: 25,
                        limitEffective: 25,
                        total: 1,
                        displayedCount: 1,
                        hasNextCursor: false,
                        nextCursorPresent: false,
                        fallbackTriggered: true,
                    },
                },
            );

        (service as any).inseeProvider = {
            searchByTextWithDiagnostics,
        };

        await service.searchByTextPaged('acme', 25);
        await service.searchByTextPaged('acme', 25);
        await service.searchByTextPaged('acme', 25, 'cursor-2');

        expect(searchByTextWithDiagnostics).toHaveBeenCalledTimes(2);
        expect(searchByTextWithDiagnostics).toHaveBeenNthCalledWith(
            1,
            'acme',
            25,
            undefined,
            { lightResults: true },
        );
        expect(searchByTextWithDiagnostics).toHaveBeenNthCalledWith(
            2,
            'acme',
            25,
            'cursor-2',
            { lightResults: true },
        );
    });

    it('journalise les diagnostics INSEE seulement quand le flag est activé', async () => {
        const disabledService = new SirenService(createConfigServiceMock('insee', false) as any);
        const enabledService = new SirenService(createConfigServiceMock('insee', true) as any);
        const response = {
            page: buildLookupPage([
                {
                    siren: '123456789',
                    siret: '12345678900010',
                    company_name: 'ACME',
                    vat_number: 'FR00123456789',
                    address: '',
                    postal_code: '',
                    city: '',
                    country_code: 'FR',
                    legal_form: '',
                    naf_code: '',
                    creation_date: '',
                },
            ]),
            diagnostics: {
                queryRaw: 'ACME',
                queryNormalized: 'ACME',
                queryPrimaryName: 'ACME',
                strategy: 'raisonSociale' as const,
                limitRequested: 25,
                limitEffective: 10,
                total: 1,
                displayedCount: 1,
                hasNextCursor: false,
                nextCursorPresent: false,
                fallbackTriggered: false,
            },
        };

        (disabledService as any).inseeProvider = {
            searchByTextWithDiagnostics: jest.fn().mockResolvedValue(response),
        };
        (enabledService as any).inseeProvider = {
            searchByTextWithDiagnostics: jest.fn().mockResolvedValue(response),
        };

        const disabledLogSpy = jest.spyOn((disabledService as any).logger, 'log').mockImplementation(() => undefined);
        const enabledLogSpy = jest.spyOn((enabledService as any).logger, 'log').mockImplementation(() => undefined);

        await disabledService.searchByTextPaged('ACME', 25);
        await enabledService.searchByTextPaged('ACME', 25);

        expect(disabledLogSpy).not.toHaveBeenCalled();
        expect(enabledLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('"strategy":"raisonSociale"'),
        );
    });
});
