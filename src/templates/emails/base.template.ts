/**
 * Template de base pour tous les emails
 * Design moderne et responsive
 */

export interface EmailTemplateData {
    companyName: string;
    companyLogo?: string;
    companyAddress?: string;
    companyCity?: string;
    companyPostalCode?: string;
    companyEmail?: string;
    companyPhone?: string;
    companySiren?: string;
    brandAssetBaseUrl?: string;
}
const SENED_EMAIL_FOOTER_TEXT = 'Ce message a été généré par Sened';
const SENED_TEXT_SIGNATURE = 'Généré par Sened';
const SENED_SECONDARY_LOGO_PATH = '/brand/secondaire/SVG/SECONDAIRE_bleu.svg';

export const baseStyles = `
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    
    body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background-color: #f3f4f6;
        margin: 0;
        padding: 0;
    }
    
    .email-wrapper {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
    }
    
    .email-container {
        background: #ffffff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    
    .header {
        padding: 32px;
        text-align: center;
    }
    
    .header-logo-table,
    .header-branding-table {
        margin: 0 auto 16px;
        border-collapse: separate;
    }

    .header-logo {
        display: block;
        border: 0;
        outline: none;
        text-decoration: none;
    }

    .header-logo-cell,
    .header-logo-fallback-cell,
    .header-company-logo-cell {
        text-align: center;
        vertical-align: middle;
    }

    .header-title {
        color: #ffffff;
        font-size: 28px;
        font-weight: 700;
        margin: 0;
        text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .header-subtitle {
        color: rgba(255,255,255,0.9);
        font-size: 14px;
        margin-top: 8px;
    }
    
    .content {
        padding: 32px;
    }
    
    .greeting {
        font-size: 18px;
        color: #374151;
        margin-bottom: 16px;
    }
    
    .message {
        color: #4b5563;
        font-size: 15px;
        margin-bottom: 24px;
    }

    .email-copy,
    .message,
    .justified-copy {
        text-align: justify;
        text-justify: inter-word;
    }
    
    .info-card {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 12px;
        padding: 24px;
        margin: 24px 0;
        border: 1px solid #e2e8f0;
    }
    
    .info-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #e2e8f0;
    }
    
    .info-row:last-child {
        border-bottom: none;
    }
    
    .info-label {
        color: #64748b;
        font-size: 14px;
        margin-right: 8px;
    }
    
    .info-value {
        color: #1e293b;
        font-weight: 600;
        font-size: 14px;
    }
    
    .amount-box {
        text-align: center;
        padding: 24px;
        border-radius: 12px;
        margin: 24px 0;
    }
    
    .amount-label {
        font-size: 14px;
        margin-bottom: 8px;
    }
    
    .amount-value {
        font-size: 36px;
        font-weight: 700;
    }
    
    .btn {
        display: inline-block;
        padding: 16px 32px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        font-size: 15px;
        text-align: center;
        transition: all 0.2s;
    }
    
    .btn-primary {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: #ffffff !important;
        box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.4);
    }
    
    .btn-success {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #ffffff !important;
        box-shadow: 0 4px 14px 0 rgba(5, 150, 105, 0.4);
    }
    
    .btn-warning {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: #ffffff !important;
        box-shadow: 0 4px 14px 0 rgba(217, 119, 6, 0.4);
    }
    
    .btn-danger {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: #ffffff !important;
        box-shadow: 0 4px 14px 0 rgba(220, 38, 38, 0.4);
    }
    
    .cta-container {
        text-align: center;
        margin: 32px 0;
    }
    
    .divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, #e2e8f0, transparent);
        margin: 24px 0;
    }
    
    .badge {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .badge-info {
        background: #dbeafe;
        color: #1d4ed8;
    }
    
    .badge-success {
        background: #d1fae5;
        color: #047857;
    }
    
    .badge-warning {
        background: #fef3c7;
        color: #b45309;
    }
    
    .badge-danger {
        background: #fee2e2;
        color: #b91c1c;
    }
    
    .alert {
        padding: 16px 20px;
        border-radius: 8px;
        margin: 20px 0;
        display: flex;
        align-items: flex-start;
        gap: 12px;
    }
    
    .alert-icon {
        font-size: 20px;
        flex-shrink: 0;
    }
    
    .alert-info {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
    }
    
    .alert-warning {
        background: #fffbeb;
        border: 1px solid #fde68a;
        color: #92400e;
    }
    
    .alert-danger {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
    }
    
    .alert-success {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #166534;
    }
    
    .footer {
        background: #f8fafc;
        padding: 24px 32px;
        text-align: center;
        border-top: 1px solid #e2e8f0;
    }
    
    .footer-company {
        font-weight: 600;
        color: #374151;
        margin-bottom: 8px;
    }
    
    .footer-info {
        color: #6b7280;
        font-size: 13px;
        line-height: 1.8;
    }
    
    .footer-legal {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
        font-size: 11px;
        color: #9ca3af;
    }

    .footer-branding {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
    }

    .footer-branding-table {
        margin: 0 auto;
        border-collapse: collapse;
    }

    .footer-branding-logo-cell {
        padding-right: 10px;
        vertical-align: middle;
    }

    .footer-branding-logo {
        display: block;
        height: 18px;
        width: auto;
        border: 0;
        outline: none;
        text-decoration: none;
    }

    .footer-branding-text {
        color: #94a3b8;
        font-size: 11px;
        line-height: 1.4;
        vertical-align: middle;
        white-space: nowrap;
    }
    
    .signature {
        margin-top: 24px;
        color: #4b5563;
    }
    
    .signature-name {
        font-weight: 600;
        color: #1f2937;
    }
    
    @media only screen and (max-width: 600px) {
        .email-wrapper {
            padding: 10px;
        }
        
        .header, .content, .footer {
            padding: 24px 20px;
        }
        
        .header-title {
            font-size: 24px;
        }
        
        .amount-value {
            font-size: 28px;
        }
        
        .btn {
            display: block;
            width: 100%;
        }
    }
`;

export function generateFooter(data: EmailTemplateData): string {
    const brandLogoUrl = resolveSenedBrandLogoUrl(data.brandAssetBaseUrl);

    return `
    <div class="footer">
        <div class="footer-company">${data.companyName}</div>
        <div class="footer-info">
            ${data.companyAddress ? `${data.companyAddress}<br>` : ''}
            ${data.companyPostalCode || data.companyCity ? `${data.companyPostalCode || ''} ${data.companyCity || ''}<br>` : ''}
            ${data.companyEmail ? `Email : ${data.companyEmail}<br>` : ''}
            ${data.companyPhone ? `Tél : ${data.companyPhone}` : ''}
        </div>
        ${data.companySiren ? `
        <div class="footer-legal">
            SIREN : ${data.companySiren}
        </div>
        ` : ''}
        <div class="footer-branding">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="footer-branding-table" align="center" style="margin:0 auto; border-collapse:collapse;">
                <tr>
                    ${brandLogoUrl ? `
                    <td class="footer-branding-logo-cell" valign="middle" style="padding-right:10px;">
                        <img src="${brandLogoUrl}" alt="Sened" class="footer-branding-logo" style="display:block; height:18px; width:auto; border:0; outline:none; text-decoration:none;">
                    </td>
                    ` : ''}
                    <td class="footer-branding-text" valign="middle" style="color:#94a3b8; font-size:11px; line-height:1.4; white-space:nowrap;">
                        ${SENED_EMAIL_FOOTER_TEXT}
                    </td>
                </tr>
            </table>
        </div>
    </div>
    `;
}

function normalizeEmailHeaderLogo(logo?: string): string | null {
    const normalizedLogo = logo?.trim();
    return normalizedLogo ? normalizedLogo : null;
}

function normalizeBrandAssetBaseUrl(baseUrl?: string): string | null {
    const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, '');
    return normalizedBaseUrl ? normalizedBaseUrl : null;
}

function resolveSenedBrandLogoUrl(baseUrl?: string): string | null {
    const normalizedBaseUrl = normalizeBrandAssetBaseUrl(baseUrl);
    return normalizedBaseUrl ? `${normalizedBaseUrl}${SENED_SECONDARY_LOGO_PATH}` : null;
}

function renderHeaderLogoBox(companyLogo: string, companyName: string, compact = false): string {
    const minWidth = compact ? '96px' : '120px';
    const minHeight = compact ? '44px' : '52px';
    const padding = compact ? '8px 14px' : '10px 18px';
    const borderRadius = compact ? '12px' : '14px';
    const maxWidth = compact ? '120px' : '150px';
    const maxHeight = compact ? '40px' : '60px';

    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
        <tr>
            <td class="header-logo-cell${compact ? ' header-company-logo-cell' : ''}" align="center" valign="middle" style="min-width:${minWidth}; min-height:${minHeight}; padding:${padding}; border-radius:${borderRadius}; background:rgba(255, 255, 255, 0.12); border:1px solid rgba(255, 255, 255, 0.22);">
                <img src="${companyLogo}" alt="${companyName}" class="header-logo" style="display:block; max-width:${maxWidth}; max-height:${maxHeight}; width:auto; height:auto; border:0; outline:none; text-decoration:none;">
            </td>
        </tr>
    </table>`;
}

export function renderEmailHeaderLogo(data: EmailTemplateData): string {
    const companyLogo = normalizeEmailHeaderLogo(data.companyLogo);
    if (!companyLogo) {
        return '';
    }

    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="header-logo-table" align="center" style="margin:0 auto 16px; border-collapse:separate;">
        <tr>
            <td align="center" valign="middle">
                ${renderHeaderLogoBox(companyLogo, data.companyName)}
            </td>
        </tr>
    </table>`;
}

export function renderGeneralEmailHeaderLogo(data: EmailTemplateData): string {
    return renderEmailHeaderLogo(data);
}

export function renderInviteEmailHeaderBranding(data: EmailTemplateData): string {
    const companyLogo = normalizeEmailHeaderLogo(data.companyLogo);
    if (!companyLogo) {
        return '';
    }

    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="header-branding-table" align="center" style="margin:0 auto 16px; border-collapse:separate;">
        <tr>
            <td align="center" valign="middle">
                ${renderHeaderLogoBox(companyLogo, data.companyName, true)}
            </td>
        </tr>
    </table>`;
}

export function appendGeneratedBySenedText(text: string): string {
    return `${text.trimEnd()}\n\n${SENED_TEXT_SIGNATURE}`;
}

export function wrapTemplate(content: string, styles: string = baseStyles): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Email</title>
    <style>${styles}</style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-container">
            ${content}
        </div>
    </div>
</body>
</html>
    `;
}
