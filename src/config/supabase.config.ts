import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase côté serveur avec le service role key
 * À utiliser UNIQUEMENT côté backend pour les opérations privilégiées
 */
let supabaseAdmin: any = null;

/**
 * Récupère ou crée le client Supabase Admin
 * Utilise le service role key pour bypass les RLS policies
 */
export function getSupabaseAdmin() {
    if (supabaseAdmin) {
        return supabaseAdmin;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error(
            'Les variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies',
        );
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        db: {
            schema: 'public',
        },
    });

    return supabaseAdmin!;
}

/**
 * Crée un client Supabase pour un utilisateur spécifique
 * Utilisé pour vérifier les tokens JWT et effectuer des requêtes
 * avec les permissions de l'utilisateur
 */
export function getSupabaseClient(accessToken?: string) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            'Les variables SUPABASE_URL et SUPABASE_ANON_KEY doivent être définies',
        );
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        db: {
            schema: 'public',
        },
        global: accessToken
            ? {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
            : undefined,
    });

    return client;
}

/**
 * Type pour les informations utilisateur Supabase
 */
export interface SupabaseUser {
    id: string;
    email: string;
    user_metadata: {
        full_name?: string;
        avatar_url?: string;
        platform_legal_accepted_at?: string;
        [key: string]: unknown;
    };
    app_metadata: {
        provider?: string;
        [key: string]: unknown;
    };
}
