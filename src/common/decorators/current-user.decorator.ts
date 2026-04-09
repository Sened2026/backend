import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SupabaseUser } from '../../config/supabase.config';

/**
 * Décorateur pour extraire l'utilisateur courant de la requête
 * Utilisé après le SupabaseAuthGuard
 *
 * @example
 * @Get('profile')
 * getProfile(@CurrentUser() user: SupabaseUser) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
    (data: keyof SupabaseUser | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user as SupabaseUser;

        // Si une propriété spécifique est demandée, la retourne
        if (data) {
            return user?.[data];
        }

        // Sinon retourne l'utilisateur complet
        return user;
    },
);

/**
 * Décorateur pour extraire le token d'accès de la requête
 */
export const AccessToken = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): string | undefined => {
        const request = ctx.switchToHttp().getRequest();
        return request.accessToken;
    },
);
