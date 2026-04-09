import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient, SupabaseUser } from '../../config/supabase.config';

// Extension du type Request pour inclure l'utilisateur
declare global {
    namespace Express {
        interface Request {
            user?: SupabaseUser;
            accessToken?: string;
        }
    }
}

/**
 * Middleware d'authentification
 * Vérifie le token JWT et attache l'utilisateur à la requête
 * Ne bloque pas la requête si le token est absent (optionnel)
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
    async use(req: Request, _res: Response, next: NextFunction) {
        const authHeader = req.headers.authorization;

        // Si pas de token, continue sans authentification
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.replace('Bearer ', '');

        try {
            // Vérifie le token avec Supabase
            const supabase = getSupabaseClient(token);
            const { data: { user }, error } = await supabase.auth.getUser();

            if (!error && user) {
                // Attache l'utilisateur à la requête
                req.user = user as SupabaseUser;
                req.accessToken = token;
            }
        } catch (error) {
            // En cas d'erreur, continue sans authentification
            console.error('Erreur middleware auth:', error);
        }

        next();
    }
}
