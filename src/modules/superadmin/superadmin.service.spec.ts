import { NotFoundException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { InvoiceType } from '../invoice/dto/invoice.dto';
import { SuperadminService } from './superadmin.service';

jest.mock('../../config/supabase.config', () => ({
    getSupabaseAdmin: jest.fn(),
}));

describe('SuperadminService', () => {
    let service: SuperadminService;
    let quoteService: { formatForPdf: jest.Mock };
    let pdfService: {
        generateQuotePdf: jest.Mock;
        getOrCreateInvoicePdf: jest.Mock;
    };

    beforeEach(() => {
        quoteService = {
            formatForPdf: jest.fn(),
        };
        pdfService = {
            generateQuotePdf: jest.fn(),
            getOrCreateInvoicePdf: jest.fn(),
        };

        service = new SuperadminService(quoteService as any, pdfService as any);
        jest.mocked(getSupabaseAdmin).mockReset();
    });

    it('returns paginated companies globally', async () => {
        const range = jest.fn().mockResolvedValue({
            data: [
                {
                    id: 'company-1',
                    name: 'Acme',
                    legal_name: 'Acme SAS',
                    siren: '123456789',
                    city: 'Paris',
                    country: 'FR',
                    logo_url: null,
                    created_at: '2026-04-08T10:00:00.000Z',
                },
            ],
            count: 1,
            error: null,
        });
        const order = jest.fn().mockReturnValue({ range });
        const select = jest.fn().mockReturnValue({ order });

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest.fn().mockReturnValue({ select }),
        } as any);

        const result = await service.getCompanies({ page: 1, limit: 20 });

        expect(result).toEqual({
            companies: [
                {
                    id: 'company-1',
                    name: 'Acme',
                    legal_name: 'Acme SAS',
                    siren: '123456789',
                    city: 'Paris',
                    country: 'FR',
                    logo_url: null,
                    created_at: '2026-04-08T10:00:00.000Z',
                },
            ],
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
        });
    });

    it('sorts quote items before returning the quote', async () => {
        const single = jest.fn().mockResolvedValue({
            data: {
                id: 'quote-1',
                quote_number: 'DEV-001',
                items: [
                    { id: 'item-2', position: 2, description: 'B' },
                    { id: 'item-1', position: 1, description: 'A' },
                ],
            },
            error: null,
        });
        const eq = jest.fn().mockReturnValue({ single });
        const select = jest.fn().mockReturnValue({ eq });

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest.fn().mockReturnValue({ select }),
        } as any);

        const result = await service.getQuoteById('quote-1');

        expect(result.items?.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    });

    it('rejects a non credit-note invoice from the credit note endpoint', async () => {
        const single = jest.fn().mockResolvedValue({
            data: {
                id: 'invoice-1',
                type: InvoiceType.STANDARD,
                items: [],
                payments: [],
            },
            error: null,
        });
        const eq = jest.fn().mockReturnValue({ single });
        const select = jest.fn().mockReturnValue({ eq });

        jest.mocked(getSupabaseAdmin).mockReturnValue({
            from: jest.fn().mockReturnValue({ select }),
        } as any);

        await expect(service.getCreditNoteById('invoice-1')).rejects.toThrow(
            new NotFoundException('Avoir non trouvé'),
        );
    });

    it('reuses the existing PDF generation pipeline for quotes', async () => {
        const quote = {
            id: 'quote-1',
            quote_number: 'DEV-001',
            items: [],
        };

        jest.spyOn(service, 'getQuoteById').mockResolvedValue(quote as any);
        quoteService.formatForPdf.mockReturnValue({ quote_number: 'DEV-001' });
        pdfService.generateQuotePdf.mockResolvedValue(Buffer.from('pdf'));

        const result = await service.generateQuotePdf('quote-1');

        expect(quoteService.formatForPdf).toHaveBeenCalledWith(quote);
        expect(pdfService.generateQuotePdf).toHaveBeenCalledWith({
            quote_number: 'DEV-001',
        });
        expect(result).toEqual({
            fileName: 'devis-DEV-001.pdf',
            buffer: Buffer.from('pdf'),
        });
    });
});
