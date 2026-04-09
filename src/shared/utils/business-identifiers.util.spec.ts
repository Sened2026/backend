import {
  cleanSiren,
  cleanSiret,
  deriveSirenFromSiret,
  validateSirenSiretConsistency,
  calculateVatNumber,
  normalizeCountryCode,
  detectQueryType,
  normalizeBusinessIdentifiers,
  stripNonDigits,
} from './business-identifiers.util';

describe('business-identifiers.util', () => {
  describe('stripNonDigits', () => {
    it('supprime les espaces et caractères non numériques', () => {
      expect(stripNonDigits('123 456 789')).toBe('123456789');
      expect(stripNonDigits('FR40443061841')).toBe('40443061841');
      expect(stripNonDigits('443-061-841')).toBe('443061841');
    });
  });

  describe('cleanSiren', () => {
    it('retourne un SIREN valide nettoyé', () => {
      expect(cleanSiren('443061841')).toBe('443061841');
      expect(cleanSiren('443 061 841')).toBe('443061841');
    });

    it('retourne null pour un SIREN invalide', () => {
      expect(cleanSiren('12345')).toBeNull();
      expect(cleanSiren('12345678901234')).toBeNull();
      expect(cleanSiren('')).toBeNull();
      expect(cleanSiren(null)).toBeNull();
      expect(cleanSiren(undefined)).toBeNull();
    });
  });

  describe('cleanSiret', () => {
    it('retourne un SIRET valide nettoyé', () => {
      expect(cleanSiret('44306184100015')).toBe('44306184100015');
      expect(cleanSiret('443 061 841 00015')).toBe('44306184100015');
    });

    it('retourne null pour un SIRET invalide', () => {
      expect(cleanSiret('443061841')).toBeNull();
      expect(cleanSiret('123')).toBeNull();
      expect(cleanSiret(null)).toBeNull();
      expect(cleanSiret(undefined)).toBeNull();
    });
  });

  describe('deriveSirenFromSiret', () => {
    it('extrait les 9 premiers chiffres', () => {
      expect(deriveSirenFromSiret('44306184100015')).toBe('443061841');
    });
  });

  describe('validateSirenSiretConsistency', () => {
    it('retourne true si cohérent', () => {
      expect(validateSirenSiretConsistency('443061841', '44306184100015')).toBe(true);
    });

    it('retourne false si incohérent', () => {
      expect(validateSirenSiretConsistency('443061841', '12345678900015')).toBe(false);
    });
  });

  describe('calculateVatNumber', () => {
    it('calcule le numéro de TVA intracommunautaire français', () => {
      expect(calculateVatNumber('443061841')).toBe('FR64443061841');
    });

    it('pad la clé sur 2 chiffres', () => {
      // SIREN 000000001 => key = (12 + 3 * (1 % 97)) % 97 = (12 + 3) % 97 = 15
      expect(calculateVatNumber('000000001')).toBe('FR15000000001');
    });
  });

  describe('normalizeCountryCode', () => {
    it('retourne FR par défaut', () => {
      expect(normalizeCountryCode(null)).toBe('FR');
      expect(normalizeCountryCode(undefined)).toBe('FR');
      expect(normalizeCountryCode('')).toBe('FR');
    });

    it('passe les codes ISO 2 lettres en majuscules', () => {
      expect(normalizeCountryCode('FR')).toBe('FR');
      expect(normalizeCountryCode('fr')).toBe('FR');
      expect(normalizeCountryCode('Be')).toBe('BE');
    });

    it('mappe les noms de pays français', () => {
      expect(normalizeCountryCode('France')).toBe('FR');
      expect(normalizeCountryCode('france')).toBe('FR');
      expect(normalizeCountryCode('Belgique')).toBe('BE');
      expect(normalizeCountryCode('Suisse')).toBe('CH');
      expect(normalizeCountryCode('Luxembourg')).toBe('LU');
      expect(normalizeCountryCode('Allemagne')).toBe('DE');
    });

    it('mappe les noms de pays anglais', () => {
      expect(normalizeCountryCode('Belgium')).toBe('BE');
      expect(normalizeCountryCode('Switzerland')).toBe('CH');
      expect(normalizeCountryCode('Germany')).toBe('DE');
    });

    it('retourne FR pour les pays inconnus', () => {
      expect(normalizeCountryCode('Narnia')).toBe('FR');
    });
  });

  describe('detectQueryType', () => {
    it('détecte un SIREN (9 chiffres)', () => {
      expect(detectQueryType('443061841')).toBe('siren');
    });

    it('détecte un SIRET (14 chiffres)', () => {
      expect(detectQueryType('44306184100015')).toBe('siret');
    });

    it('détecte une recherche textuelle', () => {
      expect(detectQueryType('Acme SAS')).toBe('text');
      expect(detectQueryType('12345')).toBe('text');
      expect(detectQueryType('443061841 Paris')).toBe('text');
    });
  });

  describe('normalizeBusinessIdentifiers', () => {
    it('nettoie et normalise un jeu complet', () => {
      const result = normalizeBusinessIdentifiers({
        siren: '443 061 841',
        siret: '443 061 841 00015',
        vat_number: 'FR40443061841',
        country: 'France',
      });

      expect(result.siren).toBe('443061841');
      expect(result.siret).toBe('44306184100015');
      expect(result.vat_number).toBe('FR40443061841');
      expect(result.country).toBe('FR');
    });

    it('dérive le SIREN depuis le SIRET si absent', () => {
      const result = normalizeBusinessIdentifiers({
        siret: '44306184100015',
      });

      expect(result.siren).toBe('443061841');
      expect(result.siret).toBe('44306184100015');
    });

    it('calcule la TVA si absente et SIREN présent', () => {
      const result = normalizeBusinessIdentifiers({
        siren: '443061841',
      });

      expect(result.vat_number).toBe('FR64443061841');
    });

    it('ne calcule pas la TVA si pas de SIREN', () => {
      const result = normalizeBusinessIdentifiers({
        country: 'BE',
      });

      expect(result.siren).toBeNull();
      expect(result.vat_number).toBeNull();
    });

    it('lève une erreur si SIREN et SIRET incohérents', () => {
      expect(() =>
        normalizeBusinessIdentifiers({
          siren: '443061841',
          siret: '12345678900015',
        }),
      ).toThrow(/incohérents/);
    });

    it('normalise le pays par défaut à FR', () => {
      const result = normalizeBusinessIdentifiers({});
      expect(result.country).toBe('FR');
    });

    it('ignore les SIREN/SIRET invalides', () => {
      const result = normalizeBusinessIdentifiers({
        siren: '123',
        siret: '456',
      });

      expect(result.siren).toBeNull();
      expect(result.siret).toBeNull();
    });
  });
});
