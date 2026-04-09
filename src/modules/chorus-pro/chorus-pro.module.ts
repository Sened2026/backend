import { Module } from "@nestjs/common";
import { ChorusProController } from "./chorus-pro.controller";
import { ChorusProService } from "./chorus-pro.service";
import { PdfModule } from "../pdf/pdf.module";

@Module({
  imports: [PdfModule],
  controllers: [ChorusProController],
  providers: [ChorusProService],
  exports: [ChorusProService],
})
export class ChorusProModule {}
