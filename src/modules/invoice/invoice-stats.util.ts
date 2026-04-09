type InvoiceLike = {
  id: string;
  status: string;
  type?: string | null;
  total?: number | string | null;
  amount_paid?: number | string | null;
  issue_date?: string | null;
  due_date?: string | null;
  client?: any;
};

type ReminderLike = {
  invoice_id?: string | null;
  status?: string | null;
  type?: string | null;
  level?: number | null;
  sent_at?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
};

export interface InvoiceBreakdown {
  base_amount: number;
  cancelled_deduction: number;
  credit_notes_correction: number;
  final_amount: number;
}

export interface ComputedInvoiceStats<TInvoice extends InvoiceLike = InvoiceLike> {
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  countDraft: number;
  countSent: number;
  countPaid: number;
  countOverdue: number;
  totalInvoicedBreakdown: InvoiceBreakdown;
  totalPaidBreakdown: InvoiceBreakdown;
  pendingInvoices: TInvoice[];
  overdueInvoices: TInvoice[];
}

const CREDIT_NOTE_TYPE = "credit_note";

function toAmount(value: number | string | null | undefined): number {
  return Number(value || 0);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function isCreditNote(invoice: InvoiceLike): boolean {
  return invoice.type === CREDIT_NOTE_TYPE;
}

function isDraft(invoice: InvoiceLike): boolean {
  return invoice.status === "draft";
}

function isCancelled(invoice: InvoiceLike): boolean {
  return invoice.status === "cancelled";
}

function isActiveStandardInvoice(invoice: InvoiceLike): boolean {
  return !isCreditNote(invoice) && !isDraft(invoice) && !isCancelled(invoice);
}

function getRemainingAmount(invoice: InvoiceLike): number {
  return toAmount(invoice.total) - toAmount(invoice.amount_paid);
}

function isStrongReminder(reminder: ReminderLike): boolean {
  if (reminder.status !== "sent") {
    return false;
  }

  if (reminder.level === 2 || reminder.level === 3) {
    return true;
  }

  // Legacy automatic reminders do not store a level.
  return reminder.level == null && reminder.type === "after_due";
}

export function computeInvoiceStats<TInvoice extends InvoiceLike>(
  periodInvoices: TInvoice[],
  receivableInvoices: TInvoice[],
  reminders: ReminderLike[],
): ComputedInvoiceStats<TInvoice> {
  const reminderByInvoiceId = new Map<string, ReminderLike[]>();
  reminders.forEach((reminder) => {
    if (!reminder.invoice_id) {
      return;
    }

    const existing = reminderByInvoiceId.get(reminder.invoice_id) || [];
    existing.push(reminder);
    reminderByInvoiceId.set(reminder.invoice_id, existing);
  });

  const nonDraftStandardPeriodInvoices = periodInvoices.filter(
    (invoice) => !isCreditNote(invoice) && !isDraft(invoice),
  );
  const cancelledStandardPeriodInvoices = nonDraftStandardPeriodInvoices.filter(
    isCancelled,
  );
  const activeStandardPeriodInvoices = nonDraftStandardPeriodInvoices.filter(
    (invoice) => !isCancelled(invoice),
  );
  const activeCreditNotes = periodInvoices.filter(
    (invoice) => isCreditNote(invoice) && !isDraft(invoice) && !isCancelled(invoice),
  );

  const totalInvoicedBase = nonDraftStandardPeriodInvoices.reduce(
    (sum, invoice) => sum + toAmount(invoice.total),
    0,
  );
  const cancelledInvoicedDeduction = cancelledStandardPeriodInvoices.reduce(
    (sum, invoice) => sum + toAmount(invoice.total),
    0,
  );
  const creditNotesCorrection = activeCreditNotes.reduce(
    (sum, invoice) => sum + Math.abs(toAmount(invoice.total)),
    0,
  );
  const totalInvoiced = roundCurrency(
    totalInvoicedBase - cancelledInvoicedDeduction - creditNotesCorrection,
  );

  const totalPaidBase = nonDraftStandardPeriodInvoices.reduce(
    (sum, invoice) => sum + toAmount(invoice.amount_paid),
    0,
  );
  const cancelledPaidDeduction = cancelledStandardPeriodInvoices.reduce(
    (sum, invoice) => sum + toAmount(invoice.amount_paid),
    0,
  );
  const totalPaid = roundCurrency(
    totalPaidBase - cancelledPaidDeduction - creditNotesCorrection,
  );

  const receivableCandidates = receivableInvoices.filter(
    (invoice) => isActiveStandardInvoice(invoice) && getRemainingAmount(invoice) > 0,
  );

  const overdueInvoices: TInvoice[] = [];
  const pendingInvoices: TInvoice[] = [];

  receivableCandidates.forEach((invoice) => {
    const invoiceReminders = reminderByInvoiceId.get(invoice.id) || [];
    const hasStrongReminder = invoiceReminders.some(isStrongReminder);

    if (hasStrongReminder) {
      overdueInvoices.push(invoice);
    } else {
      pendingInvoices.push(invoice);
    }
  });

  const totalPending = roundCurrency(
    pendingInvoices.reduce((sum, invoice) => sum + getRemainingAmount(invoice), 0),
  );
  const totalOverdue = roundCurrency(
    overdueInvoices.reduce((sum, invoice) => sum + getRemainingAmount(invoice), 0),
  );

  const countDraft = periodInvoices.filter(
    (invoice) => !isCreditNote(invoice) && isDraft(invoice),
  ).length;
  const countPaid = activeStandardPeriodInvoices.filter(
    (invoice) => getRemainingAmount(invoice) <= 0,
  ).length;

  return {
    totalInvoiced,
    totalPaid,
    totalPending,
    totalOverdue,
    countDraft,
    countSent: pendingInvoices.length,
    countPaid,
    countOverdue: overdueInvoices.length,
    totalInvoicedBreakdown: {
      base_amount: roundCurrency(totalInvoicedBase),
      cancelled_deduction: roundCurrency(cancelledInvoicedDeduction),
      credit_notes_correction: roundCurrency(creditNotesCorrection),
      final_amount: totalInvoiced,
    },
    totalPaidBreakdown: {
      base_amount: roundCurrency(totalPaidBase),
      cancelled_deduction: roundCurrency(cancelledPaidDeduction),
      credit_notes_correction: roundCurrency(creditNotesCorrection),
      final_amount: totalPaid,
    },
    pendingInvoices,
    overdueInvoices,
  };
}
