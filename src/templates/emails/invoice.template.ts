/**
 * Templates pour les FACTURES
 * - Envoi initial
 * - Confirmation de réception
 * - Rappels de paiement (plusieurs niveaux)
 */

import { baseStyles, generateFooter, wrapTemplate, EmailTemplateData, renderEmailHeaderLogo, appendGeneratedBySenedText } from './base.template';

export interface InvoiceEmailData extends EmailTemplateData {
    clientName: string;
    invoiceNumber: string;
    invoiceType?: 'standard' | 'deposit' | 'final' | 'credit';
    issueDate?: string;
    dueDate: string;
    amount: number | string;
    remainingAmount?: number | string;
    subject?: string;
    viewUrl?: string;
    paymentUrl?: string;
    daysOverdue?: number;
    reminderLevel?: 1 | 2 | 3;
}

const invoiceTypeLabels: Record<string, string> = {
    standard: 'Facture',
    deposit: "Facture d'acompte",
    final: 'Facture de solde',
    credit: 'Avoir',
};

const formatAmount = (amount: number | string): string => {
    if (typeof amount === 'string') return amount;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
};

const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};

/**
 * Email d'envoi initial d'une facture
 */
export function invoiceNewEmail(data: InvoiceEmailData): { subject: string; html: string; text: string } {
    const typeLabel = invoiceTypeLabels[data.invoiceType || 'standard'] || 'Facture';
    const isCredit = data.invoiceType === 'credit';
    const subject = `📄 ${typeLabel} ${data.invoiceNumber} - ${data.companyName}`;
    const amountStr = formatAmount(data.amount);
    const displayAmount = isCredit ? formatAmount(Math.abs(typeof data.amount === 'number' ? data.amount : parseFloat(data.amount as string))) : amountStr;
    const amountLabel = isCredit ? "Montant de l'avoir" : "Montant à régler";
    const issueDateStr = data.issueDate ? formatDate(data.issueDate) : '';
    const dueDateStr = formatDate(data.dueDate);
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">${typeLabel}</h1>
            <p class="header-subtitle">N° ${data.invoiceNumber}</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <p class="message">
                Veuillez trouver ci-joint votre ${typeLabel.toLowerCase()}${issueDateStr ? ` émise le ${issueDateStr}` : ''}.
                ${data.subject ? `<br><br><em>"${data.subject}"</em>` : ''}
            </p>
            
            <div class="info-card">
                <div class="info-row">
                    <span class="info-label">Numéro :</span>
                    <span class="info-value">${data.invoiceNumber}</span>
                </div>
                ${issueDateStr ? `
                <div class="info-row">
                    <span class="info-label">Date d'émission :</span>
                    <span class="info-value">${issueDateStr}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">Date d'échéance :</span>
                    <span class="info-value"><strong>${dueDateStr}</strong></span>
                </div>
            </div>
            
            <div class="amount-box" style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);">
                <div class="amount-label" style="color: #1e40af;">${amountLabel}</div>
                <div class="amount-value" style="color: #1d4ed8;">${displayAmount}</div>
            </div>

            ${!isCredit ? `
            <div class="alert alert-info">
                <span class="alert-icon">📅</span>
                <div>Merci de procéder au règlement avant le <strong>${dueDateStr}</strong>.</div>
            </div>
            ` : ''}

            ${data.paymentUrl && !isCredit ? `
            <div class="cta-container">
                <a href="${data.paymentUrl}" class="btn btn-primary">💳 Payer en ligne</a>
            </div>
            ` : ''}
            
            ${data.viewUrl ? `
            <p style="text-align: center; margin-top: 16px;">
                <a href="${data.viewUrl}" style="color: #2563eb; text-decoration: none;">Voir ${isCredit ? "l'avoir" : 'la facture'} en ligne →</a>
            </p>
            ` : ''}
            
            <div class="divider"></div>
            
            <p class="message">
                Vous trouverez également ${isCredit ? 'cet avoir' : 'cette facture'} en pièce jointe au format PDF.
            </p>
            
            <div class="signature">
                <p>Nous vous remercions pour votre confiance.</p>
                <p>Cordialement,</p>
                <p class="signature-name">${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

${typeLabel.toUpperCase()} N° ${data.invoiceNumber}

Bonjour ${data.clientName},

Veuillez trouver ci-joint votre ${typeLabel.toLowerCase()} émise le ${data.issueDate}.
${data.subject ? `\nObjet : ${data.subject}` : ''}

DÉTAILS :
- Numéro : ${data.invoiceNumber}
- Date d'émission : ${data.issueDate}
- Date d'échéance : ${data.dueDate}
- ${amountLabel} : ${displayAmount}
${!isCredit ? `\nMerci de procéder au règlement avant le ${data.dueDate}.` : ''}
${data.paymentUrl && !isCredit ? `Payer en ligne : ${data.paymentUrl}` : ''}
${data.viewUrl ? `Voir ${isCredit ? "l'avoir" : 'la facture'} : ${data.viewUrl}` : ''}

Nous vous remercions pour votre confiance.

Cordialement,
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}

/**
 * Email de rappel - Niveau 1 (7 jours après échéance)
 */
export function invoiceReminder1Email(data: InvoiceEmailData): { subject: string; html: string; text: string } {
    const subject = `🔔 Rappel : Facture ${data.invoiceNumber} en attente de paiement`;
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">Rappel de paiement</h1>
            <p class="header-subtitle">Facture N° ${data.invoiceNumber}</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <div class="alert alert-warning">
                <span class="alert-icon">⚠️</span>
                <div>
                    Sauf erreur de notre part, la facture <strong>${data.invoiceNumber}</strong> 
                    arrivée à échéance le <strong>${data.dueDate}</strong> reste impayée.
                </div>
            </div>
            
            <p class="message">
                Il s'agit peut-être d'un simple oubli de votre part. Nous vous serions 
                reconnaissants de bien vouloir procéder au règlement dans les meilleurs délais.
            </p>
            
            <div class="amount-box" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);">
                <div class="amount-label" style="color: #92400e;">Montant dû</div>
                <div class="amount-value" style="color: #b45309;">${data.remainingAmount || data.amount}</div>
            </div>
            
            <div class="info-card">
                <div class="info-row">
                    <span class="info-label">Numéro de facture :</span>
                    <span class="info-value">${data.invoiceNumber}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Date d'échéance :</span>
                    <span class="info-value" style="color: #d97706;">${data.dueDate}</span>
                </div>
                ${data.daysOverdue ? `
                <div class="info-row">
                    <span class="info-label">Retard :</span>
                    <span class="info-value" style="color: #d97706;">${data.daysOverdue} jour${data.daysOverdue > 1 ? 's' : ''}</span>
                </div>
                ` : ''}
            </div>
            
            ${data.paymentUrl ? `
            <div class="cta-container">
                <a href="${data.paymentUrl}" class="btn btn-warning">Régulariser maintenant</a>
            </div>
            ` : ''}
            
            <p class="message email-copy" style="font-size: 13px; color: #6b7280;">
                Si vous avez déjà procédé au règlement, nous vous prions de ne pas tenir compte de ce rappel 
                et vous remercions de votre diligence.
            </p>
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Cordialement,</p>
                <p class="signature-name">${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

🔔 RAPPEL DE PAIEMENT - Facture N° ${data.invoiceNumber}

Bonjour ${data.clientName},

Sauf erreur de notre part, la facture ${data.invoiceNumber} arrivée à échéance le ${data.dueDate} reste impayée.

Montant dû : ${data.remainingAmount || data.amount}
${data.daysOverdue ? `Retard : ${data.daysOverdue} jour(s)` : ''}

Nous vous serions reconnaissants de bien vouloir procéder au règlement dans les meilleurs délais.

${data.paymentUrl ? `Payer en ligne : ${data.paymentUrl}` : ''}

Si vous avez déjà procédé au règlement, nous vous prions de ne pas tenir compte de ce rappel.

Cordialement,
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}

/**
 * Email de rappel - Niveau 2 (14 jours après échéance)
 */
export function invoiceReminder2Email(data: InvoiceEmailData): { subject: string; html: string; text: string } {
    const subject = `⚠️ Second rappel : Facture ${data.invoiceNumber} impayée`;
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">Second rappel</h1>
            <p class="header-subtitle">Facture N° ${data.invoiceNumber}</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <div class="alert alert-danger">
                <span class="alert-icon">🚨</span>
                <div>
                    Malgré notre précédent rappel, la facture <strong>${data.invoiceNumber}</strong> 
                    reste impayée depuis le <strong>${data.dueDate}</strong>.
                </div>
            </div>
            
            <p class="message">
                Nous comprenons que des difficultés peuvent survenir. Si tel est le cas, 
                nous vous invitons à nous contacter afin de trouver ensemble une solution.
            </p>
            
            <div class="amount-box" style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);">
                <div class="amount-label" style="color: #991b1b;">Montant dû</div>
                <div class="amount-value" style="color: #dc2626;">${data.remainingAmount || data.amount}</div>
                ${data.daysOverdue ? `<div style="color: #991b1b; font-size: 14px; margin-top: 8px;">En retard de ${data.daysOverdue} jours</div>` : ''}
            </div>
            
            ${data.paymentUrl ? `
            <div class="cta-container">
                <a href="${data.paymentUrl}" class="btn btn-danger">Régulariser immédiatement</a>
            </div>
            ` : ''}
            
            <div class="alert alert-warning" style="margin-top: 24px;">
                <span class="alert-icon">📞</span>
                <div>
                    <strong>Besoin d'aide ?</strong><br>
                    Contactez-nous pour discuter d'un échéancier ou de toute autre solution adaptée à votre situation.
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Dans l'attente de votre règlement,</p>
                <p>Cordialement,</p>
                <p class="signature-name">${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

⚠️ SECOND RAPPEL - Facture N° ${data.invoiceNumber}

Bonjour ${data.clientName},

Malgré notre précédent rappel, la facture ${data.invoiceNumber} reste impayée depuis le ${data.dueDate}.

Montant dû : ${data.remainingAmount || data.amount}
${data.daysOverdue ? `Retard : ${data.daysOverdue} jours` : ''}

Nous comprenons que des difficultés peuvent survenir. Si tel est le cas, contactez-nous pour trouver une solution.

${data.paymentUrl ? `Payer en ligne : ${data.paymentUrl}` : ''}

Dans l'attente de votre règlement,
Cordialement,
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}

/**
 * Email de rappel - Niveau 3 (Mise en demeure)
 */
export function invoiceReminder3Email(data: InvoiceEmailData): { subject: string; html: string; text: string } {
    const subject = `🚨 URGENT : Dernier rappel avant procédure - Facture ${data.invoiceNumber}`;
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">Dernier rappel</h1>
            <p class="header-subtitle">Action requise sous 8 jours</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <div class="alert alert-danger">
                <span class="alert-icon">⛔</span>
                <div>
                    <strong>MISE EN DEMEURE</strong><br>
                    Malgré nos précédentes relances, la facture <strong>${data.invoiceNumber}</strong> 
                    d'un montant de <strong>${data.remainingAmount || data.amount}</strong> reste impayée.
                </div>
            </div>
            
            <p class="message">
                Par la présente, nous vous mettons en demeure de procéder au règlement de cette somme 
                dans un délai de <strong>8 jours</strong> à compter de la réception de ce courrier.
            </p>
            
            <div class="info-card" style="border: 2px solid #dc2626;">
                <div class="info-row">
                    <span class="info-label">Facture N° :</span>
                    <span class="info-value">${data.invoiceNumber}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Échéance initiale :</span>
                    <span class="info-value">${data.dueDate}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Montant dû :</span>
                    <span class="info-value" style="color: #dc2626; font-size: 18px;">${data.remainingAmount || data.amount}</span>
                </div>
                ${data.daysOverdue ? `
                <div class="info-row">
                    <span class="info-label">Retard de paiement :</span>
                    <span class="info-value" style="color: #dc2626;">${data.daysOverdue} jours</span>
                </div>
                ` : ''}
            </div>
            
            <p class="message email-copy" style="background: #fef2f2; padding: 16px; border-radius: 8px; border-left: 4px solid #dc2626;">
                <strong>À défaut de paiement dans ce délai</strong>, nous nous verrons dans l'obligation 
                d'engager les procédures de recouvrement appropriées, ce qui entraînera des frais 
                supplémentaires à votre charge.
            </p>
            
            ${data.paymentUrl ? `
            <div class="cta-container">
                <a href="${data.paymentUrl}" class="btn btn-danger">Régulariser maintenant</a>
            </div>
            ` : ''}
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Veuillez agréer nos salutations distinguées.</p>
                <p class="signature-name">${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

🚨 DERNIER RAPPEL - MISE EN DEMEURE
Facture N° ${data.invoiceNumber}

Bonjour ${data.clientName},

MISE EN DEMEURE

Malgré nos précédentes relances, la facture ${data.invoiceNumber} d'un montant de ${data.remainingAmount || data.amount} reste impayée.

Par la présente, nous vous mettons en demeure de procéder au règlement de cette somme dans un délai de 8 jours.

DÉTAILS :
- Facture N° : ${data.invoiceNumber}
- Échéance initiale : ${data.dueDate}
- Montant dû : ${data.remainingAmount || data.amount}
${data.daysOverdue ? `- Retard : ${data.daysOverdue} jours` : ''}

À défaut de paiement dans ce délai, nous serons dans l'obligation d'engager les procédures de recouvrement appropriées.

${data.paymentUrl ? `Payer en ligne : ${data.paymentUrl}` : ''}

Veuillez agréer nos salutations distinguées.
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}
