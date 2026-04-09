/**
 * Point d'entrée pour tous les templates d'emails
 * 
 * Ce module exporte tous les templates disponibles pour une utilisation facile
 * 
 * USAGE:
 * ```typescript
 * import { templates } from './templates/emails';
 * 
 * // Devis
 * const { subject, html, text } = templates.quote.new(data);
 * const { subject, html, text } = templates.quote.expiring(data);
 * const { subject, html, text } = templates.quote.accepted(data);
 * const { subject, html, text } = templates.quote.refused(data);
 * 
 * // Factures
 * const { subject, html, text } = templates.invoice.new(data);
 * const { subject, html, text } = templates.invoice.reminder1(data);
 * const { subject, html, text } = templates.invoice.reminder2(data);
 * const { subject, html, text } = templates.invoice.reminder3(data);
 * 
 * // Paiements
 * const { subject, html, text } = templates.payment.confirmed(data);
 * const { subject, html, text } = templates.payment.partial(data);
 * const { subject, html, text } = templates.payment.pending(data);
 * const { subject, html, text } = templates.payment.refunded(data);
 * const { subject, html, text } = templates.payment.failed(data);
 * 
 * // Général
 * const { subject, html, text } = templates.general.welcome(data);
 * const { subject, html, text } = templates.general.invite(data);
 * const { subject, html, text } = templates.general.notification(data);
 * const { subject, html, text } = templates.general.passwordReset(data);
 * ```
 */

// Base template utilities
export { baseStyles, generateFooter, wrapTemplate } from './base.template';
export type { EmailTemplateData } from './base.template';

// Quote templates
export {
    quoteNewEmail,
    quoteExpiringEmail,
    quoteAcceptedEmail,
    quoteRefusedEmail,
} from './quote.template';
export type { QuoteEmailData } from './quote.template';

// Invoice templates
export {
    invoiceNewEmail,
    invoiceReminder1Email,
    invoiceReminder2Email,
    invoiceReminder3Email,
} from './invoice.template';
export type { InvoiceEmailData } from './invoice.template';

// Payment templates
export {
    paymentConfirmedEmail,
    paymentPartialEmail,
    paymentPendingEmail,
    paymentRefundedEmail,
    paymentFailedEmail,
} from './payment.template';
export type { PaymentEmailData } from './payment.template';

// General templates
export {
    welcomeEmail,
    inviteEmail,
    notificationEmail,
    passwordResetEmail,
} from './general.template';
export type { WelcomeEmailData, InviteEmailData, NotificationEmailData } from './general.template';

// Organized exports for easier access
import * as quoteTemplates from './quote.template';
import * as invoiceTemplates from './invoice.template';
import * as paymentTemplates from './payment.template';
import * as generalTemplates from './general.template';

export const templates = {
    quote: {
        new: quoteTemplates.quoteNewEmail,
        expiring: quoteTemplates.quoteExpiringEmail,
        accepted: quoteTemplates.quoteAcceptedEmail,
        refused: quoteTemplates.quoteRefusedEmail,
    },
    invoice: {
        new: invoiceTemplates.invoiceNewEmail,
        reminder1: invoiceTemplates.invoiceReminder1Email,
        reminder2: invoiceTemplates.invoiceReminder2Email,
        reminder3: invoiceTemplates.invoiceReminder3Email,
    },
    payment: {
        confirmed: paymentTemplates.paymentConfirmedEmail,
        partial: paymentTemplates.paymentPartialEmail,
        pending: paymentTemplates.paymentPendingEmail,
        refunded: paymentTemplates.paymentRefundedEmail,
        failed: paymentTemplates.paymentFailedEmail,
    },
    general: {
        welcome: generalTemplates.welcomeEmail,
        invite: generalTemplates.inviteEmail,
        notification: generalTemplates.notificationEmail,
        passwordReset: generalTemplates.passwordResetEmail,
    },
};

export default templates;
