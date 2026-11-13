import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@acca-cbt/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApplyProctorDto,
  ProcessPayoutDto,
  RejectProctorApplicationDto,
  RegisterProctorDto,
  UpdateCommissionConfigDto,
  UpdateProctorPermissionsDto,
} from './commissions.dto';
import { CommissionsService } from './commissions.service';
import { DbService } from '../prisma/prisma-db-adapter';
import { loadCreationLimits } from '../common/creation-limits';

function assertAdmin(user: AuthUser) {
  const isSuper = user.resolved?.superadmin === true || user.roles.includes('SUPERADMIN');
  const isAdmin = user.isPlatformAdmin || user.roles.includes('ADMIN') || isSuper;
  if (!isAdmin) {
    throw new ForbiddenException('Hanya Administrator yang berhak mengakses fungsi ini.');
  }
}

@ApiTags('Commissions & Proctor Payouts')
@Controller('commissions')
@UseGuards(JwtAuthGuard)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService, private readonly db: DbService) {}

  @Get('proctor/limits')
  @ApiOperation({ summary: 'Akses membuat ujian/bahan ajar dan sisa kuota gratis pengguna yang login' })
  getMyCreationLimits(@CurrentUser() user: AuthUser) {
    return loadCreationLimits(this.db, user);
  }

  // ── 1. Konfigurasi Komisi & Ambang Batas ──
  @Get('config')
  @ApiOperation({ summary: 'Ambil konfigurasi pembagian komisi dan harga minimal' })
  getConfig() {
    return this.commissions.getConfig();
  }

  @Put('config')
  @ApiOperation({ summary: 'Ubah konfigurasi komisi oleh Admin' })
  updateConfig(@CurrentUser() user: AuthUser, @Body() dto: UpdateCommissionConfigDto) {
    assertAdmin(user);
    return this.commissions.updateConfig(dto, user.id);
  }

  // ── 2. Admin: Rekap Komisi & Pencairan ──
  @Get('admin/summary')
  @ApiOperation({ summary: 'Rekap komisi seluruh proktor untuk Admin' })
  getAdminSummary(@CurrentUser() user: AuthUser) {
    assertAdmin(user);
    return this.commissions.getAdminSummary();
  }

  @Post('admin/payout')
  @ApiOperation({ summary: 'Proses pencairan dana proktor dengan bukti transfer' })
  processPayout(@CurrentUser() user: AuthUser, @Body() dto: ProcessPayoutDto) {
    assertAdmin(user);
    return this.commissions.processPayout(user.id, dto);
  }

  @Put('admin/proctors/:id/permissions')
  @ApiOperation({ summary: 'Ubah hak akses proktor membuat ujian/bahan ajar' })
  updateProctorPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProctorPermissionsDto,
  ) {
    assertAdmin(user);
    return this.commissions.updateProctorPermissions(id, dto);
  }

  // ── 3. Proktor: Rincian & Riwayat Pribadi ──
  @Get('proctor/my')
  @ApiOperation({ summary: 'Rincian pendapatan dan status pencairan proktor' })
  getMySummary(@CurrentUser() user: AuthUser) {
    return this.commissions.getProctorMySummary(user.id);
  }

  @Post('proctor/register')
  @ApiOperation({ summary: 'Pendaftaran dan perbaruan data rekening/NIK proktor' })
  registerProctor(@CurrentUser() user: AuthUser, @Body() dto: RegisterProctorDto) {
    return this.commissions.registerOrUpdateProfile(user, dto);
  }

  // ── 4. Pengajuan menjadi Proktor ──
  @Get('proctor/application')
  @ApiOperation({ summary: 'Status pengajuan Proktor milik pengguna yang login' })
  getMyApplication(@CurrentUser() user: AuthUser) {
    return this.commissions.getMyApplication(user);
  }

  @Post('proctor/apply')
  @ApiOperation({ summary: 'Ajukan diri menjadi Proktor (akun Google yang login)' })
  applyAsProctor(@CurrentUser() user: AuthUser, @Body() dto: ApplyProctorDto) {
    return this.commissions.applyAsProctor(user, dto);
  }

  @Get('admin/applications')
  @ApiOperation({ summary: 'Daftar pengajuan Proktor untuk Admin' })
  listApplications(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    assertAdmin(user);
    return this.commissions.listApplications(status || 'pending');
  }

  @Post('admin/applications/:id/approve')
  @ApiOperation({ summary: 'Setujui pengajuan Proktor' })
  approveApplication(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    assertAdmin(user);
    return this.commissions.approveApplication(user, id);
  }

  @Post('admin/applications/:id/reject')
  @ApiOperation({ summary: 'Tolak pengajuan Proktor dengan alasan' })
  rejectApplication(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProctorApplicationDto,
  ) {
    assertAdmin(user);
    return this.commissions.rejectApplication(user, id, dto.reason);
  }
}
