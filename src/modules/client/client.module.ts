import { Module, forwardRef } from '@nestjs/common';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { ChorusProModule } from '../chorus-pro/chorus-pro.module';

@Module({
    imports: [forwardRef(() => ChorusProModule)],
    controllers: [ClientController],
    providers: [ClientService],
    exports: [ClientService],
})
export class ClientModule {}
