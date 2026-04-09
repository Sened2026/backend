import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ClientService } from './client.service';
import {
    CreateClientDto,
    UpdateClientDto,
    ClientQueryDto,
    ClientResponseDto,
    ClientListResponseDto,
} from './dto/client.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Contrôleur pour la gestion des clients par entreprise
 * Fournit les endpoints CRUD pour les clients
 * 
 * Routes disponibles:
 * - POST   /api/companies/:companyId/clients           - Créer un client
 * - GET    /api/companies/:companyId/clients           - Liste des clients de l'entreprise
 * - GET    /api/companies/:companyId/clients/:id       - Récupérer un client par ID
 * - PUT    /api/companies/:companyId/clients/:id       - Mettre à jour un client
 * - DELETE /api/companies/:companyId/clients/:id       - Supprimer un client
 * - POST   /api/companies/:companyId/clients/:id/duplicate - Dupliquer un client
 */
@Controller('companies/:companyId/clients')
@UseGuards(SupabaseAuthGuard)
export class ClientController {
    constructor(private readonly clientService: ClientService) {}

    /**
     * Crée un nouveau client pour une entreprise
     * Seuls les admins de l'entreprise peuvent créer des clients
     */
    @Post()
    @UseGuards(SubscriptionGuard)
    @HttpCode(HttpStatus.CREATED)
    async create(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Body() createClientDto: CreateClientDto,
    ): Promise<ClientResponseDto> {
        return this.clientService.create(userId, companyId, createClientDto);
    }

    /**
     * Récupère la liste des clients d'une entreprise
     * Supporte la pagination, la recherche et les filtres
     */
    @Get()
    async findAll(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Query() query: ClientQueryDto,
    ): Promise<ClientListResponseDto> {
        return this.clientService.findAll(userId, companyId, query);
    }

    /**
     * Récupère un client par son ID
     */
    @Get(':id')
    async findOne(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<ClientResponseDto> {
        return this.clientService.findOne(userId, companyId, id);
    }

    /**
     * Met à jour un client
     * Seuls les admins de l'entreprise peuvent modifier les clients
     */
    @Put(':id')
    @UseGuards(SubscriptionGuard)
    async update(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateClientDto: UpdateClientDto,
    ): Promise<ClientResponseDto> {
        return this.clientService.update(userId, companyId, id, updateClientDto);
    }

    /**
     * Supprime un client
     * Seuls les admins de l'entreprise peuvent supprimer des clients
     */
    @Delete(':id')
    @UseGuards(SubscriptionGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        return this.clientService.delete(userId, companyId, id);
    }

    /**
     * Duplique un client existant
     * Seuls les admins de l'entreprise peuvent dupliquer des clients
     */
    @Post(':id/duplicate')
    @UseGuards(SubscriptionGuard)
    @HttpCode(HttpStatus.CREATED)
    async duplicate(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<ClientResponseDto> {
        return this.clientService.duplicate(userId, companyId, id);
    }

    /**
     * Vérifie l'éligibilité Chorus Pro d'un client public
     * Recherche la structure dans Chorus, consulte les obligations et services
     */
    @Post(':id/chorus-pro/verify')
    @UseGuards(SubscriptionGuard)
    async verifyChorus(
        @CurrentUser('id') userId: string,
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<ClientResponseDto> {
        return this.clientService.verifyChorusEligibility(userId, companyId, id);
    }
}
