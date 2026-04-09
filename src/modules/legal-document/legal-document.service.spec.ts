import { getSupabaseAdmin } from '../../config/supabase.config';
import * as rolesModule from '../../common/roles/roles';
import { LegalDocumentService } from './legal-document.service';

jest.mock('../../config/supabase.config', () => ({
    getSupabaseAdmin: jest.fn(),
}));

describe('LegalDocumentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(rolesModule, 'requireRole').mockResolvedValue(undefined as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns an empty default_content for company sales terms', async () => {
        const service = new LegalDocumentService();

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest.fn((table: string) => {
                if (table === 'legal_documents') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    eq: jest.fn().mockReturnValue({
                                        maybeSingle: jest.fn().mockResolvedValue({
                                            data: {
                                                id: 'doc-1',
                                                scope: 'company',
                                                company_id: 'company-1',
                                                document_type: 'sales_terms',
                                                slug: 'sales-terms-company-1',
                                                title: 'Conditions générales de vente',
                                                is_required: true,
                                                created_at: '2026-04-01T00:00:00.000Z',
                                                updated_at: '2026-04-01T00:00:00.000Z',
                                            },
                                            error: null,
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }

                if (table === 'legal_document_versions') {
                    return {
                        select: jest.fn().mockReturnValue({
                            in: jest.fn().mockReturnValue({
                                order: jest.fn().mockResolvedValue({
                                    data: [],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table: ${table}`);
            }),
        } as any);

        const result = await service.listCompanyDocuments('user-1', 'company-1');

        expect(result.documents).toHaveLength(1);
        expect(result.documents[0].document_type).toBe('sales_terms');
        expect(result.documents[0].default_content).toBe('');
    });
});
