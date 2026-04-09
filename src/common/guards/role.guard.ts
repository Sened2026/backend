import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyRole, getUserCompanyRole } from '../roles/roles';

export const ROLES_KEY = 'roles';

/**
 * Guard that checks the user's role in the company specified by :companyId param.
 * Use with the @Roles() decorator on controller methods.
 */
@Injectable()
export class RoleGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredRoles = this.reflector.getAllAndOverride<CompanyRole[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const companyId = request.params.companyId || request.params.company_id;

        if (!user?.id) {
            throw new ForbiddenException('Utilisateur non authentifié');
        }

        if (!companyId) {
            throw new ForbiddenException('Identifiant d\'entreprise manquant');
        }

        const role = await getUserCompanyRole(user.id, companyId);

        if (!requiredRoles.includes(role)) {
            throw new ForbiddenException(
                "Vous n'avez pas les permissions nécessaires pour cette action",
            );
        }

        request.companyRole = role;
        return true;
    }
}
