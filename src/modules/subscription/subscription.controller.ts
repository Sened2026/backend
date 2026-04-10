import { Controller, Get, Post, Body, UseGuards, Req, Headers, RawBodyRequest, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionService } from './subscription.service';
import { LegalDocumentService } from '../legal-document/legal-document.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseUser } from '../../config/supabase.config';
import {
    ChangeSubscriptionDto,
    CreateSubscriptionDto,
    CreateRegistrationSubscriptionDto,
    FinalizeRegistrationSubscriptionDto,
    ValidateRegistrationPromotionCodeDto,
} from './dto/subscription.dto';
import { Request } from 'express';

@Controller('subscription')
@SkipSubscriptionCheck()
export class SubscriptionController {
    private stripe: Stripe | null = null;

    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly legalDocumentService: LegalDocumentService,
        private readonly configService: ConfigService,
    ) {
        const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
        if (stripeKey) {
            this.stripe = new Stripe(stripeKey);
        }
    }

    @Get()
    @UseGuards(SupabaseAuthGuard)
    async getSubscription(@CurrentUser() user: SupabaseUser, @Req() req: Request) {
        const companyId = req.headers['x-company-id'] as string | undefined;
        return this.subscriptionService.getSubscriptionWithPlans(user.id, companyId);
    }

    @Get('plans')
    async getPlans() {
        return this.subscriptionService.getAvailablePlans();
    }

    @Post('change')
    @UseGuards(SupabaseAuthGuard)
    async changePlan(
        @CurrentUser() user: SupabaseUser,
        @Body() dto: ChangeSubscriptionDto,
    ) {
        await this.legalDocumentService.syncPlatformAcceptanceFromMetadata(user);
        return this.subscriptionService.changePlan(user.id, dto.plan_slug, dto.billing_period);
    }

    /**
     * POST /api/subscription/subscribe
     * Creates a Stripe Subscription and returns client_secret for Payment Element.
     */
    @Post('subscribe')
    @UseGuards(SupabaseAuthGuard)
    async subscribe(
        @CurrentUser() user: SupabaseUser,
        @Body() dto: CreateSubscriptionDto,
    ) {
        await this.legalDocumentService.syncPlatformAcceptanceFromMetadata(user);
        return this.subscriptionService.createSubscription(
            user.id,
            dto.plan_slug,
            dto.billing_period,
        );
    }

    @Post('registration')
    async createRegistrationSubscription(
        @Body() dto: CreateRegistrationSubscriptionDto,
    ) {
        return this.subscriptionService.createRegistrationSubscription(dto);
    }

    @Post('registration/promo/validate')
    async validateRegistrationPromotionCode(
        @Body() dto: ValidateRegistrationPromotionCodeDto,
    ) {
        return this.subscriptionService.validateRegistrationPromotionCode(dto);
    }

    @Post('registration/finalize')
    async finalizeRegistrationSubscription(
        @Body() dto: FinalizeRegistrationSubscriptionDto,
    ) {
        return this.subscriptionService.finalizeRegistrationSubscription(
            dto.registration_session_id,
        );
    }

    /**
     * POST /api/subscription/billing-portal
     * Creates a Stripe Billing Portal session for managing payment methods.
     */
    @Post('billing-portal')
    @UseGuards(SupabaseAuthGuard)
    async createBillingPortal(@CurrentUser() user: SupabaseUser) {
        return this.subscriptionService.createBillingPortalSession(user.id);
    }

    /**
     * POST /api/subscription/webhook
     * Stripe webhook handler for subscription events.
     */
    @Post('webhook')
    async handleWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('stripe-signature') signature: string,
    ) {
        if (!this.stripe) {
            throw new BadRequestException('Service de paiement non configuré');
        }

        const webhookSecret = this.configService.get<string>('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET')
            || this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

        if (!webhookSecret) {
            throw new BadRequestException('Webhook secret non configuré');
        }

        let event: Stripe.Event;
        try {
            event = this.stripe.webhooks.constructEvent(
                req.rawBody!,
                signature,
                webhookSecret,
            );
        } catch (err: any) {
            throw new BadRequestException(`Webhook signature invalide: ${err.message}`);
        }

        await this.subscriptionService.handleWebhook(event);

        return { received: true };
    }
}
