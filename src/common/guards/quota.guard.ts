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

        if (effectiveTarget.is_invited_merchant_admin) {
            return true;
        }

        const subscriptionCompanyId = effectiveTarget.subscription_company_id;
        if (!subscriptionCompanyId) {
            return true;
        }

        const supabase = getSupabaseAdmin();

        // Get company subscription with plan limits
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('plan_id, subscription_plans(*)')
            .eq('company_id', subscriptionCompanyId)
            .maybeSingle();

        // No subscription → no quota enforcement
        if (!subscription?.subscription_plans) return true;

        const plan = subscription.subscription_plans as any;

        if (quotaType === 'max_quotes_per_month') {
            const limit = plan.max_quotes_per_month;
            if (!limit) return true; // null = unlimited

            // Count quotes created this month for the selected company
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const { count } = await supabase
                .from('quotes')
                .select('*', { count: 'exact', head: true })
                .eq('company_id', subscriptionCompanyId)
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

            const { count } = await supabase
                .from('invoices')
                .select('*', { count: 'exact', head: true })
                .eq('company_id', subscriptionCompanyId)
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
