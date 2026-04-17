import {
    buildInseeRaisonSocialeQuery,
    buildInseeTextSearchQuery,
    getNicSiegeFromUniteLegale,
    mapInseeUniteLegaleAndEtablissement,
    mapInseeEtablissementToResult,
    normalizeInseeSearchInput,
    simplifyBusinessNameForRaisonSociale,
} from './insee-sirene.mapper';

describe('buildInseeRaisonSocialeQuery', () => {
    it('construit une requête simple raisonSociale sans syntaxe Lucene multi-champs', () => {
        const q = buildInseeRaisonSocialeQuery('LA FINANCIERE');

        expect(q).toBe('raisonSociale:LA FINANCIERE');
        expect(q).not.toContain('periode(');
        expect(q).not.toContain(' OR ');
        expect(q).not.toContain(' AND ');
    });
});

describe('simplifyBusinessNameForRaisonSociale', () => {
    it('retourne une version métier simplifiée pour les noms avec parenthèses', () => {
        expect(simplifyBusinessNameForRaisonSociale('LA FINANCIERE (LA FINANCIERE)')).toBe('LA FINANCIERE');
    });

    it('normalise les apostrophes et les espaces comme la recherche Lucene', () => {
        expect(simplifyBusinessNameForRaisonSociale("  L’Atelier   d’Anne  ")).toBe("L'Atelier d'Anne");
        expect(normalizeInseeSearchInput("  L’Atelier   d’Anne  ")).toBe("L'Atelier d'Anne");
    });
});

describe('buildInseeTextSearchQuery', () => {
    it('construit une requête multi-champs avec un bloc tokenisé AND + fallback phrase', () => {
        const q = buildInseeTextSearchQuery('La   Fabrique cookie');

        expect(q).toContain('denominationUniteLegale');
        expect(q).toContain('nomUniteLegale');
        expect(q).toContain('denominationUsuelle1UniteLegale');
        expect(q).toContain('denominationUsuelle2UniteLegale');
        expect(q).toContain('denominationUsuelle3UniteLegale');
        expect(q).toContain('nomUsageUniteLegale');
        expect(q).toMatch(/la\*\s+AND\s+fabrique\*\s+AND\s+cookie\*/i);
        expect(q).toContain('"La Fabrique cookie"');
    });

    it('normalise les apostrophes typographiques et les espaces', () => {
        const q = buildInseeTextSearchQuery("  L’Atelier   d’Anne  ");

        expect(q).not.toContain('’');
        expect(q).toContain(`"L'Atelier d'Anne"`);
    });

    it('retire la ponctuation du bloc tokenisé pour éviter des tokens pollués', () => {
        const q = buildInseeTextSearchQuery('LA FINANCIERE (LA FINANCIERE)');

        expect(q).toContain('LA* AND FINANCIERE*');
        expect(q).not.toContain('\\(LA*');
        expect(q).not.toContain('FINANCIERE\\)*');
        expect(q).toContain('"LA FINANCIERE \\(LA FINANCIERE\\)"');
    });

    it('gère les séparateurs courants (tiret, slash, point, virgule)', () => {
        const hyphen = buildInseeTextSearchQuery('SAINT-GOBAIN');
        expect(hyphen).toMatch(/SAINT\*\s+AND\s+GOBAIN\*/);
        expect(hyphen).not.toContain('SAINT\\-GOBAIN*');

        const slash = buildInseeTextSearchQuery('A/B CONSEIL');
        expect(slash).toMatch(/A\*\s+AND\s+B\*\s+AND\s+CONSEIL\*/);
        expect(slash).not.toContain('A\\/B*');

        const dotted = buildInseeTextSearchQuery('S.C.I. DU PARC');
        expect(dotted).toContain('DU*');
        expect(dotted).toContain('PARC*');
        expect(dotted).not.toContain('S\\.C\\.I\\.*');

        const comma = buildInseeTextSearchQuery('ALPHA, BETA');
        expect(comma).toMatch(/ALPHA\*\s+AND\s+BETA\*/);
        expect(comma).not.toContain('ALPHA\\,*');
    });

    it('normalise & et conserve une recherche robuste sur les mots', () => {
        const q = buildInseeTextSearchQuery('ACME & Co');
        expect(q).toMatch(/ACME\*\s+AND\s+Co\*/i);
        expect(q).not.toContain('\\&*');
    });

    it('ajoute un fallback phrase sanitizé pour les variantes de ponctuation', () => {
        const q = buildInseeTextSearchQuery('XYZ HOLDING SAS');
        expect(q).toContain('"XYZ HOLDING SAS"');
    });
});

describe('getNicSiegeFromUniteLegale', () => {
    it('retourne le NIC du siège sur 5 caractères', () => {
        const nic = getNicSiegeFromUniteLegale({
            siren: '123456789',
            periodesUniteLegale: [
                {
                    dateDebut: '2020-01-01',
                    nicSiegeUniteLegale: '12345',
                },
            ],
        });
        expect(nic).toBe('12345');
    });
});

describe('mapInseeUniteLegaleAndEtablissement', () => {
    it('mappe une UL et un établissement siège vers SirenSearchResult', () => {
        const result = mapInseeUniteLegaleAndEtablissement(
            {
                siren: '552100554',
                dateCreationUniteLegale: '1955-01-01',
                periodesUniteLegale: [
                    {
                        dateDebut: '2000-01-01',
                        denominationUniteLegale: 'TEST SA',
                        categorieJuridiqueUniteLegale: '5710',
                        nicSiegeUniteLegale: '00017',
                    },
                ],
            },
            {
                siret: '55210055400017',
                adresseEtablissement: {
                    numeroVoieEtablissement: '1',
                    typeVoieEtablissement: 'AV',
                    libelleVoieEtablissement: 'DES CHAMPS',
                    codePostalEtablissement: '75008',
                    libelleCommuneEtablissement: 'PARIS',
                },
                periodesEtablissement: [
                    {
                        activitePrincipaleEtablissement: '62.01Z',
                    },
                ],
            },
        );
        expect(result.siren).toBe('552100554');
        expect(result.siret).toBe('55210055400017');
        expect(result.company_name).toBe('TEST SA');
        expect(result.postal_code).toBe('75008');
        expect(result.city).toBe('PARIS');
        expect(result.naf_code).toBe('62.01Z');
        expect(result.vat_number).toMatch(/^FR/);
    });
});

describe('mapInseeEtablissementToResult', () => {
    it('mappe un établissement seul', () => {
        const result = mapInseeEtablissementToResult({
            siren: '552100554',
            siret: '55210055400017',
            uniteLegale: {
                denominationUniteLegale: 'TEST SA',
                categorieJuridiqueUniteLegale: '5710',
            },
            adresseEtablissement: {
                codePostalEtablissement: '75008',
                libelleCommuneEtablissement: 'PARIS',
            },
            periodesEtablissement: [{ activitePrincipaleEtablissement: '62.01Z' }],
        });
        expect(result.siret).toBe('55210055400017');
        expect(result.company_name).toBe('TEST SA');
    });
});
