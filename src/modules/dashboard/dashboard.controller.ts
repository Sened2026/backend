import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('dashboard')
@UseGuards(SupabaseAuthGuard)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) {}

    @Get('stats')
    async getStats(
        @Req() req: any,
        @Query('year') year?: string,
    ) {
        const userId = req.user?.id;
        const companyId = req.headers['x-company-id'];
        const yearNum = year ? parseInt(year, 10) : undefined;
        return this.dashboardService.getStats(userId, companyId, yearNum);
    }

    @Get('accountant-stats')
    async getAccountantStats(
        @Req() req: any,
        @Query('year') year?: string,
    ) {
        const userId = req.user?.id;
        const companyId = req.headers['x-company-id'];
        const yearNum = year ? parseInt(year, 10) : undefined;
        return this.dashboardService.getAccountantStats(userId, companyId, yearNum);
    }
}
