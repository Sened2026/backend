/**
 * Templates pour les NOTIFICATIONS GÉNÉRALES
 * - Bienvenue / Création de compte
 * - Invitation à rejoindre une entreprise
 * - Notifications diverses
 */

import {
    baseStyles,
    generateFooter,
    wrapTemplate,
    EmailTemplateData,
    renderGeneralEmailHeaderLogo,
    renderInviteEmailHeaderBranding,
} from './base.template';

export interface WelcomeEmailData extends EmailTemplateData {
    userName: string;
    userEmail?: string;
    loginUrl: string;
}

export interface InviteEmailData extends EmailTemplateData {
    inviterName: string;
    inviteeEmail?: string;
    role?: string;
    roleName?: string;
    inviteUrl: string;
    expiresAt?: string;
}

export interface NotificationEmailData extends EmailTemplateData {
    recipientName?: string;
    title: string;
    message: string;
    actionText?: string;
    actionLabel?: string;
    actionUrl?: string;
    type?: 'info' | 'success' | 'warning' | 'danger';
}

export interface PasswordResetEmailData extends EmailTemplateData {
    userName?: string;
    resetUrl: string;
    expiresIn?: string;
    expirationMinutes?: number;
}

/**
 * Email de bienvenue - Nouveau compte créé
 */
export function welcomeEmail(data: WelcomeEmailData): { subject: string; html: string; text: string } {
    const subject = `🎉 Bienvenue sur ${data.companyName} !`;
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);">
            ${renderGeneralEmailHeaderLogo(data)}
            <h1 class="header-title">Bienvenue !</h1>
            <p class="header-subtitle">Votre compte a été créé avec succès</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour <strong>${data.userName}</strong>,</p>
            
            <div class="alert alert-success">
                <span class="alert-icon">🎉</span>
                <div>
                    Votre compte a été créé avec succès sur <strong>${data.companyName}</strong>.
                </div>
            </div>
            
            <p class="message">
                Vous pouvez maintenant accéder à toutes les fonctionnalités de notre plateforme :
            </p>
            
            <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin: 24px 0;">
                <div style="display: flex; align-items: center; margin-bottom: 16px;">
                    <span style="font-size: 24px; margin-right: 12px;">📋</span>
                    <div>
                        <strong>Devis</strong>
                        <p style="color: #6b7280; font-size: 13px; margin: 0;">Créez et envoyez des devis professionnels</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 16px;">
                    <span style="font-size: 24px; margin-right: 12px;">📄</span>
                    <div>
                        <strong>Factures</strong>
                        <p style="color: #6b7280; font-size: 13px; margin: 0;">Gérez vos factures et suivez les paiements</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 16px;">
                    <span style="font-size: 24px; margin-right: 12px;">👥</span>
                    <div>
                        <strong>Clients</strong>
                        <p style="color: #6b7280; font-size: 13px; margin: 0;">Centralisez vos contacts clients</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center;">
                    <span style="font-size: 24px; margin-right: 12px;">📊</span>
                    <div>
                        <strong>Tableau de bord</strong>
                        <p style="color: #6b7280; font-size: 13px; margin: 0;">Suivez votre activité en temps réel</p>
                    </div>
                </div>
            </div>
            
            <div class="cta-container">
                <a href="${data.loginUrl}" class="btn btn-primary">Accéder à mon compte</a>
            </div>
            
            ${data.userEmail ? `
            <div class="info-card">
                <div class="info-row">
                    <span class="info-label">Email de connexion :</span>
                    <span class="info-value">${data.userEmail}</span>
                </div>
            </div>
            ` : ''}
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>À très bientôt sur notre plateforme !</p>
                <p class="signature-name">L'équipe ${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

🎉 BIENVENUE !

Bonjour ${data.userName},

Votre compte a été créé avec succès sur ${data.companyName}.

Vous pouvez maintenant accéder à toutes les fonctionnalités :
- Devis : Créez et envoyez des devis professionnels
- Factures : Gérez vos factures et suivez les paiements
- Clients : Centralisez vos contacts clients
- Tableau de bord : Suivez votre activité en temps réel

Accéder à mon compte : ${data.loginUrl}

Email de connexion : ${data.userEmail}

À très bientôt !
L'équipe ${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text };
}

/**
 * Email d'invitation à rejoindre une entreprise
 */
export function inviteEmail(data: InviteEmailData): { subject: string; html: string; text: string } {
    const subject = `📨 ${data.inviterName} vous invite à rejoindre ${data.companyName}`;
    const roleName = data.roleName || data.role || 'membre';
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);">
            ${renderInviteEmailHeaderBranding(data)}
            <h1 class="header-title">Vous êtes invité !</h1>
            <p class="header-subtitle">Rejoignez ${data.companyName}</p>
        </div>
        
        <div class="content">
            <p class="greeting">Bonjour,</p>
            
            <div class="alert alert-info">
                <span class="alert-icon">📨</span>
                <div>
                    <strong>${data.inviterName}</strong> vous invite à rejoindre l'équipe 
                    <strong>${data.companyName}</strong> en tant que <strong>${roleName}</strong>.
                </div>
            </div>
            
            <p class="message">
                En acceptant cette invitation, vous aurez accès à la plateforme de gestion 
                et pourrez collaborer avec l'équipe.
            </p>
            
            <div class="cta-container">
                <a href="${data.inviteUrl}" class="btn btn-primary">Accepter l'invitation</a>
            </div>
            
            ${data.expiresAt ? `
            <div class="alert alert-warning" style="margin-top: 24px;">
                <span class="alert-icon">⏰</span>
                <div>Cette invitation expire le <strong>${data.expiresAt}</strong>.</div>
            </div>
            ` : ''}
            
            <p class="message email-copy" style="font-size: 13px; color: #6b7280; margin-top: 24px;">
                Si vous n'attendiez pas cette invitation ou si vous ne connaissez pas l'expéditeur, 
                vous pouvez ignorer cet email en toute sécurité.
            </p>
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Cordialement,</p>
                <p class="signature-name">L'équipe ${data.companyName}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName}

📨 INVITATION

Bonjour,

${data.inviterName} vous invite à rejoindre l'équipe ${data.companyName} en tant que ${roleName}.

En acceptant cette invitation, vous aurez accès à la plateforme de gestion.

Accepter l'invitation : ${data.inviteUrl}

${data.expiresAt ? `Cette invitation expire le ${data.expiresAt}.` : ''}

Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email.

Cordialement,
L'équipe ${data.companyName}
    `;
    
    return { subject, html: wrapTemplate(content), text };
}

/**
 * Email de notification générique
 */
export function notificationEmail(data: NotificationEmailData): { subject: string; html: string; text: string } {
    const subject = data.title;
    const actionText = data.actionText || data.actionLabel;
    
    const typeColors: Record<string, { bg: string; border: string; text: string }> = {
        info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
        success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
        warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
        danger: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
    };
    
    const typeIcons: Record<string, string> = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        danger: '🚨',
    };
    
    const type = data.type || 'info';
    const colors = typeColors[type];
    const icon = typeIcons[type];
    const recipientName = data.recipientName || '';
    
    const headerColors: Record<string, string> = {
        info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        danger: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    };
    
    const content = `
        <div class="header" style="background: ${headerColors[type]};">
            ${renderGeneralEmailHeaderLogo(data)}
            <h1 class="header-title">${data.title}</h1>
        </div>
        
        <div class="content">
            ${recipientName ? `<p class="greeting">Bonjour <strong>${recipientName}</strong>,</p>` : '<p class="greeting">Bonjour,</p>'}
            
            <div class="alert" style="background: ${colors.bg}; border: 1px solid ${colors.border}; color: ${colors.text};">
                <span class="alert-icon">${icon}</span>
                <div class="email-copy">${data.message}</div>
            </div>
            
            ${data.actionUrl && actionText ? `
            <div class="cta-container">
                <a href="${data.actionUrl}" class="btn btn-primary">${actionText}</a>
            </div>
            ` : ''}
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Cordialement,</p>
                <p class="signature-name">${data.companyName || 'L\'équipe'}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName || ''}

${data.title.toUpperCase()}

${recipientName ? `Bonjour ${recipientName},` : 'Bonjour,'}

${data.message}

${data.actionUrl && actionText ? `${actionText} : ${data.actionUrl}` : ''}

Cordialement,
${data.companyName || 'L\'équipe'}
    `;
    
    return { subject, html: wrapTemplate(content), text };
}

/**
 * Email de réinitialisation de mot de passe
 */
export function passwordResetEmail(data: PasswordResetEmailData): { subject: string; html: string; text: string } {
    const subject = `🔐 Réinitialisation de votre mot de passe`;
    const userName = data.userName || '';
    const expiresIn = data.expiresIn || (data.expirationMinutes ? `${data.expirationMinutes} minutes` : '1 heure');
    
    const content = `
        <div class="header" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);">
            ${renderGeneralEmailHeaderLogo(data)}
            <h1 class="header-title">Mot de passe oublié ?</h1>
            <p class="header-subtitle">Pas de panique !</p>
        </div>
        
        <div class="content">
            ${userName ? `<p class="greeting">Bonjour <strong>${userName}</strong>,</p>` : '<p class="greeting">Bonjour,</p>'}
            
            <p class="message">
                Vous avez demandé la réinitialisation de votre mot de passe. 
                Cliquez sur le bouton ci-dessous pour en créer un nouveau.
            </p>
            
            <div class="cta-container">
                <a href="${data.resetUrl}" class="btn btn-primary">Réinitialiser mon mot de passe</a>
            </div>
            
            <div class="alert alert-warning" style="margin-top: 24px;">
                <span class="alert-icon">⏰</span>
                <div>Ce lien expire dans <strong>${expiresIn}</strong>.</div>
            </div>
            
            <p class="message email-copy" style="font-size: 13px; color: #6b7280; margin-top: 24px;">
                Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. 
                Votre mot de passe actuel restera inchangé.
            </p>
            
            <div class="divider"></div>
            
            <div class="signature">
                <p>Cordialement,</p>
                <p class="signature-name">L'équipe ${data.companyName || ''}</p>
            </div>
        </div>
        
        ${generateFooter(data)}
    `;
    
    const text = `
${data.companyName || ''}

🔐 RÉINITIALISATION DU MOT DE PASSE

${userName ? `Bonjour ${userName},` : 'Bonjour,'}

Vous avez demandé la réinitialisation de votre mot de passe.

Cliquez sur ce lien pour en créer un nouveau : ${data.resetUrl}

Ce lien expire dans ${expiresIn}.

Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.

Cordialement,
L'équipe ${data.companyName || ''}
    `;
    
    return { subject, html: wrapTemplate(content), text };
}
