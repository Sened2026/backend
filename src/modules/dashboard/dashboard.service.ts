import { Injectable, BadRequestException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { computeInvoiceStats } from '../invoice/invoice-stats.util';

export interface DashboardStats {
    company: {
        total_revenue: number;
        total_paid: number;
        total_pending: number;
        total_overdue: number;
        revenue_vs_previous: number;
        invoice_count: number;
        average_invoice: number;
        quotes_sent: number;
        quotes_accepted: number;
        conversion_rate: number;
        pending_quotes_amount: number;
        credit_notes_count: number;
        credit_notes_amount: number;
        monthly_revenue: { month: string; amount: number }[];
        top_overdue_clients: { name: string; amount: number; days: number }[];
    };
    accounting: {
        total_vat: number;
        vat_by_rate: { rate: number; amount: number }[];
        vat_on_credit_notes: number;
        invoices_draft: number;
        invoices_sent: number;
        invoices_paid: number;
        invoices_overdue: number;
        credit_notes_count: number;
        invoices_without_vat: number;
    };
}

@Injectable()
export class DashboardService {
    async getStats(userId: string, companyId: string, year?: number): Promise<DashboardStats> {
        const supabase = getSupabaseAdmin();
        const currentYear = year || new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        const startOfYear = `${currentYear}-01-01`;
        const endOfYear = `${currentYear}-12-31`;
        const startOfPreviousYear = `${currentYear - 1}-01-01`;
        const endOfPreviousYear = `${currentYear - 1}-12-31`;

        const [
            currentYearInvoicesRes,
            previousYearInvoicesRes,
            receivableInvoicesRes,
            quotesData,
            remindersRes,
            vatData,
            vatCreditNotes,
            invoicesWithoutVat,
        ] = await Promise.all([
            supabase
                .from('invoices')
                .select(`
                    id,
                    type,
                    status,
                    total,
                    amount_paid,
                    issue_date,
                    due_date,
                    client:clients(id, company_name, first_name, last_name)
                `)
                .eq('company_id', companyId)
                .gte('issue_date', startOfYear)
                .lte('issue_date', endOfYear),
            supabase
                .from('invoices')
                .select('id, type, status, total, amount_paid, issue_date, due_date')
                .eq('company_id', companyId)
                .gte('issue_date', startOfPreviousYear)
                .lte('issue_date', endOfPreviousYear),
            supabase
                .from('invoices')
                .select(`
                    id,
                    type,
                    status,
                    total,
                    amount_paid,
                    issue_date,
                    due_date,
                    client:clients(id, company_name, first_name, last_name)
                `)
                .eq('company_id', companyId),
            supabase
                .from('quotes')
                .select('total, status')
                .eq('company_id', companyId)
                .gte('created_at', startOfYear),
            supabase
                .from('reminders')
                .select('invoice_id, status, type, level, sent_at, created_at, scheduled_at')
                .eq('company_id', companyId),
            supabase
                .from('invoice_items')
                .select('vat_rate, line_total, invoice:invoices!inner(company_id)')
                .eq('invoice.company_id', companyId)
                .gte('invoice.issue_date', startOfYear),
            supabase
                .from('invoices')
                .select('total_vat')
                .eq('company_id', companyId)
                .eq('type', 'credit_note')
                .gte('issue_date', startOfYear),
            supabase
                .from('invoices')
                .select('id')
                .eq('company_id', companyId)
                .eq('total_vat', 0)
                .neq('type', 'credit_note')
                .gte('issue_date', startOfYear),
        ]);

        const currentYearInvoices = currentYearInvoicesRes.data || [];
        const previousYearInvoices = previousYearInvoicesRes.data || [];
        const receivableInvoices = receivableInvoicesRes.data || [];
        const reminders = remindersRes.data || [];

        const currentYearStats = computeInvoiceStats(
            currentYearInvoices,
            receivableInvoices,
            reminders,
        );
        const previousYearStats = computeInvoiceStats(previousYearInvoices, [], []);

        const totalRevenueCurrent = currentYearStats.totalInvoiced;
        const totalRevenuePrevious = previousYearStats.totalInvoiced;
        const totalPaidCurrent = currentYearStats.totalPaid;

        const revenueVsPrevious = totalRevenuePrevious > 0
            ? ((totalRevenueCurrent - totalRevenuePrevious) / totalRevenuePrevious) * 100
            : 0;

        const quotesSent = quotesData.data?.filter((q: any) => q.status === 'sent').length || 0;
        const quotesAccepted = quotesData.data?.filter((q: any) => q.status === 'accepted' || q.status === 'converted').length || 0;
        const totalQuotesForConversion = quotesSent + quotesAccepted;
        const conversionRate = totalQuotesForConversion > 0 ? (quotesAccepted / totalQuotesForConversion) * 100 : 0;
        const pendingQuotesAmount = quotesData.data?.filter((q: any) => q.status === 'sent').reduce((sum: number, q: any) => sum + Number(q.total), 0) || 0;

        const creditNotes = currentYearInvoices.filter((invoice: any) => invoice.type === 'credit_note' && invoice.status !== 'draft' && invoice.status !== 'cancelled');
        const creditNotesCount = creditNotes.length;
        const creditNotesAmount = creditNotes.reduce((sum: number, invoice: any) => sum + Math.abs(Number(invoice.total || 0)), 0);

        const monthlyRevenue: { month: string; amount: number }[] = [];
        for (let m = 1; m <= 12; m++) {
            if (m > currentMonth && year === currentYear) break;
            const monthStr = `${currentYear}-${String(m).padStart(2, '0')}`;
            const monthInvoices = currentYearInvoices.filter((invoice: any) => invoice.issue_date?.startsWith(monthStr));
            const monthTotal = computeInvoiceStats(monthInvoices, [], []).totalInvoiced;
            monthlyRevenue.push({
                month: monthStr,
                amount: Math.round(monthTotal * 100) / 100,
            });
        }

        const topOverdueMap = new Map<string, { name: string; amount: number; days: number }>();
        currentYearStats.overdueInvoices.forEach((invoice: any) => {
            const clientName = invoice.client?.company_name
                || `${invoice.client?.first_name || ''} ${invoice.client?.last_name || ''}`.trim()
                || 'Client inconnu';
            const existing = topOverdueMap.get(clientName) || { name: clientName, amount: 0, days: 0 };
            const amount = Number(invoice.total || 0) - Number(invoice.amount_paid || 0);
            const days = invoice.due_date
                ? Math.max(0, Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)))
                : 0;

            topOverdueMap.set(clientName, {
                name: clientName,
                amount: existing.amount + amount,
                days: Math.max(existing.days, days),
            });
        });

        const topOverdueClients = Array.from(topOverdueMap.values())
            .filter((client) => client.amount > 0)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);

        const vatByRate: { rate: number; amount: number }[] = [];
        const vatMap = new Map<number, number>();
        (vatData.data || []).forEach((item: any) => {
            const rate = Number(item.vat_rate);
            const baseAmount = Number(item.line_total) / (1 + rate / 100);
            const vatAmount = baseAmount * (rate / 100);
            vatMap.set(rate, (vatMap.get(rate) || 0) + vatAmount);
        });
        vatMap.forEach((amount, rate) => {
            vatByRate.push({ rate, amount: Math.round(amount * 100) / 100 });
        });
        vatByRate.sort((a, b) => b.rate - a.rate);

        const totalVat = vatByRate.reduce((sum, v) => sum + v.amount, 0);
        const vatOnCreditNotes = vatCreditNotes.data?.reduce((sum: number, i: any) => sum + Math.abs(Number(i.total_vat || 0)), 0) || 0;

        const invoiceCount = currentYearInvoices.filter((invoice: any) => invoice.type !== 'credit_note' && invoice.status !== 'draft' && invoice.status !== 'cancelled').length;
        const averageInvoice = invoiceCount > 0 ? totalRevenueCurrent / invoiceCount : 0;

        return {
            company: {
                total_revenue: Math.round(totalRevenueCurrent * 100) / 100,
                total_paid: Math.round(totalPaidCurrent * 100) / 100,
                total_pending: currentYearStats.totalPending,
                total_overdue: currentYearStats.totalOverdue,
                revenue_vs_previous: Math.round(revenueVsPrevious * 10) / 10,
                invoice_count: invoiceCount,
                average_invoice: Math.round(averageInvoice * 100) / 100,
                quotes_sent: quotesSent,
                quotes_accepted: quotesAccepted,
                conversion_rate: Math.round(conversionRate * 10) / 10,
                pending_quotes_amount: Math.round(pendingQuotesAmount * 100) / 100,
                credit_notes_count: creditNotesCount,
                credit_notes_amount: Math.round(creditNotesAmount * 100) / 100,
                monthly_revenue: monthlyRevenue,
                top_overdue_clients: topOverdueClients,
            },
            accounting: {
                total_vat: Math.round(totalVat * 100) / 100,
                vat_by_rate: vatByRate,
                vat_on_credit_notes: Math.round(vatOnCreditNotes * 100) / 100,
                invoices_draft: currentYearStats.countDraft,
                invoices_sent: currentYearStats.countSent,
                invoices_paid: currentYearStats.countPaid,
                invoices_overdue: currentYearStats.countOverdue,
                credit_notes_count: creditNotesCount,
                invoices_without_vat: invoicesWithoutVat.data?.length || 0,
            },
        };
    }

    async getAccountantStats(userId: string, companyId: string, year?: number): Promise<any> {
        const supabase = getSupabaseAdmin();
        const currentYear = year || new Date().getFullYear();
        const startOfYear = `${currentYear}-01-01`;
        const endOfYear = `${currentYear}-12-31`;

        // Get all companies linked to this accountant company
        const { data: linkedCompanies, error: linkedError } = await supabase
            .from('companies')
            .select('id, name')
            .eq('accountant_company_id', companyId);

        if (linkedError) {
            throw new BadRequestException(`Erreur: ${linkedError.message}`);
        }

        const clientCount = linkedCompanies?.length || 0;

        if (clientCount === 0) {
            return {
                client_count: 0,
                total_annual_revenue: 0,
                total_paid: 0,
                total_pending: 0,
                total_overdue: 0,
                overdue_count: 0,
                monthly_revenue: [],
            };
        }

        const companyIds = linkedCompanies!.map((c: any) => c.id);

        const [annualInvoicesRes, receivableInvoicesRes, remindersRes] = await Promise.all([
            supabase
                .from('invoices')
                .select('id, type, status, total, amount_paid, issue_date, due_date')
                .in('company_id', companyIds)
                .gte('issue_date', startOfYear)
                .lte('issue_date', endOfYear),
            supabase
                .from('invoices')
                .select('id, type, status, total, amount_paid, issue_date, due_date')
                .in('company_id', companyIds),
            supabase
                .from('reminders')
                .select('invoice_id, status, type, level, sent_at, created_at, scheduled_at')
                .in('company_id', companyIds),
        ]);

        const annualInvoices = annualInvoicesRes.data || [];
        const receivableInvoices = receivableInvoicesRes.data || [];
        const reminders = remindersRes.data || [];
        const stats = computeInvoiceStats(annualInvoices, receivableInvoices, reminders);

        const totalAnnualRevenue = stats.totalInvoiced;
        const totalPaid = stats.totalPaid;
        const totalPending = stats.totalPending;
        const totalOverdue = stats.totalOverdue;

        const currentMonth = new Date().getMonth() + 1;
        const monthlyRevenue: { month: string; amount: number }[] = [];
        for (let m = 1; m <= 12; m++) {
            if (m > currentMonth && (year === undefined || year === currentYear)) break;
            const monthStr = `${currentYear}-${String(m).padStart(2, '0')}`;
            const monthInvoices = annualInvoices.filter(
                (i: any) => i.issue_date?.startsWith(monthStr)
            );
            const monthTotal = computeInvoiceStats(monthInvoices, [], []).totalInvoiced;
            monthlyRevenue.push({
                month: monthStr,
                amount: Math.round(monthTotal * 100) / 100,
            });
        }

        return {
            client_count: clientCount,
            total_annual_revenue: Math.round(totalAnnualRevenue * 100) / 100,
            total_paid: Math.round(totalPaid * 100) / 100,
            total_pending: Math.round(totalPending * 100) / 100,
            total_overdue: Math.round(totalOverdue * 100) / 100,
            overdue_count: stats.countOverdue,
            monthly_revenue: monthlyRevenue,
        };
    }
}
