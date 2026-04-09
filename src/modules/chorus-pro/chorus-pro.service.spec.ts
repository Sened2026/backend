import { encrypt } from "../../common/utils/encryption";
import {
  buildChorusMatchedStructure,
  buildChorusVerificationUpdate,
  evaluateChorusConsultStructure,
  evaluateChorusSearchStructure,
  extractChorusStructureRequirements,
  resolveChorusTestCredentials,
  selectActiveChorusStructure,
  type ChorusProSettings,
} from "./chorus-pro.service";

describe("ChorusProService helpers", () => {
  const baseSettings: ChorusProSettings = {
    id: "settings-id",
    company_id: "company-id",
    enabled: true,
    cpro_login: "stored-login",
    cpro_password: "stored-password",
    id_structure_cpp: null,
    chorus_id_utilisateur_courant: null,
    chorus_id_fournisseur: null,
    chorus_id_service_fournisseur: null,
    chorus_code_coordonnees_bancaires_fournisseur: null,
    connection_status: "not_configured",
    default_code_destinataire: null,
    default_code_service_executant: null,
    default_cadre_facturation: "A1_FACTURE_FOURNISSEUR",
    verified_company_siret: null,
    verified_structure_label: null,
    verified_user_role: null,
    verified_user_status: null,
    verified_attachment_status: null,
    verified_services: null,
    last_verified_at: null,
    created_at: "2026-03-19T00:00:00.000Z",
    updated_at: "2026-03-19T00:00:00.000Z",
  };

  beforeAll(() => {
    process.env.CHORUS_CREDENTIALS_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("uses the provided password override before the stored password", () => {
    const encryptedPassword = encrypt("stored-secret");
    const credentials = resolveChorusTestCredentials(
      {
        ...baseSettings,
        cpro_password: encryptedPassword,
      },
      {
        cpro_login: "override-login",
        cpro_password: "override-secret",
      },
    );

    expect(credentials).toEqual({
      login: "override-login",
      password: "override-secret",
    });
  });

  it("falls back to the stored encrypted password when no new password is provided", () => {
    const encryptedPassword = encrypt("stored-secret");
    const credentials = resolveChorusTestCredentials(
      {
        ...baseSettings,
        cpro_password: encryptedPassword,
      },
      {
        cpro_login: "stored-login",
      },
    );

    expect(credentials).toEqual({
      login: "stored-login",
      password: "stored-secret",
    });
  });

  it("returns null when no usable credentials are available", () => {
    expect(resolveChorusTestCredentials(null, {})).toBeNull();
  });

  it("builds a matched structure only for the exact company SIRET", () => {
    const matched = buildChorusMatchedStructure("12345678901234", {
      listeStructureRattachement: [
        {
          identifiantStructure: "99999999999999",
          typeIdentifiantStructure: "SIRET",
        },
        {
          designationStructure: "Entreprise test",
          idStructure: 42,
          identifiantStructure: "12345678901234",
          listeServicesRattache: [
            {
              codeService: "FIN",
              estActif: true,
              libelleService: "Service financier",
              statutService: "ACTIF",
              statutRattachementService: "ACTIF",
            },
          ],
          roleUtilisateur: "GESTIONNAIRE",
          statutRattachementStructure: "ACTIF",
          statutUtilisateur: "ACTIF",
          typeIdentifiantStructure: "SIRET",
        },
      ],
    });

    expect(matched).toEqual({
      companySiret: "12345678901234",
      idStructureCpp: 42,
      identifiantStructure: "12345678901234",
      structureLabel: "Entreprise test",
      userRole: "GESTIONNAIRE",
      userStatus: "ACTIF",
      attachmentStatus: "ACTIF",
      services: [
        {
          codeService: "FIN",
          libelleService: "Service financier",
          actif: true,
          statutService: "ACTIF",
          statutRattachementService: "ACTIF",
        },
      ],
    });
  });

  it("returns null when no structure matches the company SIRET", () => {
    expect(
      buildChorusMatchedStructure("12345678901234", {
        listeStructureRattachement: [
          {
            identifiantStructure: "99999999999999",
            typeIdentifiantStructure: "SIRET",
          },
        ],
      }),
    ).toBeNull();
  });

  it("builds the verification persistence payload for a successful match", () => {
    const payload = buildChorusVerificationUpdate({
      companySiret: "12345678901234",
      idStructureCpp: 42,
      identifiantStructure: "12345678901234",
      structureLabel: "Entreprise test",
      userRole: "GESTIONNAIRE",
      userStatus: "ACTIF",
      attachmentStatus: "ACTIF",
      services: [],
    });

    expect(payload).toMatchObject({
      id_structure_cpp: 42,
      verified_company_siret: "12345678901234",
      verified_structure_label: "Entreprise test",
      verified_user_role: "GESTIONNAIRE",
      verified_user_status: "ACTIF",
      verified_attachment_status: "ACTIF",
      verified_services: [],
    });
    expect(payload.last_verified_at).toEqual(expect.any(String));
  });

  it("clears the verification payload on failure", () => {
    expect(buildChorusVerificationUpdate(null)).toEqual({
      id_structure_cpp: null,
      verified_company_siret: null,
      verified_structure_label: null,
      verified_user_role: null,
      verified_user_status: null,
      verified_attachment_status: null,
      verified_services: null,
      last_verified_at: null,
    });
  });

  it("treats ACTIVE and ACTIF as active structure statuses", () => {
    expect(
      evaluateChorusSearchStructure({
        statut: "ACTIVE",
      }),
    ).toMatchObject({
      state: "active",
      primaryStatus: "ACTIVE",
    });

    expect(
      evaluateChorusConsultStructure({
        statutStructure: "ACTIF",
      }),
    ).toMatchObject({
      state: "active",
      primaryStatus: "ACTIF",
    });
  });

  it("treats missing consulterStructure status as inconclusive", () => {
    expect(
      evaluateChorusConsultStructure({
        statutStructure: null,
        parametresStructure: {},
      }),
    ).toEqual({
      state: "unknown",
      statuses: [],
      primaryStatus: null,
    });
  });

  it("selects the active structure matching the expected identifier", () => {
    const selected = selectActiveChorusStructure(
      {
        listeStructures: [
          {
            identifiantStructure: "99999999900000",
            statut: "ACTIVE",
            idStructureCPP: 10,
          },
          {
            identifiantStructure: "12345678200051",
            statut: "ACTIVE",
            idStructureCPP: 20,
          },
        ],
      },
      "12345678200051",
    );

    expect(selected).toMatchObject({
      identifiantStructure: "12345678200051",
      idStructureCPP: 20,
    });
  });

  it("extracts structure requirements from consulterStructure responses", () => {
    expect(
      extractChorusStructureRequirements({
        parametresStructure: {
          codeServiceObligatoire: true,
          numeroEngagementObligatoire: false,
        },
      }),
    ).toEqual({
      serviceCodeRequired: true,
      engagementRequired: false,
    });
  });
});
