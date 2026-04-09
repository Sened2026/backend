import { ForbiddenException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.config';

export type CompanyRole =
    | 'merchant_admin'
    | 'merchant_consultant'
    | 'accountant'
    | 'accountant_consultant'
    | 'superadmin';

export type CompanyOwnerRole = 'merchant_admin' | 'accountant';

export const ADMIN_ROLES: CompanyRole[] = ['merchant_admin', 'accountant'];
export const MERCHANT_ROLES: CompanyRole[] = ['merchant_admin', 'merchant_consultant'];
export const ACCOUNTANT_ROLES: CompanyRole[] = ['accountant', 'accountant_consultant'];
export const ALL_ROLES: CompanyRole[] = [
    'merchant_admin',
    'merchant_consultant',
    'accountant',
    'accountant_consultant',
    'superadmin',
];

export const ROLE_LABELS: Record<CompanyRole, string> = {
    merchant_admin: 'Administrateur',
    merchant_consultant: 'Collaborateur',
    accountant: 'Expert-comptable',
    accountant_consultant: 'Collaborateur comptable',
    superadmin: 'Superadmin',
};

export interface UserCompanyMembership {
    role: CompanyRole;
}

export interface UserCompanyAccessContext {
    role: CompanyRole;
    companyOwnerRole: CompanyOwnerRole;
    companyOwnerId: string | null;
    isCabinet: boolean;
    isMerchantCompany: boolean;
}

function normalizeCompanyOwnerRole(role: string | null | undefined): CompanyOwnerRole {
    return role === 'accountant' ? 'accountant' : 'merchant_admin';
}

export function getRootSuperadminEmail(): string | null {
    const normalizedEmail = process.env.SUPERADMIN_ROOT_EMAIL?.trim().toLowerCase();

    return normalizedEmail || null;
}

export function isRootSuperadminEmail(email: string | null | undefined): boolean {
    const rootSuperadminEmail = getRootSuperadminEmail();
    const normalizedEmail = email?.trim().toLowerCase();

    return Boolean(rootSuperadminEmail && normalizedEmail && normalizedEmail === rootSuperadminEmail);
}

export function canInviteSuperadminRole(
    inviterEmail: string | null | undefined,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return companyOwnerRole === 'merchant_admin' && isRootSuperadminEmail(inviterEmail);
}

/**
 * Checks that the user belongs to the company and returns their role.
 * Throws ForbiddenException if the user has no membership.
 */
export async function getUserCompanyRole(
    userId: string,
    companyId: string,
): Promise<CompanyRole> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('user_companies')
        .select('role')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .single();

    if (error || !data) {
        throw new ForbiddenException(
            "Vous n'avez pas accès à cette entreprise",
        );
    }

    return data.role as CompanyRole;
}

/**
 * Returns the membership role together with the company owner role,
 * which defines whether the selected company is a merchant company or a firm.
 */
export async function getUserCompanyAccessContext(
    userId: string,
    companyId: string,
): Promise<UserCompanyAccessContext> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('user_companies')
        .select(`
            role,
            company:companies(owner_id)
        `)
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .single();

    if (error || !data) {
        throw new ForbiddenException(
            "Vous n'avez pas accès à cette entreprise",
        );
    }

    const role = data.role as CompanyRole;
    const companyOwnerId = data.company?.owner_id || null;

    let companyOwnerRole = normalizeCompanyOwnerRole(role);

    if (companyOwnerId && companyOwnerId !== userId) {
        const { data: ownerRelation } = await supabase
            .from('user_companies')
            .select('role')
            .eq('user_id', companyOwnerId)
            .eq('company_id', companyId)
            .maybeSingle();

        companyOwnerRole = normalizeCompanyOwnerRole(ownerRelation?.role);
    }

    return {
        role,
        companyOwnerRole,
        companyOwnerId,
        isCabinet: companyOwnerRole === 'accountant',
        isMerchantCompany: companyOwnerRole === 'merchant_admin',
    };
}

/**
 * Checks that the user has one of the allowed roles for the company.
 * Returns the role if allowed, throws ForbiddenException otherwise.
 */
export async function requireRole(
    userId: string,
    companyId: string,
    allowedRoles: CompanyRole[],
): Promise<CompanyRole> {
    const role = await getUserCompanyRole(userId, companyId);

    if (!allowedRoles.includes(role)) {
        throw new ForbiddenException(
            "Vous n'avez pas les permissions nécessaires pour cette action",
        );
    }

    return role;
}

export function canManageCompanyAsAdmin(
    role: CompanyRole,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return companyOwnerRole === 'accountant'
        ? role === 'accountant'
        : role === 'merchant_admin';
}

export function canManageMembers(
    role: CompanyRole,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return canManageCompanyAsAdmin(role, companyOwnerRole);
}

export function canWriteCompanyDocuments(
    role: CompanyRole,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return companyOwnerRole === 'accountant'
        ? ACCOUNTANT_ROLES.includes(role)
        : MERCHANT_ROLES.includes(role);
}

export function canReadCompanyDocuments(
    role: CompanyRole,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return companyOwnerRole === 'accountant'
        ? ACCOUNTANT_ROLES.includes(role)
        : MERCHANT_ROLES.includes(role) || role === 'superadmin';
}

export function canDeleteCompanyDocuments(
    role: CompanyRole,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return canManageCompanyAsAdmin(role, companyOwnerRole);
}

export function canCreateCompanyCreditNote(
    role: CompanyRole,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return canManageCompanyAsAdmin(role, companyOwnerRole);
}

export function canWriteCompanyCatalog(
    role: CompanyRole,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return companyOwnerRole === 'accountant'
        ? ACCOUNTANT_ROLES.includes(role)
        : role === 'merchant_admin';
}

export function canViewCompanyDraftDocuments(
    role: CompanyRole,
    companyOwnerRole: CompanyOwnerRole,
): boolean {
    return companyOwnerRole === 'accountant'
        ? ACCOUNTANT_ROLES.includes(role)
        : MERCHANT_ROLES.includes(role) || role === 'superadmin';
}

export function getInvitableRolesForCompanyType(
    companyOwnerRole: CompanyOwnerRole,
): CompanyRole[] {
    return companyOwnerRole === 'accountant'
        ? ['accountant', 'accountant_consultant']
        : ['merchant_admin', 'merchant_consultant'];
}
