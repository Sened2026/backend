import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { CHECK_QUOTA_KEY } from '../decorators/check-quota.decorator';
import {
    getRequestCompanyId,
    resolveEffectiveSubscriptionTarget,
} from '../subscription/effective-subscription';

@Injectable()
export class QuotaGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    private async getOwnedMerchantCompanyIds(supabase: any, ownerUserId: string): Promise<string[]> {
        const { data: ownerRelations } = await supabase
            .from('user_companies')
            .select('company_id, company:companies(owner_id)')
            .eq('user_id', ownerUserId)
            .eq('role', 'merchant_admin');

        return (ownerRelations || [])
            .filter((relation: any) => relation.company?.owner_id === ownerUserId)
            .map((relation: any) => relation.company_id);
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const quotaType = this.reflector.get<string>(
            CHECK_QUOTA_KEY,
            context.getHandler(),
        );
        if (!quotaType) return true;

        const request = context.switchToHttp().getRequest();
        const userId = request.user?.id;
        if (!userId) return true;
        const companyId = getRequestCompanyId(request);
        const effectiveTarget = await resolveEffectiveSubscriptionTarget(userId, companyId);

        if (companyId && !effectiveTarget.has_company_access) {
            return true;
        }

        const subscriptionUserId = effectiveTarget.subscription_user_id || userId;
        const ownerUserId = effectiveTarget.owner_user_id || subscriptionUserId;

        const supabase = getSupabaseAdmin();

        // Get user subscription with plan limits
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('plan_id, subscription_plans(*)')
            .eq('user_id', subscriptionUserId)
            .maybeSingle();

        // No subscription → no quota enforcement
        if (!subscription?.subscription_plans) return true;

        const plan = subscription.subscription_plans as any;

        if (quotaType === 'max_quotes_per_month') {
            const limit = plan.max_quotes_per_month;
            if (!limit) return true; // null = unlimited

            // Count quotes created this month across all user's companies
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const companyIds = await this.getOwnedMerchantCompanyIds(supabase, ownerUserId);
            if (companyIds.length === 0) return true;

            const { count } = await supabase
                .from('quotes')
                .select('*', { count: 'exact', head: true })
                .in('company_id', companyIds)
                .gte('created_at', startOfMonth.toISOString());

            if ((count || 0) >= limit) {
                throw new ForbiddenException(
                    `Limite atteinte : votre plan "${plan.name}" autorise ${limit} devis par mois.`,
                );
            }
        }

        if (quotaType === 'max_invoices_per_month') {
            const limit = plan.max_invoices_per_month;
            if (!limit) return true; // null = unlimited

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const companyIds = await this.getOwnedMerchantCompanyIds(supabase, ownerUserId);
            if (companyIds.length === 0) return true;

            const { count } = await supabase
                .from('invoices')
                .select('*', { count: 'exact', head: true })
                .in('company_id', companyIds)
                .gte('created_at', startOfMonth.toISOString());

            if ((count || 0) >= limit) {
                throw new ForbiddenException(
                    `Limite atteinte : votre plan "${plan.name}" autorise ${limit} factures par mois.`,
                );
            }
        }

        return true;
    }
}
