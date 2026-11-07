import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCommissionConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  admin_share_pct!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  proctor_share_pct!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  token_idr_rate!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  min_withdrawal_tokens!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_exam_token_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_material_token_price!: number;
}

export class ProcessPayoutDto {
  @IsString()
  @IsNotEmpty()
  proctor_id!: string;

  @IsString()
  @IsNotEmpty()
  period_month!: string; // format 'YYYY-MM'

  @Type(() => Number)
  @IsInt()
  total_tokens!: number;

  @Type(() => Number)
  @IsInt()
  proctor_tokens!: number;

  @Type(() => Number)
  @IsNumber()
  total_idr!: number;

  @IsString()
  @IsNotEmpty()
  transfer_proof_url!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RegisterProctorDto {
  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @IsString()
  @Length(16, 20)
  nik!: string;

  @IsString()
  @IsNotEmpty()
  whatsapp!: string;

  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  bank1_name!: string;

  @IsString()
  @IsNotEmpty()
  bank1_account_name!: string;

  @IsString()
  @IsNotEmpty()
  bank1_account_number!: string;

  @IsOptional()
  @IsString()
  bank2_name?: string;

  @IsOptional()
  @IsString()
  bank2_account_name?: string;

  @IsOptional()
  @IsString()
  bank2_account_number?: string;
}

export class UpdateProctorPermissionsDto {
  @IsOptional()
  @IsBoolean()
  can_create_exams?: boolean;

  @IsOptional()
  @IsBoolean()
  can_create_materials?: boolean;

  @IsOptional()
  @IsString()
  status?: 'pending' | 'approved' | 'rejected';
}
