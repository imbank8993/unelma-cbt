import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const ADMIN_MANAGED_ROLES = ['Admin', 'Proktor', 'Siswa'] as const;
export type AdminManagedRole = (typeof ADMIN_MANAGED_ROLES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Terima 'admin'/'ADMIN' dsb., simpan dalam bentuk baku 'Admin'. */
const canonicalRole = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return ADMIN_MANAGED_ROLES.find((role) => role.toLowerCase() === value.trim().toLowerCase()) ?? value;
};

export class AdminCreateUserDto {
  @ApiProperty({ example: 'guru@sekolah.sch.id' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Format email tidak valid.' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Ahmad Fauzi' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Nama lengkap wajib diisi.' })
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: ADMIN_MANAGED_ROLES })
  @Transform(canonicalRole)
  @IsIn(ADMIN_MANAGED_ROLES, { message: 'Peran harus Admin, Proktor, atau Siswa.' })
  role!: AdminManagedRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  schoolName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  className?: string;
}

export class AdminUpdateRoleDto {
  @ApiProperty({ enum: ADMIN_MANAGED_ROLES })
  @Transform(canonicalRole)
  @IsIn(ADMIN_MANAGED_ROLES, { message: 'Peran harus Admin, Proktor, atau Siswa.' })
  role!: AdminManagedRole;
}
