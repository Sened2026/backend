import { GouvRechercheEntreprisesProvider } from './gouv-recherche-entreprises.provider';
import { SirenRateLimitError } from './siren.types';

describe('GouvRechercheEntreprisesProvider', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('utilise le fallback de 10s si Retry-After est absent', async () => {
        const onRateLimited = jest.fn();
        const provider = new GouvRechercheEntreprisesProvider('TestAgent/1.0', onRateLimited);

        global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 429 })) as typeof fetch;

        await expect(provider.fetchSearch('acme', 5)).rejects.toBeInstanceOf(SirenRateLimitError);
        expect(onRateLimited).toHaveBeenCalledWith(10);
    });

    it('utilise le fallback de 10s si Retry-After est invalide', async () => {
        const onRateLimited = jest.fn();
        const provider = new GouvRechercheEntreprisesProvider('TestAgent/1.0', onRateLimited);

        global.fetch = jest.fn().mockResolvedValue(
            new Response(null, { status: 429, headers: { 'Retry-After': 'abc' } }),
        ) as typeof fetch;

        await expect(provider.fetchSearch('acme', 5)).rejects.toBeInstanceOf(SirenRateLimitError);
        expect(onRateLimited).toHaveBeenCalledWith(10);
    });

    it('respecte Retry-After numérique amont', async () => {
        const onRateLimited = jest.fn();
        const provider = new GouvRechercheEntreprisesProvider('TestAgent/1.0', onRateLimited);

        global.fetch = jest.fn().mockResolvedValue(
            new Response(null, { status: 429, headers: { 'Retry-After': '12' } }),
        ) as typeof fetch;

        await expect(provider.fetchSearch('acme', 5)).rejects.toBeInstanceOf(SirenRateLimitError);
        expect(onRateLimited).toHaveBeenCalledWith(12);
    });

    it('calcule Retry-After depuis une date HTTP future', async () => {
        const onRateLimited = jest.fn();
        const provider = new GouvRechercheEntreprisesProvider('TestAgent/1.0', onRateLimited);
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        const retryAt = new Date(Date.now() + 12_500).toUTCString();
        const expectedSeconds = Math.ceil((Date.parse(retryAt) - Date.now()) / 1000);

        global.fetch = jest.fn().mockResolvedValue(
            new Response(null, { status: 429, headers: { 'Retry-After': retryAt } }),
        ) as typeof fetch;

        await expect(provider.fetchSearch('acme', 5)).rejects.toBeInstanceOf(SirenRateLimitError);
        expect(onRateLimited).toHaveBeenCalledWith(expectedSeconds);
        nowSpy.mockRestore();
    });
});
