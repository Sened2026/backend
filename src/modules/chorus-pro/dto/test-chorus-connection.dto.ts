import { IsOptional, IsString } from 'class-validator';

export class TestChorusConnectionDto {
    @IsOptional()
    @IsString()
    cpro_login?: string;

    @IsOptional()
    @IsString()
    cpro_password?: string;
}
