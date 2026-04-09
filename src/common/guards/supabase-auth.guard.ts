import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { getSupabaseClient } from '../../config/supabase.config';

/**
 * Guard d'authentification Supabase
 * Vérifie que le token JWT est valide et extrait l'utilisateur
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        // Récupère le token depuis le header Authorization
        const authHeader = request.headers.authorization;

        if (!authHeader) {
            throw new UnauthorizedException('Token d\'authentification requis');
        }

        // Extrait le token du format "Bearer <token>"
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
            throw new UnauthorizedException('Format de token invalide');
        }

        try {
            // Vérifie le token avec Supabase
            const supabase = getSupabaseClient(token);
            const { data: { user }, error } = await supabase.auth.getUser();

            if (error || !user) {
                throw new UnauthorizedException('Token invalide ou expiré');
            }

            // Attache l'utilisateur à la requête pour utilisation ultérieure
            request.user = user;
            request.accessToken = token;

            return true;
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Erreur lors de la vérification du token');
        }
    }
}
