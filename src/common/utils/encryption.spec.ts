import { decrypt, encrypt } from './encryption';

describe('encryption utils', () => {
    const plainText = 'secret-technique';

    afterEach(() => {
        delete process.env.CHORUS_CREDENTIALS_ENCRYPTION_KEY;
    });

    it('encrypts and decrypts with a 64-char hex key', () => {
        process.env.CHORUS_CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

        const encrypted = encrypt(plainText);

        expect(decrypt(encrypted)).toBe(plainText);
    });

    it('encrypts and decrypts with a 32-char text key', () => {
        process.env.CHORUS_CREDENTIALS_ENCRYPTION_KEY = '12345678901234567890123456789012';

        const encrypted = encrypt(plainText);

        expect(decrypt(encrypted)).toBe(plainText);
    });

    it('derives a stable key from arbitrary strings such as UUIDs', () => {
        process.env.CHORUS_CREDENTIALS_ENCRYPTION_KEY = 'f091c608-249a-4815-a78f-035027666902';

        const encrypted = encrypt(plainText);

        expect(decrypt(encrypted)).toBe(plainText);
    });

    it('throws when the key is missing', () => {
        delete process.env.CHORUS_CREDENTIALS_ENCRYPTION_KEY;

        expect(() => encrypt(plainText)).toThrow('CHORUS_CREDENTIALS_ENCRYPTION_KEY manquante');
    });
});
