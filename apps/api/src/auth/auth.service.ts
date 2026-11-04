import { SignupDto } from './dto/login.dto';
import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { jwtVerify } from 'jose';
import { type AuthUser, type LoginResponse, isSuperadminEmail } from '@acca-cbt/shared';
import { DbService } from '../prisma/prisma-db-adapter';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUsersRepository } from './auth-users.repository';
import { LoginHistoryService } from './login-history.service';
import { CbtRolesService } from './cbt-roles.service';
import { SingleSchoolService } from './single-school.service';

/** Peran sekolah yang disamakan persis dengan isi tiket SSO. */
const SSO_SYNCED_ROLES = ['ADMIN', 'PROKTOR', 'GURU', 'PENGAWAS', 'SISWA'] as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authUsers: AuthUsersRepository,
    private readonly roles: CbtRolesService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly db: DbService,
    private readonly prisma: PrismaService,
    private readonly schoolScope: SingleSchoolService,
    private readonly loginHistory: LoginHistoryService,
  ) {}

  async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    const identifier = (email || '').trim().toLowerCase();
    const user = await this.authUsers.findByEmail(identifier);

    // Pesan yang sama untuk email tidak dikenal maupun password salah, supaya
    // endpoint ini tidak bisa dipakai memeriksa email mana yang terdaftar.
    if (!user) {
      this.logger.warn(`Login gagal: email '${identifier}' tidak ditemukan`);
      throw new UnauthorizedException('Email atau password salah.');
    }
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      throw new UnauthorizedException('Akun sedang dinonaktifkan.');
    }

    const valid = await this.authUsers.verifyPassword(password, user.encrypted_password);
    if (!valid) {
      this.logger.warn(`Login gagal: password salah untuk '${identifier}'`);
      void this.loginHistory.record({
        userId: user.id,
        loginMethod: 'password',
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Password salah',
      });
      throw new UnauthorizedException('Email atau password salah.');
    }

    await this.authUsers.touchLastSignIn(user.id);
    void this.loginHistory.record({
      userId: user.id,
      loginMethod: 'password',
      ipAddress,
      userAgent,
      success: true,
    });
    return this.issueSession(user.id, user.email || identifier, user.raw_user_meta_data);
  }

  /**
   * Tukar tiket SSO acca-app dengan sesi CBT.
   *
   * Alur lama menukar tiket ini dengan magic link Supabase, lalu menyerahkan
   * access+refresh token lewat fragment URL. Rangkaian itu rapuh: kedua aplikasi
   * menggerakkan satu keluarga refresh token, Supabase merotasinya tiap
   * pemakaian, dan aplikasi yang menyegarkan belakangan kehilangan sesinya —
   * tepat di tengah ujian, sehingga autosave jawaban ikut ditolak.
   *
   * Karena kedua aplikasi kini memakai JWT_SECRET yang sama, seluruh rangkaian
   * itu tidak diperlukan lagi: tiket diverifikasi, peran disinkronkan, lalu CBT
   * menerbitkan tokennya sendiri.
   */
  async exchangeSsoTicket(token: string, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    const secret = this.config.get<string>('CBT_SSO_SECRET');
    if (!secret) {
      throw new UnauthorizedException('CBT_SSO_SECRET belum diset di server.');
    }

    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(token, new TextEncoder().encode(secret));
      payload = verified.payload as Record<string, unknown>;
    } catch (error) {
      this.logger.warn(`Tiket SSO ditolak: ${(error as Error).message}`);
      throw new UnauthorizedException('Tiket SSO tidak valid atau sudah kedaluwarsa.');
    }

    const userId = String(payload.sub || '');
    const fullName = String(payload.name || '');
    const roleClaim = String(payload.role || '');

    if (!userId) {
      throw new UnauthorizedException('Tiket SSO tidak menyertakan identitas pengguna.');
    }

    const user = await this.authUsers.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Akun pada tiket SSO tidak ditemukan di CBT.');
    }
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      throw new UnauthorizedException('Akun sedang dinonaktifkan.');
    }

    // Pengecekan ketat status aktif di master tabel public.users
    const publicUsers = await this.prisma.$queryRawUnsafe<
      Array<{ id: bigint; aktif: boolean; nama: string | null; nama_lengkap: string | null; nip: string | null; foto_profil: string | null }>
    >(
      `SELECT id, aktif, nama, nama_lengkap, nip, foto_profil 
         FROM public.users 
        WHERE auth_id = $1::uuid
        LIMIT 1`,
      userId,
    );

    if (publicUsers.length > 0 && publicUsers[0].aktif === false) {
      throw new UnauthorizedException('Akun Anda telah dinonaktifkan di sistem ACCA.');
    }

    const verifiedName =
      publicUsers[0]?.nama_lengkap ||
      publicUsers[0]?.nama ||
      fullName ||
      (user.raw_user_meta_data?.full_name as string) ||
      '';

    await this.syncSsoMembership(
      userId,
      verifiedName,
      roleClaim,
      publicUsers[0]?.foto_profil,
      publicUsers[0]?.nip,
    );
    await this.authUsers.touchLastSignIn(userId);
    void this.loginHistory.record({
      userId,
      loginMethod: 'sso',
      ipAddress,
      userAgent,
      success: true,
    });

    return this.issueSession(
      userId,
      user.email || String(payload.email || ''),
      user.raw_user_meta_data,
      verifiedName,
    );
  }

  /**
   * Samakan keanggotaan dan peran dengan isi tiket.
   *
   * Peran sekolah disamakan PERSIS: yang hilang dari tiket ikut dicabut agar
   * perubahan peran di ACCA New berlaku saat pengguna masuk kembali ke CBT.
   */
  private async syncSsoMembership(
    userId: string,
    fullName: string,
    roleClaim: string,
    avatarUrl?: string | null,
    identityNumber?: string | null,
  ): Promise<void> {
    const org = await this.schoolScope.getSchool({ createIfMissing: true });

    const profilePayload: Record<string, any> = { id: userId };
    if (fullName) profilePayload.full_name = fullName;
    if (avatarUrl) profilePayload.avatar_url = avatarUrl;
    if (identityNumber) profilePayload.identity_number = identityNumber;

    if (Object.keys(profilePayload).length > 1) {
      const { error } = await this.db
        .from('cbt_profiles')
        .upsert(profilePayload, { onConflict: 'id' });
      if (error) this.logger.warn(`Failed to sync SSO profile: ${error.message}`);
    }

    const { data: member } = await this.db
      .from('cbt_organization_members')
      .upsert(
        { organization_id: org.id, user_id: userId },
        { onConflict: 'organization_id,user_id' },
      )
      .select()
      .single();

    // Dulu `if (!member) return;` tanpa suara. Upsert ini SELALU mengembalikan
    // null selama adapter memakai DO NOTHING untuk payload yang seluruh
    // kolomnya kolom konflik, sehingga penyamaan peran di bawah tidak pernah
    // sekali pun dijalankan — dan tidak ada jejaknya di log.
    if (!member) {
      this.logger.error(
        `Keanggotaan organisasi untuk ${userId} tidak terbaca; peran SSO tidak disinkronkan.`,
      );
      return;
    }

    const ticketRoles = new Set(
      roleClaim
        .split(',')
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean),
    );

    const { data: allRoles } = await this.db.from('cbt_roles').select('id, name');
    const roleIdByName = new Map<string, string>(
      ((allRoles as Array<{ id: string; name: string }>) || []).map((r) => [
        String(r.name).toUpperCase(),
        r.id,
      ]),
    );

    const desired = new Set<string>();
    for (const name of [...SSO_SYNCED_ROLES, 'ADMIN']) {
      const id = roleIdByName.get(name);
      if (id && ticketRoles.has(name)) desired.add(id);
    }

    const { data: currentRows } = await this.db
      .from('cbt_member_roles')
      .select('role_id')
      .eq('organization_member_id', member.id);

    const syncedIds = new Set(
      SSO_SYNCED_ROLES.map((n) => roleIdByName.get(n)).filter(Boolean) as string[],
    );
    const current = ((currentRows as Array<{ role_id: string }>) || []).map((r) => r.role_id);

    const toRemove = current.filter((id) => syncedIds.has(id) && !desired.has(id));
    if (toRemove.length > 0) {
      await this.db
        .from('cbt_member_roles')
        .delete()
        .eq('organization_member_id', member.id)
        .in('role_id', toRemove);
    }

    const currentSet = new Set(current);
    const toAdd = [...desired].filter((id) => !currentSet.has(id));
    if (toAdd.length > 0) {
      await this.db.from('cbt_member_roles').upsert(
        toAdd.map((roleId) => ({
          organization_member_id: member.id,
          role_id: roleId,
        })),
        { onConflict: 'organization_member_id,role_id' },
      );
    }
  }

  /**
   * Perpanjang sesi HANYA selama siswa sedang mengerjakan ujian.
   *
   * Sesi berlaku 12 jam sejak login dan dulu tidak pernah diperpanjang. Siswa
   * yang login malam sebelumnya (atau lewat portal SSO pagi-pagi) kehilangan
   * sesinya di tengah ujian: simpan otomatis, heartbeat, dan pengumpulan ditolak
   * 401 padahal jaringan normal, sehingga jawaban menumpuk di perangkat.
   * Status akun dibaca ulang supaya akun yang dinonaktifkan tidak ikut diperpanjang.
   */
  async refreshExamSession(current: AuthUser): Promise<LoginResponse> {
    const user = await this.authUsers.findById(current.id);
    if (!user) throw new UnauthorizedException('Akun tidak ditemukan.');
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      throw new UnauthorizedException('Akun sedang dinonaktifkan.');
    }
    const inactive = await this.prisma.$queryRawUnsafe<Array<{ aktif: boolean }>>(
      `SELECT aktif FROM public.users WHERE auth_id = $1::uuid LIMIT 1`, current.id);
    if (inactive.length > 0 && inactive[0].aktif === false) {
      throw new UnauthorizedException('Akun Anda telah dinonaktifkan di sistem ACCA.');
    }
    const active = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.cbt_exam_attempts WHERE user_id = $1::uuid AND status = 'in_progress' LIMIT 1`, current.id);
    if (active.length === 0) {
      throw new ForbiddenException('Sesi hanya diperpanjang selama ujian sedang dikerjakan.');
    }
    return this.issueSession(current.id, user.email || current.email || '', user.raw_user_meta_data, current.fullName || undefined);
  }

  private async issueSession(
    userId: string,
    email: string,
    metadata: Record<string, unknown> | null,
    overrideFullName?: string,
  ): Promise<LoginResponse> {
    const context = await this.roles.resolve(userId, email, metadata);

    const user: AuthUser = {
      id: userId,
      email,
      fullName: overrideFullName || (metadata?.full_name as string) || null,
      roles: context.roleNames,
      resolved: context.resolved,
      bestRole: context.bestRole,
      organizationId: context.organizationId,
      organizationName: context.organizationName,
      isPlatformAdmin: context.isPlatformAdmin,
    };

    // Klaim dibuat sebentuk dengan token acca-new agar satu token berlaku di
    // kedua aplikasi. Peran ikut disertakan HANYA sebagai petunjuk untuk
    // middleware; otorisasi tetap membaca ulang peran dari database.
    const accessToken = this.jwt.sign({
      sub: userId,
      authId: userId,
      email,
      role: context.roleNames.join(','),
    });

    return { access_token: accessToken, token_type: 'Bearer', user };
  }

  /**
   * Profil pemanggil beserta organisasi yang ditampilkan bilah sisi.
   *
   * Pemasangan ini satu sekolah, jadi profil hanya mencari keanggotaan aktif
   * pada ID sekolah instalasi yang sudah diverifikasi.
   */
  async getProfileWithOrganization(user: AuthUser) {
    let { data: profile } = await this.db
      .from('cbt_profiles')
      .select('id, full_name, identity_number, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    try {
      const publicUsers = await this.prisma.$queryRawUnsafe<
        Array<{ foto_profil: string | null; nip: string | null; nama: string | null; nama_lengkap: string | null }>
      >(
        `SELECT foto_profil, nip, nama, nama_lengkap 
           FROM public.users 
          WHERE auth_id = $1::uuid
          LIMIT 1`,
        user.id,
      );

      if (publicUsers.length > 0) {
        const pu = publicUsers[0];
        const avatarUrl = profile?.avatar_url || pu.foto_profil || null;
        const identityNumber = profile?.identity_number || pu.nip || null;
        const fullName = profile?.full_name || pu.nama_lengkap || pu.nama || null;

        if (
          avatarUrl !== profile?.avatar_url ||
          identityNumber !== profile?.identity_number ||
          fullName !== profile?.full_name
        ) {
          const { error } = await this.db
            .from('cbt_profiles')
            .upsert(
              {
                id: user.id,
                full_name: fullName,
                identity_number: identityNumber,
                avatar_url: avatarUrl,
              },
              { onConflict: 'id' },
            );
          if (error) throw new Error(error.message);

          profile = {
            id: user.id,
            full_name: fullName,
            identity_number: identityNumber,
            avatar_url: avatarUrl,
          };
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to sync profile from public.users: ${(err as Error).message}`);
    }

    const school = await this.schoolScope.getSchool();
    const { data: membership } = await this.db
      .from('cbt_organization_members')
      .select('organization_id, organizations:cbt_organizations(id, name, logo_url)')
      .eq('user_id', user.id)
      .eq('organization_id', school.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const related = (membership as { organizations?: unknown } | null)?.organizations;
    const organization = Array.isArray(related) ? related[0] : related;

    return { profile: profile ?? null, organization: organization ?? null };
  }


  async loginWithGoogle(
    payload: { email: string; name: string; avatarUrl?: string | null; googleId?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponse> {
    const normalizedEmail = (payload.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email Google tidak valid.');
    }

    const authUser = await this.authUsers.findOrCreateOAuthUser({
      email: normalizedEmail,
      name: payload.name || 'Pengguna Google',
      avatarUrl: payload.avatarUrl,
      provider: 'google',
    });

    if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) {
      throw new UnauthorizedException('Akun sedang dinonaktifkan.');
    }

    // Ensure profile in cbt_profiles
    await this.db.from('cbt_profiles').upsert(
      {
        id: authUser.id,
        full_name: payload.name || 'Pengguna Google',
        avatar_url: payload.avatarUrl || null,
        email: normalizedEmail,
      },
      { onConflict: 'id' },
    );

    const school = await this.schoolScope.getSchool({ createIfMissing: true });

    // Ensure organization membership
    const { data: member } = await this.db
      .from('cbt_organization_members')
      .upsert(
        {
          user_id: authUser.id,
          organization_id: school.id,
          is_active: true,
        },
        { onConflict: 'user_id,organization_id' },
      )
      .select('id')
      .maybeSingle();

    const isSuper = isSuperadminEmail(normalizedEmail);
    if (isSuper) {
      // Superadmin: ensure platform_admins and Admin role
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.platform_admins (id, email, created_at)
         VALUES ($1::uuid, $2, now())
         ON CONFLICT (id) DO NOTHING`,
        authUser.id,
        normalizedEmail,
      );

      const { data: adminRole } = await this.db.from('cbt_roles').select('id').eq('name', 'Admin').maybeSingle();
      if (adminRole && member) {
        await this.db.from('cbt_member_roles').upsert(
          {
            organization_member_id: (member as any).id,
            role_id: (adminRole as any).id,
          },
          { onConflict: 'organization_member_id,role_id' },
        );
      }
    } else {
      // Normal user: if no role yet, assign Siswa role
      if (member) {
        const { data: existingRoles } = await this.db
          .from('cbt_member_roles')
          .select('id')
          .eq('organization_member_id', (member as any).id);

        if (!existingRoles || (existingRoles as any[]).length === 0) {
          const { data: siswaRole } = await this.db.from('cbt_roles').select('id').eq('name', 'Siswa').maybeSingle();
          if (siswaRole) {
            await this.db.from('cbt_member_roles').insert({
              organization_member_id: (member as any).id,
              role_id: (siswaRole as any).id,
            });
          }
        }
      }
    }

    await this.authUsers.touchLastSignIn(authUser.id);
    void this.loginHistory.record({
      userId: authUser.id,
      loginMethod: 'google',
      ipAddress,
      userAgent,
      success: true,
    });

    return this.issueSession(
      authUser.id,
      normalizedEmail,
      authUser.raw_user_meta_data,
      payload.name || undefined,
    );
  }

  async listAllUsersForAdmin(): Promise<any[]> {
    const query = `
      SELECT 
        u.id, 
        u.email, 
        u.created_at, 
        u.last_sign_in_at,
        p.full_name, 
        p.avatar_url,
        p.school_name,
        p.class_name,
        pa.id IS NOT NULL as is_platform_admin,
        ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles
      FROM auth.users u
      LEFT JOIN public.cbt_profiles p ON p.id = u.id
      LEFT JOIN public.platform_admins pa ON pa.id = u.id
      LEFT JOIN public.cbt_organization_members om ON om.user_id = u.id
      LEFT JOIN public.cbt_member_roles mr ON mr.organization_member_id = om.id
      LEFT JOIN public.cbt_roles r ON r.id = mr.role_id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.email, u.created_at, u.last_sign_in_at, p.full_name, p.avatar_url, p.school_name, p.class_name, pa.id
      ORDER BY u.created_at DESC;
    `;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(query);
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name || r.email,
      avatarUrl: r.avatar_url,
      schoolName: r.school_name || null,
      className: r.class_name || null,
      isSuperadmin: isSuperadminEmail(r.email),
      isPlatformAdmin: Boolean(r.is_platform_admin),
      roles: r.roles || [],
      createdAt: r.created_at,
      lastSignInAt: r.last_sign_in_at,
    }));
  }

  async updateUserRoleByAdmin(targetUserId: string, newRole: string): Promise<{ success: boolean; message: string }> {
    const validRoles = ['Admin', 'Proktor', 'Guru', 'Siswa', 'Pengawas'];
    const matchedRole = validRoles.find((r) => r.toLowerCase() === (newRole || '').toLowerCase());
    if (!matchedRole) {
      throw new BadRequestException(`Role ${newRole} tidak valid. Pilih salah satu dari: ${validRoles.join(', ')}`);
    }

    const school = await this.schoolScope.getSchool({ createIfMissing: true });
    const { data: member } = await this.db
      .from('cbt_organization_members')
      .upsert(
        {
          user_id: targetUserId,
          organization_id: school.id,
          is_active: true,
        },
        { onConflict: 'user_id,organization_id' },
      )
      .select('id')
      .maybeSingle();

    if (!member) {
      throw new BadRequestException('Gagal memuat keanggotaan organisasi pengguna.');
    }

    const { data: roleRow } = await this.db.from('cbt_roles').select('id').ilike('name', matchedRole).maybeSingle();
    if (!roleRow) {
      throw new BadRequestException(`Role ${matchedRole} tidak ditemukan di database.`);
    }

    // Replace roles
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM public.cbt_member_roles WHERE organization_member_id = $1::uuid`,
      (member as any).id,
    );

    await this.db.from('cbt_member_roles').insert({
      organization_member_id: (member as any).id,
      role_id: (roleRow as any).id,
    });

    const targetUser = await this.authUsers.findById(targetUserId);
    if (matchedRole === 'Admin') {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.platform_admins (id, email, created_at)
         VALUES ($1::uuid, $2, now())
         ON CONFLICT (id) DO NOTHING`,
        targetUserId,
        targetUser?.email || '',
      );
    } else {
      if (!isSuperadminEmail(targetUser?.email)) {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM public.platform_admins WHERE id = $1::uuid`,
          targetUserId,
        );
      }
    }

    return { success: true, message: `Peran ${targetUser?.email || 'pengguna'} berhasil diubah menjadi ${matchedRole}.` };
  }


  async signup(dto: SignupDto, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    const normalizedEmail = (dto.email || '').trim().toLowerCase();
    if (!normalizedEmail || !dto.name || !dto.schoolName) {
      throw new BadRequestException('Email, Nama Lengkap, dan Asal Sekolah wajib diisi.');
    }

    const existing = await this.authUsers.findByEmail(normalizedEmail);
    if (existing) {
      throw new BadRequestException('Email sudah terdaftar. Silakan masuk ke akun Anda.');
    }

    const metadata = {
      full_name: dto.name,
      school_name: dto.schoolName,
      class_name: dto.className || null,
      role: 'Siswa',
    };

    let authUser: any;
    if (dto.password) {
      authUser = await this.authUsers.createUser({
        email: normalizedEmail,
        password: dto.password,
        emailConfirm: true,
        userMetadata: metadata,
      });
    } else {
      authUser = await this.authUsers.findOrCreateOAuthUser({
        email: normalizedEmail,
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        provider: 'google',
      });
    }

    // Insert profile with school_name and class_name
    await this.db.from('cbt_profiles').upsert(
      {
        id: authUser.id,
        full_name: dto.name,
        email: normalizedEmail,
        school_name: dto.schoolName,
        class_name: dto.className || null,
        avatar_url: dto.avatarUrl || null,
        role: 'Siswa',
      },
      { onConflict: 'id' },
    );

    const school = await this.schoolScope.getSchool({ createIfMissing: true });

    const { data: member } = await this.db
      .from('cbt_organization_members')
      .upsert(
        {
          user_id: authUser.id,
          organization_id: school.id,
          is_active: true,
        },
        { onConflict: 'user_id,organization_id' },
      )
      .select('id')
      .maybeSingle();

    // Default role for registered users is Siswa
    const isSuper = isSuperadminEmail(normalizedEmail);
    if (isSuper) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.platform_admins (id, email, created_at)
         VALUES ($1::uuid, $2, now())
         ON CONFLICT (id) DO NOTHING`,
        authUser.id,
        normalizedEmail,
      );

      const { data: adminRole } = await this.db.from('cbt_roles').select('id').eq('name', 'Admin').maybeSingle();
      if (adminRole && member) {
        await this.db.from('cbt_member_roles').upsert(
          {
            organization_member_id: (member as any).id,
            role_id: (adminRole as any).id,
          },
          { onConflict: 'organization_member_id,role_id' },
        );
      }
    } else {
      const { data: siswaRole } = await this.db.from('cbt_roles').select('id').eq('name', 'Siswa').maybeSingle();
      if (siswaRole && member) {
        await this.db.from('cbt_member_roles').upsert(
          {
            organization_member_id: (member as any).id,
            role_id: (siswaRole as any).id,
          },
          { onConflict: 'organization_member_id,role_id' },
        );
      }
    }

    await this.authUsers.touchLastSignIn(authUser.id);
    void this.loginHistory.record({
      userId: authUser.id,
      loginMethod: dto.password ? 'password' : 'google',
      ipAddress,
      userAgent,
      success: true,
    });

    return this.issueSession(
      authUser.id,
      normalizedEmail,
      metadata,
      dto.name,
    );
  }

}
