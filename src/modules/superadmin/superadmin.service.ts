import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.config';
import {
    Invoice,
    InvoiceListResponse,
    InvoiceQueryDto,
    InvoiceType,
    InvoiceItem,
    Payment,
} from '../invoice/dto/invoice.dto';
import { PdfService } from '../pdf/pdf.service';
import { Quote, QuoteItem, QuoteListResponse, QuoteQueryDto } from '../quote/dto/quote.dto';
import { QuoteService } from '../quote/quote.service';
import {
    SuperadminCompanyListResponseDto,
    SuperadminCompanyQueryDto,
    SuperadminInvoiceDocumentType,
    SuperadminInvoiceQueryDto,
    SuperadminQuoteQueryDto,
} from './dto/superadmin.dto';

type Pagination = {
    page: number;
    limit: number;
    offset: number;
};

@Injectable()
export class SuperadminService {
    constructor(
        private readonly quoteService: QuoteService,
        private readonly pdfService: PdfService,
    ) {}

    async getCompanies(
        query: SuperadminCompanyQueryDto,
    ): Promise<SuperadminCompanyListResponseDto> {
        const supabase = getSupabaseAdmin();
        const { page, limit, offset } = this.normalizePagination(query.page, query.limit);

        let queryBuilder = supabase
            .from('companies')
            .select(
                'id, name, legal_name, siren, city, country, logo_url, created_at',
                { count: 'exact' },
            );

        if (query.search?.trim()) {
            const search = query.search.trim();
            queryBuilder = queryBuilder.or(
                `name.ilike.%${search}%,legal_name.ilike.%${search}%,siren.ilike.%${search}%`,
            );
        }

        const { data, error, count } = await queryBuilder
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new BadRequestException(
                `Erreur lors de la récupération des entreprises: ${error.message}`,
            );
        }

        return {
            companies: data || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    async getQuotes(query: SuperadminQuoteQueryDto): Promise<QuoteListResponse> {
        const supabase = getSupabaseAdmin();
        const { page, limit, offset } = this.normalizePagination(query.page, query.limit);

        let queryBuilder = supabase
            .from('quotes')
            .select(
                `
                    *,
                    client:clients(id, company_name, first_name, last_name, email),
                    company:companies(id, name, siren)
                `,
                { count: 'exact' },
            );

        queryBuilder = this.applyQuoteFilters(queryBuilder, query);

        const { data, error, count } = await queryBuilder
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new BadRequestException(
                `Erreur lors de la récupération des devis: ${error.message}`,
            );
        }

        return {
            quotes: data || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    async getQuoteById(quoteId: string): Promise<Quote> {
        const supabase = getSupabaseAdmin();

        const { data: quote, error } = await supabase
            .from('quotes')
            .select(
                `
                    *,
                    client:clients(*),
                    company:companies(
                        id,
                        name,
                        legal_name,
                        siren,
                        vat_number,
                        address,
                        city,
                        postal_code,
                        phone,
                        email,
                        logo_url
                    ),
                    items:quote_items(*)
                `,
            )
            .eq('id', quoteId)
            .single();

        if (error || !quote) {
            throw new NotFoundException('Devis non trouvé');
        }

        if (quote.items) {
            quote.items.sort((a: QuoteItem, b: QuoteItem) => a.position - b.position);
        }

        return quote as Quote;
    }

    async generateQuotePdf(quoteId: string): Promise<{ fileName: string; buffer: Buffer }> {
        const quote = await this.getQuoteById(quoteId);
        const pdfData = this.quoteService.formatForPdf(quote);
        const pdfBuffer = await this.pdfService.generateQuotePdf(pdfData);

        return {
            fileName: `devis-${quote.quote_number}.pdf`,
            buffer: pdfBuffer,
        };
    }

    async getInvoices(
        query: SuperadminInvoiceQueryDto,
        documentType: SuperadminInvoiceDocumentType = 'all',
    ): Promise<InvoiceListResponse> {
        const supabase = getSupabaseAdmin();
        const { page, limit, offset } = this.normalizePagination(query.page, query.limit);

        let queryBuilder = supabase
            .from('invoices')
            .select(
                `
                    *,
                    client:clients(id, company_name, first_name, last_name, email),
                    company:companies(id, name, siren)
                `,
                { count: 'exact' },
            );

        queryBuilder = this.applyInvoiceFilters(queryBuilder, query, documentType);

        const { data, error, count } = await queryBuilder
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new BadRequestException(
                `Erreur lors de la récupération des factures: ${error.message}`,
            );
        }

        return {
            invoices: data || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    async getInvoiceById(invoiceId: string, expectedType?: InvoiceType): Promise<Invoice> {
        const supabase = getSupabaseAdmin();

        const { data: invoice, error } = await supabase
            .from('invoices')
            .select(
                `
                    *,
                    client:clients(*),
                    company:companies(
                        id,
                        name,
                        legal_name,
                        siren,
                        vat_number,
                        address,
                        city,
                        postal_code,
                        phone,
                        email,
                        logo_url,
                        rib_iban,
                        rib_bic,
                        rib_bank_name
                    ),
                    items:invoice_items(*),
                    payments:payments(*),
                    quote:quotes(id, quote_number, title)
                `,
            )
            .eq('id', invoiceId)
            .single();

        if (error || !invoice) {
            throw new NotFoundException('Facture non trouvée');
        }

        if (expectedType && invoice.type !== expectedType) {
            throw new NotFoundException(
                expectedType === InvoiceType.CREDIT_NOTE
                    ? 'Avoir non trouvé'
                    : 'Facture non trouvée',
            );
        }

        if (invoice.items) {
            invoice.items.sort((a: InvoiceItem, b: InvoiceItem) => a.position - b.position);
        }

        if (invoice.payments) {
            invoice.payments.sort(
                (a: Payment, b: Payment) =>
                    new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime(),
            );
        }

        if (invoice.type === InvoiceType.FINAL && invoice.parent_invoice_id) {
            const { data: deposits } = await supabase
                .from('invoices')
                .select('id, invoice_number, total, amount_paid, status')
                .eq('parent_invoice_id', invoice.parent_invoice_id)
                .eq('type', InvoiceType.DEPOSIT);

            invoice.deposit_invoices = deposits || [];
        }

        return invoice as Invoice;
    }

    async getCreditNoteById(invoiceId: string): Promise<Invoice> {
        return this.getInvoiceById(invoiceId, InvoiceType.CREDIT_NOTE);
    }

    async generateInvoicePdf(
        invoiceId: string,
        expectedType?: InvoiceType,
    ): Promise<{ fileName: string; buffer: Buffer }> {
        const invoice = await this.getInvoiceById(invoiceId, expectedType);
        const pdfBuffer = (await this.pdfService.getOrCreateInvoicePdf(invoice)).buffer;
        const prefix = invoice.type === InvoiceType.CREDIT_NOTE ? 'avoir' : 'facture';

        return {
            fileName: `${prefix}-${invoice.invoice_number}.pdf`,
            buffer: pdfBuffer,
        };
    }

    private normalizePagination(page?: number, limit?: number): Pagination {
        const safePage = Math.max(page || 1, 1);
        const safeLimit = Math.min(Math.max(limit || 20, 1), 100);

        return {
            page: safePage,
            limit: safeLimit,
            offset: (safePage - 1) * safeLimit,
        };
    }

    private applyQuoteFilters(queryBuilder: any, query: QuoteQueryDto & { company_id?: string }) {
        let builder = queryBuilder;

        if (query.company_id) {
            builder = builder.eq('company_id', query.company_id);
        }

        if (query.status) {
            builder = builder.eq('status', query.status);
        }

        if (query.client_id) {
            builder = builder.eq('client_id', query.client_id);
        }

        if (query.from_date) {
            builder = builder.gte('issue_date', query.from_date);
        }

        if (query.to_date) {
            builder = builder.lte('issue_date', query.to_date);
        }

        if (query.search?.trim()) {
            const search = query.search.trim();
            builder = builder.or(
                `quote_number.ilike.%${search}%,title.ilike.%${search}%,subject.ilike.%${search}%`,
            );
        }

        return builder;
    }

    private applyInvoiceFilters(
        queryBuilder: any,
        query: InvoiceQueryDto & { company_id?: string },
        documentType: SuperadminInvoiceDocumentType,
    ) {
        let builder = queryBuilder;

        if (query.company_id) {
            builder = builder.eq('company_id', query.company_id);
        }

        if (documentType === InvoiceType.CREDIT_NOTE) {
            builder = builder.eq('type', InvoiceType.CREDIT_NOTE);
        } else if (documentType === 'all') {
            if (query.type) {
                builder = builder.eq('type', query.type);
            }
        } else {
            builder = builder.neq('type', InvoiceType.CREDIT_NOTE);
            if (query.type) {
                builder = builder.eq('type', query.type);
            }
        }

        if (query.status) {
            builder = builder.eq('status', query.status);
        }

        if (query.client_id) {
            builder = builder.eq('client_id', query.client_id);
        }

        if (query.from_date) {
            builder = builder.gte('issue_date', query.from_date);
        }

        if (query.to_date) {
            builder = builder.lte('issue_date', query.to_date);
        }

        if (query.overdue_only) {
            builder = builder
                .in('status', ['sent', 'overdue'])
                .lt('due_date', new Date().toISOString().split('T')[0]);
        }

        if (query.search?.trim()) {
            const search = query.search.trim();
            builder = builder.or(
                `invoice_number.ilike.%${search}%,title.ilike.%${search}%,subject.ilike.%${search}%`,
            );
        }

        return builder;
    }
}
