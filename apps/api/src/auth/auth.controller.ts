import { Body, Delete, ForbiddenException, Param, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@acca-cbt/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto, SsoTicketDto, SignupDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RateLimiter, tooManyRequests } from '../common/rate-limit';

/** Gagal login per akun: cukup untuk salah ketik, terlalu sedikit untuk menebak NIS/sandi. */
const ACCOUNT_FAILURE_LIMIT = 10;
/** Per IP lebih longgar: satu sekolah sering keluar lewat satu IP NAT yang sama. */
const IP_FAILURE_LIMIT = 200;
const FAILURE_WINDOW_MS = 15 * 60_000;
export const loginFailures = new RateLimiter();

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Masuk dengan email dan password' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = dto.ipAddress || req.ip;
    const ua = dto.userAgent || req.headers['user-agent'];
    const accountKey = `account:${String(dto.email || '').trim().toLowerCase()}`;
    const ipKey = `ip:${ip || 'unknown'}`;
    const wait = Math.max(loginFailures.blocked(accountKey, ACCOUNT_FAILURE_LIMIT),
      loginFailures.blocked(ipKey, IP_FAILURE_LIMIT));
    if (wait) {
      throw tooManyRequests(wait, `Terlalu banyak percobaan login gagal. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`);
    }
    try {
      const result = await this.authService.login(dto.email, dto.password, ip, ua);
      loginFailures.reset(accountKey);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        loginFailures.hit(accountKey, ACCOUNT_FAILURE_LIMIT, FAILURE_WINDOW_MS);
        loginFailures.hit(ipKey, IP_FAILURE_LIMIT, FAILURE_WINDOW_MS);
      }
      throw error;
    }
  }

  
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Daftar akun siswa baru' })
  async signup(@Body() dto: SignupDto, @Req() req: Request) {
    const ip = dto.ipAddress || req.ip;
    const ua = dto.userAgent || req.headers['user-agent'];
    return this.authService.signup(dto, ip, ua);
  }

  @Post('sso')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tukar tiket SSO acca-app dengan sesi CBT' })
  sso(@Body() dto: SsoTicketDto, @Req() req: Request) {
    const ip = dto.ipAddress || req.ip;
    const ua = dto.userAgent || req.headers['user-agent'];
    return this.authService.exchangeSsoTicket(dto.token, ip, ua);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perpanjang sesi selama siswa sedang mengerjakan ujian' })
  refresh(@CurrentUser() user: AuthUser) {
    return this.authService.refreshExamSession(user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Identitas dan peran pemanggil saat ini' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Profil pemanggil beserta organisasi utamanya',
    description:
      'Untuk bilah sisi: foto profil, nama sekolah, dan logonya. Terpisah dari /auth/me ' +
      'karena ketiganya butuh query tambahan yang tidak dibutuhkan setiap pemanggil identitas.',
  })
  profile(@CurrentUser() user: AuthUser) {
    return this.authService.getProfileWithOrganization(user);
  }


  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perbarui profil pengguna (sekolah & kelas)' })
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() body: { fullName?: string; schoolName: string; className?: string },
  ) {
    return this.authService.updateStudentProfile(user, body);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Masuk atau mendaftar dengan akun Google' })
  async googleLogin(
    @Body() body: { email: string; name: string; avatarUrl?: string; googleId?: string; schoolName?: string; className?: string },
    @Req() req: Request,
  ) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.authService.loginWithGoogle(body, ip, ua);
  }

  @Get('admin/users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Daftar semua pengguna untuk Superadmin / Admin' })
  async listUsersForAdmin(@CurrentUser() user: AuthUser) {
    if (!user.isPlatformAdmin && !user.roles.includes('SUPERADMIN') && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Hanya Superadmin atau Admin yang dapat mengakses manajemen pengguna.');
    }
    return this.authService.listAllUsersForAdmin();
  }

  @Post('admin/users/:userId/role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ubah atau tunjuk peran pengguna oleh Superadmin / Admin' })
  async updateUserRole(
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
    @Body() body: { role: string },
  ) {
    if (!user.isPlatformAdmin && !user.roles.includes('SUPERADMIN') && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Hanya Superadmin atau Admin yang berhak menunjuk peran pengguna.');
    }
    return this.authService.updateUserRoleByAdmin(user, targetUserId, body.role);
  }

  @Delete('admin/users/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hapus pengguna oleh Superadmin / Admin' })
  async deleteUser(
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
  ) {
    if (!user.isPlatformAdmin && !user.roles.includes('SUPERADMIN') && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Hanya Superadmin atau Admin yang berhak menghapus pengguna.');
    }
    return this.authService.deleteUserByAdmin(user, targetUserId);
  }

}
