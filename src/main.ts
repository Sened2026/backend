import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

function normalizeOrigin(origin: string): string {
    return origin.trim().replace(/\/+$/, '');
}

function parseAllowedOrigins(rawValue: string | undefined): string[] {
    if (!rawValue) {
        return [];
    }

    return rawValue
        .split(',')
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean);
}

/**
 * Bootstrap de l'application NestJS
 */
async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        // Activer rawBody pour les webhooks Stripe
        rawBody: true,
    });

    // Préfixe global pour l'API
    app.setGlobalPrefix('api');

    const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);

    // Configuration CORS
    app.enableCors({
        origin: (origin, callback) => {
            // Autorise les clients non navigateur (curl, health checks, webhooks).
            if (!origin) {
                return callback(null, true);
            }

            const normalizedRequestOrigin = normalizeOrigin(origin);
            const isAllowed = allowedOrigins.includes(normalizedRequestOrigin);

            if (isAllowed) {
                return callback(null, true);
            }

            return callback(
                new Error(
                    `Origin ${normalizedRequestOrigin} non autorisée. ` +
                    `CORS_ORIGIN attendu: ${allowedOrigins.join(', ') || '(non configuré)'}`,
                ),
                false,
            );
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id', 'stripe-signature'],
        exposedHeaders: ['Retry-After'],
        credentials: true,
    });

    // Pipe de validation global
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true, // Supprime les propriétés non décorées
            forbidNonWhitelisted: true, // Rejette les propriétés inconnues
            transform: true, // Transforme automatiquement les types
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    // Port d'écoute
    const port = process.env.PORT || 3001;
    await app.listen(port);

    console.log(`🚀 Application démarrée sur: http://localhost:${port}`);
    console.log(`📚 API disponible sur: http://localhost:${port}/api`);
}

bootstrap();
