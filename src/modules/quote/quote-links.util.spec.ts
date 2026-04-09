import 'reflect-metadata';
import { QuoteSignatureProvider } from './dto/quote.dto';
import { buildQuotePublicUrls, buildQuoteSignUrl, buildQuoteTermsUrl } from './quote-links.util';

describe('quote-links util', () => {
    it('builds the public sign and terms URLs', () => {
        expect(buildQuoteSignUrl('https://app.example.com/', 'token-1')).toBe(
            'https://app.example.com/quotes/sign/token-1',
        );
        expect(buildQuoteTermsUrl('https://app.example.com/', 'token-1')).toBe(
            'https://app.example.com/quotes/sign/token-1/terms',
        );
    });

    it('builds public quote links when a signature token is present', () => {
        expect(
            buildQuotePublicUrls({
                frontendUrl: 'https://app.example.com',
                signatureToken: 'quote-token',
                signatureProvider: QuoteSignatureProvider.YOUSIGN,
                includeTermsUrl: true,
            }),
        ).toEqual({
            signUrl: 'https://app.example.com/quotes/sign/quote-token',
            viewUrl: 'https://app.example.com/quotes/sign/quote-token',
            termsUrl: 'https://app.example.com/quotes/sign/quote-token/terms',
        });
    });

    it('keeps the public quote links for internal quotes', () => {
        expect(
            buildQuotePublicUrls({
                frontendUrl: 'https://app.example.com',
                signatureToken: 'quote-token',
                signatureProvider: QuoteSignatureProvider.INTERNAL,
                includeTermsUrl: true,
            }),
        ).toEqual({
            signUrl: 'https://app.example.com/quotes/sign/quote-token',
            viewUrl: 'https://app.example.com/quotes/sign/quote-token',
            termsUrl: 'https://app.example.com/quotes/sign/quote-token/terms',
        });
    });
});
