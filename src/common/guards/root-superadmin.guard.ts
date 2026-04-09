import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { isRootSuperadminEmail } from '../roles/roles';

@Injectable()
export class RootSuperadminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const email = request.user?.email as string | undefined;

        if (!isRootSuperadminEmail(email)) {
            throw new ForbiddenException(
                'Accès réservé au superadmin racine',
            );
        }

        return true;
    }
}
