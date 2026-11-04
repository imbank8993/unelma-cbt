import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTokenPackageDto {
  @IsString()
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  token_amount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price_idr!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateTokenPackageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  token_amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price_idr?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreatePaymentDto {
  @IsString()
  package_id!: string;

  @IsOptional()
  @IsString()
  customer_name?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class UnlockItemDto {
  @IsString()
  itemType!: 'exam' | 'material';

  @IsString()
  itemId!: string;
}

export class SaveMidtransConfigDto {
  @IsBoolean()
  is_production!: boolean;

  @IsOptional()
  @IsString()
  sandbox_client_key?: string;

  @IsOptional()
  @IsString()
  sandbox_server_key?: string;

  @IsOptional()
  @IsString()
  production_client_key?: string;

  @IsOptional()
  @IsString()
  production_server_key?: string;
}
