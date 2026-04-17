import { SirenController } from './siren.controller';

describe('SirenController pagination limits', () => {
    const emptyPage = {
        items: [],
        total: 0,
        limit: 0,
        nextCursor: null,
        hasMore: false,
    };

    it('plafonne la recherche publique paginée à 25 résultats', async () => {
        const lookupPaged = jest.fn().mockResolvedValue(emptyPage);
        const controller = new SirenController({
            lookupPaged,
        } as any);

        await controller.publicLookupPaged(
            'acme',
            '999',
            undefined,
            { setHeader: jest.fn() } as any,
        );

        expect(lookupPaged).toHaveBeenCalledWith('acme', 25, undefined);
    });

    it('plafonne la recherche authentifiée paginée à 100 résultats', async () => {
        const lookupPaged = jest.fn().mockResolvedValue(emptyPage);
        const controller = new SirenController({
            lookupPaged,
        } as any);

        await controller.lookupPaged(
            'acme',
            '999',
            undefined,
            { setHeader: jest.fn() } as any,
        );

        expect(lookupPaged).toHaveBeenCalledWith('acme', 100, undefined);
    });
});
