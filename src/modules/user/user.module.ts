import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * Module utilisateur
 * Gère les opérations CRUD sur les profils utilisateurs
 */
@Module({
    controllers: [UserController],
    providers: [UserService],
    exports: [UserService],
})
export class UserModule { }
