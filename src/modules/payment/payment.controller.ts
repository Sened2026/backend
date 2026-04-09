import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Req,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import {
    RecordManualPaymentDto,
    RefundPaymentDto,
    PaymentQueryDto,
} from './dto/payment.dto';

@Controller('payments')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) {}

    /**
     * Enregistrer un paiement manuel
     * POST /api/payments/manual
     */
    @Post('manual')
    async recordManualPayment(
        @Req() req: any,
        @Body() dto: RecordManualPaymentDto,
    ) {
        const userId = req.user?.id;
        const companyId = req.headers['x-company-id'];

        return this.paymentService.recordManualPayment(userId, companyId, dto);
    }

    /**
     * Effectuer un remboursement
     * POST /api/payments/refund
     */
    @Post('refund')
    async refundPayment(
        @Req() req: any,
        @Body() dto: RefundPaymentDto,
    ) {
        const userId = req.user?.id;
        const companyId = req.headers['x-company-id'];

        return this.paymentService.refundPayment(userId, companyId, dto);
    }

    /**
     * Récupérer la liste des paiements
     * GET /api/payments
     */
    @Get()
    async findAll(
        @Req() req: any,
        @Query() query: PaymentQueryDto,
    ) {
        const userId = req.user?.id;
        const companyId = req.headers['x-company-id'];

        return this.paymentService.findAll(userId, companyId, query);
    }

    /**
     * Récupérer les statistiques de paiement
     * GET /api/payments/stats
     */
    @Get('stats')
    async getStats(
        @Req() req: any,
        @Query('from_date') fromDate?: string,
        @Query('to_date') toDate?: string,
    ) {
        const userId = req.user?.id;
        const companyId = req.headers['x-company-id'];

        return this.paymentService.getStats(userId, companyId, fromDate, toDate);
    }
}
