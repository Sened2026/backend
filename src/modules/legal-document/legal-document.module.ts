import { Module } from '@nestjs/common';
import { LegalDocumentController } from './legal-document.controller';
import { LegalDocumentService } from './legal-document.service';

@Module({
    controllers: [LegalDocumentController],
    providers: [LegalDocumentService],
    exports: [LegalDocumentService],
})
export class LegalDocumentModule {}
