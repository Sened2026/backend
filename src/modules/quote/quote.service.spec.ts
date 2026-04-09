import { getSupabaseAdmin } from '../../config/supabase.config';
import * as rolesModule from '../../common/roles/roles';
import { buildQuoteTokenExpiryFromValidityDate, QuoteService } from './quote.service';
import { QuoteSignatureProvider, QuoteStatus } from './dto/quote.dto';

jest.mock('../../config/supabase.config', () => ({
    getSupabaseAdmin: jest.fn(),
}));

function createChain<T>(result: Promise<T> | T, terminalMethod: string) {
    const builder: Record<string, jest.Mock> = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
    };

    builder[terminalMethod] = jest.fn().mockResolvedValue(result);

    return builder;
}

describe('quote validity date helpers', () => {
    it('keeps the public quote token expiry as a full ISO timestamp', () => {
        expect(buildQuoteTokenExpiryFromValidityDate('2026-04-27')).toBe('2026-04-27T22:59:59.999Z');
    });
});

describe('QuoteService internal send', () => {
    const configService = {
        get: jest.fn((key: string, defaultValue?: string) => {
            if (key === 'FRONTEND_URL') return 'https://app.example.com';
            return defaultValue;
        }),
    };
    const notificationService = {
        isEmailConfigured: jest.fn(),
        sendQuoteEmailV2: jest.fn(),
    };
    const pdfService = {
        generateQuotePdf: jest.fn(),
    };
    const websocketGateway = {
        notifyQuoteStatusChanged: jest.fn(),
    };
    const legalDocumentService = {
        getPublishedCompanySalesTerms: jest.fn(),
        resolveQuoteTermsVersion: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('falls back to the internal signing flow when Yousign is disabled', async () => {
        const service = new QuoteService(
            configService as any,
            notificationService as any,
            pdfService as any,
            websocketGateway as any,
            legalDocumentService as any,
        );

        const quote = {
            id: 'quote-1',
            quote_number: 'DEV-001',
            company_id: 'company-1',
            client_id: 'client-1',
            created_by: 'user-1',
            status: QuoteStatus.DRAFT,
            validity_date: '2026-04-27',
            issue_date: '2026-03-28',
            total: 1200,
            subject: 'Test',
            terms_and_conditions: 'CGV initiales',
            client: {
                id: 'client-1',
                email: 'client@example.com',
            },
            company: {
                id: 'company-1',
                name: 'Acme',
            },
            items: [],
        };

        const selectBuilder = {
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: quote,
                            error: null,
                        }),
                    }),
                }),
            }),
        };
        const updateBuilder = {
            update: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                    error: null,
                }),
            }),
        };

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest
                .fn()
                .mockReturnValueOnce(selectBuilder)
                .mockReturnValueOnce(updateBuilder),
        } as any);

        jest.spyOn(service as any, 'checkWriteAccess').mockResolvedValue('merchant_admin');
        jest.spyOn(service as any, 'formatForPdf').mockReturnValue({ quote_number: quote.quote_number });
        jest.spyOn(service, 'findOne').mockResolvedValue({
            ...quote,
            status: QuoteStatus.SENT,
            signature_provider: QuoteSignatureProvider.INTERNAL,
            signature_token: 'token-1',
            signature_token_expires_at: '2026-04-27T22:59:59.999Z',
        } as any);

        legalDocumentService.getPublishedCompanySalesTerms.mockResolvedValue(null);
        legalDocumentService.resolveQuoteTermsVersion.mockResolvedValue({
            document: { id: 'doc-1' },
            version: { id: 'version-1', version_number: 3 },
            content_text: 'CGV figées',
            checksum_sha256: 'checksum-1',
        });
        pdfService.generateQuotePdf.mockResolvedValue(Buffer.from('pdf'));
        notificationService.isEmailConfigured.mockReturnValue(true);
        notificationService.sendQuoteEmailV2.mockResolvedValue({ success: true });

        const result = await service.send('user-1', 'company-1', 'quote-1');

        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                status: QuoteStatus.SENT,
                signature_provider: QuoteSignatureProvider.INTERNAL,
                yousign_signature_request_id: null,
                yousign_document_id: null,
                yousign_signer_id: null,
                yousign_status: null,
                yousign_signature_link_expires_at: null,
                yousign_last_event_name: null,
                yousign_last_event_at: null,
            }),
        );
        expect(result.public_url).toMatch(/^https:\/\/app\.example\.com\/quotes\/sign\/[0-9a-f-]+$/);
        expect(notificationService.sendQuoteEmailV2).toHaveBeenCalled();
    });

    it('refuses to send a quote without any CGV when the explicit confirmation is missing', async () => {
        const service = new QuoteService(
            configService as any,
            notificationService as any,
            pdfService as any,
            websocketGateway as any,
            legalDocumentService as any,
        );

        const quote = {
            id: 'quote-1',
            quote_number: 'DEV-001',
            company_id: 'company-1',
            client_id: 'client-1',
            created_by: 'user-1',
            status: QuoteStatus.DRAFT,
            validity_date: '2026-04-27',
            issue_date: '2026-03-28',
            total: 1200,
            subject: 'Test',
            terms_and_conditions: null,
            client: {
                id: 'client-1',
                email: 'client@example.com',
            },
            company: {
                id: 'company-1',
                name: 'Acme',
            },
            items: [],
        };

        const selectBuilder = {
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: quote,
                            error: null,
                        }),
                    }),
                }),
            }),
        };

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest.fn().mockReturnValue(selectBuilder),
        } as any);

        jest.spyOn(service as any, 'checkWriteAccess').mockResolvedValue('merchant_admin');
        legalDocumentService.getPublishedCompanySalesTerms.mockResolvedValue(null);

        await expect(service.send('user-1', 'company-1', 'quote-1')).rejects.toThrow(
            "Confirmez l'envoi sans CGV pour envoyer ce devis sans CGV publiées ou texte de CGV sur le devis",
        );
    });

    it('sends a quote without any CGV when the explicit confirmation is provided', async () => {
        const service = new QuoteService(
            configService as any,
            notificationService as any,
            pdfService as any,
            websocketGateway as any,
            legalDocumentService as any,
        );

        const quote = {
            id: 'quote-1',
            quote_number: 'DEV-001',
            company_id: 'company-1',
            client_id: 'client-1',
            created_by: 'user-1',
            status: QuoteStatus.DRAFT,
            validity_date: '2026-04-27',
            issue_date: '2026-03-28',
            total: 1200,
            subject: 'Test',
            terms_and_conditions: null,
            client: {
                id: 'client-1',
                email: 'client@example.com',
            },
            company: {
                id: 'company-1',
                name: 'Acme',
            },
            items: [],
        };

        const selectBuilder = {
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: quote,
                            error: null,
                        }),
                    }),
                }),
            }),
        };
        const updateBuilder = {
            update: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                    error: null,
                }),
            }),
        };

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest
                .fn()
                .mockReturnValueOnce(selectBuilder)
                .mockReturnValueOnce(updateBuilder),
        } as any);

        jest.spyOn(service as any, 'checkWriteAccess').mockResolvedValue('merchant_admin');
        jest.spyOn(service as any, 'formatForPdf').mockReturnValue({ quote_number: quote.quote_number });
        jest.spyOn(service, 'findOne').mockResolvedValue({
            ...quote,
            status: QuoteStatus.SENT,
            signature_provider: QuoteSignatureProvider.INTERNAL,
            signature_token: 'token-1',
            signature_token_expires_at: '2026-04-27T22:59:59.999Z',
            legal_document_version_id: null,
            legal_document_version_number: null,
            terms_checksum_sha256: null,
        } as any);

        legalDocumentService.getPublishedCompanySalesTerms.mockResolvedValue(null);
        pdfService.generateQuotePdf.mockResolvedValue(Buffer.from('pdf'));
        notificationService.isEmailConfigured.mockReturnValue(true);
        notificationService.sendQuoteEmailV2.mockResolvedValue({ success: true });

        const result = await service.send('user-1', 'company-1', 'quote-1', {
            confirm_send_without_cgv: true,
        });

        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                status: QuoteStatus.SENT,
                signature_provider: QuoteSignatureProvider.INTERNAL,
                terms_and_conditions: null,
                legal_document_version_id: null,
                legal_document_version_number: null,
                terms_checksum_sha256: null,
            }),
        );
        expect(result.public_url).toMatch(/^https:\/\/app\.example\.com\/quotes\/sign\/[0-9a-f-]+$/);
    });

});

describe('QuoteService access control', () => {
    const configService = { get: jest.fn() };
    const notificationService = {};
    const pdfService = {
        generateQuotePdf: jest.fn(),
    };
    const websocketGateway = {};
    const legalDocumentService = {};

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('allows superadmin to list merchant-company quotes', async () => {
        const service = new QuoteService(
            configService as any,
            notificationService as any,
            pdfService as any,
            websocketGateway as any,
            legalDocumentService as any,
        );

        jest.spyOn(rolesModule, 'getUserCompanyAccessContext').mockResolvedValue({
            role: 'superadmin',
            companyOwnerRole: 'merchant_admin',
            companyOwnerId: 'owner-1',
            isCabinet: false,
            isMerchantCompany: true,
        });

        const listQuery = createChain(
            {
                data: [],
                error: null,
                count: 0,
            },
            'range',
        );

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest.fn().mockReturnValue(listQuery),
        } as any);

        await expect(
            service.findAll('user-1', 'company-1', {}),
        ).resolves.toMatchObject({
            quotes: [],
            total: 0,
        });
    });

    it('allows superadmin to open a draft merchant-company quote', async () => {
        const service = new QuoteService(
            configService as any,
            notificationService as any,
            pdfService as any,
            websocketGateway as any,
            legalDocumentService as any,
        );

        jest.spyOn(rolesModule, 'getUserCompanyAccessContext').mockResolvedValue({
            role: 'superadmin',
            companyOwnerRole: 'merchant_admin',
            companyOwnerId: 'owner-1',
            isCabinet: false,
            isMerchantCompany: true,
        });

        const detailQuery = createChain(
            {
                data: {
                    id: 'quote-1',
                    company_id: 'company-1',
                    quote_number: 'DEV-001',
                    status: QuoteStatus.DRAFT,
                    items: [],
                },
                error: null,
            },
            'single',
        );

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest.fn().mockReturnValue(detailQuery),
        } as any);

        await expect(
            service.findOne('user-1', 'company-1', 'quote-1'),
        ).resolves.toMatchObject({
            id: 'quote-1',
            status: QuoteStatus.DRAFT,
        });
    });
});
