import {
    canInviteSuperadminRole,
    canCreateCompanyCreditNote,
    canDeleteCompanyDocuments,
    canManageCompanyAsAdmin,
    canManageMembers,
    canReadCompanyDocuments,
    canViewCompanyDraftDocuments,
    canWriteCompanyCatalog,
    canWriteCompanyDocuments,
    getInvitableRolesForCompanyType,
} from './roles';

describe('company access matrix', () => {
    const originalRootSuperadminEmail = process.env.SUPERADMIN_ROOT_EMAIL;

    afterEach(() => {
        if (originalRootSuperadminEmail === undefined) {
            delete process.env.SUPERADMIN_ROOT_EMAIL;
            return;
        }

        process.env.SUPERADMIN_ROOT_EMAIL = originalRootSuperadminEmail;
    });

    describe('cabinet companies', () => {
        it('grants standard document and catalog write access to accountant members', () => {
            expect(canWriteCompanyDocuments('accountant', 'accountant')).toBe(true);
            expect(canWriteCompanyDocuments('accountant_consultant', 'accountant')).toBe(true);
            expect(canWriteCompanyCatalog('accountant', 'accountant')).toBe(true);
            expect(canWriteCompanyCatalog('accountant_consultant', 'accountant')).toBe(true);
        });

        it('reserves admin and credit-note permissions to the expert-comptable', () => {
            expect(canManageCompanyAsAdmin('accountant', 'accountant')).toBe(true);
            expect(canManageCompanyAsAdmin('accountant_consultant', 'accountant')).toBe(false);
            expect(canManageMembers('accountant', 'accountant')).toBe(true);
            expect(canManageMembers('accountant_consultant', 'accountant')).toBe(false);
            expect(canDeleteCompanyDocuments('accountant', 'accountant')).toBe(true);
            expect(canDeleteCompanyDocuments('accountant_consultant', 'accountant')).toBe(false);
            expect(canCreateCompanyCreditNote('accountant', 'accountant')).toBe(true);
            expect(canCreateCompanyCreditNote('accountant_consultant', 'accountant')).toBe(false);
        });

        it('keeps draft visibility enabled for cabinet members', () => {
            expect(canViewCompanyDraftDocuments('accountant', 'accountant')).toBe(true);
            expect(canViewCompanyDraftDocuments('accountant_consultant', 'accountant')).toBe(true);
        });

        it('limits cabinet invitations to accounting roles', () => {
            expect(getInvitableRolesForCompanyType('accountant')).toEqual([
                'accountant',
                'accountant_consultant',
            ]);
        });
    });

    describe('merchant companies', () => {
        it('preserves existing merchant document permissions', () => {
            expect(canWriteCompanyDocuments('merchant_admin', 'merchant_admin')).toBe(true);
            expect(canWriteCompanyDocuments('merchant_consultant', 'merchant_admin')).toBe(true);
            expect(canWriteCompanyDocuments('accountant', 'merchant_admin')).toBe(false);
            expect(canWriteCompanyDocuments('accountant_consultant', 'merchant_admin')).toBe(false);
            expect(canWriteCompanyDocuments('superadmin', 'merchant_admin')).toBe(false);
        });

        it('allows read-only document access to superadmin on merchant companies', () => {
            expect(canReadCompanyDocuments('merchant_admin', 'merchant_admin')).toBe(true);
            expect(canReadCompanyDocuments('merchant_consultant', 'merchant_admin')).toBe(true);
            expect(canReadCompanyDocuments('superadmin', 'merchant_admin')).toBe(true);
            expect(canReadCompanyDocuments('accountant', 'merchant_admin')).toBe(false);
            expect(canReadCompanyDocuments('accountant_consultant', 'merchant_admin')).toBe(false);
        });

        it('keeps catalog writes restricted to merchant admins', () => {
            expect(canWriteCompanyCatalog('merchant_admin', 'merchant_admin')).toBe(true);
            expect(canWriteCompanyCatalog('merchant_consultant', 'merchant_admin')).toBe(false);
            expect(canWriteCompanyCatalog('accountant', 'merchant_admin')).toBe(false);
            expect(canWriteCompanyCatalog('accountant_consultant', 'merchant_admin')).toBe(false);
        });

        it('blocks accountants from merchant drafts and credit notes', () => {
            expect(canViewCompanyDraftDocuments('merchant_admin', 'merchant_admin')).toBe(true);
            expect(canViewCompanyDraftDocuments('merchant_consultant', 'merchant_admin')).toBe(true);
            expect(canViewCompanyDraftDocuments('superadmin', 'merchant_admin')).toBe(true);
            expect(canViewCompanyDraftDocuments('accountant', 'merchant_admin')).toBe(false);
            expect(canViewCompanyDraftDocuments('accountant_consultant', 'merchant_admin')).toBe(false);
            expect(canCreateCompanyCreditNote('merchant_admin', 'merchant_admin')).toBe(true);
            expect(canCreateCompanyCreditNote('merchant_consultant', 'merchant_admin')).toBe(false);
            expect(canCreateCompanyCreditNote('superadmin', 'merchant_admin')).toBe(false);
        });

        it('keeps standard merchant invitations limited to non-superadmin roles', () => {
            expect(getInvitableRolesForCompanyType('merchant_admin')).toEqual([
                'merchant_admin',
                'merchant_consultant',
            ]);
        });

        it('reserves superadmin invitations to the configured root email', () => {
            process.env.SUPERADMIN_ROOT_EMAIL = 'root@example.com';

            expect(
                canInviteSuperadminRole('ROOT@EXAMPLE.COM', 'merchant_admin'),
            ).toBe(true);
            expect(
                canInviteSuperadminRole('other@example.com', 'merchant_admin'),
            ).toBe(false);
            expect(
                canInviteSuperadminRole('root@example.com', 'accountant'),
            ).toBe(false);
        });
    });
});
