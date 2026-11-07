import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@acca-cbt/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ProcessPayoutDto,
  RegisterProctorDto,
  UpdateCommissionConfigDto,
  UpdateProctorPermissionsDto,
} from './commissions.dto';
import { CommissionsService } from './commissions.service';

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
  constructor(private readonly commissions: CommissionsService) {}

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
    return this.commissions.updateConfig(dto);
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
    return this.commissions.registerOrUpdateProfile(user.id, dto);
  }
}
