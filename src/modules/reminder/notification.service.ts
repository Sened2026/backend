import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { Twilio } from 'twilio';
import { EmailData, SmsData, SendResult } from './dto/reminder.dto';
import { templates } from '../../templates/emails';
import { appendGeneratedBySenedText } from '../../templates/emails/base.template';
import { ROLE_LABELS, CompanyRole } from '../../common/roles/roles';
import { buildQuotePublicUrls } from '../quote/quote-links.util';

@Injectable()
export class NotificationService {
    private resend: Resend | null = null;
    private twilio: Twilio | null = null;
    private twilioPhoneNumber: string | null = null;

    constructor(private configService: ConfigService) {
        // Initialiser Resend
        const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
        if (resendApiKey) {
            this.resend = new Resend(resendApiKey);
        }

        // Initialiser Twilio
        const twilioAccountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
        const twilioAuthToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
        this.twilioPhoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER') || null;

        if (twilioAccountSid && twilioAuthToken) {
            this.twilio = new Twilio(twilioAccountSid, twilioAuthToken);
        }
    }

    private getFrontendUrl(): string {
        return this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
    }

    private getBrandAssetBaseUrl(): string {
        return this.getFrontendUrl().replace(/\/+$/, '');
    }

    private getQuotePublicUrls(quote: any) {
        return buildQuotePublicUrls({
            frontendUrl: this.getFrontendUrl(),
            signatureToken: quote.signature_token,
            signatureProvider: quote.signature_provider,
            includeTermsUrl: Boolean(quote.terms_and_conditions),
        });
    }

    private getLegacyEmailCopyStyles(): string {
        return `
        .copy { text-align: justify; text-justify: inter-word; }
        .copy-muted { text-align: justify; text-justify: inter-word; color: #6b7280; font-size: 13px; }
        `;
    }

    private withEmailBranding<T extends Record<string, any>>(data: T): T & { brandAssetBaseUrl: string } {
        return {
            ...data,
            brandAssetBaseUrl: this.getBrandAssetBaseUrl(),
        };
    }

    private renderLegacyEmailFooter(company: any): string {
        const brandLogoUrl = `${this.getBrandAssetBaseUrl()}/brand/secondaire/SVG/SECONDAIRE_bleu.svg`;

        return `
        <div class="footer">
            <p>${company.name}${company.address ? ' - ' + company.address : ''}${company.city ? ', ' + company.postal_code + ' ' + company.city : ''}</p>
            ${company.email ? `<p>Email : ${company.email}</p>` : ''}
            ${company.phone ? `<p>Tél : ${company.phone}</p>` : ''}
            ${company.siren ? `<p>SIREN : ${company.siren}</p>` : ''}
            <div style="margin-top:16px; padding-top:16px; border-top:1px solid #e5e7eb;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto; border-collapse:collapse;">
                    <tr>
                        <td valign="middle" style="padding-right:10px;">
                            <img src="${brandLogoUrl}" alt="Sened" style="display:block; height:18px; width:auto; border:0; outline:none; text-decoration:none;">
                        </td>
                        <td valign="middle" style="font-size:11px; line-height:1.4; color:#94a3b8; white-space:nowrap;">
                            Ce message a été généré par Sened
                        </td>
                    </tr>
                </table>
            </div>
        </div>`;
    }

    /**
     * Vérifie si l'envoi d'emails est configuré
     */
    isEmailConfigured(): boolean {
        return this.resend !== null;
    }

    /**
     * Vérifie si l'envoi de SMS est configuré
     */
    isSmsConfigured(): boolean {
        return this.twilio !== null && this.twilioPhoneNumber !== null;
    }

    /**
     * Envoie un email via Resend
     */
    async sendEmail(data: EmailData): Promise<SendResult> {
        if (!this.resend) {
            return {
                success: false,
                error: 'Resend n\'est pas configuré. Ajoutez RESEND_API_KEY dans les variables d\'environnement.',
            };
        }

        try {
            const defaultFrom = this.configService.get<string>('RESEND_FROM_EMAIL') || 'noreply@votre-domaine.com';

            const response = await this.resend.emails.send({
                from: data.from || defaultFrom,
                to: data.to,
                subject: data.subject,
                html: data.html,
                text: data.text,
                replyTo: data.replyTo,
                attachments: data.attachments?.map((att) => ({
                    filename: att.filename,
                    content: typeof att.content === 'string' ? att.content : att.content.toString('base64'),
                })),
            });

            if (response.error) {
                return {
                    success: false,
                    error: response.error.message,
                };
            }

            return {
                success: true,
                message_id: response.data?.id,
            };
        } catch (error: any) {
            console.error('Error sending email:', error);
            return {
                success: false,
                error: error.message || 'Erreur lors de l\'envoi de l\'email',
            };
        }
    }

    /**
     * Envoie un SMS via Twilio
     */
    async sendSms(data: SmsData): Promise<SendResult> {
        if (!this.twilio || !this.twilioPhoneNumber) {
            return {
                success: false,
                error: 'Twilio n\'est pas configuré. Ajoutez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_PHONE_NUMBER.',
            };
        }

        try {
            // Formater le numéro de téléphone (ajouter +33 si nécessaire)
            let formattedPhone = data.to.replace(/\s/g, '');
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '+33' + formattedPhone.substring(1);
            } else if (!formattedPhone.startsWith('+')) {
                formattedPhone = '+' + formattedPhone;
            }

            const message = await this.twilio.messages.create({
                body: data.body,
                from: this.twilioPhoneNumber,
                to: formattedPhone,
            });

            return {
                success: true,
                message_id: message.sid,
            };
        } catch (error: any) {
            console.error('Error sending SMS:', error);
            return {
                success: false,
                error: error.message || 'Erreur lors de l\'envoi du SMS',
            };
        }
    }

    /**
     * Génère le contenu d'un email de rappel pour une facture
     */
    generateInvoiceReminderEmail(
        invoice: any,
        client: any,
        company: any,
        daysOffset: number,
        customMessage?: string,
    ): { subject: string; html: string; text: string } {
        const isOverdue = daysOffset > 0;
        const dueDate = new Date(invoice.due_date).toLocaleDateString('fr-FR');
        const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(invoice.total);
        const remaining = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
            invoice.total - (invoice.amount_paid || 0),
        );

        let subject: string;
        let intro: string;

        if (isOverdue) {
            if (daysOffset <= 7) {
                subject = `Rappel : Facture ${invoice.invoice_number} en retard de paiement`;
                intro = `Nous vous rappelons que la facture <strong>${invoice.invoice_number}</strong> est arrivée à échéance le ${dueDate}.`;
            } else if (daysOffset <= 14) {
                subject = `Second rappel : Facture ${invoice.invoice_number} impayée`;
                intro = `Malgré notre précédent rappel, la facture <strong>${invoice.invoice_number}</strong> reste impayée depuis le ${dueDate}.`;
            } else {
                subject = `Dernier rappel : Facture ${invoice.invoice_number} - Action requise`;
                intro = `Votre facture <strong>${invoice.invoice_number}</strong> est en retard de paiement depuis plus de ${daysOffset} jours.`;
            }
        } else {
            subject = `Rappel : Facture ${invoice.invoice_number} - Échéance le ${dueDate}`;
            intro = `Nous vous rappelons que la facture <strong>${invoice.invoice_number}</strong> arrive à échéance le ${dueDate}.`;
        }

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #fff; padding: 30px; border: 1px solid #e9ecef; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6c757d; }
        .amount { font-size: 24px; font-weight: bold; color: #007bff; margin: 20px 0; }
        .btn { display: inline-block; padding: 12px 24px; background: #007bff; color: #fff; text-decoration: none; border-radius: 4px; margin-top: 20px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
        ${this.getLegacyEmailCopyStyles()}
        ${isOverdue ? '.urgent { color: #dc3545; font-weight: bold; }' : ''}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>${company.name}</h2>
        </div>
        <div class="content">
            <p>Bonjour${client.contact_name ? ' ' + client.contact_name : ''},</p>
            
            <p class="copy">${customMessage || intro}</p>
            
            <div class="details">
                <p><strong>Numéro de facture :</strong> ${invoice.invoice_number}</p>
                <p><strong>Date d'échéance :</strong> ${dueDate}</p>
                <p><strong>Montant total :</strong> ${amount}</p>
                ${invoice.amount_paid > 0 ? `<p><strong>Reste à payer :</strong> ${remaining}</p>` : ''}
            </div>
            
            <div class="amount">
                Montant dû : ${invoice.amount_paid > 0 ? remaining : amount}
            </div>
            
            ${
                invoice.payment_link
                    ? `<p style="text-align: center;"><a href="${invoice.payment_link}" class="btn">Payer maintenant</a></p>`
                    : ''
            }
            
            <p class="copy-muted">Si vous avez déjà effectué le paiement, veuillez ignorer ce message.</p>
            
            <p>Cordialement,<br>${company.name}</p>
        </div>
        ${this.renderLegacyEmailFooter(company)}
    </div>
</body>
</html>`;

        const text = `
${company.name}

Bonjour${client.contact_name ? ' ' + client.contact_name : ''},

${customMessage || intro.replace(/<[^>]*>/g, '')}

Détails de la facture :
- Numéro : ${invoice.invoice_number}
- Date d'échéance : ${dueDate}
- Montant total : ${amount}
${invoice.amount_paid > 0 ? `- Reste à payer : ${remaining}` : ''}

Montant dû : ${invoice.amount_paid > 0 ? remaining : amount}

${invoice.payment_link ? `Lien de paiement : ${invoice.payment_link}` : ''}

Si vous avez déjà effectué le paiement, veuillez ignorer ce message.

Cordialement,
${company.name}
`;

        return { subject, html, text: appendGeneratedBySenedText(text) };
    }

    /**
     * Génère le contenu d'un SMS de rappel pour une facture
     */
    generateInvoiceReminderSms(invoice: any, company: any, daysOffset: number): string {
        const isOverdue = daysOffset > 0;
        const dueDate = new Date(invoice.due_date).toLocaleDateString('fr-FR');
        const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
            invoice.total - (invoice.amount_paid || 0),
        );

        if (isOverdue) {
            return `${company.name}: Facture ${invoice.invoice_number} impayée (${amount}). Échéance dépassée le ${dueDate}. ${invoice.payment_link || ''}`;
        } else {
            return `${company.name}: Rappel facture ${invoice.invoice_number} (${amount}) à régler avant le ${dueDate}. ${invoice.payment_link || ''}`;
        }
    }

    /**
     * Génère le contenu d'un email de rappel pour un devis
     */
    generateQuoteReminderEmail(
        quote: any,
        client: any,
        company: any,
        customMessage?: string,
    ): { subject: string; html: string; text: string } {
        const expiryDate = new Date(quote.validity_date).toLocaleDateString('fr-FR');
        const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(quote.total);
        const { signUrl } = this.getQuotePublicUrls(quote);

        const subject = `Rappel : Votre devis ${quote.quote_number} expire bientôt`;
        const intro =
            customMessage ||
            `Nous vous rappelons que le devis <strong>${quote.quote_number}</strong> que nous vous avons envoyé expire le ${expiryDate}.`;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #fff; padding: 30px; border: 1px solid #e9ecef; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6c757d; }
        .amount { font-size: 24px; font-weight: bold; color: #28a745; margin: 20px 0; }
        .btn { display: inline-block; padding: 12px 24px; background: #28a745; color: #fff; text-decoration: none; border-radius: 4px; margin-top: 20px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
        ${this.getLegacyEmailCopyStyles()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>${company.name}</h2>
        </div>
        <div class="content">
            <p>Bonjour${client.contact_name ? ' ' + client.contact_name : ''},</p>
            
            <p class="copy">${intro}</p>
            
            <div class="details">
                <p><strong>Numéro de devis :</strong> ${quote.quote_number}</p>
                <p><strong>Date de validité :</strong> ${expiryDate}</p>
                <p><strong>Montant :</strong> ${amount}</p>
            </div>
            
            <div class="amount">
                Total : ${amount}
            </div>
            
            ${signUrl ? `<p style="text-align: center;"><a href="${signUrl}" class="btn">Accepter le devis</a></p>` : ''}
            
            <p class="copy">N'hésitez pas à nous contacter si vous avez des questions.</p>
            
            <p>Cordialement,<br>${company.name}</p>
        </div>
        ${this.renderLegacyEmailFooter(company)}
    </div>
</body>
</html>`;

        const text = `
${company.name}

Bonjour${client.contact_name ? ' ' + client.contact_name : ''},

${intro.replace(/<[^>]*>/g, '')}

Détails du devis :
- Numéro : ${quote.quote_number}
- Validité : ${expiryDate}
- Montant : ${amount}

${signUrl ? `Pour consulter ce devis : ${signUrl}` : ''}

N'hésitez pas à nous contacter si vous avez des questions.

Cordialement,
${company.name}
`;

        return { subject, html, text: appendGeneratedBySenedText(text) };
    }

    /**
     * Génère le contenu d'un SMS de rappel pour un devis
     */
    generateQuoteReminderSms(quote: any, company: any): string {
        const expiryDate = new Date(quote.validity_date).toLocaleDateString('fr-FR');
        const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(quote.total);

        return `${company.name}: Votre devis ${quote.quote_number} (${amount}) expire le ${expiryDate}. Acceptez-le avant cette date.`;
    }

    // ========================================
    // EMAILS D'ENVOI INITIAL (pas de rappel)
    // ========================================

    /**
     * Génère et envoie l'email d'envoi initial d'une facture
     */
    async sendInvoiceEmail(
        invoice: any,
        client: any,
        company: any,
        pdfBuffer?: Buffer,
    ): Promise<SendResult> {
        const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(invoice.total);
        const dueDate = new Date(invoice.due_date).toLocaleDateString('fr-FR');
        const issueDate = new Date(invoice.issue_date).toLocaleDateString('fr-FR');
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';

        const subject = `Facture ${invoice.invoice_number} - ${company.name}`;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h2 { color: #fff; margin: 0; font-size: 24px; }
        .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; border-top: none; }
        .amount-box { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .amount { font-size: 28px; font-weight: bold; color: #1d4ed8; }
        .btn { display: inline-block; padding: 14px 28px; background: #2563eb; color: #fff !important; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600; }
        .btn:hover { background: #1d4ed8; }
        .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .details p { margin: 8px 0; }
        .label { color: #6b7280; }
        ${this.getLegacyEmailCopyStyles()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>${company.name}</h2>
        </div>
        <div class="content">
            <p>Bonjour${client.company_name ? ' <strong>' + client.company_name + '</strong>' : (client.first_name ? ' ' + client.first_name : '')},</p>
            
            <p class="copy">Veuillez trouver ci-joint votre facture <strong>${invoice.invoice_number}</strong> émise le ${issueDate}.</p>
            
            <div class="details">
                <p><span class="label">Numéro de facture :</span> <strong>${invoice.invoice_number}</strong></p>
                <p><span class="label">Date d'émission :</span> ${issueDate}</p>
                <p><span class="label">Date d'échéance :</span> <strong>${dueDate}</strong></p>
                ${invoice.subject ? `<p><span class="label">Objet :</span> ${invoice.subject}</p>` : ''}
            </div>
            
            <div class="amount-box">
                <div style="color: #6b7280; font-size: 14px;">Montant à régler</div>
                <div class="amount">${amount}</div>
            </div>
            
            ${invoice.signature_token ? `<p style="text-align: center;"><a href="${frontendUrl}/invoices/view/${invoice.signature_token}" class="btn">Voir la facture</a></p>` : ''}
            
            <p class="copy" style="margin-top: 30px;">Nous vous remercions pour votre confiance.</p>
            
            <p>Cordialement,<br><strong>${company.name}</strong></p>
        </div>
        ${this.renderLegacyEmailFooter(company)}
    </div>
</body>
</html>`;

        const text = `
${company.name}

Bonjour${client.company_name ? ' ' + client.company_name : (client.first_name ? ' ' + client.first_name : '')},

Veuillez trouver ci-joint votre facture ${invoice.invoice_number} émise le ${issueDate}.

Détails de la facture :
- Numéro : ${invoice.invoice_number}
- Date d'émission : ${issueDate}
- Date d'échéance : ${dueDate}
- Montant : ${amount}
${invoice.subject ? `- Objet : ${invoice.subject}` : ''}

Nous vous remercions pour votre confiance.

Cordialement,
${company.name}
`;

        const attachments = pdfBuffer ? [{
            filename: `facture-${invoice.invoice_number}.pdf`,
            content: pdfBuffer,
        }] : undefined;

        return this.sendEmail({
            to: client.email,
            subject,
            html,
            text: appendGeneratedBySenedText(text),
            replyTo: company.email,
            attachments,
        });
    }

    /**
     * Génère et envoie l'email d'envoi initial d'un devis
     */
    async sendQuoteEmail(
        quote: any,
        client: any,
        company: any,
        pdfBuffer?: Buffer,
    ): Promise<SendResult> {
        const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(quote.total);
        const validUntil = new Date(quote.validity_date).toLocaleDateString('fr-FR');
        const issueDate = new Date(quote.issue_date).toLocaleDateString('fr-FR');
        const { signUrl } = this.getQuotePublicUrls(quote);

        const subject = `Devis ${quote.quote_number} - ${company.name}`;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h2 { color: #fff; margin: 0; font-size: 24px; }
        .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; border-top: none; }
        .amount-box { background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%); padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .amount { font-size: 28px; font-weight: bold; color: #6d28d9; }
        .btn { display: inline-block; padding: 14px 28px; background: #7c3aed; color: #fff !important; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600; }
        .btn:hover { background: #6d28d9; }
        .btn-accept { background: #059669; }
        .btn-accept:hover { background: #047857; }
        .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .details p { margin: 8px 0; }
        .label { color: #6b7280; }
        .validity { background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 6px; text-align: center; margin: 20px 0; color: #92400e; }
        ${this.getLegacyEmailCopyStyles()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>${company.name}</h2>
        </div>
        <div class="content">
            <p>Bonjour${client.company_name ? ' <strong>' + client.company_name + '</strong>' : (client.first_name ? ' ' + client.first_name : '')},</p>
            
            <p class="copy">Suite à votre demande, veuillez trouver ci-joint notre devis <strong>${quote.quote_number}</strong>.</p>
            
            <div class="details">
                <p><span class="label">Numéro de devis :</span> <strong>${quote.quote_number}</strong></p>
                <p><span class="label">Date d'émission :</span> ${issueDate}</p>
                ${quote.subject ? `<p><span class="label">Objet :</span> ${quote.subject}</p>` : ''}
            </div>
            
            <div class="amount-box">
                <div style="color: #6b7280; font-size: 14px;">Montant total TTC</div>
                <div class="amount">${amount}</div>
            </div>

            <div class="validity">
                ⏰ Ce devis est valable jusqu'au <strong>${validUntil}</strong>
            </div>
            
            ${signUrl ? `
            <p style="text-align: center;">
                <a href="${signUrl}" class="btn btn-accept">✓ Accepter le devis</a>
            </p>
            <p style="text-align: center; color: #6b7280; font-size: 13px; margin-top: 10px;">
                Cliquez sur le bouton ci-dessus pour consulter et accepter ce devis en ligne.
            </p>
            ` : ''}
            
            <p class="copy" style="margin-top: 30px;">N'hésitez pas à nous contacter si vous avez des questions.</p>
            
            <p>Cordialement,<br><strong>${company.name}</strong></p>
        </div>
        ${this.renderLegacyEmailFooter(company)}
    </div>
</body>
</html>`;

        const text = `
${company.name}

Bonjour${client.company_name ? ' ' + client.company_name : (client.first_name ? ' ' + client.first_name : '')},

Suite à votre demande, veuillez trouver ci-joint notre devis ${quote.quote_number}.

Détails du devis :
- Numéro : ${quote.quote_number}
- Date d'émission : ${issueDate}
- Valide jusqu'au : ${validUntil}
- Montant : ${amount}
${quote.subject ? `- Objet : ${quote.subject}` : ''}

${signUrl ? `Pour consulter ce devis en ligne : ${signUrl}` : ''}

N'hésitez pas à nous contacter si vous avez des questions.

Cordialement,
${company.name}
`;

        const attachments = pdfBuffer ? [{
            filename: `devis-${quote.quote_number}.pdf`,
            content: pdfBuffer,
        }] : undefined;

        return this.sendEmail({
            to: client.email,
            subject,
            html,
            text: appendGeneratedBySenedText(text),
            replyTo: company.email,
            attachments,
        });
    }

    // ========================================
    // MÉTHODES UTILISANT LES NOUVEAUX TEMPLATES
    // ========================================

    /**
     * Envoie un email de confirmation de paiement
     */
    async sendPaymentConfirmationEmail(
        invoice: any,
        client: any,
        company: any,
        paymentMethod?: string,
        transactionId?: string,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        
        const { subject, html, text } = templates.payment.confirmed(this.withEmailBranding({
            clientName: client.company_name || client.first_name || 'Client',
            companyName: company.name,
            companyLogo: company.logo_url,
            companyAddress: company.address,
            companyPostalCode: company.postal_code,
            companyCity: company.city,
            companyEmail: company.email,
            companyPhone: company.phone,
            companySiren: company.siren,
            invoiceNumber: invoice.invoice_number,
            amount: invoice.total,
            paymentDate: new Date().toISOString(),
            paymentMethod,
            transactionId,
            viewUrl: invoice.signature_token ? `${frontendUrl}/invoices/view/${invoice.signature_token}` : undefined,
        }));

        return this.sendEmail({
            to: client.email,
            subject,
            html,
            text,
            replyTo: company.email,
        });
    }

    /**
     * Envoie un email de paiement partiel
     */
    async sendPartialPaymentEmail(
        invoice: any,
        client: any,
        company: any,
        amountPaid: number,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        
        const { subject, html, text } = templates.payment.partial(this.withEmailBranding({
            clientName: client.company_name || client.first_name || 'Client',
            companyName: company.name,
            companyLogo: company.logo_url,
            companyAddress: company.address,
            companyPostalCode: company.postal_code,
            companyCity: company.city,
            companyEmail: company.email,
            companyPhone: company.phone,
            companySiren: company.siren,
            invoiceNumber: invoice.invoice_number,
            amountPaid,
            remainingAmount: invoice.total - amountPaid,
            totalAmount: invoice.total,
            dueDate: invoice.due_date,
            paymentUrl: invoice.payment_link || (invoice.signature_token ? `${frontendUrl}/invoices/view/${invoice.signature_token}` : undefined),
        }));

        return this.sendEmail({
            to: client.email,
            subject,
            html,
            text,
            replyTo: company.email,
        });
    }

    /**
     * Envoie un email de bienvenue
     */
    async sendWelcomeEmail(
        user: any,
        company: any,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        
        const { subject, html, text } = templates.general.welcome(this.withEmailBranding({
            userName: user.first_name || user.email.split('@')[0],
            companyName: company?.name || 'Notre plateforme',
            companyLogo: company?.logo_url,
            companyEmail: company?.email,
            companyPhone: company?.phone,
            loginUrl: `${frontendUrl}/login`,
        }));

        return this.sendEmail({
            to: user.email,
            subject,
            html,
            text,
            replyTo: company?.email,
        });
    }

    /**
     * Envoie un email d'invitation
     */
    async sendInviteEmail(
        email: string,
        inviterName: string,
        company: any,
        role: string,
        invitationToken: string,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        const roleName = ROLE_LABELS[role as CompanyRole] || role;
        const inviteUrl = `${frontendUrl}/auth/register?invite=${invitationToken}`;
        const subject = `Invitation à rejoindre ${company.name}`;
        const { html, text } = templates.general.invite(this.withEmailBranding({
            inviterName,
            role,
            roleName,
            inviteUrl,
            companyName: company.name,
            companyLogo: company.logo_url,
            companyAddress: company.address,
            companyPostalCode: company.postal_code,
            companyCity: company.city,
            companyEmail: company.email,
            companyPhone: company.phone,
            companySiren: company.siren,
        }));

        return this.sendEmail({
            to: email,
            subject,
            html,
            text,
            replyTo: company.email,
        });
    }

    /**
     * Envoie un email de réinitialisation de mot de passe
     */
    async sendPasswordResetEmail(
        email: string,
        resetToken: string,
        companyName?: string,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        
        const { subject, html, text } = templates.general.passwordReset(this.withEmailBranding({
            resetUrl: `${frontendUrl}/reset-password?token=${resetToken}`,
            companyName: companyName || 'Notre plateforme',
            expirationMinutes: 60,
        }));

        return this.sendEmail({
            to: email,
            subject,
            html,
            text,
        });
    }

    /**
     * Envoie un email de notification générique
     */
    async sendNotificationEmail(
        email: string,
        title: string,
        message: string,
        company?: any,
        actionUrl?: string,
        actionLabel?: string,
    ): Promise<SendResult> {
        const { subject, html, text } = templates.general.notification(this.withEmailBranding({
            title,
            message,
            companyName: company?.name,
            companyLogo: company?.logo_url,
            companyEmail: company?.email,
            companyPhone: company?.phone,
            actionUrl,
            actionLabel,
        }));

        return this.sendEmail({
            to: email,
            subject,
            html,
            text,
            replyTo: company?.email,
        });
    }

    /**
     * Envoie un email de devis accepté (notification au vendeur)
     */
    async sendQuoteAcceptedNotification(
        quote: any,
        client: any,
        company: any,
        sellerEmail: string,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        
        const { subject, html, text } = templates.quote.accepted(this.withEmailBranding({
            clientName: client.company_name || `${client.first_name} ${client.last_name}`.trim() || 'Client',
            companyName: company.name,
            companyLogo: company.logo_url,
            companyEmail: company.email,
            companyPhone: company.phone,
            quoteNumber: quote.quote_number,
            amount: quote.total,
            acceptedDate: new Date().toISOString(),
            signatureUrl: quote.signature_url,
            viewUrl: `${frontendUrl}/quotes/${quote.id}`,
        }));

        return this.sendEmail({
            to: sellerEmail,
            subject,
            html,
            text,
        });
    }

    /**
     * Envoie un email de devis refusé (notification au vendeur)
     */
    async sendQuoteRefusedNotification(
        quote: any,
        client: any,
        company: any,
        sellerEmail: string,
        reason?: string,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        
        const { subject, html, text } = templates.quote.refused(this.withEmailBranding({
            clientName: client.company_name || `${client.first_name} ${client.last_name}`.trim() || 'Client',
            companyName: company.name,
            companyLogo: company.logo_url,
            companyEmail: company.email,
            companyPhone: company.phone,
            quoteNumber: quote.quote_number,
            amount: quote.total,
            refusedDate: new Date().toISOString(),
            reason,
            viewUrl: `${frontendUrl}/quotes/${quote.id}`,
        }));

        return this.sendEmail({
            to: sellerEmail,
            subject,
            html,
            text,
        });
    }

    /**
     * Envoie un email avec les nouveaux templates - Version améliorée pour facture
     */
    async sendInvoiceEmailV2(
        invoice: any,
        client: any,
        company: any,
        pdfBuffer?: Buffer,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        
        const invoiceType = invoice.type === 'credit_note' ? 'credit' : (invoice.type || 'standard');

        const { subject, html, text } = templates.invoice.new(this.withEmailBranding({
            clientName: client.company_name || client.first_name || 'Client',
            companyName: company.name,
            companyLogo: company.logo_url,
            companyAddress: company.address,
            companyPostalCode: company.postal_code,
            companyCity: company.city,
            companyEmail: company.email,
            companyPhone: company.phone,
            companySiren: company.siren,
            invoiceNumber: invoice.invoice_number,
            invoiceType,
            amount: invoice.total,
            issueDate: invoice.issue_date,
            dueDate: invoice.due_date,
            subject: invoice.subject,
            viewUrl: invoice.signature_token ? `${frontendUrl}/invoices/view/${invoice.signature_token}` : undefined,
            paymentUrl: invoiceType === 'credit' ? undefined : invoice.payment_link,
        }));

        const typePrefix = invoice.type === 'credit_note' ? 'avoir' : 'facture';
        const attachments = pdfBuffer ? [{
            filename: `${typePrefix}-${invoice.invoice_number}.pdf`,
            content: pdfBuffer,
        }] : undefined;

        return this.sendEmail({
            to: client.email,
            subject,
            html,
            text,
            replyTo: company.email,
            attachments,
        });
    }

    /**
     * Envoie un email avec les nouveaux templates - Version améliorée pour devis
     */
    async sendQuoteEmailV2(
        quote: any,
        client: any,
        company: any,
        pdfBuffer?: Buffer,
    ): Promise<SendResult> {
        const { signUrl, viewUrl, termsUrl } = this.getQuotePublicUrls(quote);
        
        const { subject, html, text } = templates.quote.new(this.withEmailBranding({
            clientName: client.company_name || client.first_name || 'Client',
            companyName: company.name,
            companyLogo: company.logo_url,
            companyAddress: company.address,
            companyPostalCode: company.postal_code,
            companyCity: company.city,
            companyEmail: company.email,
            companyPhone: company.phone,
            companySiren: company.siren,
            quoteNumber: quote.quote_number,
            amount: quote.total,
            issueDate: quote.issue_date,
            validUntil: quote.validity_date,
            subject: quote.subject,
            signUrl,
            viewUrl,
            termsUrl,
        }));

        const attachments = pdfBuffer ? [{
            filename: `devis-${quote.quote_number}.pdf`,
            content: pdfBuffer,
        }] : undefined;

        return this.sendEmail({
            to: client.email,
            subject,
            html,
            text,
            replyTo: company.email,
            attachments,
        });
    }

    /**
     * Envoie une relance de paiement avec niveau personnalisé
     */
    async sendInvoiceReminderV2(
        invoice: any,
        client: any,
        company: any,
        level: 1 | 2 | 3,
        pdfBuffer?: Buffer,
    ): Promise<SendResult> {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
        
        const templateFn = level === 1 
            ? templates.invoice.reminder1 
            : level === 2 
                ? templates.invoice.reminder2 
                : templates.invoice.reminder3;
        
        const { subject, html, text } = templateFn(this.withEmailBranding({
            clientName: client.company_name || client.first_name || 'Client',
            companyName: company.name,
            companyLogo: company.logo_url,
            companyAddress: company.address,
            companyPostalCode: company.postal_code,
            companyCity: company.city,
            companyEmail: company.email,
            companyPhone: company.phone,
            companySiren: company.siren,
            invoiceNumber: invoice.invoice_number,
            amount: invoice.total - (invoice.amount_paid || 0),
            dueDate: invoice.due_date,
            daysOverdue: Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)),
            paymentUrl: invoice.payment_link || (invoice.signature_token ? `${frontendUrl}/invoices/view/${invoice.signature_token}` : undefined),
            viewUrl: invoice.signature_token ? `${frontendUrl}/invoices/view/${invoice.signature_token}` : undefined,
        }));

        const attachments = pdfBuffer ? [{
            filename: `facture-${invoice.invoice_number}.pdf`,
            content: pdfBuffer,
        }] : undefined;

        return this.sendEmail({
            to: client.email,
            subject,
            html,
            text,
            replyTo: company.email,
            attachments,
        });
    }

    /**
     * Envoie une notification de devis expirant bientôt
     */
    async sendQuoteExpiringEmail(
        quote: any,
        client: any,
        company: any,
        daysRemaining: number,
    ): Promise<SendResult> {
        const { signUrl, viewUrl } = this.getQuotePublicUrls(quote);
        
        const { subject, html, text } = templates.quote.expiring(this.withEmailBranding({
            clientName: client.company_name || client.first_name || 'Client',
            companyName: company.name,
            companyLogo: company.logo_url,
            companyAddress: company.address,
            companyPostalCode: company.postal_code,
            companyCity: company.city,
            companyEmail: company.email,
            companyPhone: company.phone,
            companySiren: company.siren,
            quoteNumber: quote.quote_number,
            amount: quote.total,
            validUntil: quote.validity_date,
            daysRemaining,
            signUrl,
            viewUrl,
        }));

        return this.sendEmail({
            to: client.email,
            subject,
            html,
            text,
            replyTo: company.email,
        });
    }
}
