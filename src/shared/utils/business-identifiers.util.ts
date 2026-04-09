/**
 * Utilitaires de normalisation des identifiants d'entreprise (SIREN, SIRET, TVA, pays).
 * Fonctions pures, sans dépendance NestJS.
 */

// Mapping des noms de pays courants vers codes ISO 3166-1 alpha-2
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  france: 'FR',
  belgique: 'BE',
  belgium: 'BE',
  suisse: 'CH',
  switzerland: 'CH',
  luxembourg: 'LU',
  allemagne: 'DE',
  germany: 'DE',
  espagne: 'ES',
  spain: 'ES',
  italie: 'IT',
  italy: 'IT',
  'pays-bas': 'NL',
  'pays bas': 'NL',
  netherlands: 'NL',
  'royaume-uni': 'GB',
  'royaume uni': 'GB',
  'united kingdom': 'GB',
  portugal: 'PT',
  autriche: 'AT',
  austria: 'AT',
  canada: 'CA',
  irlande: 'IE',
  ireland: 'IE',
};

/**
 * Supprime tous les caractères non numériques d'une chaîne.
 */
export function stripNonDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Nettoie et valide un SIREN (9 chiffres).
 * Retourne la chaîne nettoyée ou null si invalide.
 */
export function cleanSiren(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = stripNonDigits(input);
  return cleaned.length === 9 ? cleaned : null;
}

/**
 * Nettoie et valide un SIRET (14 chiffres).
 * Retourne la chaîne nettoyée ou null si invalide.
 */
export function cleanSiret(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = stripNonDigits(input);
  return cleaned.length === 14 ? cleaned : null;
}

/**
 * Dérive le SIREN (9 premiers chiffres) à partir d'un SIRET (14 chiffres).
 */
export function deriveSirenFromSiret(siret: string): string {
  return siret.substring(0, 9);
}

/**
 * Vérifie que le SIREN et le SIRET sont cohérents (le SIRET commence par le SIREN).
 */
export function validateSirenSiretConsistency(
  siren: string,
  siret: string,
): boolean {
  return siret.startsWith(siren);
}

/**
 * Calcule le numéro de TVA intracommunautaire français à partir du SIREN.
 */
export function calculateVatNumber(siren: string): string {
  const sirenNum = parseInt(siren, 10);
  const key = (12 + 3 * (sirenNum % 97)) % 97;
  return `FR${key.toString().padStart(2, '0')}${siren}`;
}

/**
 * Normalise un code pays : texte connu → ISO 2, code 2 lettres passthrough, défaut 'FR'.
 */
export function normalizeCountryCode(
  input: string | null | undefined,
): string {
  if (!input || input.trim().length === 0) return 'FR';
  const trimmed = input.trim();
  // Déjà un code ISO 2 lettres
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  // Tenter le mapping par nom
  const mapped = COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()];
  return mapped || 'FR';
}

/**
 * Détecte le type de requête en fonction de la saisie utilisateur.
 */
export function detectQueryType(
  query: string,
): 'siren' | 'siret' | 'text' {
  const digits = stripNonDigits(query);
  if (digits.length === 9 && digits === query.replace(/\s/g, '')) return 'siren';
  if (digits.length === 14 && digits === query.replace(/\s/g, '')) return 'siret';
  return 'text';
}

export interface BusinessIdentifiersInput {
  siren?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  country?: string | null;
}

export interface NormalizedBusinessIdentifiers {
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  country: string;
}

/**
 * Normalise un ensemble d'identifiants métier :
 * - Nettoie SIREN / SIRET
 * - Dérive le SIREN depuis le SIRET si absent
 * - Vérifie la cohérence SIREN/SIRET
 * - Calcule le numéro de TVA si absent et SIREN présent
 * - Normalise le code pays
 *
 * @throws Error si SIREN et SIRET sont présents mais incohérents
 */
export function normalizeBusinessIdentifiers(
  data: BusinessIdentifiersInput,
): NormalizedBusinessIdentifiers {
  let siren = cleanSiren(data.siren);
  let siret = cleanSiret(data.siret);

  // Dériver le SIREN depuis le SIRET si le SIREN est absent
  if (!siren && siret) {
    siren = deriveSirenFromSiret(siret);
  }

  // Vérifier la cohérence
  if (siren && siret && !validateSirenSiretConsistency(siren, siret)) {
    throw new Error(
      `SIREN (${siren}) et SIRET (${siret}) sont incohérents : le SIRET doit commencer par le SIREN`,
    );
  }

  // Calculer la TVA si absente et SIREN présent
  let vatNumber = data.vat_number?.trim() || null;
  if (!vatNumber && siren) {
    vatNumber = calculateVatNumber(siren);
  }

  const country = normalizeCountryCode(data.country);

  return { siren, siret, vat_number: vatNumber, country };
}
