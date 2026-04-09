import { Module } from '@nestjs/common';
import { SirenController } from './siren.controller';
import { SirenService } from './siren.service';

@Module({
    controllers: [SirenController],
    providers: [SirenService],
    exports: [SirenService],
})
export class SirenModule {}
