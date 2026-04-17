import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { SKIP_SUBSCRIPTION_CHECK_KEY } from '../decorators/skip-subscription-check.decorator';
import {
    getRequestCompanyId,
    hasUsableSubscriptionForCompanyOwnerRole,
    resolveEffectiveSubscriptionTarget,
} from '../subscription/effective-subscription';

@Injectable()
export class SubscriptionGuard implements CanActivate {
    private readonly logger = new Logger(SubscriptionGuard.name);

    constructor(private reflector: Reflector) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check @SkipSubscriptionCheck() on handler or class
        const skip = this.reflector.getAllAndOverride<boolean>(
            SKIP_SUBSCRIPTION_CHECK_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (skip) return true;

        const request = context.switchToHttp().getRequest();
        const method = request.method?.toUpperCase();
        const requestPath = `${request.originalUrl || request.url || ''}`.toLowerCase();

        // Read-only methods always pass
        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            return true;
        }

        const userId = request.user?.id;
        if (!userId) return true;
        // Allow company creation first, subscription comes immediately after.
        if (method === 'POST' && requestPath.endsWith('/companies')) {
            return true;
        }

        const companyId = getRequestCompanyId(request);
        const effectiveTarget = await resolveEffectiveSubscriptionTarget(userId, companyId);

        if (companyId && !effectiveTarget.has_company_access) {
            return true;
        }

        const supabase = getSupabaseAdmin();
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('user_id, company_id, status, plan_id, subscription_plans(slug)')
            .eq('company_id', effectiveTarget.subscription_company_id || '')
            .maybeSingle();

        if (effectiveTarget.is_invited_merchant_admin) {
            request.subscription = subscription;
            request.subscriptionScope = effectiveTarget.scope;
            request.subscriptionOwnerUserId = effectiveTarget.owner_user_id;
            return true;
        }

        // No subscription → block writes (abonnement requis)
        if (!hasUsableSubscriptionForCompanyOwnerRole(
            subscription,
            effectiveTarget.company_owner_role,
            {
                isCompanyLinkedToAccountantCabinet:
                    effectiveTarget.is_selected_company_linked_to_accountant_cabinet,
            },
        )) {
            throw new ForbiddenException(
                'Abonnement requis. Souscrivez à un forfait pour utiliser l\'application.',
            );
        }

        const hasCabinetMembership = effectiveTarget.memberships.some((membership) =>
            membership.role === 'accountant' || membership.role === 'accountant_consultant',
        );

        if (
            companyId
            && hasCabinetMembership
            && effectiveTarget.company_owner_role === 'merchant_admin'
            && effectiveTarget.is_selected_company_linked_to_accountant_cabinet
        ) {
            this.logger.warn(
                JSON.stringify({
                    event: 'subscription_guard_linked_merchant_write',
                    userId,
                    companyId,
                    scope: effectiveTarget.scope,
                    ownerUserId: effectiveTarget.owner_user_id,
                }),
            );
        }

        request.subscription = subscription;
        request.subscriptionScope = effectiveTarget.scope;
        request.subscriptionOwnerUserId = effectiveTarget.owner_user_id;
        return true;
    }
}
