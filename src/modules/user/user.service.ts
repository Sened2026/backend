import { Injectable, NotFoundException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { UpdateProfileDto, ProfileResponseDto, ProfileWithSubscriptionDto } from './dto/user.dto';

/**
 * Interface pour le profil utilisateur en base de données
 */
export interface UserProfile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    address: string | null;
    avatar_url: string | null;
    signature_url: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Service utilisateur
 * Gère les opérations sur les profils utilisateurs dans Supabase
 */
@Injectable()
export class UserService {
    /**
     * Récupère le profil de l'utilisateur connecté avec son abonnement
     */
    async getProfileWithSubscription(userId: string): Promise<ProfileWithSubscriptionDto> {
        const supabase = getSupabaseAdmin();

        // Récupère le profil
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            throw new NotFoundException('Profil utilisateur non trouvé');
        }

        // Récupère l'abonnement avec le plan
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select(`
                id,
                status,
                current_period_end,
                plan_id
            `)
            .eq('user_id', userId)
            .single();

        let subscriptionInfo = null;

        if (subscription) {
            // Récupère les détails du plan
            const { data: plan } = await supabase
                .from('subscription_plans')
                .select('name, slug, max_companies')
                .eq('id', subscription.plan_id)
                .single();

            subscriptionInfo = {
                id: subscription.id,
                plan_name: plan?.name || 'Free',
                plan_slug: plan?.slug || 'free',
                status: subscription.status,
                max_companies: plan?.max_companies ?? null,
                current_period_end: subscription.current_period_end,
            };
        }

        return {
            ...profile,
            subscription: subscriptionInfo,
        } as ProfileWithSubscriptionDto;
    }

    /**
     * Récupère ou crée un profil utilisateur
     * Appelé après la connexion OAuth pour s'assurer que le profil existe
     */
    async getOrCreateProfile(
        userId: string,
        email: string,
        metadata?: { first_name?: string; last_name?: string; avatar_url?: string },
    ): Promise<ProfileResponseDto> {
        const supabase = getSupabaseAdmin();

        // Cherche le profil existant
        const { data: existingProfile, error: fetchError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw new Error(`Erreur lors de la récupération du profil: ${fetchError.message}`);
        }

        // Si le profil existe, le retourne
        if (existingProfile) {
            return existingProfile as ProfileResponseDto;
        }

        // Sinon, crée un nouveau profil
        const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                email,
                first_name: metadata?.first_name || null,
                last_name: metadata?.last_name || null,
                avatar_url: metadata?.avatar_url || null,
            })
            .select()
            .single();

        if (createError) {
            throw new Error(`Erreur lors de la création du profil: ${createError.message}`);
        }

        return newProfile as ProfileResponseDto;
    }

    /**
     * Récupère un profil utilisateur par son ID
     */
    async getProfileById(userId: string): Promise<ProfileResponseDto> {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            throw new NotFoundException('Profil utilisateur non trouvé');
        }

        return data as ProfileResponseDto;
    }

    /**
     * Met à jour le profil utilisateur
     */
    async updateProfile(
        userId: string,
        updateData: UpdateProfileDto,
    ): Promise<ProfileResponseDto> {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase
            .from('profiles')
            .update({
                ...updateData,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            throw new Error(`Erreur lors de la mise à jour du profil: ${error.message}`);
        }

        return data as ProfileResponseDto;
    }

    /**
     * Récupère les entreprises de l'utilisateur
     */
    async getUserCompanies(userId: string) {
        const supabase = getSupabaseAdmin();

        // Récupère les relations user_companies
        const { data: userCompanies, error } = await supabase
            .from('user_companies')
            .select('id, role, is_default, created_at, company_id')
            .eq('user_id', userId);

        if (error) {
            throw new Error(`Erreur lors de la récupération des entreprises: ${error.message}`);
        }

        // Pour chaque relation, récupère les détails de l'entreprise
        const companiesWithDetails = await Promise.all(
            userCompanies.map(async (uc: any) => {
                const { data: company } = await supabase
                    .from('companies')
                    .select('id, name, legal_name, siren, logo_url')
                    .eq('id', uc.company_id)
                    .single();

                return {
                    id: uc.id,
                    role: uc.role,
                    is_default: uc.is_default,
                    created_at: uc.created_at,
                    company,
                };
            }),
        );

        return companiesWithDetails;
    }
}
