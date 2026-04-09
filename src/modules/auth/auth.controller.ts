import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseUser } from '../../config/supabase.config';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { isRootSuperadminEmail } from '../../common/roles/roles';

/**
 * Contrôleur d'authentification
 * Endpoints pour la gestion de l'authentification
 */
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Get('registration-availability')
    async checkRegistrationAvailability(
        @Query('siren') siren?: string,
        @Query('siret') siret?: string,
        @Query('role') role?: 'merchant_admin' | 'merchant_consultant' | 'accountant' | 'accountant_consultant' | 'superadmin',
        @Query('country') country?: string,
    ) {
        return this.authService.checkRegistrationAvailability({
            siren,
            siret,
            role,
            country,
        });
    }

    /**
     * GET /api/auth/me
     * Récupère les informations de l'utilisateur connecté depuis Supabase Auth
     */
    @Get('me')
    @UseGuards(SupabaseAuthGuard)
    async getMe(@CurrentUser() user: SupabaseUser) {
        const isRootSuperadmin = isRootSuperadminEmail(user.email);

        return {
            id: user.id,
            email: user.email,
            first_name: user.user_metadata?.full_name?.split(' ')[0] || null,
            last_name: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || null,
            avatar_url: user.user_metadata?.avatar_url || null,
            provider: user.app_metadata?.provider || 'email',
            can_invite_superadmin: isRootSuperadmin,
            is_root_superadmin: isRootSuperadmin,
        };
    }

    /**
     * GET /api/auth/verify
     * Vérifie si le token JWT est valide
     */
    @Get('verify')
    @UseGuards(SupabaseAuthGuard)
    async verifyToken(@CurrentUser() user: SupabaseUser) {
        return {
            valid: true,
            user_id: user.id,
            email: user.email,
        };
    }

    /**
     * POST /api/auth/logout
     * Endpoint de déconnexion (côté serveur)
     * Note: La déconnexion principale se fait côté client via Supabase
     */
    @Post('logout')
    @UseGuards(SupabaseAuthGuard)
    async logout(@CurrentUser() user: SupabaseUser) {
        // Ici on pourrait invalider des sessions côté serveur si nécessaire
        return {
            success: true,
            message: 'Déconnexion réussie',
        };
    }

    /**
     * GET /api/auth/session
     * Récupère les informations de session
     */
    @Get('session')
    @UseGuards(SupabaseAuthGuard)
    async getSession(@CurrentUser() user: SupabaseUser) {
        const isRootSuperadmin = isRootSuperadminEmail(user.email);

        return {
            user: {
                id: user.id,
                email: user.email,
            },
            provider: user.app_metadata?.provider,
            authenticated: true,
            can_invite_superadmin: isRootSuperadmin,
            is_root_superadmin: isRootSuperadmin,
        };
    }

    @Post('complete-registration')
    @UseGuards(SupabaseAuthGuard)
    async completeRegistration(
        @CurrentUser() user: SupabaseUser,
        @Body() dto: CompleteRegistrationDto
    ) {
        return this.authService.completeRegistration(user.email!, dto);
    }
}
