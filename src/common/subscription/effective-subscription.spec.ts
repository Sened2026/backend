import {
    hasUsableSubscriptionForCompanyOwnerRole,
} from './effective-subscription';

describe('hasUsableSubscriptionForCompanyOwnerRole', () => {
    const activeFreeSubscription = {
        plan_id: 'p1',
        status: 'active',
        subscription_plans: { slug: 'free' },
    };

    const activePaidSubscription = {
        plan_id: 'p2',
        status: 'active',
        subscription_plans: { slug: 'essentiel' },
    };

    it('blocks merchant_admin with free plan when not cabinet-linked', () => {
        expect(
            hasUsableSubscriptionForCompanyOwnerRole(activeFreeSubscription, 'merchant_admin'),
        ).toBe(false);
    });

    it('keeps merchant_admin with free plan blocked even when linked to an accountant cabinet', () => {
        expect(
            hasUsableSubscriptionForCompanyOwnerRole(activeFreeSubscription, 'merchant_admin', {
                isCompanyLinkedToAccountantCabinet: true,
            }),
        ).toBe(false);
    });

    it('allows merchant_admin with paid plan', () => {
        expect(
            hasUsableSubscriptionForCompanyOwnerRole(activePaidSubscription, 'merchant_admin'),
        ).toBe(true);
    });

    it('allows accountant with free plan', () => {
        expect(
            hasUsableSubscriptionForCompanyOwnerRole(activeFreeSubscription, 'accountant'),
        ).toBe(true);
    });

    it('allows accountant without explicit subscription plan', () => {
        expect(
            hasUsableSubscriptionForCompanyOwnerRole(
                { plan_id: null, status: 'active' },
                'accountant',
            ),
        ).toBe(true);
    });

    it('rejects when subscription has no plan', () => {
        expect(
            hasUsableSubscriptionForCompanyOwnerRole(
                { plan_id: null, status: 'active' },
                'merchant_admin',
                { isCompanyLinkedToAccountantCabinet: true },
            ),
        ).toBe(false);
    });
});
