import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CompanyService } from './company.service';

@Controller('invites')
export class InviteController {
    constructor(private readonly companyService: CompanyService) {}

    @Get(':token')
    async validateToken(@Param('token') token: string) {
        const invitation = await this.companyService.validateInviteToken(token);

        if (!invitation) {
            throw new NotFoundException('Invitation invalide ou expirée');
        }

        return invitation;
    }
}
