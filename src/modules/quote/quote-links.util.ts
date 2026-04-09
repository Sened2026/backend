import { QuoteSignatureProvider } from './dto/quote.dto';

interface BuildQuoteUrlsOptions {
    frontendUrl: string;
    signatureToken?: string | null;
    /** Conservé pour compatibilité lecture (anciennes lignes API) ; non utilisé pour masquer l’URL. */
    signatureProvider?: QuoteSignatureProvider | string | null;
    includeTermsUrl?: boolean;
}

export interface QuotePublicUrls {
    signUrl?: string;
    viewUrl?: string;
    termsUrl?: string;
}

function trimTrailingSlashes(value: string): string {
    return value.replace(/\/+$/, '');
}

export function buildQuoteSignUrl(frontendUrl: string, token: string): string {
    return `${trimTrailingSlashes(frontendUrl)}/quotes/sign/${token}`;
}

export function buildQuoteTermsUrl(frontendUrl: string, token: string): string {
    return `${buildQuoteSignUrl(frontendUrl, token)}/terms`;
}

export function buildQuotePublicUrls(options: BuildQuoteUrlsOptions): QuotePublicUrls {
    if (!options.signatureToken) {
        return {};
    }

    const signUrl = buildQuoteSignUrl(options.frontendUrl, options.signatureToken);

    return {
        signUrl,
        viewUrl: signUrl,
        termsUrl: options.includeTermsUrl ? buildQuoteTermsUrl(options.frontendUrl, options.signatureToken) : undefined,
    };
}
