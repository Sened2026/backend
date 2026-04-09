import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getSupabaseAdmin } from "../../config/supabase.config";
import {
  getUserCompanyRole,
  requireRole,
  ADMIN_ROLES,
} from "../../common/roles/roles";
import { encrypt, decrypt, isEncrypted } from "../../common/utils/encryption";
import { UpdateChorusSettingsDto } from "./dto/update-chorus-settings.dto";
import { SubmitInvoiceChorusDto } from "./dto/submit-invoice-chorus.dto";
import { shouldSyncToInternalStatus } from "./chorus-status-map";
import { TestChorusConnectionDto } from "./dto/test-chorus-connection.dto";
import { PdfService } from "../pdf/pdf.service";

interface OAuthToken {
  access_token: string;
  expires_at: number;
}

export interface ChorusProSettings {
  id: string;
  company_id: string;
  enabled: boolean;
  cpro_login: string | null;
  cpro_password: string | null;
  id_structure_cpp: number | null;
  chorus_id_utilisateur_courant: number | null;
  chorus_id_fournisseur: number | null;
  chorus_id_service_fournisseur: number | null;
  chorus_code_coordonnees_bancaires_fournisseur: number | null;
  connection_status: string;
  default_code_destinataire: string | null;
  default_code_service_executant: string | null;
  default_cadre_facturation: string | null;
  verified_company_siret: string | null;
  verified_structure_label: string | null;
  verified_user_role: string | null;
  verified_user_status: string | null;
  verified_attachment_status: string | null;
  verified_services: ChorusProVerifiedService[] | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChorusProVerifiedService {
  codeService: string | null;
  libelleService: string | null;
  actif: boolean;
  statutService: string | null;
  statutRattachementService: string | null;
}

export interface ChorusProMatchedStructure {
  companySiret: string;
  idStructureCpp: number | null;
  identifiantStructure: string;
  structureLabel: string | null;
  userRole: string | null;
  userStatus: string | null;
  attachmentStatus: string | null;
  services: ChorusProVerifiedService[];
}

export interface ChorusProTestConnectionResult {
  success: boolean;
  message: string;
  matchedStructure: ChorusProMatchedStructure | null;
}

interface ChorusCompanyRecord {
  id: string;
  name: string;
  siren: string | null;
}

interface ResolvedChorusCredentials {
  login: string;
  password: string;
}

interface ChorusSupplierIdentifiers {
  idUtilisateurCourant: number;
  idFournisseur: number;
  idServiceFournisseur?: number;
  codeCoordonneesBancairesFournisseur?: number;
}

type ChorusSubmissionStage = "revalidation" | "deposit" | "submit";

interface ChorusUserAttachmentService {
  codeService?: string;
  estActif?: boolean;
  libelleService?: string;
  statutRattachementService?: string;
  statutService?: string;
}

interface ChorusUserAttachment {
  designationStructure?: string;
  idStructure?: number;
  identifiantStructure?: string;
  listeServicesRattache?: ChorusUserAttachmentService[];
  roleUtilisateur?: string;
  statutRattachementStructure?: string;
  statutUtilisateur?: string;
  typeIdentifiantStructure?: string;
}

interface ChorusUserAttachmentsResponse {
  codeRetour?: number;
  libelle?: string;
  listeStructureRattachement?: ChorusUserAttachment[];
  message?: string;
}

type ChorusStructureActivityState = "active" | "inactive" | "unknown";

interface ChorusStructureStatusEvaluation {
  state: ChorusStructureActivityState;
  statuses: string[];
  primaryStatus: string | null;
}

const CHORUS_VERIFICATION_RESET = {
  id_structure_cpp: null,
  verified_company_siret: null,
  verified_structure_label: null,
  verified_user_role: null,
  verified_user_status: null,
  verified_attachment_status: null,
  verified_services: null,
  last_verified_at: null,
};

const maskChorusPassword = (
  settings: ChorusProSettings,
): ChorusProSettings => ({
  ...settings,
  cpro_password: settings.cpro_password ? "********" : null,
});

const getStoredPassword = (
  settings: ChorusProSettings | null,
): string | null => {
  if (!settings?.cpro_password) {
    return null;
  }

  return isEncrypted(settings.cpro_password)
    ? decrypt(settings.cpro_password)
    : settings.cpro_password;
};

export const resolveChorusTestCredentials = (
  settings: ChorusProSettings | null,
  overrides?: TestChorusConnectionDto,
): ResolvedChorusCredentials | null => {
  const login =
    overrides?.cpro_login?.trim() || settings?.cpro_login?.trim() || "";
  const password =
    overrides?.cpro_password || getStoredPassword(settings) || "";

  if (!login || !password) {
    return null;
  }

  return { login, password };
};

export const buildChorusMatchedStructure = (
  companySiret: string,
  response: ChorusUserAttachmentsResponse,
): ChorusProMatchedStructure | null => {
  const matchedStructure = (response.listeStructureRattachement || []).find(
    (structure) =>
      structure.identifiantStructure === companySiret &&
      (!structure.typeIdentifiantStructure ||
        structure.typeIdentifiantStructure === "SIREN" ||
        structure.typeIdentifiantStructure === "SIRET"),
  );

  if (!matchedStructure) {
    return null;
  }

  const services = (matchedStructure.listeServicesRattache || []).map(
    (service) => ({
      codeService: service.codeService || null,
      libelleService: service.libelleService || null,
      actif: Boolean(service.estActif),
      statutService: service.statutService || null,
      statutRattachementService: service.statutRattachementService || null,
    }),
  );

  return {
    companySiret,
    idStructureCpp: matchedStructure.idStructure ?? null,
    identifiantStructure: matchedStructure.identifiantStructure || companySiret,
    structureLabel: matchedStructure.designationStructure || null,
    userRole: matchedStructure.roleUtilisateur || null,
    userStatus: matchedStructure.statutUtilisateur || null,
    attachmentStatus: matchedStructure.statutRattachementStructure || null,
    services,
  };
};

export const buildChorusVerificationUpdate = (
  matchedStructure: ChorusProMatchedStructure | null,
): Record<string, any> => {
  if (!matchedStructure) {
    return { ...CHORUS_VERIFICATION_RESET };
  }

  return {
    id_structure_cpp: matchedStructure.idStructureCpp,
    verified_company_siret: matchedStructure.companySiret,
    verified_structure_label: matchedStructure.structureLabel,
    verified_user_role: matchedStructure.userRole,
    verified_user_status: matchedStructure.userStatus,
    verified_attachment_status: matchedStructure.attachmentStatus,
    verified_services: matchedStructure.services,
    last_verified_at: new Date().toISOString(),
  };
};

const CHORUS_ACTIVE_STATUSES = new Set(["ACTIVE", "ACTIF"]);

const normalizeChorusStatus = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

const collectUniqueStatuses = (candidates: unknown[]): string[] => {
  const statuses = candidates
    .map((candidate) => normalizeChorusStatus(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));

  return Array.from(new Set(statuses));
};

export const evaluateChorusStructureStatuses = (
  ...candidates: unknown[]
): ChorusStructureStatusEvaluation => {
  const statuses = collectUniqueStatuses(candidates);

  if (statuses.length === 0) {
    return {
      state: "unknown",
      statuses: [],
      primaryStatus: null,
    };
  }

  if (statuses.some((status) => CHORUS_ACTIVE_STATUSES.has(status))) {
    return {
      state: "active",
      statuses,
      primaryStatus: statuses[0],
    };
  }

  return {
    state: "inactive",
    statuses,
    primaryStatus: statuses[0],
  };
};

export const evaluateChorusSearchStructure = (
  structure: any,
): ChorusStructureStatusEvaluation =>
  evaluateChorusStructureStatuses(
    structure?.statut,
    structure?.statutStructure,
    structure?.parametresStructure?.statut,
    structure?.parametresStructure?.statutStructure,
  );

export const evaluateChorusConsultStructure = (
  consultResult: any,
): ChorusStructureStatusEvaluation =>
  evaluateChorusStructureStatuses(
    consultResult?.statutStructure,
    consultResult?.parametresStructure?.statutStructure,
    consultResult?.statut,
    consultResult?.parametresStructure?.statut,
  );

export const extractChorusSearchStructures = (searchResult: any): any[] =>
  searchResult?.listeStructures || searchResult?.parametresRetour?.listeStructures || [];

const normalizeChorusIdentifier = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const selectActiveChorusStructure = (
  searchResult: any,
  expectedIdentifiant?: string | null,
): any | null => {
  const structures = extractChorusSearchStructures(searchResult);
  const activeStructures = structures.filter(
    (structure: any) => evaluateChorusSearchStructure(structure).state === "active",
  );

  if (activeStructures.length === 0) {
    return null;
  }

  const normalizedExpected = normalizeChorusIdentifier(expectedIdentifiant);
  if (!normalizedExpected) {
    return activeStructures[0];
  }

  return (
    activeStructures.find(
      (structure: any) =>
        normalizeChorusIdentifier(structure?.identifiantStructure) === normalizedExpected,
    ) || activeStructures[0]
  );
};

export const extractChorusStructureId = (structure: any): number | null => {
  const rawId =
    structure?.idStructureCPP ??
    structure?.idStructureCpp ??
    structure?.idStructure ??
    structure?.parametresStructure?.idStructureCPP ??
    structure?.parametresStructure?.idStructureCpp ??
    structure?.parametresStructure?.idStructure;

  const parsed = Number(rawId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export const extractChorusStructureLabel = (structure: any): string | null =>
  structure?.designationStructure ||
  structure?.raisonSociale ||
  structure?.libelleStructure ||
  structure?.parametresStructure?.designationStructure ||
  structure?.parametresStructure?.raisonSociale ||
  null;

export const extractChorusStructureCodeDestinataire = (
  structure: any,
  fallback?: string | null,
): string | null =>
  normalizeChorusIdentifier(
    structure?.identifiantStructure ||
      structure?.codeDestinataire ||
      structure?.parametresStructure?.identifiantStructure ||
      fallback ||
      null,
  );

export const extractChorusStructureRequirements = (
  response: any,
): {
  serviceCodeRequired: boolean;
  engagementRequired: boolean;
} => ({
  serviceCodeRequired:
    response?.parametresStructure?.codeServiceObligatoire === true ||
    response?.codeServiceObligatoire === true,
  engagementRequired:
    response?.parametresStructure?.numeroEngagementObligatoire === true ||
    response?.numeroEngagementObligatoire === true,
});

export const mapActiveChorusServices = (
  servicesResult: any,
): ChorusProVerifiedService[] =>
  (servicesResult?.listeServices || servicesResult?.parametresRetour?.listeServices || [])
    .filter((service: any) => service.actif === true || service.estActif === true)
    .map((service: any) => ({
      codeService: service.codeService || null,
      libelleService: service.libelleService || null,
      actif: true,
      statutService: service.statutService || null,
      statutRattachementService: service.statutRattachementService || null,
    }));

@Injectable()
export class ChorusProService {
  private readonly logger = new Logger(ChorusProService.name);
  private cachedToken: OAuthToken | null = null;

  private readonly SANDBOX_API =
    "https://sandbox-api.piste.gouv.fr/cpro/factures";
  private readonly PROD_API = "https://api.aife.economie.gouv.fr/cpro/factures";
  private readonly SANDBOX_USERS_API =
    "https://sandbox-api.piste.gouv.fr/cpro/utilisateurs";
  private readonly PROD_USERS_API =
    "https://api.aife.economie.gouv.fr/cpro/utilisateurs";
  private readonly SANDBOX_STRUCTURES_API =
    "https://sandbox-api.piste.gouv.fr/cpro/structures";
  private readonly PROD_STRUCTURES_API =
    "https://api.aife.economie.gouv.fr/cpro/structures";
  private readonly SANDBOX_OAUTH =
    "https://sandbox-oauth.piste.gouv.fr/api/oauth/token";
  private readonly PROD_OAUTH = "https://oauth.piste.gouv.fr/api/oauth/token";

  constructor(
    private readonly configService: ConfigService,
    private readonly pdfService: PdfService,
  ) {}

  private get apiBase(): string {
    return this.configService.get("CHORUS_PRO_ENV") === "production"
      ? this.PROD_API
      : this.SANDBOX_API;
  }

  private get usersApiBase(): string {
    return this.configService.get("CHORUS_PRO_ENV") === "production"
      ? this.PROD_USERS_API
      : this.SANDBOX_USERS_API;
  }

  private get structuresApiBase(): string {
    return this.configService.get("CHORUS_PRO_ENV") === "production"
      ? this.PROD_STRUCTURES_API
      : this.SANDBOX_STRUCTURES_API;
  }

  private get oauthUrl(): string {
    return this.configService.get("CHORUS_PRO_ENV") === "production"
      ? this.PROD_OAUTH
      : this.SANDBOX_OAUTH;
  }

  // ─── OAuth Token (PISTE — global env) ─────────────────

  private async getOAuthToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expires_at > Date.now() + 60_000) {
      return this.cachedToken.access_token;
    }

    const clientId = this.configService.get("PISTE_CLIENT_ID");
    const clientSecret = this.configService.get("PISTE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        "Identifiants PISTE non configurés (variables d'environnement PISTE_CLIENT_ID / PISTE_CLIENT_SECRET)",
      );
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "openid",
    });

    const response = await fetch(this.oauthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`OAuth PISTE error: ${response.status} - ${text}`);
      throw new BadRequestException(`Erreur OAuth Chorus Pro: ${text}`);
    }

    const data = await response.json();
    this.cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    };

    return data.access_token;
  }

  // ─── Generic API call ────────────────────────────────

  private async callApi(
    endpoint: string,
    body: Record<string, any>,
    companyId: string,
    action?: string,
    invoiceId?: string,
  ): Promise<any> {
    const settings = await this.getSettingsOrFail(companyId);

    if (!settings.cpro_login || !settings.cpro_password) {
      throw new BadRequestException(
        "Compte technique Chorus Pro non configuré",
      );
    }

    const token = await this.getOAuthToken();

    // Déchiffrer le mot de passe (rétrocompat : si pas chiffré, utiliser tel quel)
    let password = settings.cpro_password;
    if (isEncrypted(password)) {
      password = decrypt(password);
    }

    const cproAccount = Buffer.from(
      `${settings.cpro_login}:${password}`,
    ).toString("base64");

    const startTime = Date.now();
    let responseStatus: number | undefined;
    let errorMessage: string | null = null;
    let responseData: any;

    try {
      const response = await fetch(`${this.apiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8",
          Accept: "application/json;charset=utf-8",
          Authorization: `Bearer ${token}`,
          "cpro-account": cproAccount,
        },
        body: JSON.stringify(body),
      });

      responseStatus = response.status;

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetail: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.message || errorJson.libelle || errorText;
        } catch {
          errorDetail = errorText;
        }
        errorMessage = `Erreur Chorus Pro (${response.status}): ${errorDetail}`;
        throw new BadRequestException(errorMessage);
      }

      responseData = await response.json();
      return responseData;
    } catch (error: any) {
      if (!errorMessage) {
        errorMessage = error.message;
      }
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      // Log the API call asynchronously (don't block the response)
      this.logApiCall(
        companyId,
        action || endpoint,
        endpoint,
        this.sanitizePayload(body),
        responseStatus,
        responseData ? this.sanitizePayload(responseData) : null,
        errorMessage,
        duration,
        invoiceId,
      ).catch((err) =>
        this.logger.error(`Failed to log API call: ${err.message}`),
      );
    }
  }

  // ─── Structures API call ─────────────────────────────

  private async callStructuresApi(
    endpoint: string,
    body: Record<string, any>,
    companyId: string,
    action?: string,
  ): Promise<any> {
    const settings = await this.getSettingsOrFail(companyId);

    if (!settings.cpro_login || !settings.cpro_password) {
      throw new BadRequestException(
        "Compte technique Chorus Pro non configuré",
      );
    }

    const token = await this.getOAuthToken();

    let password = settings.cpro_password;
    if (isEncrypted(password)) {
      password = decrypt(password);
    }

    const cproAccount = Buffer.from(
      `${settings.cpro_login}:${password}`,
    ).toString("base64");

    const startTime = Date.now();
    let responseStatus: number | undefined;
    let errorMessage: string | null = null;
    let responseData: any;

    try {
      const response = await fetch(`${this.structuresApiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8",
          Accept: "application/json;charset=utf-8",
          Authorization: `Bearer ${token}`,
          "cpro-account": cproAccount,
        },
        body: JSON.stringify(body),
      });

      responseStatus = response.status;

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetail: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.message || errorJson.libelle || errorText;
        } catch {
          errorDetail = errorText;
        }
        errorMessage = `Erreur Chorus Pro Structures (${response.status}): ${errorDetail}`;
        throw new BadRequestException(errorMessage);
      }

      responseData = await response.json();
      return responseData;
    } catch (error: any) {
      if (!errorMessage) {
        errorMessage = error.message;
      }
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      this.logApiCall(
        companyId,
        action || endpoint,
        endpoint,
        this.sanitizePayload(body),
        responseStatus,
        responseData ? this.sanitizePayload(responseData) : null,
        errorMessage,
        duration,
      ).catch((err) =>
        this.logger.error(`Failed to log Structures API call: ${err.message}`),
      );
    }
  }

  // ─── API Logging ─────────────────────────────────────

  private async logApiCall(
    companyId: string,
    action: string,
    endpoint: string,
    requestSummary: any,
    responseStatus: number | undefined,
    responseSummary: any,
    errorMessage: string | null,
    durationMs: number,
    invoiceId?: string,
  ): Promise<void> {
    const supabase = getSupabaseAdmin();
    await supabase.from("chorus_pro_logs").insert({
      company_id: companyId,
      action,
      endpoint,
      request_summary: requestSummary,
      response_status: responseStatus || null,
      response_summary: responseSummary,
      error_message: errorMessage,
      duration_ms: durationMs,
      invoice_id: invoiceId || null,
    });
  }

  private sanitizePayload(payload: any): any {
    if (!payload || typeof payload !== "object") return payload;
    const sanitized = { ...payload };
    const sensitiveKeys = [
      "cpro_password",
      "client_secret",
      "password",
      "cpro-account",
      "Authorization",
    ];
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = "***";
      }
    }
    if (typeof sanitized.fichierFacture === "string") {
      sanitized.fichierFacture = `[base64 omitted: ${sanitized.fichierFacture.length} chars]`;
    }
    if (typeof sanitized.fichierFlux === "string") {
      sanitized.fichierFlux = `[base64 omitted: ${sanitized.fichierFlux.length} chars]`;
    }
    return sanitized;
  }

  // ─── Settings ────────────────────────────────────────

  private async getCompanyOrFail(
    companyId: string,
  ): Promise<ChorusCompanyRecord> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, siren")
      .eq("id", companyId)
      .single();

    if (error || !data) {
      throw new NotFoundException("Entreprise non trouvée");
    }

    return data as ChorusCompanyRecord;
  }

  private async getStoredSettings(
    companyId: string,
  ): Promise<ChorusProSettings | null> {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("company_chorus_pro_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    return data ? (data as ChorusProSettings) : null;
  }

  private async getSettingsOrFail(
    companyId: string,
  ): Promise<ChorusProSettings> {
    const data = await this.getStoredSettings(companyId);

    if (!data) {
      throw new NotFoundException(
        "Configuration Chorus Pro non trouvée pour cette entreprise",
      );
    }
    return data;
  }

  async getSettings(
    userId: string,
    companyId: string,
  ): Promise<ChorusProSettings | null> {
    await getUserCompanyRole(userId, companyId);

    const data = await this.getStoredSettings(companyId);

    if (!data) return null;

    return maskChorusPassword(data);
  }

  async updateSettings(
    userId: string,
    companyId: string,
    dto: UpdateChorusSettingsDto,
  ): Promise<ChorusProSettings> {
    await requireRole(userId, companyId, ADMIN_ROLES);

    const supabase = getSupabaseAdmin();

    const upsertData: Record<string, any> = {
      company_id: companyId,
      updated_at: new Date().toISOString(),
    };

    if (dto.enabled !== undefined) upsertData.enabled = dto.enabled;
    if (dto.cpro_login !== undefined) upsertData.cpro_login = dto.cpro_login;
    if (dto.chorus_id_utilisateur_courant !== undefined)
      upsertData.chorus_id_utilisateur_courant =
        dto.chorus_id_utilisateur_courant;
    if (dto.chorus_id_fournisseur !== undefined)
      upsertData.chorus_id_fournisseur = dto.chorus_id_fournisseur;
    if (dto.chorus_id_service_fournisseur !== undefined)
      upsertData.chorus_id_service_fournisseur =
        dto.chorus_id_service_fournisseur;
    if (dto.chorus_code_coordonnees_bancaires_fournisseur !== undefined)
      upsertData.chorus_code_coordonnees_bancaires_fournisseur =
        dto.chorus_code_coordonnees_bancaires_fournisseur;
    if (dto.default_code_destinataire !== undefined)
      upsertData.default_code_destinataire = dto.default_code_destinataire;
    if (dto.default_code_service_executant !== undefined)
      upsertData.default_code_service_executant =
        dto.default_code_service_executant;
    if (dto.default_cadre_facturation !== undefined)
      upsertData.default_cadre_facturation = dto.default_cadre_facturation;

    // Chiffrer le mot de passe si fourni
    if (dto.cpro_password) {
      try {
        upsertData.cpro_password = encrypt(dto.cpro_password);
      } catch (error: any) {
        throw new InternalServerErrorException(
          error.message || "Configuration de chiffrement Chorus Pro invalide",
        );
      }
    }

    const { data, error } = await supabase
      .from("company_chorus_pro_settings")
      .upsert(upsertData, { onConflict: "company_id" })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(
        `Erreur lors de la mise à jour: ${error.message}`,
      );
    }

    let settings = data as ChorusProSettings;

    if (!settings.enabled) {
      const disabledUpdate = {
        connection_status: "not_configured",
        updated_at: new Date().toISOString(),
        ...CHORUS_VERIFICATION_RESET,
      };

      await supabase
        .from("company_chorus_pro_settings")
        .update(disabledUpdate)
        .eq("company_id", companyId);

      settings = {
        ...settings,
        ...disabledUpdate,
      };
    } else {
      const company = await this.getCompanyOrFail(companyId);
      const testResult = await this.testConnectionInternal(company, settings);
      const verificationUpdate = {
        connection_status: testResult.success ? "connected" : "error",
        updated_at: new Date().toISOString(),
        ...buildChorusVerificationUpdate(testResult.matchedStructure),
      };

      await supabase
        .from("company_chorus_pro_settings")
        .update(verificationUpdate)
        .eq("company_id", companyId);

      settings = {
        ...settings,
        ...verificationUpdate,
      };
    }

    return maskChorusPassword(settings);
  }

  // ─── Test Connection ─────────────────────────────────

  private async callUserApi(
    endpoint: string,
    body: Record<string, any>,
    companyId: string,
    credentials: ResolvedChorusCredentials,
    action: string,
  ): Promise<any> {
    const token = await this.getOAuthToken();
    const cproAccount = Buffer.from(
      `${credentials.login}:${credentials.password}`,
    ).toString("base64");

    const startTime = Date.now();
    let responseStatus: number | undefined;
    let errorMessage: string | null = null;
    let responseData: any;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${this.usersApiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8",
          Accept: "application/json;charset=utf-8",
          Authorization: `Bearer ${token}`,
          "cpro-account": cproAccount,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      responseStatus = response.status;

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetail: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.message || errorJson.libelle || errorText;
        } catch {
          errorDetail = errorText;
        }

        if (response.status === 401 || response.status === 403) {
          errorMessage = `Identifiants Chorus Pro invalides: ${errorDetail}`;
        } else {
          errorMessage = `Erreur Chorus Pro (${response.status}): ${errorDetail}`;
        }

        throw new BadRequestException(errorMessage);
      }

      responseData = await response.json();
      return responseData;
    } catch (error: any) {
      if (error.name === "AbortError") {
        errorMessage =
          "Délai d'attente dépassé (10s) — le serveur Chorus Pro ne répond pas";
        throw new BadRequestException(errorMessage);
      }

      if (!errorMessage) {
        errorMessage = error.message || "Erreur de connexion";
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      this.logApiCall(
        companyId,
        action,
        endpoint,
        this.sanitizePayload({
          ...body,
          cpro_login: credentials.login,
          cpro_password: "***",
        }),
        responseStatus,
        responseData ? this.sanitizePayload(responseData) : null,
        errorMessage,
        duration,
      ).catch((err) =>
        this.logger.error(`Failed to log user API call: ${err.message}`),
      );
    }
  }

  private async testConnectionInternal(
    company: ChorusCompanyRecord,
    settings: ChorusProSettings | null,
    overrides?: TestChorusConnectionDto,
  ): Promise<ChorusProTestConnectionResult> {
    if (!company.siren) {
      return {
        success: false,
        message:
          "Le SIREN de l’entreprise doit être renseigné avant de tester Chorus Pro",
        matchedStructure: null,
      };
    }

    const credentials = resolveChorusTestCredentials(settings, overrides);
    if (!credentials) {
      return {
        success: false,
        message:
          "Login et mot de passe technique requis pour tester la connexion",
        matchedStructure: null,
      };
    }

    try {
      const result = await this.callUserApi(
        "/v1/monCompte/recuperer/rattachements",
        {
          parametresRecherche: {
            nbResultatsParPage: 100,
            pageResultatDemandee: 1,
            triColonne: "IdentifiantStructure",
            triSens: "Ascendant",
          },
        },
        company.id,
        credentials,
        "testConnection",
      );

      const matchedStructure = buildChorusMatchedStructure(
        company.siren,
        result as ChorusUserAttachmentsResponse,
      );
      if (!matchedStructure) {
        return {
          success: false,
          message: `Identifiants validés, mais aucun rattachement Chorus Pro ne correspond au SIREN ${company.siren}`,
          matchedStructure: null,
        };
      }

      return {
        success: true,
        message: `Connexion réussie pour le SIREN ${company.siren}`,
        matchedStructure,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Erreur de connexion",
        matchedStructure: null,
      };
    }
  }

  async testConnection(
    userId: string,
    companyId: string,
    dto?: TestChorusConnectionDto,
  ): Promise<ChorusProTestConnectionResult> {
    await requireRole(userId, companyId, ADMIN_ROLES);

    try {
      const [company, settings] = await Promise.all([
        this.getCompanyOrFail(companyId),
        this.getStoredSettings(companyId),
      ]);
      return this.testConnectionInternal(company, settings, dto);
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Erreur de connexion",
        matchedStructure: null,
      };
    }
  }

  // ─── Structures API ─────────────────────────────────

  async rechercherStructure(
    userId: string,
    companyId: string,
    identifiant: string,
    typeIdentifiant: "SIRET" | "SIREN" = "SIRET",
  ): Promise<any> {
    await getUserCompanyRole(userId, companyId);

    return this.callStructuresApi(
      "/v1/rechercher",
      {
        structure: {
          identifiantStructure: identifiant,
          typeIdentifiantStructure: typeIdentifiant,
        },
        parametres: {
          nbResultatsParPage: 10,
          pageResultatDemandee: 1,
          triColonne: "IdentifiantStructure",
          triSens: "Ascendant",
        },
      },
      companyId,
      "rechercherStructure",
    );
  }

  /**
   * @deprecated Utiliser rechercherStructure à la place
   */
  async searchStructure(
    userId: string,
    companyId: string,
    siren: string,
  ): Promise<any> {
    return this.rechercherStructure(userId, companyId, siren, "SIREN");
  }

  async consulterStructure(
    companyId: string,
    idStructureCPP: number,
  ): Promise<any> {
    return this.callStructuresApi(
      "/v1/consulter",
      {
        idStructureCPP,
      },
      companyId,
      "consulterStructure",
    );
  }

  async rechercherServiceStructure(
    companyId: string,
    idStructure: number,
  ): Promise<any> {
    return this.callStructuresApi(
      "/v1/rechercher/services",
      {
        idStructure,
      },
      companyId,
      "rechercherServiceStructure",
    );
  }

  private deriveSupplierIdFromLogin(
    settings: ChorusProSettings,
  ): number | null {
    const match = settings.cpro_login?.match(/_(\d+)@/);
    if (!match) {
      return null;
    }

    const derived = Number(match[1]);
    return Number.isSafeInteger(derived) ? derived : null;
  }

  private resolveSupplierIdentifiers(
    settings: ChorusProSettings,
  ): ChorusSupplierIdentifiers {
    const idUtilisateurCourant = settings.chorus_id_utilisateur_courant;
    const idFournisseur =
      settings.chorus_id_fournisseur ||
      this.deriveSupplierIdFromLogin(settings) ||
      settings.id_structure_cpp;

    if (!idUtilisateurCourant) {
      throw new BadRequestException(
        "Identifiant utilisateur courant Chorus Pro non configuré",
      );
    }

    if (!idFournisseur) {
      throw new BadRequestException(
        "Identifiant fournisseur Chorus Pro non configuré",
      );
    }

    return {
      idUtilisateurCourant,
      idFournisseur,
      ...(settings.chorus_id_service_fournisseur
        ? { idServiceFournisseur: settings.chorus_id_service_fournisseur }
        : {}),
      ...(settings.chorus_code_coordonnees_bancaires_fournisseur
        ? {
            codeCoordonneesBancairesFournisseur:
              settings.chorus_code_coordonnees_bancaires_fournisseur,
          }
        : {}),
    };
  }

  private ensureSubmissionSupplierIdentifiersConfigured(
    settings: ChorusProSettings,
  ): void {
    const missingFields: string[] = [];

    if (!settings.chorus_id_utilisateur_courant) {
      missingFields.push("ID utilisateur courant");
    }

    const derivedSupplierId =
      settings.chorus_id_fournisseur ||
      this.deriveSupplierIdFromLogin(settings) ||
      settings.id_structure_cpp;
    if (!derivedSupplierId) {
      missingFields.push("ID fournisseur");
    }

    if (missingFields.length === 0) {
      return;
    }

    throw new BadRequestException(
      `Configuration Chorus Pro incomplète pour l'envoi de facture: renseignez ${missingFields.join(
        " et ",
      )} dans les paramètres de l'entreprise.`,
    );
  }

  private mapInvoicePaymentMethod(
    invoice: any,
  ): "CHEQUE" | "VIREMENT" | "ESPECE" | "AUTRE" {
    switch (invoice.payment_method) {
      case "check":
        return "CHEQUE";
      case "cash":
        return "ESPECE";
      case "bank_transfer":
        return "VIREMENT";
      default:
        return "AUTRE";
    }
  }

  private logSubmissionStage(
    stage: ChorusSubmissionStage,
    level: "log" | "warn" | "error",
    message: string,
    context: Record<string, any> = {},
  ): void {
    const serializedContext =
      Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
    this.logger[level](`[submit:${stage}] ${message}${serializedContext}`);
  }

  private buildSubmissionStageError(
    stage: ChorusSubmissionStage,
    message: string,
  ): BadRequestException {
    return new BadRequestException({
      message,
      stage,
      error: "Bad Request",
    });
  }

  private extractBadRequestMessage(error: BadRequestException): string {
    const response = error.getResponse();
    return typeof response === "string"
      ? response
      : (response as any)?.message || error.message;
  }

  private deriveStructureIdentifierType(
    identifiant: string,
  ): "SIRET" | "SIREN" {
    const normalized = identifiant.replace(/\s+/g, "");
    if (normalized.length === 9) {
      return "SIREN";
    }

    return "SIRET";
  }

  private async loadStructureServices(
    companyId: string,
    structureId: number,
  ): Promise<ChorusProVerifiedService[] | null> {
    const servicesResult = await this.rechercherServiceStructure(
      companyId,
      structureId,
    );
    const services = mapActiveChorusServices(servicesResult);
    return services.length > 0 ? services : null;
  }

  private async resolveDestinationStructureForSubmit(
    submittedBy: string,
    companyId: string,
    invoiceId: string,
    client: any,
    dto: SubmitInvoiceChorusDto,
  ): Promise<{
    structureId: number;
    structureLabel: string | null;
    codeDestinataire: string;
    serviceCodeRequired: boolean;
    engagementRequired: boolean;
  }> {
    const supabase = getSupabaseAdmin();
    const requestedCodeDestinataire = dto.codeDestinataire.trim();
    const currentStructureId = client.chorus_pro_structure_id || null;

    let resolvedStructureId = currentStructureId;
    let resolvedStructureLabel = client.chorus_pro_structure_label || null;
    let resolvedCodeDestinataire =
      requestedCodeDestinataire || client.chorus_pro_code_destinataire;
    let serviceCodeRequired = Boolean(client.chorus_pro_service_code_required);
    let engagementRequired = Boolean(client.chorus_pro_engagement_required);
    let refreshedServices: ChorusProVerifiedService[] | null | undefined;
    let consultEvaluation: ChorusStructureStatusEvaluation = {
      state: "unknown",
      statuses: [],
      primaryStatus: null,
    };
    let usedFallbackSearch = false;

    if (currentStructureId) {
      this.logSubmissionStage(
        "revalidation",
        "log",
        "Calling Chorus consulterStructure before submit",
        {
          invoiceId,
          companyId,
          clientId: client.id,
          clientStructureId: currentStructureId,
          codeDestinataire: requestedCodeDestinataire,
        },
      );

      const consultResult = await this.consulterStructure(
        companyId,
        currentStructureId,
      );
      consultEvaluation = evaluateChorusConsultStructure(consultResult);
      const consultRequirements =
        extractChorusStructureRequirements(consultResult);

      this.logSubmissionStage(
        "revalidation",
        "log",
        "Received Chorus consulterStructure response",
        {
          invoiceId,
          clientId: client.id,
          clientStructureId: currentStructureId,
          statusCandidates: consultEvaluation.statuses,
          resolvedState: consultEvaluation.state,
          primaryStatus: consultEvaluation.primaryStatus,
        },
      );

      if (consultEvaluation.state === "active") {
        resolvedStructureLabel =
          extractChorusStructureLabel(consultResult) || resolvedStructureLabel;
        resolvedCodeDestinataire =
          extractChorusStructureCodeDestinataire(
            consultResult,
            requestedCodeDestinataire,
          ) || requestedCodeDestinataire;
        serviceCodeRequired = consultRequirements.serviceCodeRequired;
        engagementRequired = consultRequirements.engagementRequired;
      } else {
        this.logSubmissionStage(
          "revalidation",
          "warn",
          consultEvaluation.state === "inactive"
            ? "Destination structure returned inactive during submit"
            : "Destination structure status inconclusive during submit",
          {
            invoiceId,
            clientId: client.id,
            clientStructureId: currentStructureId,
            statutStructure: consultEvaluation.primaryStatus,
            statusCandidates: consultEvaluation.statuses,
          },
        );
      }
    }

    if (consultEvaluation.state !== "active") {
      usedFallbackSearch = true;
      this.logSubmissionStage(
        "revalidation",
        "log",
        "Falling back to Chorus rechercherStructure before submit",
        {
          invoiceId,
          clientId: client.id,
          clientStructureId: currentStructureId,
          codeDestinataire: requestedCodeDestinataire,
          reason:
            consultEvaluation.state === "inactive"
              ? "inactive"
              : "inconclusive_or_missing_structure_id",
        },
      );

      const searchResult = await this.rechercherStructure(
        submittedBy,
        companyId,
        requestedCodeDestinataire,
        this.deriveStructureIdentifierType(requestedCodeDestinataire),
      );
      const activeStructure = selectActiveChorusStructure(
        searchResult,
        requestedCodeDestinataire,
      );

      if (!activeStructure) {
        throw this.buildSubmissionStageError(
          "revalidation",
          consultEvaluation.state === "inactive"
            ? "Échec de revalidation du destinataire Chorus Pro: la structure destinataire n'est plus active."
            : "Échec de revalidation du destinataire Chorus Pro: impossible de retrouver une structure destinataire active.",
        );
      }

      resolvedStructureId = extractChorusStructureId(activeStructure);
      if (!resolvedStructureId) {
        throw this.buildSubmissionStageError(
          "revalidation",
          "Échec de revalidation du destinataire Chorus Pro: idStructureCPP introuvable pour la structure active.",
        );
      }

      resolvedStructureLabel =
        extractChorusStructureLabel(activeStructure) || resolvedStructureLabel;
      resolvedCodeDestinataire =
        extractChorusStructureCodeDestinataire(
          activeStructure,
          requestedCodeDestinataire,
        ) || requestedCodeDestinataire;

      this.logSubmissionStage(
        "revalidation",
        "log",
        "Resolved active destination structure via rechercherStructure",
        {
          invoiceId,
          clientId: client.id,
          resolvedStructureId,
          codeDestinataire: resolvedCodeDestinataire,
          structureLabel: resolvedStructureLabel,
        },
      );

      try {
        this.logSubmissionStage(
          "revalidation",
          "log",
          "Calling Chorus consulterStructure for resolved destination structure",
          {
            invoiceId,
            clientId: client.id,
            resolvedStructureId,
          },
        );

        const resolvedConsultResult = await this.consulterStructure(
          companyId,
          resolvedStructureId,
        );
        const resolvedConsultEvaluation =
          evaluateChorusConsultStructure(resolvedConsultResult);
        const resolvedRequirements =
          extractChorusStructureRequirements(resolvedConsultResult);

        this.logSubmissionStage(
          "revalidation",
          "log",
          "Resolved destination structure consultation received",
          {
            invoiceId,
            clientId: client.id,
            resolvedStructureId,
            statusCandidates: resolvedConsultEvaluation.statuses,
            resolvedState: resolvedConsultEvaluation.state,
            primaryStatus: resolvedConsultEvaluation.primaryStatus,
          },
        );

        if (resolvedConsultEvaluation.state === "inactive") {
          throw this.buildSubmissionStageError(
            "revalidation",
            "Échec de revalidation du destinataire Chorus Pro: la structure destinataire n'est plus active.",
          );
        }

        resolvedStructureLabel =
          extractChorusStructureLabel(resolvedConsultResult) ||
          resolvedStructureLabel;
        resolvedCodeDestinataire =
          extractChorusStructureCodeDestinataire(
            resolvedConsultResult,
            resolvedCodeDestinataire,
          ) || resolvedCodeDestinataire;
        serviceCodeRequired = resolvedRequirements.serviceCodeRequired;
        engagementRequired = resolvedRequirements.engagementRequired;
      } catch (error: any) {
        if (error instanceof BadRequestException) {
          const message = this.extractBadRequestMessage(error);
          const stage = (error.getResponse() as any)?.stage;
          if (stage === "revalidation") {
            throw error;
          }

          this.logSubmissionStage(
            "revalidation",
            "warn",
            "Unable to consult resolved destination structure; continuing with known requirements",
            {
              invoiceId,
              clientId: client.id,
              resolvedStructureId,
              message,
            },
          );
        } else {
          this.logSubmissionStage(
            "revalidation",
            "warn",
            "Unexpected error while consulting resolved destination structure; continuing with known requirements",
            {
              invoiceId,
              clientId: client.id,
              resolvedStructureId,
              message: error?.message || "unknown",
            },
          );
        }
      }
    }

    if (!resolvedStructureId) {
      throw this.buildSubmissionStageError(
        "revalidation",
        "Échec de revalidation du destinataire Chorus Pro: aucun idStructureCPP exploitable.",
      );
    }

    try {
      refreshedServices = await this.loadStructureServices(
        companyId,
        resolvedStructureId,
      );
    } catch (error: any) {
      this.logSubmissionStage(
        "revalidation",
        "warn",
        "Unable to refresh Chorus destination services during submit",
        {
          invoiceId,
          clientId: client.id,
          resolvedStructureId,
          message: error?.message || "unknown",
        },
      );
    }

    const clientUpdate: Record<string, any> = {};

    if (resolvedStructureId !== client.chorus_pro_structure_id) {
      clientUpdate.chorus_pro_structure_id = resolvedStructureId;
    }
    if (resolvedStructureLabel !== client.chorus_pro_structure_label) {
      clientUpdate.chorus_pro_structure_label = resolvedStructureLabel;
    }
    if (resolvedCodeDestinataire !== client.chorus_pro_code_destinataire) {
      clientUpdate.chorus_pro_code_destinataire = resolvedCodeDestinataire;
    }
    if (
      serviceCodeRequired !== Boolean(client.chorus_pro_service_code_required)
    ) {
      clientUpdate.chorus_pro_service_code_required = serviceCodeRequired;
    }
    if (
      engagementRequired !== Boolean(client.chorus_pro_engagement_required)
    ) {
      clientUpdate.chorus_pro_engagement_required = engagementRequired;
    }
    if (refreshedServices !== undefined) {
      clientUpdate.chorus_pro_services = refreshedServices;
    }

    if (Object.keys(clientUpdate).length > 0) {
      const timestamp = new Date().toISOString();
      clientUpdate.chorus_pro_last_checked_at = timestamp;
      clientUpdate.updated_at = timestamp;

      await supabase
        .from("clients")
        .update(clientUpdate)
        .eq("id", client.id)
        .eq("company_id", companyId);

      this.logSubmissionStage(
        "revalidation",
        "log",
        "Refreshed Chorus destination metadata on client during submit",
        {
          invoiceId,
          clientId: client.id,
          resolvedStructureId,
          usedFallbackSearch,
          updatedFields: Object.keys(clientUpdate),
        },
      );
    }

    this.logSubmissionStage(
      "revalidation",
      "log",
      "Resolved Chorus destination structure for submit",
      {
        invoiceId,
        clientId: client.id,
        resolvedStructureId,
        codeDestinataire: resolvedCodeDestinataire,
        structureLabel: resolvedStructureLabel,
        serviceCodeRequired,
        engagementRequired,
        usedFallbackSearch,
      },
    );

    return {
      structureId: resolvedStructureId,
      structureLabel: resolvedStructureLabel,
      codeDestinataire: resolvedCodeDestinataire,
      serviceCodeRequired,
      engagementRequired,
    };
  }

  private async persistSubmissionAttempt(
    existingSubmissionId: string | null,
    companyId: string,
    invoiceId: string,
    submittedBy: string,
    values: Record<string, any>,
  ): Promise<any> {
    const supabase = getSupabaseAdmin();
    const payload = {
      company_id: companyId,
      invoice_id: invoiceId,
      submitted_by: submittedBy,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...values,
    };

    if (existingSubmissionId) {
      const { data, error } = await supabase
        .from("chorus_pro_submissions")
        .update(payload)
        .eq("id", existingSubmissionId)
        .select()
        .single();

      if (error || !data) {
        throw new InternalServerErrorException(
          `Erreur lors de la mise à jour de la soumission: ${error?.message || "inconnue"}`,
        );
      }

      return data;
    }

    const { data, error } = await supabase
      .from("chorus_pro_submissions")
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Erreur lors de l'enregistrement: ${error?.message || "inconnue"}`,
      );
    }

    return data;
  }

  private async depositInvoicePdf(
    companyId: string,
    invoiceId: string,
    invoice: any,
    settings: ChorusProSettings,
  ): Promise<any> {
    const supplier = this.resolveSupplierIdentifiers(settings);
    const pdf = await this.pdfService.getOrCreateInvoicePdf(
      invoice,
      invoice.created_by,
    );
    const depositPayload = {
      idUtilisateurCourant: supplier.idUtilisateurCourant,
      fichierFacture: pdf.buffer.toString("base64"),
      nomFichier: `facture-${invoice.invoice_number}.pdf`,
      formatDepot: "PDF_NON_SIGNE",
    };

    this.logSubmissionStage("deposit", "log", "Calling Chorus deposer/pdf", {
      invoiceId,
      companyId,
      idUtilisateurCourant: depositPayload.idUtilisateurCourant,
      nomFichier: depositPayload.nomFichier,
      formatDepot: depositPayload.formatDepot,
      fichierFacturePresent: Boolean(depositPayload.fichierFacture),
      fichierFactureBase64Length: depositPayload.fichierFacture.length,
      pdfFromStorage: pdf.fromStorage,
      pdfStoragePath: pdf.storagePath,
    });

    return this.callApi(
      "/v1/deposer/pdf",
      depositPayload,
      companyId,
      "depositInvoicePdf",
      invoiceId,
    );
  }

  // ─── Submit Invoice ──────────────────────────────────

  async submitInvoice(
    userId: string,
    companyId: string,
    invoiceId: string,
    dto: SubmitInvoiceChorusDto,
  ): Promise<any> {
    await requireRole(userId, companyId, ADMIN_ROLES);
    return this._doSubmit(companyId, invoiceId, dto, userId);
  }

  /**
   * Auto-submit une facture à Chorus Pro si le client a les champs Chorus Pro remplis
   * et que l'entreprise a Chorus Pro configuré. Non-bloquant : ne throw jamais.
   */
  async autoSubmitInvoice(
    companyId: string,
    invoiceId: string,
    client: any,
    userId: string,
  ): Promise<void> {
    // Vérifier que le client est éligible Chorus Pro
    if (!client?.chorus_pro_code_destinataire) {
      return;
    }
    if (client.chorus_pro_eligibility_status !== "eligible") {
      return;
    }
    if (client.client_sector !== "public") {
      return;
    }

    // Vérifier que l'entreprise a Chorus Pro configuré
    let settings: ChorusProSettings;
    try {
      settings = await this.getSettingsOrFail(companyId);
    } catch {
      return; // Pas de settings Chorus Pro = skip silencieux
    }

    if (!settings.enabled || !settings.id_structure_cpp) {
      return;
    }

    // Construire le DTO depuis les champs du client
    const dto: SubmitInvoiceChorusDto = {
      codeDestinataire: client.chorus_pro_code_destinataire,
      cadreFacturation:
        client.chorus_pro_cadre_facturation || "A1_FACTURE_FOURNISSEUR",
      codeServiceExecutant:
        client.chorus_pro_code_service_executant || undefined,
      numeroEngagement: client.chorus_pro_numero_engagement || undefined,
    };

    await this._doSubmit(companyId, invoiceId, dto, userId);
  }

  private async _doSubmit(
    companyId: string,
    invoiceId: string,
    dto: SubmitInvoiceChorusDto,
    submittedBy: string,
  ): Promise<any> {
    const supabase = getSupabaseAdmin();

    // Check no existing submission
    const { data: existing } = await supabase
      .from("chorus_pro_submissions")
      .select(
        "id, statut_chorus, identifiant_facture_cpp, piece_jointe_id, deposit_response",
      )
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      existing?.identifiant_facture_cpp &&
      !["REJETEE", "SUSPENDUE"].includes(existing.statut_chorus || "")
    ) {
      throw new BadRequestException(
        "Cette facture a déjà été soumise à Chorus Pro",
      );
    }

    // Load invoice with items and client
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .select(
        "*, items:invoice_items(*), client:clients(*), company:companies(*)",
      )
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single();

    if (invError || !invoice) {
      throw new NotFoundException("Facture non trouvée");
    }

    if (["draft", "cancelled"].includes(invoice.status)) {
      throw new BadRequestException(
        "Impossible d'envoyer un brouillon ou une facture annulée",
      );
    }

    const settings = await this.getSettingsOrFail(companyId);
    this.ensureSubmissionSupplierIdentifiersConfigured(settings);

    // Vérifier éligibilité client
    const client = invoice.client;
    if (client?.client_sector === "public") {
      if (client.chorus_pro_eligibility_status !== "eligible") {
        throw new BadRequestException(
          "Ce client n'est pas vérifié comme destinataire Chorus Pro",
        );
      }

      try {
        const destinationResolution =
          await this.resolveDestinationStructureForSubmit(
            submittedBy,
            companyId,
            invoiceId,
            client,
            dto,
          );

        if (
          destinationResolution.serviceCodeRequired &&
          !dto.codeServiceExecutant &&
          !client.chorus_pro_code_service_executant
        ) {
          throw new BadRequestException(
            "Le code service est requis pour ce destinataire Chorus Pro",
          );
        }
        if (
          destinationResolution.engagementRequired &&
          !dto.numeroEngagement &&
          !client.chorus_pro_numero_engagement
        ) {
          throw new BadRequestException(
            "Le numéro d'engagement est requis pour ce destinataire Chorus Pro",
          );
        }
      } catch (revalError: any) {
        if (revalError instanceof BadRequestException) {
          const message = this.extractBadRequestMessage(revalError);
          const stage = (revalError.getResponse() as any)?.stage;
          this.logSubmissionStage(
            "revalidation",
            "warn",
            "Submit blocked during Chorus revalidation",
            {
              invoiceId,
              clientId: client.id,
              message,
            },
          );

          if (stage === "revalidation") {
            throw revalError;
          }

          throw this.buildSubmissionStageError(
            "revalidation",
            `Échec de revalidation du destinataire Chorus Pro: ${message}`,
          );
        }
        // Erreur technique → bloquer mais ne pas dégrader le client
        this.logSubmissionStage(
          "revalidation",
          "error",
          "Unexpected error during Chorus revalidation",
          {
            invoiceId,
            clientId: client.id,
            message: revalError?.message || "unknown",
          },
        );
        throw this.buildSubmissionStageError(
          "revalidation",
          "Échec de revalidation du destinataire Chorus Pro. Réessayez ultérieurement.",
        );
      }
    }

    // For credit notes, load the parent invoice to get its number
    if (invoice.type === "credit_note" && invoice.parent_invoice_id) {
      const { data: parentInvoice } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("id", invoice.parent_invoice_id)
        .single();
      invoice.parent_invoice = parentInvoice;
    }

    if (!settings.id_structure_cpp) {
      throw new BadRequestException(
        "ID structure Chorus Pro non configuré. Recherchez d'abord votre structure.",
      );
    }

    let pieceJointeId = existing?.piece_jointe_id || null;
    let depositResult = existing?.deposit_response || null;
    let depositErrorMessage: string | null = null;
    let submissionResult: any;
    let errorMessage: string | null = null;

    if (!pieceJointeId) {
      try {
        this.logSubmissionStage(
          "deposit",
          "log",
          "Starting Chorus PDF deposit",
          {
            invoiceId,
            companyId,
            hasExistingPieceJointeId: false,
          },
        );
        depositResult = await this.depositInvoicePdf(
          companyId,
          invoiceId,
          invoice,
          settings,
        );
        pieceJointeId = depositResult?.pieceJointeId || null;

        if (!pieceJointeId) {
          throw new BadRequestException(
            "Le dépôt Chorus Pro n'a pas retourné de pieceJointeId",
          );
        }
      } catch (error: any) {
        depositErrorMessage =
          error.message || "Erreur lors du dépôt PDF Chorus Pro";
        this.logSubmissionStage(
          "deposit",
          "error",
          "Chorus PDF deposit failed",
          {
            invoiceId,
            companyId,
            message: depositErrorMessage,
          },
        );

        await this.persistSubmissionAttempt(
          existing?.id || null,
          companyId,
          invoiceId,
          submittedBy,
          {
            mode_depot: "DEPOT_PDF_API",
            piece_jointe_id: null,
            identifiant_facture_cpp: null,
            numero_facture_chorus: null,
            statut_chorus: "ERREUR",
            deposit_response: depositResult,
            deposit_error_message: depositErrorMessage,
            submission_response: null,
            error_message: depositErrorMessage,
          },
        );

        throw this.buildSubmissionStageError(
          "deposit",
          `Échec du dépôt PDF Chorus Pro: ${depositErrorMessage}`,
        );
      }
    } else {
      this.logSubmissionStage(
        "deposit",
        "log",
        "Reusing existing Chorus pieceJointeId for submit",
        {
          invoiceId,
          companyId,
          pieceJointeId,
        },
      );
    }

    const payload = this.buildSubmissionPayload(
      invoice,
      settings,
      dto,
      pieceJointeId,
    );

    try {
      this.logSubmissionStage("submit", "log", "Calling Chorus soumettre", {
        invoiceId,
        companyId,
        pieceJointeId,
        numeroFactureSaisi: payload.numeroFactureSaisi,
        modeDepot: payload.modeDepot,
      });
      submissionResult = await this.callApi(
        "/v1/soumettre",
        payload,
        companyId,
        "submitInvoice",
        invoiceId,
      );
    } catch (error: any) {
      errorMessage = error.message;
      this.logSubmissionStage("submit", "error", "Chorus soumettre failed", {
        invoiceId,
        companyId,
        pieceJointeId,
        message: errorMessage,
      });
    }

    const submission = await this.persistSubmissionAttempt(
      existing?.id || null,
      companyId,
      invoiceId,
      submittedBy,
      {
        mode_depot: "DEPOT_PDF_API",
        piece_jointe_id: pieceJointeId,
        identifiant_facture_cpp:
          submissionResult?.identifiantFactureCPP || null,
        numero_facture_chorus:
          submissionResult?.numeroFactureChorusPro ||
          depositResult?.numeroFacture ||
          null,
        statut_chorus:
          submissionResult?.statutFacture ||
          (submissionResult ? "DEPOSEE" : "ERREUR"),
        deposit_response: depositResult,
        deposit_error_message: depositErrorMessage,
        submission_response: submissionResult || null,
        error_message: errorMessage,
      },
    );

    if (errorMessage) {
      throw this.buildSubmissionStageError(
        "submit",
        `Échec de soumission Chorus Pro: ${errorMessage}`,
      );
    }

    return submission;
  }

  private buildSubmissionPayload(
    invoice: any,
    settings: ChorusProSettings,
    dto: SubmitInvoiceChorusDto,
    pieceJointeId: number,
  ): Record<string, any> {
    const items = invoice.items || [];
    const isCreditNote = invoice.type === "credit_note";
    const supplier = this.resolveSupplierIdentifiers(settings);

    // For credit notes, Chorus expects positive amounts + typeFacture: AVOIR
    const abs = (v: number) => (isCreditNote ? Math.abs(v) : v);

    // Group TVA lines
    const tvaMap = new Map<number, { ht: number; tva: number }>();
    for (const item of items) {
      const rate = item.vat_rate || 0;
      const ht = abs(item.line_total || 0);
      const tva = ht * (rate / 100);
      const existing = tvaMap.get(rate) || { ht: 0, tva: 0 };
      tvaMap.set(rate, { ht: existing.ht + ht, tva: existing.tva + tva });
    }

    const ligneTva = Array.from(tvaMap.entries()).map(
      ([rate, { ht, tva }]) => ({
        ligneTvaMontantBaseHtParTaux: Math.round(ht * 100) / 100,
        ligneTvaMontantTvaParTaux: Math.round(tva * 100) / 100,
        ligneTvaTauxManuel: rate,
      }),
    );

    const lignePoste = items.map((item: any, index: number) => ({
      lignePosteNumero: index + 1,
      lignePosteReference: item.reference || item.product_id || undefined,
      lignePosteDenomination: item.description || "",
      lignePosteQuantite: Math.abs(item.quantity || 1),
      lignePosteUnite: item.unit || undefined,
      lignePosteMontantUnitaireHT: abs(item.unit_price || 0),
      lignePosteMontantRemiseHT:
        item.discount_type || item.discount_value
          ? Math.max(
              (item.quantity || 1) * (item.unit_price || 0) -
                abs(item.line_total || 0),
              0,
            )
          : undefined,
      lignePosteTauxTvaManuel: item.vat_rate || 0,
    }));

    const references: Record<string, any> = {
      deviseFacture: "EUR",
      modePaiement: this.mapInvoicePaymentMethod(invoice),
      typeFacture: isCreditNote ? "AVOIR" : "FACTURE",
      typeTva: invoice.total_vat === 0 ? "EXONERATION" : "TVA_SUR_DEBIT",
      motifExonerationTva: invoice.total_vat === 0 ? "EXONERE" : undefined,
      numeroEngagement: dto.numeroEngagement || undefined,
    };

    // For credit notes, reference the original invoice number
    if (isCreditNote && invoice.parent_invoice_id) {
      const parentInvoice = invoice.parent_invoice;
      if (parentInvoice?.invoice_number) {
        references.numeroFactureOrigine = parentInvoice.invoice_number;
      }
    }

    const payload: Record<string, any> = {
      idUtilisateurCourant: supplier.idUtilisateurCourant,
      modeDepot: "DEPOT_PDF_API",
      numeroFactureSaisi: invoice.invoice_number,
      dateFacture: `${invoice.issue_date}T00:00:00`,
      cadreDeFacturation: {
        codeCadreFacturation: dto.cadreFacturation,
      },
      references,
      fournisseur: {
        idFournisseur: supplier.idFournisseur,
        ...(supplier.idServiceFournisseur
          ? { idServiceFournisseur: supplier.idServiceFournisseur }
          : {}),
        ...(supplier.codeCoordonneesBancairesFournisseur
          ? {
              codeCoordonneesBancairesFournisseur:
                supplier.codeCoordonneesBancairesFournisseur,
            }
          : {}),
      },
      destinataire: {
        codeDestinataire: dto.codeDestinataire,
        codeServiceExecutant: dto.codeServiceExecutant || undefined,
      },
      montantTotal: {
        montantAPayer: isCreditNote
          ? abs(invoice.total)
          : Math.max(
              abs(invoice.total) - Math.max(invoice.amount_paid || 0, 0),
              0,
            ),
        montantHtTotal: abs(invoice.subtotal),
        montantTVA: abs(invoice.total_vat),
        montantTtcTotal: abs(invoice.total),
      },
      pieceJointePrincipale: {
        pieceJointePrincipaleId: pieceJointeId,
      },
      ligneTva,
      lignePoste,
    };

    return payload;
  }

  // ─── Submission Status ───────────────────────────────

  async getSubmissionStatus(
    userId: string,
    companyId: string,
    invoiceId: string,
  ): Promise<any> {
    await getUserCompanyRole(userId, companyId);

    const supabase = getSupabaseAdmin();

    // Get latest submission for this invoice
    const { data: submission, error } = await supabase
      .from("chorus_pro_submissions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !submission) {
      return null;
    }

    // If we have an identifiant_facture_cpp, check status from Chorus Pro
    if (submission.identifiant_facture_cpp) {
      try {
        const result = await this.callApi(
          "/v1/consulter/historique",
          { identifiantFactureCPP: submission.identifiant_facture_cpp },
          companyId,
          "getStatus",
          invoiceId,
        );

        // Update status in DB
        const latestStatus =
          result?.listeStatuts?.[0]?.codeStatut || submission.statut_chorus;

        await supabase
          .from("chorus_pro_submissions")
          .update({
            statut_chorus: latestStatus,
            last_status_check_at: new Date().toISOString(),
            last_status_response: result,
            updated_at: new Date().toISOString(),
          })
          .eq("id", submission.id);

        // Sync internal invoice status if applicable
        const internalStatus = shouldSyncToInternalStatus(latestStatus);
        if (internalStatus) {
          await supabase
            .from("invoices")
            .update({
              status: internalStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", submission.invoice_id);
        }

        return {
          ...submission,
          statut_chorus: latestStatus,
          last_status_response: result,
        };
      } catch {
        // Return existing data if API call fails
        return submission;
      }
    }

    return submission;
  }

  // ─── Search Sent Invoices ────────────────────────────

  async searchSentInvoices(
    userId: string,
    companyId: string,
    params: Record<string, any>,
  ): Promise<any> {
    await getUserCompanyRole(userId, companyId);

    const settings = await this.getSettingsOrFail(companyId);
    const idFournisseur =
      settings.chorus_id_fournisseur ||
      this.deriveSupplierIdFromLogin(settings) ||
      settings.id_structure_cpp;

    if (!idFournisseur) {
      throw new BadRequestException(
        "Identifiant fournisseur Chorus Pro non configuré",
      );
    }

    return this.callApi(
      "/v1/rechercher/fournisseur",
      {
        idFournisseur,
        rechercheFactureParFournisseur: {
          ...params,
        },
      },
      companyId,
      "searchSentInvoices",
    );
  }

  // ─── Search Received Invoices ────────────────────────

  async searchReceivedInvoices(
    userId: string,
    companyId: string,
    params: Record<string, any>,
  ): Promise<any> {
    await getUserCompanyRole(userId, companyId);

    const settings = await this.getSettingsOrFail(companyId);

    return this.callApi(
      "/v1/rechercher/recipiendaire",
      {
        idDestinataire: settings.id_structure_cpp,
        rechercheFactureParRecipiendaire: {
          ...params,
        },
      },
      companyId,
      "searchReceivedInvoices",
    );
  }

  // ─── Get Received Invoice Detail ─────────────────────

  async getReceivedInvoiceDetail(
    userId: string,
    companyId: string,
    idFacture: number,
  ): Promise<any> {
    await getUserCompanyRole(userId, companyId);

    return this.callApi(
      "/v1/consulter/recipiendaire",
      {
        identifiantFactureCPP: idFacture,
      },
      companyId,
      "getReceivedInvoiceDetail",
    );
  }

  // ─── Download Invoices ───────────────────────────────

  async downloadInvoices(
    userId: string,
    companyId: string,
    ids: number[],
    format: string = "PDF",
  ): Promise<any> {
    await getUserCompanyRole(userId, companyId);

    return this.callApi(
      "/v1/telecharger/groupe",
      {
        listeFacture: ids.map((id) => ({ identifiantFactureCPP: id })),
        format,
      },
      companyId,
      "downloadInvoices",
    );
  }

  // ─── Process Received Invoice ────────────────────────

  async processReceivedInvoice(
    userId: string,
    companyId: string,
    idFacture: number,
    action: string,
  ): Promise<any> {
    await requireRole(userId, companyId, ADMIN_ROLES);

    return this.callApi(
      "/v1/traiter/recue",
      {
        identifiantFactureCPP: idFacture,
        action,
      },
      companyId,
      "processReceivedInvoice",
    );
  }
}
