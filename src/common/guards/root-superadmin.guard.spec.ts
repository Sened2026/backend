import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RootSuperadminGuard } from './root-superadmin.guard';

describe('RootSuperadminGuard', () => {
    const originalRootEmail = process.env.SUPERADMIN_ROOT_EMAIL;
    let guard: RootSuperadminGuard;

    beforeEach(() => {
        guard = new RootSuperadminGuard();
        process.env.SUPERADMIN_ROOT_EMAIL = 'root@example.com';
    });

    afterEach(() => {
        if (originalRootEmail === undefined) {
            delete process.env.SUPERADMIN_ROOT_EMAIL;
        } else {
            process.env.SUPERADMIN_ROOT_EMAIL = originalRootEmail;
        }
    });

    function createContext(email?: string): ExecutionContext {
        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    user: email ? { email } : undefined,
                }),
            }),
        } as ExecutionContext;
    }

    it('allows the configured root superadmin email', () => {
        expect(guard.canActivate(createContext('ROOT@EXAMPLE.COM'))).toBe(true);
    });

    it('rejects any other email', () => {
        expect(() => guard.canActivate(createContext('other@example.com'))).toThrow(
            new ForbiddenException('Accès réservé au superadmin racine'),
        );
    });
});
