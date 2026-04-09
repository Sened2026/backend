import { SetMetadata } from '@nestjs/common';
import { CompanyRole } from '../roles/roles';
import { ROLES_KEY } from '../guards/role.guard';

/**
 * Decorator that specifies which roles are allowed to access a route.
 * Must be used with RoleGuard and SupabaseAuthGuard.
 *
 * @example
 * @Roles('merchant_admin')
 * @Delete(':id')
 * async delete(@Param('id') id: string) { ... }
 */
export const Roles = (...roles: CompanyRole[]) =>
    SetMetadata(ROLES_KEY, roles);
