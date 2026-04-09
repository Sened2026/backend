import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
    const rawKey = process.env.CHORUS_CREDENTIALS_ENCRYPTION_KEY?.trim();

    if (!rawKey) {
        throw new Error('CHORUS_CREDENTIALS_ENCRYPTION_KEY manquante');
    }

    if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
        return Buffer.from(rawKey, 'hex');
    }

    if (/^[A-Za-z0-9+/]+={0,2}$/.test(rawKey)) {
        const base64Key = Buffer.from(rawKey, 'base64');
        if (base64Key.length === 32) {
            return base64Key;
        }
    }

    const utf8Key = Buffer.from(rawKey, 'utf8');
    if (utf8Key.length === 32) {
        return utf8Key;
    }

    // Compat: accept legacy arbitrary strings such as UUIDs by deriving
    // a stable 32-byte key from the configured value.
    return createHash('sha256').update(rawKey, 'utf8').digest();
}

export function encrypt(text: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

export function decrypt(data: string): string {
    const key = getEncryptionKey();
    const [ivB64, encB64, tagB64] = data.split(':');
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return decipher.update(Buffer.from(encB64, 'base64')) + decipher.final('utf8');
}

export function isEncrypted(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 3;
}
