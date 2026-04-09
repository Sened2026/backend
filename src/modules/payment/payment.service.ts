import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
    Inject,
    forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { getUserCompanyRole, requireRole, MERCHANT_ROLES, ADMIN_ROLES } from '../../common/roles/roles';
import {
    RecordManualPaymentDto,
    RefundPaymentDto,
    PaymentQueryDto,
    Payment,
    PaymentListResponse,
    PaymentStats,
} from './dto/payment.dto';

@Injectable()
export class PaymentService {
    constructor(
        private configService: ConfigService,
        @Inject(forwardRef(() => WebsocketGateway))
        private websocketGateway: WebsocketGateway,
    ) {}

    private async checkCompanyAccess(userId: string, companyId: string) {
        return getUserCompanyRole(userId, companyId);
    }

    private async checkMerchantAccess(userId: string, companyId: string) {
        return requireRole(userId, companyId, MERCHANT_ROLES);
    }

    private async checkAdminAccess(userId: string, companyId: string) {
        return requireRole(userId, companyId, ADMIN_ROLES);
    }

    /**
     * Enregistre un paiement manuel
     */
    async recordManualPayment(
        userId: string,
        companyId: string,
        dto: RecordManualPaymentDto,
    ): Promise<Payment> {
        await this.checkMerchantAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Vérifier la facture
        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .select('status, total, amount_paid')
            .eq('id', dto.invoice_id)
            .eq('company_id', companyId)
            .single();

        if (invoiceError || !invoice) {
            throw new NotFoundException('Facture non trouvée');
        }

        if (['draft', 'cancelled', 'paid'].includes(invoice.status)) {
            throw new BadRequestException('Impossible d\'enregistrer un paiement sur cette facture');
        }

        const remainingAmount = invoice.total - (invoice.amount_paid || 0);
        if (dto.amount > remainingAmount + 0.01) { // Petite marge pour les arrondis
            throw new BadRequestException(`Le montant ne peut pas dépasser ${remainingAmount.toFixed(2)} €`);
        }

        // Utiliser la fonction SQL pour enregistrer le paiement
        const { data: paymentId, error: paymentError } = await supabase.rpc('record_payment', {
            p_invoice_id: dto.invoice_id,
            p_amount: dto.amount,
            p_payment_method: dto.payment_method,
            p_reference: dto.reference || null,
            p_notes: dto.notes || null,
            p_created_by: userId,
        });

        if (paymentError) {
            console.error('Error recording payment:', paymentError);
            throw new BadRequestException('Erreur lors de l\'enregistrement du paiement');
        }

        // Récupérer le paiement créé
        const { data: payment, error: fetchError } = await supabase
            .from('payments')
            .select('*')
            .eq('id', paymentId)
            .single();

        if (fetchError || !payment) {
            throw new InternalServerErrorException('Erreur lors de la récupération du paiement');
        }

        // Récupérer la facture mise à jour avec ses relations
        const { data: updatedInvoice } = await supabase
            .from('invoices')
            .select('*, client:clients(*)')
            .eq('id', dto.invoice_id)
            .single();

        // Émettre les événements WebSocket
        if (updatedInvoice) {
            this.websocketGateway.notifyInvoiceStatusChanged(companyId, updatedInvoice);
            this.websocketGateway.notifyPaymentCreated(companyId, {
                ...payment,
                invoice: updatedInvoice,
            });
        }

        return payment;
    }

    /**
     * Effectue un remboursement (manuel uniquement)
     */
    async refundPayment(
        userId: string,
        companyId: string,
        dto: RefundPaymentDto,
    ): Promise<{ success: boolean }> {
        await this.checkAdminAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        // Récupérer le paiement
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .select('*, invoice:invoices(company_id, total)')
            .eq('id', dto.payment_id)
            .single();

        if (paymentError || !payment) {
            throw new NotFoundException('Paiement non trouvé');
        }

        if (payment.invoice?.company_id !== companyId) {
            throw new ForbiddenException('Accès refusé');
        }

        if (payment.status === 'refunded') {
            throw new BadRequestException('Ce paiement a déjà été remboursé');
        }

        // Marquer comme remboursé
        await supabase
            .from('payments')
            .update({
                status: 'refunded',
                notes: `${payment.notes || ''}\nRemboursement manuel: ${dto.reason || ''}`,
            })
            .eq('id', dto.payment_id);

        // Recalculer le montant payé
        const { data: payments } = await supabase
            .from('payments')
            .select('amount')
            .eq('invoice_id', payment.invoice_id)
            .eq('status', 'succeeded');

        const totalPaid = payments?.reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0) || 0;

        await supabase
            .from('invoices')
            .update({
                amount_paid: totalPaid,
                status: totalPaid > 0 ? (totalPaid >= payment.invoice?.total ? 'paid' : 'sent') : 'sent',
            })
            .eq('id', payment.invoice_id);

        return { success: true };
    }

    /**
     * Récupère la liste des paiements
     */
    async findAll(
        userId: string,
        companyId: string,
        query: PaymentQueryDto,
    ): Promise<PaymentListResponse> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();
        const page = query.page || 1;
        const limit = query.limit || 20;
        const offset = (page - 1) * limit;

        let queryBuilder = supabase
            .from('payments')
            .select(`
                *,
                invoice:invoices!inner(id, invoice_number, company_id, client_id)
            `, { count: 'exact' })
            .eq('invoice.company_id', companyId);

        if (query.invoice_id) {
            queryBuilder = queryBuilder.eq('invoice_id', query.invoice_id);
        }

        if (query.client_id) {
            queryBuilder = queryBuilder.eq('invoice.client_id', query.client_id);
        }

        if (query.status) {
            queryBuilder = queryBuilder.eq('status', query.status);
        }

        if (query.payment_method) {
            queryBuilder = queryBuilder.eq('payment_method', query.payment_method);
        }

        if (query.from_date) {
            queryBuilder = queryBuilder.gte('paid_at', query.from_date);
        }

        if (query.to_date) {
            queryBuilder = queryBuilder.lte('paid_at', query.to_date);
        }

        queryBuilder = queryBuilder
            .order('paid_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const { data: payments, error, count } = await queryBuilder;

        if (error) {
            console.error('Error fetching payments:', error);
            throw new BadRequestException('Erreur lors de la récupération des paiements');
        }

        return {
            payments: payments || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    /**
     * Récupère les statistiques de paiement
     */
    async getStats(
        userId: string,
        companyId: string,
        fromDate?: string,
        toDate?: string,
    ): Promise<PaymentStats> {
        await this.checkCompanyAccess(userId, companyId);

        const supabase = getSupabaseAdmin();

        const from = fromDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
        const to = toDate || new Date().toISOString().split('T')[0];

        // Total reçu
        const { data: received } = await supabase
            .from('payments')
            .select('amount, payment_method, invoice:invoices!inner(company_id)')
            .eq('invoice.company_id', companyId)
            .eq('status', 'succeeded')
            .gte('paid_at', from)
            .lte('paid_at', to);

        // Total en attente
        const { data: pending } = await supabase
            .from('payments')
            .select('amount, invoice:invoices!inner(company_id)')
            .eq('invoice.company_id', companyId)
            .eq('status', 'pending')
            .gte('paid_at', from)
            .lte('paid_at', to);

        // Total remboursé
        const { data: refunded } = await supabase
            .from('payments')
            .select('amount, invoice:invoices!inner(company_id)')
            .eq('invoice.company_id', companyId)
            .eq('status', 'refunded')
            .gte('paid_at', from)
            .lte('paid_at', to);

        const totalReceived = received?.reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0) || 0;
        const totalPending = pending?.reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0) || 0;
        const totalRefunded = refunded?.reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0) || 0;

        // Comptage par méthode
        const countByMethod: Record<string, number> = {};
        received?.forEach((p: any) => {
            countByMethod[p.payment_method] = (countByMethod[p.payment_method] || 0) + 1;
        });

        return {
            total_received: Math.round(totalReceived * 100) / 100,
            total_pending: Math.round(totalPending * 100) / 100,
            total_refunded: Math.round(totalRefunded * 100) / 100,
            count_by_method: countByMethod,
        };
    }
}
