import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { SubscriptionGuard } from "../../common/guards/subscription.guard";
import { QuotaGuard } from "../../common/guards/quota.guard";
import { CheckQuota } from "../../common/decorators/check-quota.decorator";
import { Response } from "express";
import { InvoiceService } from "./invoice.service";
import { PdfService } from "../pdf/pdf.service";
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceQueryDto,
  SignInvoiceDto,
  RecordPaymentDto,
  CreateDepositInvoiceDto,
  CancelInvoiceDto,
  CreateCreditNoteDto,
  SendReminderDto,
} from "./dto/invoice.dto";

@Controller("invoices")
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * Créer une nouvelle facture
   * POST /api/invoices
   */
  @Post()
  @UseGuards(SubscriptionGuard, QuotaGuard)
  @CheckQuota("max_invoices_per_month")
  async create(@Req() req: any, @Body() createInvoiceDto: CreateInvoiceDto) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.create(userId, companyId, createInvoiceDto);
  }

  /**
   * Récupérer la liste des factures
   * GET /api/invoices
   */
  @Get()
  async findAll(@Req() req: any, @Query() query: InvoiceQueryDto) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.findAll(userId, companyId, query);
  }

  /**
   * Récupérer les statistiques de facturation
   * GET /api/invoices/stats
   */
  @Get("stats")
  async getStats(
    @Req() req: any,
    @Query("from_date") fromDate?: string,
    @Query("to_date") toDate?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.getStats(userId, companyId, fromDate, toDate);
  }

  /**
   * Signer une facture (accès public via token)
   * POST /api/invoices/sign/:token
   */
  @Post("sign/:token")
  @HttpCode(HttpStatus.OK)
  async signPublic(
    @Param("token") token: string,
    @Body() signDto: SignInvoiceDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    return this.invoiceService.sign(token, signDto, ip, userAgent);
  }

  /**
   * Accéder à une facture via le lien de signature (accès public)
   * GET /api/invoices/view/:token
   */
  @Get("view/:token")
  async viewByToken(@Param("token") token: string) {
    return this.invoiceService.findBySignatureToken(token);
  }

  /**
   * Récupérer une facture par son ID
   * GET /api/invoices/:id
   */
  @Get(":id")
  async findOne(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.findOne(userId, companyId, id);
  }

  /**
   * Mettre à jour une facture
   * PUT /api/invoices/:id
   */
  @Put(":id")
  @UseGuards(SubscriptionGuard)
  async update(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.update(userId, companyId, id, updateInvoiceDto);
  }

  /**
   * Supprimer une facture
   * DELETE /api/invoices/:id
   */
  @Delete(":id")
  @UseGuards(SubscriptionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    await this.invoiceService.delete(userId, companyId, id);
  }

  /**
   * Envoyer une facture
   * POST /api/invoices/:id/send
   */
  @Post(":id/send")
  @UseGuards(SubscriptionGuard)
  @HttpCode(HttpStatus.OK)
  async send(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.send(userId, companyId, id);
  }

  /**
   * Enregistrer un paiement manuel
   * POST /api/invoices/:id/payments
   */
  @Post(":id/payments")
  async recordPayment(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() recordPaymentDto: RecordPaymentDto,
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.recordPayment(
      userId,
      companyId,
      id,
      recordPaymentDto,
    );
  }

  /**
   * Récupérer les paiements d'une facture
   * GET /api/invoices/:id/payments
   */
  @Get(":id/payments")
  async getPayments(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.getPayments(userId, companyId, id);
  }

  /**
   * Créer une facture d'acompte
   * POST /api/invoices/:id/deposit
   */
  @Post(":id/deposit")
  async createDeposit(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() createDepositDto: CreateDepositInvoiceDto,
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.createDeposit(
      userId,
      companyId,
      id,
      createDepositDto,
    );
  }

  /**
   * Créer un avoir pour une facture
   * POST /api/invoices/:id/credit-note
   */
  @Post(":id/credit-note")
  async createCreditNote(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditNoteDto,
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.createCreditNote(userId, companyId, id, dto);
  }

  /**
   * Annuler une facture
   * POST /api/invoices/:id/cancel
   */
  @Post(":id/cancel")
  @UseGuards(SubscriptionGuard)
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() cancelDto: CancelInvoiceDto,
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.cancel(userId, companyId, id, cancelDto);
  }

  /**
   * Renvoyer l'email de la facture
   * POST /api/invoices/:id/resend
   */
  @Post(":id/resend")
  @HttpCode(HttpStatus.OK)
  async resend(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.resendEmail(userId, companyId, id);
  }

  /**
   * Envoyer une relance de paiement
   * POST /api/invoices/:id/reminder
   */
  @Post(":id/reminder")
  @HttpCode(HttpStatus.OK)
  async sendReminder(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() reminderDto: SendReminderDto,
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.sendReminder(userId, companyId, id, reminderDto);
  }

  /**
   * Marquer une facture comme payée (paiement en espèces/hors système)
   * POST /api/invoices/:id/mark-paid
   */
  @Post(":id/mark-paid")
  @HttpCode(HttpStatus.OK)
  async markAsPaid(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    body: { payment_method?: string; reference?: string; notes?: string },
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    return this.invoiceService.markAsPaid(userId, companyId, id, body);
  }

  /**
   * Télécharger le PDF d'une facture
   * GET /api/invoices/:id/pdf
   */
  @Get(":id/pdf")
  async downloadPdf(
    @Req() req: any,
    @Res() res: Response,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.headers["x-company-id"];

    const invoice = await this.invoiceService.findOne(userId, companyId, id);

    const pdfBuffer = (
      await this.pdfService.getOrCreateInvoicePdf(invoice, userId)
    ).buffer;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="facture-${invoice.invoice_number}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  /**
   * Télécharger le PDF via token (accès public)
   * GET /api/invoices/pdf/:token
   */
  @Get("pdf/:token")
  async downloadPdfByToken(
    @Res() res: Response,
    @Param("token") token: string,
  ) {
    const invoice = await this.invoiceService.findBySignatureToken(token);

    const pdfBuffer = (await this.pdfService.getOrCreateInvoicePdf(invoice))
      .buffer;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="facture-${invoice.invoice_number}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }
}
