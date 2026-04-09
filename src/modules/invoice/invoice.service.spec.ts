import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { getSupabaseAdmin } from "../../config/supabase.config";
import * as rolesModule from "../../common/roles/roles";
import { InvoiceService } from "./invoice.service";

jest.mock("../../config/supabase.config", () => ({
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

describe("InvoiceService", () => {
  const notificationService = {
    isEmailConfigured: jest.fn(),
    sendInvoiceEmailV2: jest.fn(),
  };
  const pdfService = {
    getOrCreateInvoicePdf: jest.fn(),
  };
  const websocketGateway = {
    notifyInvoiceCreated: jest.fn(),
    notifyInvoiceStatusChanged: jest.fn(),
    notifyPaymentCreated: jest.fn(),
  };
  const chorusProService = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects duplicate credit note creation with a business error", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(service as any, "checkCreditNoteAccess").mockResolvedValue("merchant_admin");
    jest.mocked(getSupabaseAdmin).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: "Un avoir existe déjà pour cette facture" },
      }),
    } as any);

    await expect(
      service.createCreditNote("user-1", "company-1", "invoice-1", {
        reason: "Correction",
      }),
    ).rejects.toThrow(new BadRequestException("Un avoir existe déjà pour cette facture"));
  });

  it("adds linked credit note metadata to invoice lists", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "merchant_admin",
      companyOwnerRole: "merchant_admin",
      companyOwnerId: "owner-1",
      isCabinet: false,
      isMerchantCompany: true,
    });

    const listQuery = createChain(
      {
        data: [
          {
            id: "invoice-1",
            company_id: "company-1",
            client_id: "client-1",
            invoice_number: "FAC-001",
            type: "standard",
            status: "paid",
            total: 120,
            amount_paid: 120,
          },
        ],
        error: null,
        count: 1,
      },
      "range",
    );
    const linkedCreditNotesQuery = createChain(
      {
        data: [
          {
            id: "credit-note-1",
            invoice_number: "AV-001",
            parent_invoice_id: "invoice-1",
          },
        ],
        error: null,
      },
      "order",
    );

    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest
        .fn()
        .mockReturnValueOnce(listQuery)
        .mockReturnValueOnce(linkedCreditNotesQuery),
    } as any);

    const response = await service.findAll("user-1", "company-1", {});

    expect(response.invoices).toHaveLength(1);
    expect(response.invoices[0]).toMatchObject({
      id: "invoice-1",
      has_credit_note: true,
      linked_credit_note_id: "credit-note-1",
      linked_credit_note_number: "AV-001",
    });
  });

  it("adds linked credit note metadata to invoice details", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "merchant_admin",
      companyOwnerRole: "merchant_admin",
      companyOwnerId: "owner-1",
      isCabinet: false,
      isMerchantCompany: true,
    });

    const detailQuery = createChain(
      {
        data: {
          id: "invoice-1",
          company_id: "company-1",
          client_id: "client-1",
          invoice_number: "FAC-001",
          type: "standard",
          status: "paid",
          total: 120,
          amount_paid: 120,
          items: [],
          payments: [],
        },
        error: null,
      },
      "single",
    );
    const linkedCreditNotesQuery = createChain(
      {
        data: [
          {
            id: "credit-note-1",
            invoice_number: "AV-001",
            parent_invoice_id: "invoice-1",
          },
        ],
        error: null,
      },
      "order",
    );

    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest
        .fn()
        .mockReturnValueOnce(detailQuery)
        .mockReturnValueOnce(linkedCreditNotesQuery),
    } as any);

    const invoice = await service.findOne("user-1", "company-1", "invoice-1");

    expect(invoice).toMatchObject({
      id: "invoice-1",
      has_credit_note: true,
      linked_credit_note_id: "credit-note-1",
      linked_credit_note_number: "AV-001",
    });
  });

  it("keeps draft invoices visible for cabinet members", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "accountant_consultant",
      companyOwnerRole: "accountant",
      companyOwnerId: "owner-1",
      isCabinet: true,
      isMerchantCompany: false,
    });

    const listQuery = createChain(
      {
        data: [],
        error: null,
        count: 0,
      },
      "range",
    );

    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest.fn().mockReturnValue(listQuery),
    } as any);

    await service.findAll("user-1", "cabinet-1", {});

    expect(listQuery.neq).not.toHaveBeenCalledWith("status", "draft");
  });

  it("hides drafts from accountants in merchant companies", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "accountant",
      companyOwnerRole: "merchant_admin",
      companyOwnerId: "owner-1",
      isCabinet: false,
      isMerchantCompany: true,
    });

    const listQuery = createChain(
      {
        data: [],
        error: null,
        count: 0,
      },
      "range",
    );

    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest.fn().mockReturnValue(listQuery),
    } as any);

    await service.findAll("user-1", "company-1", {});

    expect(listQuery.neq).toHaveBeenCalledWith("status", "draft");
  });

  it("allows cabinet members to open a draft invoice", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "accountant_consultant",
      companyOwnerRole: "accountant",
      companyOwnerId: "owner-1",
      isCabinet: true,
      isMerchantCompany: false,
    });

    const detailQuery = createChain(
      {
        data: {
          id: "invoice-1",
          company_id: "cabinet-1",
          invoice_number: "FAC-001",
          type: "standard",
          status: "draft",
          total: 120,
          amount_paid: 0,
          items: [],
          payments: [],
        },
        error: null,
      },
      "single",
    );
    const linkedCreditNotesQuery = createChain({ data: [], error: null }, "order");

    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest
        .fn()
        .mockReturnValueOnce(detailQuery)
        .mockReturnValueOnce(linkedCreditNotesQuery),
    } as any);

    await expect(
      service.findOne("user-1", "cabinet-1", "invoice-1"),
    ).resolves.toMatchObject({ status: "draft" });
  });

  it("rejects draft access for accountants in merchant companies", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "accountant",
      companyOwnerRole: "merchant_admin",
      companyOwnerId: "owner-1",
      isCabinet: false,
      isMerchantCompany: true,
    });

    const detailQuery = createChain(
      {
        data: {
          id: "invoice-1",
          company_id: "company-1",
          invoice_number: "FAC-001",
          type: "standard",
          status: "draft",
          total: 120,
          amount_paid: 0,
          items: [],
          payments: [],
        },
        error: null,
      },
      "single",
    );

    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest.fn().mockReturnValue(detailQuery),
    } as any);

    await expect(
      service.findOne("user-1", "company-1", "invoice-1"),
    ).rejects.toThrow(new ForbiddenException("Accès refusé aux brouillons"));
  });

  it("rejects credit notes for accountant_consultant in a cabinet", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "accountant_consultant",
      companyOwnerRole: "accountant",
      companyOwnerId: "owner-1",
      isCabinet: true,
      isMerchantCompany: false,
    });

    await expect(
      service.createCreditNote("user-1", "cabinet-1", "invoice-1", {
        reason: "Correction",
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        "Vous n'avez pas les permissions nécessaires pour cette action",
      ),
    );
  });

  it("keeps draft invoices visible for superadmin in merchant companies", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "superadmin",
      companyOwnerRole: "merchant_admin",
      companyOwnerId: "owner-1",
      isCabinet: false,
      isMerchantCompany: true,
    });

    const listQuery = createChain(
      {
        data: [],
        error: null,
        count: 0,
      },
      "range",
    );

    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest.fn().mockReturnValue(listQuery),
    } as any);

    await service.findAll("user-1", "company-1", {});

    expect(listQuery.neq).not.toHaveBeenCalledWith("status", "draft");
  });

  it("rejects credit note creation for superadmin in merchant companies", async () => {
    const service = new InvoiceService(
      notificationService as any,
      pdfService as any,
      websocketGateway as any,
      chorusProService as any,
    );

    jest.spyOn(rolesModule, "getUserCompanyAccessContext").mockResolvedValue({
      role: "superadmin",
      companyOwnerRole: "merchant_admin",
      companyOwnerId: "owner-1",
      isCabinet: false,
      isMerchantCompany: true,
    });

    await expect(
      service.createCreditNote("user-1", "company-1", "invoice-1", {
        reason: "Correction",
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        "Vous n'avez pas les permissions nécessaires pour cette action",
      ),
    );
  });
});
