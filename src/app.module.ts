import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ImageModule } from './modules/image/image.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { CompanyModule } from './modules/company/company.module';
import { ProductModule } from './modules/product/product.module';
import { CategoryModule } from './modules/category/category.module';
import { ClientModule } from './modules/client/client.module';
import { SirenModule } from './modules/siren/siren.module';
import { QuoteModule } from './modules/quote/quote.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ChorusProModule } from './modules/chorus-pro/chorus-pro.module';
import { LegalDocumentModule } from './modules/legal-document/legal-document.module';
import { SuperadminModule } from './modules/superadmin/superadmin.module';
import { AuthMiddleware } from './common/middleware/auth.middleware';

/**
 * Module racine de l'application
 * Configure les modules globaux et l'injection de dépendances
 */
@Module({
    imports: [
        // Configuration des variables d'environnement
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        // Module de planification des tâches CRON
        ScheduleModule.forRoot(),
        // Module WebSocket pour le temps réel
        WebsocketModule,
        // Modules de l'application
        AuthModule,
        UserModule,
        ImageModule,
        SubscriptionModule,
        CompanyModule,
        ProductModule,
        CategoryModule,
        ClientModule,
        SirenModule,
        QuoteModule,
        InvoiceModule,
        PaymentModule,
        ReminderModule,
        DashboardModule,
        ChorusProModule,
        LegalDocumentModule,
        SuperadminModule,
    ],
})
export class AppModule implements NestModule {
    /**
     * Configure les middlewares pour les routes
     */
    configure(consumer: MiddlewareConsumer) {
        // Applique le middleware d'authentification sur toutes les routes sauf les endpoints publics et webhooks
        consumer
            .apply(AuthMiddleware)
            .exclude(
                'api/auth/(.*)',
                'api/quotes/sign/(.*)',
                'api/quotes/refuse/(.*)',
                'api/quotes/pdf/(.*)',
                'api/invoices/sign/(.*)',
                'api/invoices/view/(.*)',
                'api/invoices/pdf/(.*)',
                'api/subscription/webhook',
                'api/subscription/plans',
                'api/invites/(.*)',
                'api/siren/public-search',
                'api/siren/public-lookup',
            )
            .forRoutes('*');
    }
}
