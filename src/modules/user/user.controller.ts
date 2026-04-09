import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseUser } from '../../config/supabase.config';
import { UpdateProfileDto } from './dto/user.dto';

/**
 * Contrôleur utilisateur
 * Endpoints pour la gestion des profils utilisateurs
 */
@Controller('user')
@UseGuards(SupabaseAuthGuard)
export class UserController {
    constructor(private readonly userService: UserService) { }

    /**
     * GET /api/user/profile
     * Récupère le profil complet avec abonnement
     */
    @Get('profile')
    async getProfile(@CurrentUser() user: SupabaseUser) {
        return this.userService.getProfileWithSubscription(user.id);
    }

    /**
     * PATCH /api/user/profile
     * Met à jour le profil de l'utilisateur connecté
     */
    @Patch('profile')
    async updateProfile(
        @CurrentUser() user: SupabaseUser,
        @Body() updateData: UpdateProfileDto,
    ) {
        return this.userService.updateProfile(user.id, updateData);
    }

    /**
     * GET /api/user/companies
     * Récupère les entreprises de l'utilisateur
     */
    @Get('companies')
    async getCompanies(@CurrentUser() user: SupabaseUser) {
        return this.userService.getUserCompanies(user.id);
    }

    /**
     * GET /api/user/sync
     * Synchronise le profil après connexion OAuth
     * Crée le profil si nécessaire (backup du trigger Supabase)
     */
    @Get('sync')
    async syncProfile(@CurrentUser() user: SupabaseUser) {
        const profile = await this.userService.getOrCreateProfile(
            user.id,
            user.email,
            {
                first_name: user.user_metadata?.full_name?.split(' ')[0],
                last_name: user.user_metadata?.full_name?.split(' ').slice(1).join(' '),
                avatar_url: user.user_metadata?.avatar_url,
            },
        );
        return { success: true, profile };
    }
}
