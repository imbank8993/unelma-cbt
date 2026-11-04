import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '@acca-cbt/shared';
import * as crypto from 'crypto';
import { CreatePaymentDto, CreateTokenPackageDto, SaveMidtransConfigDto, UnlockItemDto, UpdateTokenPackageDto } from './tokens.dto';

export interface MidtransConfig {
  is_production: boolean;
  sandbox_client_key?: string;
  sandbox_server_key?: string;
  production_client_key?: string;
  production_server_key?: string;
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // 1. TOKEN PACKAGES
  // ─────────────────────────────────────────────────────────────

  async getPublicPackages() {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, token_amount, price_idr, description, is_active
      FROM public.token_packages
      WHERE is_active = true
      ORDER BY price_idr ASC
    `);
  }

  async getAllPackagesAdmin() {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, token_amount, price_idr, description, is_active, created_at, updated_at
      FROM public.token_packages
      ORDER BY created_at DESC
    `);
  }

  async createPackage(dto: CreateTokenPackageDto) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO public.token_packages (name, token_amount, price_idr, description, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, dto.name, dto.token_amount, dto.price_idr, dto.description || '', dto.is_active ?? true);
    return { success: true, package: rows[0] };
  }

  async updatePackage(id: string, dto: UpdateTokenPackageDto) {
    const existing = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.token_packages WHERE id = $1::uuid
    `, id);
    if (!existing.length) throw new NotFoundException('Paket token tidak ditemukan.');

    const curr = existing[0];
    const name = dto.name ?? curr.name;
    const tokenAmount = dto.token_amount ?? curr.token_amount;
    const priceIdr = dto.price_idr ?? curr.price_idr;
    const description = dto.description ?? curr.description;
    const isActive = dto.is_active ?? curr.is_active;

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      UPDATE public.token_packages
      SET name = $1, token_amount = $2, price_idr = $3, description = $4, is_active = $5, updated_at = NOW()
      WHERE id = $6::uuid
      RETURNING *
    `, name, tokenAmount, priceIdr, description, isActive, id);
    return { success: true, package: rows[0] };
  }

  async deletePackage(id: string) {
    await this.prisma.$executeRawUnsafe(`
      DELETE FROM public.token_packages WHERE id = $1::uuid
    `, id);
    return { success: true, message: 'Paket token berhasil dihapus.' };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. MIDTRANS CONFIGURATION
  // ─────────────────────────────────────────────────────────────

  async getMidtransConfig(maskSecrets = true): Promise<MidtransConfig & { client_key?: string }> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT value FROM public.acca_settings WHERE key = 'midtrans_config'
    `);

    let cfg: MidtransConfig = {
      is_production: false,
      sandbox_client_key: this.config.get<string>('MIDTRANS_CLIENT_KEY') || '',
      sandbox_server_key: this.config.get<string>('MIDTRANS_SERVER_KEY') || '',
      production_client_key: '',
      production_server_key: '',
    };

    if (rows.length && rows[0].value) {
      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      cfg = { ...cfg, ...val };
    }

    const activeClientKey = cfg.is_production ? cfg.production_client_key : cfg.sandbox_client_key;
    const activeServerKey = cfg.is_production ? cfg.production_server_key : cfg.sandbox_server_key;

    if (maskSecrets) {
      return {
        is_production: Boolean(cfg.is_production),
        sandbox_client_key: cfg.sandbox_client_key,
        sandbox_server_key: cfg.sandbox_server_key ? '••••••••' + cfg.sandbox_server_key.slice(-4) : '',
        production_client_key: cfg.production_client_key,
        production_server_key: cfg.production_server_key ? '••••••••' + cfg.production_server_key.slice(-4) : '',
        client_key: activeClientKey,
      };
    }

    return {
      ...cfg,
      client_key: activeClientKey,
      sandbox_server_key: cfg.sandbox_server_key,
      production_server_key: cfg.production_server_key,
    };
  }

  async saveMidtransConfig(dto: SaveMidtransConfigDto) {
    const existing = await this.getMidtransConfig(false);
    const updated: MidtransConfig = {
      is_production: Boolean(dto.is_production),
      sandbox_client_key: dto.sandbox_client_key !== undefined ? dto.sandbox_client_key : existing.sandbox_client_key,
      sandbox_server_key: dto.sandbox_server_key && !dto.sandbox_server_key.includes('••••') ? dto.sandbox_server_key : existing.sandbox_server_key,
      production_client_key: dto.production_client_key !== undefined ? dto.production_client_key : existing.production_client_key,
      production_server_key: dto.production_server_key && !dto.production_server_key.includes('••••') ? dto.production_server_key : existing.production_server_key,
    };

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO public.acca_settings (key, value, updated_at)
      VALUES ('midtrans_config', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, JSON.stringify(updated));

    return { success: true, message: 'Konfigurasi Midtrans berhasil disimpan.' };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. MIDTRANS PAYMENTS & CHECKOUT
  // ─────────────────────────────────────────────────────────────

  async createPayment(user: AuthUser | null, dto: CreatePaymentDto) {
    const pkgs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.token_packages WHERE id = $1::uuid AND is_active = true
    `, dto.package_id);
    if (!pkgs.length) throw new NotFoundException('Paket token tidak tersedia atau nonaktif.');

    const pkg = pkgs[0];
    const customerEmail = dto.email || user?.email;
    const customerName = dto.customer_name || (user as any)?.nama || (user as any)?.name || user?.email?.split('@')[0] || 'Siswa';

    if (!customerEmail) {
      throw new BadRequestException('Email pengguna wajib diisi untuk transaksi pembayaran.');
    }

    const orderId = `TOKEN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const amount = Number(pkg.price_idr);

    const cfg = await this.getMidtransConfig(false);
    const serverKey = cfg.is_production ? cfg.production_server_key : cfg.sandbox_server_key;
    const clientKey = cfg.is_production ? cfg.production_client_key : cfg.sandbox_client_key;

    let snapToken = '';
    let redirectUrl = '';

    if (serverKey) {
      const snapEndpoint = cfg.is_production
        ? 'https://app.midtrans.com/snap/v1/transactions'
        : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

      const authHeader = 'Basic ' + Buffer.from(serverKey + ':').toString('base64');
      const payload = {
        transaction_details: {
          order_id: orderId,
          gross_amount: Math.round(amount),
        },
        customer_details: {
          first_name: customerName,
          email: customerEmail,
        },
        item_details: [
          {
            id: pkg.id,
            price: Math.round(amount),
            quantity: 1,
            name: `${pkg.name} (${pkg.token_amount} Token)`,
          },
        ],
      };

      try {
        const snapRes = await fetch(snapEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify(payload),
        });

        const snapJson = await snapRes.json();
        if (snapJson.token) {
          snapToken = snapJson.token;
          redirectUrl = snapJson.redirect_url;
        } else {
          this.logger.warn(`Midtrans Snap error: ${JSON.stringify(snapJson)}`);
        }
      } catch (err) {
        this.logger.error(`Gagal memanggil Midtrans Snap: ${(err as Error).message}`);
      }
    }

    // Simpan ke payment_transactions
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO public.payment_transactions (
        order_id, user_id, email, customer_name, package_id, package_name, 
        token_amount, amount, status, snap_token, snap_redirect_url
      ) VALUES (
        $1, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, 'pending', $9, $10
      )
      RETURNING *
    `, orderId, user?.id || null, customerEmail, customerName, pkg.id, pkg.name, pkg.token_amount, amount, snapToken, redirectUrl);

    return {
      success: true,
      order_id: orderId,
      snap_token: snapToken,
      redirect_url: redirectUrl,
      client_key: clientKey,
      is_production: cfg.is_production,
      transaction: rows[0],
    };
  }

  async handleWebhook(body: any) {
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status, payment_type } = body || {};

    if (!order_id) return { status: 'ignored', message: 'No order_id' };

    const cfg = await this.getMidtransConfig(false);
    const serverKey = cfg.is_production ? cfg.production_server_key : cfg.sandbox_server_key;

    // Verifikasi signature jika server key tersedia
    if (serverKey && signature_key) {
      const expected = crypto
        .createHash('sha512')
        .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
        .digest('hex');

      if (expected !== signature_key) {
        this.logger.warn(`Webhook signature mismatch for ${order_id}`);
        throw new ForbiddenException('Invalid signature');
      }
    }

    const txs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.payment_transactions WHERE order_id = $1
    `, order_id);

    if (!txs.length) {
      this.logger.warn(`Transaction ${order_id} not found in database.`);
      return { status: 'not_found' };
    }

    const tx = txs[0];
    if (tx.status === 'success') {
      return { status: 'already_success' };
    }

    const isSettled =
      transaction_status === 'settlement' ||
      (transaction_status === 'capture' && fraud_status !== 'challenge');

    const isFailed =
      transaction_status === 'cancel' ||
      transaction_status === 'deny' ||
      transaction_status === 'expire';

    if (isSettled) {
      await this.prisma.$transaction(async (prisma) => {
        // 1. Update status transaksi pembayaran
        await prisma.$executeRawUnsafe(`
          UPDATE public.payment_transactions
          SET status = 'success', payment_type = $1, paid_at = NOW(), updated_at = NOW()
          WHERE id = $2::uuid
        `, payment_type || 'midtrans', tx.id);

        // 2. Tambah saldo token ke profil pengguna
        let targetUserId = tx.user_id;
        if (!targetUserId && tx.email) {
          const u = await prisma.$queryRawUnsafe<any[]>(`
            SELECT id FROM auth.users WHERE lower(email) = lower($1)
          `, tx.email);
          if (u.length) targetUserId = u[0].id;
        }

        if (targetUserId) {
          await prisma.$executeRawUnsafe(`
            UPDATE public.cbt_profiles
            SET token_balance = COALESCE(token_balance, 0) + $1
            WHERE id = $2::uuid
          `, tx.token_amount, targetUserId);

          // 3. Catat mutasi token di token_transactions
          await prisma.$executeRawUnsafe(`
            INSERT INTO public.token_transactions (user_id, amount, type, description, reference_id)
            VALUES ($1::uuid, $2, 'topup', $3, $4)
          `, targetUserId, tx.token_amount, `Top up token: ${tx.package_name || 'Paket Token'}`, order_id);
        }
      });

      this.logger.log(`[Token Webhook] Order ${order_id} settled successfully! User credited with ${tx.token_amount} tokens.`);
      return { status: 'settled', tokens_credited: tx.token_amount };
    } else if (isFailed) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE public.payment_transactions
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1::uuid
      `, tx.id);
      return { status: 'failed' };
    }

    return { status: 'pending' };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. USER TOKEN BALANCE & USAGE
  // ─────────────────────────────────────────────────────────────

  async getUserBalance(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COALESCE(token_balance, 0) as balance FROM public.cbt_profiles WHERE id = $1::uuid
    `, userId);
    return Number(rows[0]?.balance || 0);
  }

  async getUserTransactions(userId: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, amount, type, description, reference_id, created_at
      FROM public.token_transactions
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 100
    `, userId);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. UNLOCK ITEMS (EXAM / BAHAN AJAR)
  // ─────────────────────────────────────────────────────────────

  async checkAccess(userId: string, itemType: 'exam' | 'material', itemId: string) {
    let title = '';
    let isPaid = false;
    let tokenPrice = 0;

    if (itemType === 'exam') {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT title, COALESCE(is_paid, false) as is_paid, COALESCE(token_price, 0) as token_price
        FROM public.cbt_exams
        WHERE id = $1::uuid
      `, itemId);
      if (!rows.length) throw new NotFoundException('Ujian tidak ditemukan.');
      title = rows[0].title;
      isPaid = Boolean(rows[0].is_paid);
      tokenPrice = Number(rows[0].token_price || 0);
    } else {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT title, COALESCE(is_paid, false) as is_paid, COALESCE(token_price, 0) as token_price
        FROM public.cbt_learning_materials
        WHERE id = $1::uuid
      `, itemId);
      if (!rows.length) throw new NotFoundException('Bahan ajar tidak ditemukan.');
      title = rows[0].title;
      isPaid = Boolean(rows[0].is_paid);
      tokenPrice = Number(rows[0].token_price || 0);
    }

    if (!isPaid || tokenPrice <= 0) {
      return { hasAccess: true, isFree: true, title, tokenPrice: 0 };
    }

    // Cek apakah user sudah pernah membuka item ini sebelumnya
    const unlocked = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 1 FROM public.unlocked_items
      WHERE user_id = $1::uuid AND item_type = $2 AND item_id = $3
      LIMIT 1
    `, userId, itemType, itemId);

    const userBalance = await this.getUserBalance(userId);

    if (unlocked.length > 0) {
      return { hasAccess: true, isUnlocked: true, title, tokenPrice, balance: userBalance };
    }

    return { hasAccess: false, isUnlocked: false, title, tokenPrice, balance: userBalance };
  }

  async unlockItem(userId: string, dto: UnlockItemDto) {
    const { itemType, itemId } = dto;
    const access = await this.checkAccess(userId, itemType, itemId);

    if (access.hasAccess) {
      return { success: true, message: 'Item sudah terbuka.', remainingBalance: access.balance || 0 };
    }

    const tokenCost = access.tokenPrice;
    const currentBalance = await this.getUserBalance(userId);

    if (currentBalance < tokenCost) {
      throw new BadRequestException(
        `Saldo token Anda tidak mencukupi (Saldo: ${currentBalance} Token, Dibutuhkan: ${tokenCost} Token). Silakan lakukan top up token terlebih dahulu.`,
      );
    }

    const itemLabel = itemType === 'exam' ? 'Ujian' : 'Bahan Ajar';
    const desc = `Membuka akses ${itemLabel}: ${access.title}`;

    await this.prisma.$transaction(async (prisma) => {
      // 1. Kurangi token_balance
      await prisma.$executeRawUnsafe(`
        UPDATE public.cbt_profiles
        SET token_balance = token_balance - $1
        WHERE id = $2::uuid
      `, tokenCost, userId);

      // 2. Catat pemakaian token
      await prisma.$executeRawUnsafe(`
        INSERT INTO public.token_transactions (user_id, amount, type, description, reference_id)
        VALUES ($1::uuid, $2, 'usage', $3, $4)
      `, userId, -tokenCost, desc, itemId);

      // 3. Tambahkan ke unlocked_items
      await prisma.$executeRawUnsafe(`
        INSERT INTO public.unlocked_items (user_id, item_type, item_id)
        VALUES ($1::uuid, $2, $3)
        ON CONFLICT (user_id, item_type, item_id) DO NOTHING
      `, userId, itemType, itemId);
    });

    const newBalance = currentBalance - tokenCost;
    return {
      success: true,
      message: `Berhasil membuka ${itemLabel} "${access.title}". Saldo token berkurang ${tokenCost}.`,
      remainingBalance: newBalance,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. ADMIN TRACKERS
  // ─────────────────────────────────────────────────────────────

  async getPurchasesTracker(search = '') {
    const s = `%${search.trim().toLowerCase()}%`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        pt.id, pt.order_id, pt.user_id, pt.email, pt.customer_name,
        pt.package_name, pt.token_amount, pt.amount, pt.status,
        pt.payment_type, pt.paid_at, pt.created_at,
        COALESCE(p.full_name, pt.customer_name, 'Pengguna') as user_name
      FROM public.payment_transactions pt
      LEFT JOIN public.cbt_profiles p ON p.id = pt.user_id
      WHERE $1 = '%%' 
         OR lower(pt.order_id) LIKE $1 
         OR lower(pt.email) LIKE $1 
         OR lower(COALESCE(pt.customer_name, '')) LIKE $1
         OR lower(COALESCE(p.full_name, '')) LIKE $1
      ORDER BY pt.created_at DESC
      LIMIT 200
    `, s);

    // Hitung statistik
    const stats = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        COUNT(*)::int as total_orders,
        COUNT(CASE WHEN status = 'success' THEN 1 END)::int as success_orders,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0)::numeric as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'success' THEN token_amount ELSE 0 END), 0)::int as total_tokens_sold
      FROM public.payment_transactions
    `);

    return {
      transactions: rows,
      stats: stats[0] || { total_orders: 0, success_orders: 0, total_revenue: 0, total_tokens_sold: 0 },
    };
  }

  async getUsagesTracker(search = '') {
    const s = `%${search.trim().toLowerCase()}%`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        tt.id, tt.user_id, tt.amount, tt.type, tt.description,
        tt.reference_id, tt.created_at,
        p.email as user_email,
        COALESCE(p.full_name, 'Siswa') as user_name,
        ui.item_type
      FROM public.token_transactions tt
      LEFT JOIN public.cbt_profiles p ON p.id = tt.user_id
      LEFT JOIN public.unlocked_items ui ON ui.user_id = tt.user_id AND ui.item_id = tt.reference_id
      WHERE tt.amount < 0 AND (
        $1 = '%%'
        OR lower(tt.description) LIKE $1
        OR lower(COALESCE(p.email, '')) LIKE $1
        OR lower(COALESCE(p.full_name, '')) LIKE $1
      )
      ORDER BY tt.created_at DESC
      LIMIT 200
    `, s);

    const stats = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        COUNT(*)::int as total_unlocks,
        ABS(COALESCE(SUM(amount), 0))::int as total_tokens_spent,
        COUNT(DISTINCT user_id)::int as active_students
      FROM public.token_transactions
      WHERE amount < 0
    `);

    return {
      usages: rows,
      stats: stats[0] || { total_unlocks: 0, total_tokens_spent: 0, active_students: 0 },
    };
  }
}
