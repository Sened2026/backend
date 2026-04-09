import { IsOptional, IsBoolean, IsString, IsNumber } from "class-validator";

export class UpdateChorusSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  cpro_login?: string;

  @IsOptional()
  @IsString()
  cpro_password?: string;

  @IsOptional()
  @IsNumber()
  id_structure_cpp?: number;

  @IsOptional()
  @IsNumber()
  chorus_id_utilisateur_courant?: number;

  @IsOptional()
  @IsNumber()
  chorus_id_fournisseur?: number;

  @IsOptional()
  @IsNumber()
  chorus_id_service_fournisseur?: number;

  @IsOptional()
  @IsNumber()
  chorus_code_coordonnees_bancaires_fournisseur?: number;

  @IsOptional()
  @IsString()
  default_code_destinataire?: string;

  @IsOptional()
  @IsString()
  default_code_service_executant?: string;

  @IsOptional()
  @IsString()
  default_cadre_facturation?: string;
}
