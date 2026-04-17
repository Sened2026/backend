import { getSupabaseAdmin } from '../../config/supabase.config';
type SubscriptionOwnerCompanyRole = 'merchant_admin' | 'accountant';

export const SUSPENDED_SUBSCRIPTION_STATUSES = ['past_due', 'incomplete', 'cancelled'];

export type EffectiveSubscriptionScope = 'self' | 'owner' | 'none';

interface CompanyEmbed {
    owner_id: string | null;
    accountant_company_id: string | null;
}

interface MembershipRow {
    company_id: string;
    is_default: boolean;
    role: string;
    company: CompanyEmbed | CompanyEmbed[] | null;
}

function normalizeCompanyEmbed(
    company: CompanyEmbed | CompanyEmbed[] | null | undefined,
): CompanyEmbed | null {
    if (company == null) {
        return null;
    }

    return Array.isArray(company) ? company[0] ?? null : company;
}

export interface UserMembershipContext {
    company_id: string;
    is_default: boolean;
    role: string;
    owner_user_id: string | null;
    is_owner: boolean;
    is_company_linked_to_accountant_cabinet: boolean;
}

export interface EffectiveSubscriptionTarget {
    scope: EffectiveSubscriptionScope;
    company_id: string | null;
    owner_user_id: string | null;
    subscription_company_id: string | null;
    company_owner_role: SubscriptionOwnerCompanyRole | null;
    /** Société marchande liée à un cabinet (facturation gérée comme l'espace comptable, plan free autorisé). */
    is_selected_company_linked_to_accountant_cabinet: boolean;
    /** Vrai si l'utilisateur courant est administrateur marchand invité (non propriétaire) de la société sélectionnée. */
    is_invited_merchant_admin: boolean;
    can_manage_billing: boolean;
    has_any_active_company_subscription: boolean;
    has_company_access: boolean;
    memberships: UserMembershipContext[];
}

export interface SubscriptionBillingOptions {
    /** true si la société courante a un cabinet référent (entreprise cliente de l'expert). */
    isCompanyLinkedToAccountantCabinet?: boolean;
}

function canMembershipManageBilling(membership: UserMembershipContext | null): boolean {
    return membership?.is_owner === true && membership.role === 'merchant_admin';
}

function normalizeCompanyId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }

    if (Array.isArray(value)) {
        const firstString = value.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
        return firstString ?? null;
    }

    return null;
}

export function getRequestCompanyId(request: any): string | null {
    return normalizeCompanyId(
        request?.params?.companyId
        ?? request?.params?.company_id
        ?? request?.headers?.['x-company-id'],
    );
}

export function hasUsableSubscription(
    subscription: { status?: string | null; plan_id?: string | null } | null | undefined,
): boolean {
    if (!subscription?.plan_id) {
        return false;
    }

    return !SUSPENDED_SUBSCRIPTION_STATUSES.includes(subscription.status || '');
}

function getPlanSlug(
    subscription: any,
): string | null {
    return subscription?.subscription_plans?.slug
        ?? subscription?.plan?.slug
        ?? subscription?.plan_slug
        ?? null;
}

export function hasUsableSubscriptionForCompanyOwnerRole(
    subscription: any,
    companyOwnerRole: SubscriptionOwnerCompanyRole | null,
    options?: SubscriptionBillingOptions,
): boolean {
    if (companyOwnerRole === 'accountant') {
        return true;
    }

    if (!hasUsableSubscription(subscription)) {
        return false;
    }

    if (companyOwnerRole === 'merchant_admin' && getPlanSlug(subscription) === 'free') {
        return false;
    }

    return true;
}

export async function resolveEffectiveSubscriptionTarget(
    userId: string,
    explicitCompanyId?: string | null,
): Promise<EffectiveSubscriptionTarget> {
    const supabase = getSupabaseAdmin();
    const normalizedCompanyId = explicitCompanyId || null;

    const { data: membershipsData } = await supabase
        .from('user_companies')
        .select(`
            company_id,
            is_default,
            role,
            company:companies(owner_id, accountant_company_id)
        `)
        .eq('user_id', userId);

    interface BaseMembership {
        company_id: string;
        is_default: boolean;
        role: string;
        owner_user_id: string | null;
        is_owner: boolean;
        accountant_company_id: string | null;
    }

    const baseMemberships: BaseMembership[] = (membershipsData || []).map((membership: MembershipRow) => {
        const co = normalizeCompanyEmbed(membership.company);
        const ownerUserId = co?.owner_id || null;
        return {
            company_id: membership.company_id,
            is_default: membership.is_default,
            role: membership.role,
            owner_user_id: ownerUserId,
            is_owner: ownerUserId === userId,
            accountant_company_id: co?.accountant_company_id ?? null,
        };
    });

    const memberships: UserMembershipContext[] = baseMemberships.map((m) => ({
        company_id: m.company_id,
        is_default: m.is_default,
        role: m.role,
        owner_user_id: m.owner_user_id,
        is_owner: m.is_owner,
        is_company_linked_to_accountant_cabinet: Boolean(m.accountant_company_id),
    }));

    const companyIds = [...new Set(
        memberships.map((membership: UserMembershipContext) => membership.company_id),
    )];

    const ownerRoleByCompanyId = new Map<string, SubscriptionOwnerCompanyRole>();
    if (companyIds.length > 0) {
        const { data: ownerRelations } = await supabase
            .from('user_companies')
            .select('company_id, user_id, role')
            .in('company_id', companyIds)
            .in('role', ['merchant_admin', 'accountant']);

        for (const relation of ownerRelations || []) {
            const membership = memberships.find(
                (item) =>
                    item.company_id === relation.company_id
                    && item.owner_user_id === relation.user_id,
            );
            if (membership && !ownerRoleByCompanyId.has(relation.company_id)) {
                ownerRoleByCompanyId.set(relation.company_id, relation.role as SubscriptionOwnerCompanyRole);
            }
        }
    }

    let hasAnyActiveCompanySubscription = false;
    if (companyIds.length > 0) {
        const { data: companySubscriptions } = await supabase
            .from('subscriptions')
            .select('company_id, status, plan_id, subscription_plans(slug)')
            .in('company_id', companyIds);

        const subscriptionByCompanyId = new Map<string, any>();
        for (const subscription of companySubscriptions || []) {
            if (subscription.company_id) {
                subscriptionByCompanyId.set(subscription.company_id, subscription);
            }
        }

        hasAnyActiveCompanySubscription = memberships.some((membership: UserMembershipContext) =>
            hasUsableSubscriptionForCompanyOwnerRole(
                subscriptionByCompanyId.get(membership.company_id),
                ownerRoleByCompanyId.get(membership.company_id) || null,
                {
                    isCompanyLinkedToAccountantCabinet: membership.is_company_linked_to_accountant_cabinet,
                },
            ),
        );
    }

    const selectedMembership = normalizedCompanyId
        ? memberships.find((membership: UserMembershipContext) => membership.company_id === normalizedCompanyId) || null
        : memberships.find((membership: UserMembershipContext) => membership.is_default) || memberships[0] || null;

    if (normalizedCompanyId && !selectedMembership) {
        return {
            scope: 'none',
            company_id: normalizedCompanyId,
            owner_user_id: null,
            subscription_company_id: null,
            company_owner_role: null,
            is_selected_company_linked_to_accountant_cabinet: false,
            is_invited_merchant_admin: false,
            can_manage_billing: false,
            has_any_active_company_subscription: hasAnyActiveCompanySubscription,
            has_company_access: false,
            memberships,
        };
    }

    // Si sélection explicite, ne pas chercher d'autres sociétés possédées
    const ownedMembership = normalizedCompanyId
        ? (selectedMembership?.is_owner ? selectedMembership : null)
        : (selectedMembership?.is_owner
            ? selectedMembership
            : memberships.find((membership: UserMembershipContext) => membership.is_owner) || null);

    if (ownedMembership) {
        return {
            scope: 'self',
            company_id: ownedMembership.company_id,
            owner_user_id: userId,
            subscription_company_id: ownedMembership.company_id,
            company_owner_role: ownerRoleByCompanyId.get(ownedMembership.company_id) || (ownedMembership.role as SubscriptionOwnerCompanyRole),
            is_selected_company_linked_to_accountant_cabinet: ownedMembership.is_company_linked_to_accountant_cabinet,
            is_invited_merchant_admin: false,
            can_manage_billing: canMembershipManageBilling(ownedMembership),
            has_any_active_company_subscription: hasAnyActiveCompanySubscription,
            has_company_access: true,
            memberships,
        };
    }

    if (selectedMembership?.owner_user_id) {
        const selectedOwnerRole = ownerRoleByCompanyId.get(selectedMembership.company_id) || null;
        const isInvitedMerchantAdmin =
            selectedMembership.role === 'merchant_admin'
            && !selectedMembership.is_owner
            && selectedOwnerRole === 'merchant_admin';

        return {
            scope: 'owner',
            company_id: selectedMembership.company_id,
            owner_user_id: selectedMembership.owner_user_id,
            subscription_company_id: selectedMembership.company_id,
            company_owner_role: selectedOwnerRole,
            is_selected_company_linked_to_accountant_cabinet: selectedMembership.is_company_linked_to_accountant_cabinet,
            is_invited_merchant_admin: isInvitedMerchantAdmin,
            can_manage_billing: false,
            has_any_active_company_subscription: hasAnyActiveCompanySubscription,
            has_company_access: true,
            memberships,
        };
    }

    return {
        scope: memberships.length > 0 ? 'none' : 'self',
        company_id: selectedMembership?.company_id || null,
        owner_user_id: memberships.length > 0 ? null : userId,
        subscription_company_id: null,
        company_owner_role: null,
        is_selected_company_linked_to_accountant_cabinet: selectedMembership?.is_company_linked_to_accountant_cabinet ?? false,
        is_invited_merchant_admin: false,
        can_manage_billing: memberships.length === 0,
        has_any_active_company_subscription: hasAnyActiveCompanySubscription,
        has_company_access: true,
        memberships,
    };
}
