import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Batas wajar agar nilai tetap muat di kolom integer dan diterima Midtrans. */
export const TOKEN_PACKAGE_LIMITS = {
  nameMax: 100,
  descriptionMax: 500,
  tokenMax: 100_000,
  priceMin: 1,
  priceMax: 100_000_000,
} as const;

export class CreateTokenPackageDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Nama paket wajib diisi.' })
  @MaxLength(TOKEN_PACKAGE_LIMITS.nameMax)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TOKEN_PACKAGE_LIMITS.tokenMax)
  token_amount!: number;

  @Type(() => Number)
  @IsInt({ message: 'Harga paket harus bilangan bulat rupiah.' })
  @Min(TOKEN_PACKAGE_LIMITS.priceMin, { message: 'Harga paket minimal Rp 1.' })
  @Max(TOKEN_PACKAGE_LIMITS.priceMax)
  price_idr!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TOKEN_PACKAGE_LIMITS.descriptionMax)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateTokenPackageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Nama paket wajib diisi.' })
  @MaxLength(TOKEN_PACKAGE_LIMITS.nameMax)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TOKEN_PACKAGE_LIMITS.tokenMax)
  token_amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Harga paket harus bilangan bulat rupiah.' })
  @Min(TOKEN_PACKAGE_LIMITS.priceMin, { message: 'Harga paket minimal Rp 1.' })
  @Max(TOKEN_PACKAGE_LIMITS.priceMax)
  price_idr?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TOKEN_PACKAGE_LIMITS.descriptionMax)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreatePaymentDto {
  /** Identitas pembeli selalu diambil dari akun yang login; tidak diterima dari request. */
  @IsUUID()
  package_id!: string;
}

export class UnlockItemDto {
  @IsIn(['exam', 'material'])
  itemType!: 'exam' | 'material';

  @IsUUID()
  itemId!: string;
}

export class SaveMidtransConfigDto {
  @IsBoolean()
  is_production!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sandbox_client_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sandbox_server_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  production_client_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  production_server_key?: string;

  /** Hapus server key tersimpan (input kosong berarti "pertahankan"). */
  @IsOptional()
  @IsBoolean()
  clear_sandbox_server_key?: boolean;

  @IsOptional()
  @IsBoolean()
  clear_production_server_key?: boolean;
}
