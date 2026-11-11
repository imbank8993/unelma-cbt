import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Hapus spasi/tanda hubung pada nomor (NIK, rekening, WhatsApp) sebelum divalidasi. */
const digitsOnly = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value);
const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export class UpdateCommissionConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  admin_share_pct!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  proctor_share_pct!: number;

  @Type(() => Number)
  @IsInt({ message: 'Kurs token harus bilangan bulat rupiah.' })
  @Min(1)
  @Max(10_000_000)
  token_idr_rate!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  min_withdrawal_tokens!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  min_exam_token_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  min_material_token_price!: number;
}

/**
 * Jumlah token & rupiah TIDAK diterima dari browser: server menghitungnya dari
 * saldo komisi yang belum dicairkan.
 */
export class ProcessPayoutDto {
  @IsUUID()
  proctor_id!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Periode harus berformat YYYY-MM.' })
  period_month!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Tautan bukti transfer wajib diisi.' })
  @MaxLength(2000)
  transfer_proof_url!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RegisterProctorDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name!: string;

  @Transform(digitsOnly)
  @Matches(/^\d{16}$/, { message: 'NIK harus 16 digit angka.' })
  nik!: string;

  @Transform(digitsOnly)
  @Matches(/^\+?\d{8,15}$/, { message: 'Nomor WhatsApp tidak valid.' })
  whatsapp!: string;

  @Transform(trim)
  @IsEmail({}, { message: 'Email tidak valid.' })
  @MaxLength(255)
  email!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bank1_name!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  bank1_account_name!: string;

  @Transform(digitsOnly)
  @Matches(/^\d{5,30}$/, { message: 'Nomor rekening 1 harus 5–30 digit angka.' })
  bank1_account_number!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  bank2_name?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(150)
  bank2_account_name?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const cleaned = digitsOnly({ value });
    return cleaned === '' ? undefined : cleaned;
  })
  @Matches(/^\d{5,30}$/, { message: 'Nomor rekening 2 harus 5–30 digit angka.' })
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
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';
}
