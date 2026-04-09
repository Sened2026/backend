import { buildSubscriptionMemberUsage } from './subscription.service';

describe('buildSubscriptionMemberUsage', () => {
    it('includes pending merchant invitations in billable member counts', () => {
        expect(
            buildSubscriptionMemberUsage(1, 2, 'merchant_admin', 1),
        ).toEqual({
            total_members: 1,
            extra_members: 0,
            pending_invitations: 2,
            billable_members: 3,
            billable_extra_members: 2,
        });
    });

    it('keeps the same billable add-on count when a pending invitation becomes an active member', () => {
        const pendingInvitationUsage = buildSubscriptionMemberUsage(
            1,
            1,
            'merchant_admin',
            1,
        );
        const acceptedInvitationUsage = buildSubscriptionMemberUsage(
            2,
            0,
            'merchant_admin',
            2,
        );

        expect(pendingInvitationUsage.billable_extra_members).toBe(1);
        expect(acceptedInvitationUsage.billable_extra_members).toBe(1);
        expect(pendingInvitationUsage.billable_members).toBe(2);
        expect(acceptedInvitationUsage.billable_members).toBe(2);
    });

    it('does not bill cabinet invitations as merchant add-ons', () => {
        expect(
            buildSubscriptionMemberUsage(3, 2, 'accountant', 3),
        ).toEqual({
            total_members: 3,
            extra_members: 2,
            pending_invitations: 2,
            billable_members: 3,
            billable_extra_members: 0,
        });
    });
});
