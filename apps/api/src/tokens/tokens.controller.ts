import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@acca-cbt/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePaymentDto, CreateTokenPackageDto, SaveMidtransConfigDto, UnlockItemDto, UpdateTokenPackageDto } from './tokens.dto';
import { TokensService } from './tokens.service';

function assertAdmin(user: AuthUser) {
  const isSuper = user.resolved?.superadmin === true || user.roles.includes('SUPERADMIN');
  const isAdmin = user.isPlatformAdmin || user.roles.includes('ADMIN') || isSuper;
  if (!isAdmin) {
    throw new ForbiddenException('Hanya Administrator yang berhak mengakses fungsi ini.');
  }
}

@ApiTags('Tokens & Payments')
@Controller('tokens')
export class TokensController {
  constructor(private readonly tokens: TokensService) {}

  // ── 1. Paket Token Publik & Admin ──
  @Get('packages')
  @ApiOperation({ summary: 'Daftar paket token aktif untuk umum/siswa' })
  getPublicPackages() {
    return this.tokens.getPublicPackages();
  }

  @Get('admin/packages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Daftar seluruh paket token untuk Admin' })
  getAllPackagesAdmin(@CurrentUser() user: AuthUser) {
    assertAdmin(user);
    return this.tokens.getAllPackagesAdmin();
  }

  @Post('admin/packages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tambah paket token baru oleh Admin' })
  createPackage(@CurrentUser() user: AuthUser, @Body() dto: CreateTokenPackageDto) {
    assertAdmin(user);
    return this.tokens.createPackage(dto);
  }

  @Put('admin/packages/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ubah paket token oleh Admin' })
  updatePackage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTokenPackageDto,
  ) {
    assertAdmin(user);
    return this.tokens.updatePackage(id, dto);
  }

  @Delete('admin/packages/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Hapus paket token oleh Admin' })
  deletePackage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    assertAdmin(user);
    return this.tokens.deletePackage(id);
  }

  // ── 2. Konfigurasi Midtrans ──
  @Get('admin/midtrans-config')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ambil konfigurasi Midtrans' })
  getMidtransConfig(@CurrentUser() user: AuthUser) {
    assertAdmin(user);
    return this.tokens.getMidtransConfig(true);
  }

  @Post('admin/midtrans-config')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Simpan konfigurasi Midtrans' })
  saveMidtransConfig(@CurrentUser() user: AuthUser, @Body() dto: SaveMidtransConfigDto) {
    assertAdmin(user);
    return this.tokens.saveMidtransConfig(dto);
  }

  // ── 3. Transaksi & Midtrans Snap / Webhook ──
  @Post('payments/create')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Buat transaksi Midtrans Snap token (wajib login)' })
  createPayment(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.tokens.createPayment(user, dto);
  }

  @Post('payments/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook notifikasi pembayaran dari Midtrans' })
  handleWebhook(@Body() body: any) {
    return this.tokens.handleWebhook(body);
  }

  // ── 4. Saldo & Riwayat Siswa ──
  @Get('balance')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ambil saldo token pengguna saat ini' })
  async getBalance(@CurrentUser() user: AuthUser) {
    const balance = await this.tokens.getUserBalance(user.id);
    return { token_balance: balance };
  }

  @Get('my-transactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ambil riwayat transaksi token pengguna saat ini' })
  getMyTransactions(@CurrentUser() user: AuthUser) {
    return this.tokens.getUserTransactions(user.id);
  }

  // ── 5. Buka Akses Item (Ujian & Bahan Ajar) ──
  @Get('check-access')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Periksa status akses item (gratis/terbuka/perlu token)' })
  checkAccess(
    @CurrentUser() user: AuthUser,
    @Query('type') type: 'exam' | 'material',
    @Query('id', ParseUUIDPipe) id: string,
  ) {
    if (type !== 'exam' && type !== 'material') {
      throw new BadRequestException("Parameter 'type' harus 'exam' atau 'material'.");
    }
    return this.tokens.checkAccess(user.id, type, id);
  }

  @Post('unlock')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Buka akses item menggunakan token' })
  unlockItem(@CurrentUser() user: AuthUser, @Body() dto: UnlockItemDto) {
    return this.tokens.unlockItem(user.id, dto);
  }

  // ── 6. Admin Trackers ──
  @Get('admin/tracker/purchases')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tracker pembelian paket token untuk Admin' })
  getPurchasesTracker(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    assertAdmin(user);
    return this.tokens.getPurchasesTracker(search || '');
  }

  @Get('admin/tracker/usages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tracker pemakaian token saat buka item untuk Admin' })
  getUsagesTracker(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    assertAdmin(user);
    return this.tokens.getUsagesTracker(search || '');
  }
}
