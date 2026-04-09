import { AuthController } from './auth.controller';

describe('AuthController', () => {
    const originalRootEmail = process.env.SUPERADMIN_ROOT_EMAIL;
    let controller: AuthController;

    beforeEach(() => {
        controller = new AuthController({} as any);
    });

    afterEach(() => {
        if (originalRootEmail === undefined) {
            delete process.env.SUPERADMIN_ROOT_EMAIL;
        } else {
            process.env.SUPERADMIN_ROOT_EMAIL = originalRootEmail;
        }
    });

    it('exposes is_root_superadmin for the configured root email', async () => {
        process.env.SUPERADMIN_ROOT_EMAIL = 'root@example.com';

        const result = await controller.getMe({
            id: 'user-1',
            email: 'ROOT@EXAMPLE.COM',
            user_metadata: {
                full_name: 'Jane Doe',
            },
            app_metadata: {},
        });

        expect(result).toMatchObject({
            email: 'ROOT@EXAMPLE.COM',
            can_invite_superadmin: true,
            is_root_superadmin: true,
            first_name: 'Jane',
            last_name: 'Doe',
        });
    });

    it('keeps is_root_superadmin disabled for any other email', async () => {
        process.env.SUPERADMIN_ROOT_EMAIL = 'root@example.com';

        const result = await controller.getSession({
            id: 'user-2',
            email: 'member@example.com',
            user_metadata: {},
            app_metadata: {
                provider: 'email',
            },
        });

        expect(result).toMatchObject({
            authenticated: true,
            can_invite_superadmin: false,
            is_root_superadmin: false,
        });
    });
});
