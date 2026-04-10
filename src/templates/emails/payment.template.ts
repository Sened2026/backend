/**
 * Templates pour les PAIEMENTS
 * - Confirmation de paiement
 * - Paiement partiel reçu
 * - Paiement en attente
 * - Remboursement
 */

import { baseStyles, generateFooter, wrapTemplate, EmailTemplateData, renderEmailHeaderLogo, appendGeneratedBySenedText } from './base.template';

export interface PaymentEmailData extends EmailTemplateData {
    clientName: string;
    invoiceNumber: string;
    amount?: number | string;
    paymentAmount?: number | string;
    paymentDate?: string;
    paymentMethod?: string;
    totalAmount?: number | string;
    remainingAmount?: number | string;
    amountPaid?: number | string;
    transactionId?: string;
    paymentUrl?: string;
    viewUrl?: string;
    dueDate?: string;
}

const formatAmount = (amount: number | string | undefined): string => {
    if (!amount) return '0,00 €';
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
 * Email de confirmation - Paiement complet reçu
 */
export function paymentConfirmedEmail(data: PaymentEmailData): { subject: string; html: string; text: string } {
    const subject = `✅ Paiement reçu - Facture ${data.invoiceNumber}`;
    const amountStr = formatAmount(data.paymentAmount || data.amount);
    const paymentDateStr = data.paymentDate ? formatDate(data.paymentDate) : new Date().toLocaleDateString('fr-FR');
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">Paiement Confirmé</h1>
            <p class="header-subtitle">Merci !</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <div class="alert alert-success">
                <span class="alert-icon">✓</span>
                <div>
                    Nous avons bien reçu votre paiement pour la facture <strong>${data.invoiceNumber}</strong>.
                </div>
            </div>
            
            <div class="amount-box" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);">
                <div class="amount-label" style="color: #047857;">Montant reçu</div>
                <div class="amount-value" style="color: #059669;">${amountStr}</div>
            </div>
            
            <div class="info-card">
                <div class="info-row">
                    <span class="info-label">Facture N° :</span>
                    <span class="info-value">${data.invoiceNumber}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Date du paiement :</span>
                    <span class="info-value">${paymentDateStr}</span>
                </div>
                ${data.paymentMethod ? `
                <div class="info-row">
                    <span class="info-label">Moyen de paiement :</span>
                    <span class="info-value">${data.paymentMethod}</span>
                </div>
                ` : ''}
                ${data.transactionId ? `
                <div class="info-row">
                    <span class="info-label">Référence transaction :</span>
                    <span class="info-value" style="font-family: monospace;">${data.transactionId}</span>
                </div>
                ` : ''}
                <div class="info-row" style="background: #d1fae5; margin: 8px -24px -24px; padding: 16px 24px; border-radius: 0 0 12px 12px;">
                    <span class="info-label" style="color: #047857; font-weight: 600;">Statut :</span>
                    <span class="badge badge-success">PAYÉE</span>
                </div>
            </div>
            
            <p class="message">
                Votre facture est maintenant soldée. Vous pouvez conserver cet email comme confirmation de paiement.
            </p>
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Merci pour votre confiance !</p>
                <p class="signature-name">${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

✅ PAIEMENT CONFIRMÉ - Facture N° ${data.invoiceNumber}

Bonjour ${data.clientName},

Nous avons bien reçu votre paiement pour la facture ${data.invoiceNumber}.

DÉTAILS DU PAIEMENT :
- Montant reçu : ${data.paymentAmount}
- Date : ${data.paymentDate}
${data.paymentMethod ? `- Moyen de paiement : ${data.paymentMethod}` : ''}
${data.transactionId ? `- Référence : ${data.transactionId}` : ''}

Statut : PAYÉE

Votre facture est maintenant soldée.

Merci pour votre confiance !
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}

/**
 * Email de confirmation - Paiement partiel reçu
 */
export function paymentPartialEmail(data: PaymentEmailData): { subject: string; html: string; text: string } {
    const subject = `💰 Paiement partiel reçu - Facture ${data.invoiceNumber}`;
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">Paiement Reçu</h1>
            <p class="header-subtitle">Acompte enregistré</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <div class="alert alert-info">
                <span class="alert-icon">💰</span>
                <div>
                    Nous avons bien reçu un paiement partiel pour la facture <strong>${data.invoiceNumber}</strong>.
                </div>
            </div>
            
            <div class="amount-box" style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);">
                <div class="amount-label" style="color: #1e40af;">Montant reçu</div>
                <div class="amount-value" style="color: #2563eb;">${data.paymentAmount}</div>
            </div>
            
            <div class="info-card">
                <div class="info-row">
                    <span class="info-label">Facture N° :</span>
                    <span class="info-value">${data.invoiceNumber}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Montant total facture :</span>
                    <span class="info-value">${data.totalAmount}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Paiement reçu :</span>
                    <span class="info-value" style="color: #059669;">+ ${data.paymentAmount}</span>
                </div>
                <div class="info-row" style="background: #fef3c7; margin: 8px -24px -24px; padding: 16px 24px; border-radius: 0 0 12px 12px;">
                    <span class="info-label" style="color: #92400e; font-weight: 600;">Reste à payer :</span>
                    <span class="info-value" style="color: #b45309; font-size: 18px;">${data.remainingAmount}</span>
                </div>
            </div>
            
            ${data.paymentUrl ? `
            <div class="cta-container">
                <a href="${data.paymentUrl}" class="btn btn-primary">Régler le solde</a>
            </div>
            ` : ''}
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Merci pour votre paiement.</p>
                <p>Cordialement,</p>
                <p class="signature-name">${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

💰 PAIEMENT PARTIEL REÇU - Facture N° ${data.invoiceNumber}

Bonjour ${data.clientName},

Nous avons bien reçu un paiement partiel pour la facture ${data.invoiceNumber}.

DÉTAILS :
- Montant total facture : ${data.totalAmount}
- Paiement reçu : ${data.paymentAmount}
- Reste à payer : ${data.remainingAmount}

${data.paymentUrl ? `Régler le solde : ${data.paymentUrl}` : ''}

Merci pour votre paiement.
Cordialement,
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}

/**
 * Email - Paiement en attente (en cours de traitement)
 */
export function paymentPendingEmail(data: PaymentEmailData): { subject: string; html: string; text: string } {
    const subject = `⏳ Paiement en cours de traitement - Facture ${data.invoiceNumber}`;
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">Paiement en cours</h1>
            <p class="header-subtitle">Traitement en attente</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <div class="alert alert-warning">
                <span class="alert-icon">⏳</span>
                <div>
                    Votre paiement pour la facture <strong>${data.invoiceNumber}</strong> est en cours de traitement.
                </div>
            </div>
            
            <p class="message">
                Nous avons bien reçu votre ordre de paiement. Le traitement peut prendre 
                de quelques minutes à quelques jours ouvrés selon le moyen de paiement utilisé.
            </p>
            
            <div class="info-card">
                <div class="info-row">
                    <span class="info-label">Facture N° :</span>
                    <span class="info-value">${data.invoiceNumber}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Montant :</span>
                    <span class="info-value">${data.paymentAmount}</span>
                </div>
                ${data.paymentMethod ? `
                <div class="info-row">
                    <span class="info-label">Moyen de paiement :</span>
                    <span class="info-value">${data.paymentMethod}</span>
                </div>
                ` : ''}
                <div class="info-row" style="background: #fef3c7; margin: 8px -24px -24px; padding: 16px 24px; border-radius: 0 0 12px 12px;">
                    <span class="info-label" style="color: #92400e; font-weight: 600;">Statut :</span>
                    <span class="badge badge-warning">EN ATTENTE</span>
                </div>
            </div>
            
            <p class="message">
                Vous recevrez une confirmation dès que le paiement aura été validé.
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

⏳ PAIEMENT EN COURS - Facture N° ${data.invoiceNumber}

Bonjour ${data.clientName},

Votre paiement pour la facture ${data.invoiceNumber} est en cours de traitement.

DÉTAILS :
- Facture N° : ${data.invoiceNumber}
- Montant : ${data.paymentAmount}
${data.paymentMethod ? `- Moyen de paiement : ${data.paymentMethod}` : ''}
- Statut : EN ATTENTE

Vous recevrez une confirmation dès que le paiement aura été validé.

Cordialement,
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}

/**
 * Email - Remboursement effectué
 */
export function paymentRefundedEmail(data: PaymentEmailData): { subject: string; html: string; text: string } {
    const subject = `↩️ Remboursement effectué - ${data.paymentAmount}`;
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">Remboursement</h1>
            <p class="header-subtitle">Traitement effectué</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <div class="alert alert-info">
                <span class="alert-icon">↩️</span>
                <div>
                    Un remboursement a été effectué sur votre compte concernant la facture <strong>${data.invoiceNumber}</strong>.
                </div>
            </div>
            
            <div class="amount-box" style="background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);">
                <div class="amount-label" style="color: #4338ca;">Montant remboursé</div>
                <div class="amount-value" style="color: #4f46e5;">${data.paymentAmount}</div>
            </div>
            
            <div class="info-card">
                <div class="info-row">
                    <span class="info-label">Facture N° :</span>
                    <span class="info-value">${data.invoiceNumber}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Date du remboursement :</span>
                    <span class="info-value">${data.paymentDate}</span>
                </div>
                ${data.transactionId ? `
                <div class="info-row">
                    <span class="info-label">Référence :</span>
                    <span class="info-value" style="font-family: monospace;">${data.transactionId}</span>
                </div>
                ` : ''}
            </div>
            
            <p class="message">
                Le montant sera crédité sur votre compte dans un délai de 5 à 10 jours ouvrés 
                selon votre établissement bancaire.
            </p>
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Pour toute question, n'hésitez pas à nous contacter.</p>
                <p>Cordialement,</p>
                <p class="signature-name">${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

↩️ REMBOURSEMENT EFFECTUÉ

Bonjour ${data.clientName},

Un remboursement a été effectué concernant la facture ${data.invoiceNumber}.

DÉTAILS :
- Montant remboursé : ${data.paymentAmount}
- Date : ${data.paymentDate}
${data.transactionId ? `- Référence : ${data.transactionId}` : ''}

Le montant sera crédité sur votre compte dans un délai de 5 à 10 jours ouvrés.

Pour toute question, n'hésitez pas à nous contacter.

Cordialement,
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}

/**
 * Email - Échec de paiement
 */
export function paymentFailedEmail(data: PaymentEmailData): { subject: string; html: string; text: string } {
    const subject = `❌ Échec du paiement - Facture ${data.invoiceNumber}`;
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
            ${renderEmailHeaderLogo(data)}
            <h1 class="header-title">Paiement échoué</h1>
            <p class="header-subtitle">Action requise</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.clientName}</strong>,</p>
            
            <div class="alert alert-danger">
                <span class="alert-icon">❌</span>
                <div>
                    Votre paiement pour la facture <strong>${data.invoiceNumber}</strong> n'a pas pu être traité.
                </div>
            </div>
            
            <p class="message">
                Le paiement de <strong>${data.paymentAmount}</strong> a été refusé. 
                Cela peut être dû à :
            </p>
            
            <ul style="color: #4b5563; margin: 16px 0; padding-left: 24px;">
                <li>Fonds insuffisants sur le compte</li>
                <li>Carte expirée ou informations incorrectes</li>
                <li>Limite de paiement atteinte</li>
                <li>Refus de la banque émettrice</li>
            </ul>
            
            <div class="info-card" style="border: 2px solid #fecaca;">
                <div class="info-row">
                    <span class="info-label">Facture N° :</span>
                    <span class="info-value">${data.invoiceNumber}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Montant :</span>
                    <span class="info-value">${data.paymentAmount}</span>
                </div>
            </div>
            
            ${data.paymentUrl ? `
            <div class="cta-container">
                <a href="${data.paymentUrl}" class="btn btn-danger">Réessayer le paiement</a>
            </div>
            ` : ''}
            
            <p class="message email-copy" style="font-size: 13px; color: #6b7280;">
                Si le problème persiste, veuillez contacter votre banque ou essayer un autre moyen de paiement.
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

❌ ÉCHEC DU PAIEMENT - Facture N° ${data.invoiceNumber}

Bonjour ${data.clientName},

Votre paiement pour la facture ${data.invoiceNumber} n'a pas pu être traité.

Le paiement de ${data.paymentAmount} a été refusé.

Cela peut être dû à :
- Fonds insuffisants
- Carte expirée
- Limite de paiement atteinte
- Refus de la banque

${data.paymentUrl ? `Réessayer : ${data.paymentUrl}` : ''}

Si le problème persiste, contactez votre banque.

Cordialement,
${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text: appendGeneratedBySenedText(text) };
}
