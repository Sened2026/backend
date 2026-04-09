import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

/**
 * Module de gestion des produits
 * Fournit les endpoints CRUD pour les produits par entreprise
 */
@Module({
    controllers: [ProductController],
    providers: [ProductService],
    exports: [ProductService],
})
export class ProductModule {}
