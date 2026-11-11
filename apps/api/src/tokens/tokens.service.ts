import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DbService } from '../prisma/prisma-db-adapter';
import { AuthorizationService } from '../auth/authorization.service';
import { canAccessExam, loadExamAudience } from '../students/exam-access';
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

interface UnlockableItem {
  id: string;
  title: string;
  isPaid: boolean;
  tokenPrice: number;
  isFree: boolean;
  organization_id?: string | null;
  is_published?: boolean | null;
  metadata?: any;
  end_time?: string | Date | null;
  status?: string | null;
}

const MAX_PENDING_ORDERS_PER_10_MIN = 5;
const TRACKER_PAGE_SIZE = 50;
const TRACKER_PAGE_SIZE_MAX = 200;
const TRACKER_SEARCH_MAX = 100;

function basicAuth(serverKey: string) {
  return 'Basic ' + Buffer.from(serverKey + ':').toString('base64');
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly db: DbService,
    private readonly authz: AuthorizationService,
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
    const pickServerKey = (incoming: string | undefined, clear: boolean | undefined, current: string | undefined) => {
      if (clear) return '';
      const value = (incoming || '').trim();
      // Kosong atau masih berupa nilai tersamar dari GET = pertahankan kunci lama.
      if (!value || value.includes('••••')) return current || '';
      return value;
    };
    const updated: MidtransConfig = {
      is_production: Boolean(dto.is_production),
      sandbox_client_key: dto.sandbox_client_key !== undefined ? dto.sandbox_client_key.trim() : existing.sandbox_client_key,
      sandbox_server_key: pickServerKey(dto.sandbox_server_key, dto.clear_sandbox_server_key, existing.sandbox_server_key),
      production_client_key: dto.production_client_key !== undefined ? dto.production_client_key.trim() : existing.production_client_key,
      production_server_key: pickServerKey(dto.production_server_key, dto.clear_production_server_key, existing.production_server_key),
    };

    // Kunci berawalan SB- hanya berlaku di sandbox Midtrans.
    if ((updated.production_server_key || '').startsWith('SB-') || (updated.production_client_key || '').startsWith('SB-')) {
      throw new BadRequestException('Kunci Production tidak boleh berawalan "SB-" (itu kunci Sandbox).');
    }
    const activeServer = updated.is_production ? updated.production_server_key : updated.sandbox_server_key;
    const activeClient = updated.is_production ? updated.production_client_key : updated.sandbox_client_key;
    if (!activeServer || !activeClient) {
      const mode = updated.is_production ? 'Production' : 'Sandbox';
      throw new BadRequestException(
        `Client Key dan Server Key ${mode} wajib diisi sebelum mode ${mode} diaktifkan.`,
      );
    }

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

  async createPayment(user: AuthUser, dto: CreatePaymentDto) {
    const pkgs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.token_packages WHERE id = $1::uuid AND is_active = true
    `, dto.package_id);
    if (!pkgs.length) throw new NotFoundException('Paket token tidak tersedia atau nonaktif.');

    const pkg = pkgs[0];
    const amount = Math.round(Number(pkg.price_idr));
    if (!Number.isFinite(amount) || amount < 1) {
      throw new BadRequestException('Harga paket token tidak valid. Hubungi Administrator.');
    }

    // Batasi pesanan menggantung agar tabel transaksi dan kuota API Snap tidak dibanjiri.
    const recent = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*)::int AS n FROM public.payment_transactions
      WHERE user_id = $1::uuid AND status = 'pending' AND created_at > NOW() - INTERVAL '10 minutes'
    `, user.id);
    if (Number(recent[0]?.n || 0) >= MAX_PENDING_ORDERS_PER_10_MIN) {
      throw new HttpException(
        'Terlalu banyak pesanan yang belum dibayar. Selesaikan pembayaran sebelumnya atau tunggu beberapa menit.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Identitas pembeli diambil dari akun yang login, BUKAN dari isi request:
    // siswa tidak boleh bisa mengisi email/nama orang lain yang lalu tampil di
    // tracker admin atau dikirim ke Midtrans.
    const customerEmail = (user.email || '').trim();
    const customerName = (user.fullName || user.email?.split('@')[0] || 'Siswa').trim().slice(0, 100);
    const orderId = `TOKEN-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const cfg = await this.getMidtransConfig(false);
    const serverKey = cfg.is_production ? cfg.production_server_key : cfg.sandbox_server_key;
    const clientKey = cfg.is_production ? cfg.production_client_key : cfg.sandbox_client_key;
    if (!serverKey) {
      throw new ServiceUnavailableException('Pembayaran belum dikonfigurasi. Hubungi Administrator.');
    }

    const snapEndpoint = cfg.is_production
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
    const coreEndpoint = cfg.is_production
      ? 'https://api.midtrans.com/v2/charge'
      : 'https://api.sandbox.midtrans.com/v2/charge';

    const paymentMethod = (dto.payment_method || '').toLowerCase().trim();
    const isCoreApi = Boolean(paymentMethod);

    const transactionDetails = { order_id: orderId, gross_amount: amount };
    const customerDetails = {
      first_name: customerName,
      ...(customerEmail ? { email: customerEmail } : {}),
    };
    const itemDetails = [
      {
        id: pkg.id,
        price: amount,
        quantity: 1,
        name: `${pkg.name} (${pkg.token_amount} Token)`.slice(0, 50),
      },
    ];

    if (isCoreApi) {
      let chargePayload: any = {
        transaction_details: transactionDetails,
        customer_details: customerDetails,
        item_details: itemDetails,
      };

      if (paymentMethod === 'qris') {
        chargePayload.payment_type = 'qris';
        chargePayload.qris = { acquirer: 'gopay' };
      } else if (['bca_va', 'bni_va', 'bri_va', 'cimb_va'].includes(paymentMethod)) {
        const bank = paymentMethod.replace('_va', '');
        chargePayload.payment_type = 'bank_transfer';
        chargePayload.bank_transfer = { bank };
      } else if (paymentMethod === 'permata_va') {
        chargePayload.payment_type = 'bank_transfer';
        chargePayload.bank_transfer = { bank: 'permata' };
      } else if (paymentMethod === 'mandiri_bill') {
        chargePayload.payment_type = 'echannel';
        chargePayload.echannel = {
          bill_info1: 'Pembelian Token:',
          bill_info2: `${pkg.token_amount} Token Unelma`,
        };
      } else {
        throw new BadRequestException(`Metode pembayaran '${paymentMethod}' tidak didukung.`);
      }

      let chargeJson: any = null;
      try {
        const chargeRes = await fetch(coreEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: basicAuth(serverKey),
          },
          body: JSON.stringify(chargePayload),
        });
        chargeJson = await chargeRes.json();
      } catch (err) {
        this.logger.error(`Gagal memanggil Midtrans Core API: ${(err as Error).message}`);
        throw new ServiceUnavailableException('Gagal menghubungi gateway pembayaran Midtrans. Silakan coba lagi.');
      }

      if (!chargeJson || (chargeJson.status_code !== '201' && chargeJson.status_code !== '200')) {
        this.logger.warn(`Midtrans Core API error: ${JSON.stringify(chargeJson)}`);
        throw new BadRequestException(chargeJson?.status_message || 'Gagal memproses pembayaran. Periksa konfigurasi metode pembayaran.');
      }

      const qrAction = Array.isArray(chargeJson.actions)
        ? chargeJson.actions.find((a: any) => a.name === 'generate-qr-code')
        : null;
      const qrUrl = qrAction?.url || null;
      const qrString = chargeJson.qr_string || null;
      const vaNumber = chargeJson.va_numbers?.[0]?.va_number || chargeJson.permata_va_number || null;
      const bank = chargeJson.va_numbers?.[0]?.bank || (chargeJson.permata_va_number ? 'permata' : null) || (paymentMethod === 'mandiri_bill' ? 'mandiri' : null);
      const billerCode = chargeJson.biller_code || null;
      const billKey = chargeJson.bill_key || null;
      const expiryTime = chargeJson.expiry_time || null;

      const paymentDetails = {
        payment_method: paymentMethod,
        payment_type: chargeJson.payment_type || paymentMethod,
        qr_url: qrUrl,
        qr_string: qrString,
        va_number: vaNumber,
        bank,
        biller_code: billerCode,
        bill_key: billKey,
        expiry_time: expiryTime,
      };

      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO public.payment_transactions (
          order_id, user_id, email, customer_name, package_id, package_name,
          token_amount, amount, status, snap_token, snap_redirect_url, payment_type, payment_details
        ) VALUES (
          $1, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, 'pending', $9, $10, $11, $12::jsonb
        )
        RETURNING id, order_id, package_name, token_amount, amount, status, created_at
      `, orderId, user.id, customerEmail, customerName, pkg.id, pkg.name, pkg.token_amount, amount, null, null, paymentMethod, JSON.stringify(paymentDetails));

      return {
        success: true,
        order_id: orderId,
        payment_method: paymentMethod,
        payment_type: chargeJson.payment_type || paymentMethod,
        amount,
        token_amount: pkg.token_amount,
        package_name: pkg.name,
        payment_details: paymentDetails,
        is_production: cfg.is_production,
        transaction: rows[0],
      };
    }

    const payload = {
      transaction_details: transactionDetails,
      customer_details: customerDetails,
      item_details: itemDetails,
    };

    let snapToken = '';
    let redirectUrl = '';
    try {
      const snapRes = await fetch(snapEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: basicAuth(serverKey),
        },
        body: JSON.stringify(payload),
      });
      const snapJson = await snapRes.json();
      if (snapJson?.token) {
        snapToken = snapJson.token;
        redirectUrl = snapJson.redirect_url;
      } else {
        this.logger.warn(`Midtrans Snap error: ${JSON.stringify(snapJson)}`);
      }
    } catch (err) {
      this.logger.error(`Gagal memanggil Midtrans Snap: ${(err as Error).message}`);
    }
    if (!snapToken) {
      throw new ServiceUnavailableException('Gagal membuat transaksi di Midtrans. Silakan coba lagi.');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO public.payment_transactions (
        order_id, user_id, email, customer_name, package_id, package_name,
        token_amount, amount, status, snap_token, snap_redirect_url, payment_type, payment_details
      ) VALUES (
        $1, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, 'pending', $9, $10, 'snap', '{}'::jsonb
      )
      RETURNING id, order_id, package_name, token_amount, amount, status, created_at
    `, orderId, user.id, customerEmail, customerName, pkg.id, pkg.name, pkg.token_amount, amount, snapToken, redirectUrl);

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

  /**
   * Cocokkan signature notifikasi dengan server key yang tersimpan.
   * Kedua mode dicoba agar pesanan yang dibuat sebelum admin berpindah mode
   * (sandbox ↔ production) tetap bisa diselesaikan. Mengembalikan mode yang cocok.
   */
  private matchSignature(body: any, cfg: MidtransConfig): { production: boolean; serverKey: string } | null {
    const signature = typeof body?.signature_key === 'string' ? body.signature_key.toLowerCase() : '';
    if (!/^[0-9a-f]{128}$/.test(signature)) return null;
    const candidates = [
      { production: true, serverKey: cfg.production_server_key || '' },
      { production: false, serverKey: cfg.sandbox_server_key || '' },
    ];
    for (const c of candidates) {
      if (!c.serverKey) continue;
      const expected = crypto
        .createHash('sha512')
        .update(`${body.order_id}${body.status_code}${body.gross_amount}${c.serverKey}`)
        .digest();
      if (crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return c;
    }
    return null;
  }

  /** Status resmi dari API Midtrans — sumber kebenaran, bukan isi notifikasi. */
  private async fetchMidtransStatus(orderId: string, production: boolean, serverKey: string) {
    const base = production ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
    try {
      const res = await fetch(`${base}/v2/${encodeURIComponent(orderId)}/status`, {
        headers: { Accept: 'application/json', Authorization: basicAuth(serverKey) },
      });
      const json = await res.json();
      if (!json || json.order_id !== orderId || !json.transaction_status) {
        throw new Error(`status_code ${json?.status_code ?? res.status}`);
      }
      return json as { status_code?: string; transaction_status: string; fraud_status?: string; gross_amount: string; payment_type?: string };
    } catch (err) {
      this.logger.error(`Gagal memeriksa status Midtrans untuk ${orderId}: ${(err as Error).message}`);
      // 503 membuat Midtrans mengirim ulang notifikasi nanti.
      throw new ServiceUnavailableException('Status pembayaran belum dapat diverifikasi.');
    }
  }

  async handleWebhook(body: any) {
    const orderId = typeof body?.order_id === 'string' ? body.order_id : '';
    if (!orderId) return { status: 'ignored', message: 'No order_id' };

    const cfg = await this.getMidtransConfig(false);
    const matched = this.matchSignature(body, cfg);
    if (!matched) {
      this.logger.warn(`Webhook ditolak: signature tidak ada/tidak cocok untuk ${orderId}`);
      throw new ForbiddenException('Invalid signature');
    }

    const txs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.payment_transactions WHERE order_id = $1
    `, orderId);
    if (!txs.length) {
      this.logger.warn(`Transaction ${orderId} not found in database.`);
      // Snap dibuat sebelum baris lokal tersimpan. Jangan balas 200 jika
      // notifikasi mendahului INSERT: Midtrans perlu mengirimnya ulang.
      throw new ServiceUnavailableException('Transaksi pembayaran belum tersedia.');
    }
    const tx = txs[0];
    if (tx.status === 'success') return { status: 'already_success' };

    const official = await this.fetchMidtransStatus(orderId, matched.production, matched.serverKey);
    const expectedAmount = Math.round(Number(tx.amount));
    if (Math.round(Number(official.gross_amount)) !== expectedAmount) {
      this.logger.error(`Nominal tidak cocok untuk ${orderId}: Midtrans ${official.gross_amount}, DB ${tx.amount}`);
      throw new ForbiddenException('Amount mismatch');
    }

    const txStatus = official.transaction_status;
    const isSettled = official.status_code === '200' && (
      txStatus === 'settlement' ||
      (txStatus === 'capture' && (!official.fraud_status || official.fraud_status.toLowerCase() === 'accept'))
    );
    const isFailed = txStatus === 'cancel' || txStatus === 'deny' || txStatus === 'expire' || txStatus === 'failure';

    if (isSettled) {
      const credited = await this.creditSettledTransaction(tx, official, orderId);
      if (!credited) return { status: 'already_success' };
      this.logger.log(`[Token Webhook] Order ${orderId} settled. User credited with ${tx.token_amount} tokens.`);
      return { status: 'settled', tokens_credited: tx.token_amount };
    }

    if (isFailed) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE public.payment_transactions
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1::uuid AND status = 'pending'
      `, tx.id);
      return { status: 'failed' };
    }

    return { status: 'pending' };
  }

  private async creditSettledTransaction(tx: any, official: any, orderId: string): Promise<boolean> {
    return this.prisma.$transaction(async (prisma) => {
      // Klaim atomik: hanya satu proses (webhook atau polling pengguna) yang berhasil mengubah status.
      const claimed = await prisma.$queryRawUnsafe<any[]>(`
        UPDATE public.payment_transactions
        SET status = 'success', payment_type = $1, paid_at = NOW(), updated_at = NOW()
        WHERE id = $2::uuid AND status <> 'success'
        RETURNING id
      `, official.payment_type || tx.payment_type || 'midtrans', tx.id);
      if (!claimed.length) return false;

      let targetUserId = tx.user_id as string | null;
      if (!targetUserId && tx.email) {
        // Transaksi lama (sebelum pembelian wajib login) belum menyimpan user_id.
        const u = await prisma.$queryRawUnsafe<any[]>(`
          SELECT id FROM auth.users WHERE lower(email) = lower($1)
        `, tx.email);
        if (u.length) targetUserId = u[0].id;
      }
      if (!targetUserId) {
        throw new ServiceUnavailableException('Pemilik transaksi belum dapat ditemukan.');
      }

      const profiles = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
        UPDATE public.cbt_profiles
        SET token_balance = COALESCE(token_balance, 0) + $1
        WHERE id = $2::uuid
        RETURNING id
      `, tx.token_amount, targetUserId);
      if (!profiles.length) {
        throw new ServiceUnavailableException('Profil penerima token belum tersedia.');
      }
      await prisma.$executeRawUnsafe(`
        INSERT INTO public.token_transactions (user_id, amount, type, description, reference_id)
        VALUES ($1::uuid, $2, 'topup', $3, $4)
      `, targetUserId, tx.token_amount, `Top up token: ${tx.package_name || 'Paket Token'}`, orderId);
      return true;
    });
  }

  /**
   * Cek status transaksi pembayaran token dari pengguna saat membuka layar pembayaran kustom.
   * Bila di Midtrans sudah lunas (settlement), saldo langsung dikreditkan tanpa harus menunggu webhook.
   */
  async checkPaymentStatus(user: AuthUser, orderId: string) {
    const cleanOrderId = (orderId || '').trim();
    if (!cleanOrderId) throw new BadRequestException('Order ID wajib disertakan.');

    const txs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.payment_transactions WHERE order_id = $1
    `, cleanOrderId);
    if (!txs.length) throw new NotFoundException('Transaksi tidak ditemukan.');

    const tx = txs[0];
    const isOwner = tx.user_id === user.id;
    const isAdmin = user.isPlatformAdmin || user.roles.includes('ADMIN') || user.resolved?.superadmin === true;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Anda tidak berhak memeriksa transaksi ini.');
    }

    if (tx.status === 'success') {
      const balance = await this.getUserBalance(tx.user_id);
      return { success: true, status: 'success', token_amount: tx.token_amount, balance };
    }

    if (tx.status === 'failed') {
      return { success: true, status: 'failed', message: 'Transaksi dibatalkan atau telah kedaluwarsa.' };
    }

    // Ambil status resmi ke Midtrans
    const cfg = await this.getMidtransConfig(false);
    const serverKey = cfg.is_production ? cfg.production_server_key : cfg.sandbox_server_key;
    if (!serverKey) {
      return { success: true, status: tx.status, payment_details: tx.payment_details };
    }

    let official: any = null;
    try {
      official = await this.fetchMidtransStatus(cleanOrderId, cfg.is_production, serverKey);
    } catch {
      return { success: true, status: tx.status, payment_details: tx.payment_details };
    }

    const txStatus = official?.transaction_status;
    const isSettled = official?.status_code === '200' && (
      txStatus === 'settlement' ||
      (txStatus === 'capture' && (!official.fraud_status || official.fraud_status.toLowerCase() === 'accept'))
    );
    const isFailed = txStatus === 'cancel' || txStatus === 'deny' || txStatus === 'expire' || txStatus === 'failure';

    if (isSettled) {
      await this.creditSettledTransaction(tx, official, cleanOrderId);
      const balance = await this.getUserBalance(tx.user_id);
      return { success: true, status: 'success', token_amount: tx.token_amount, balance };
    }

    if (isFailed) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE public.payment_transactions
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1::uuid AND status = 'pending'
      `, tx.id);
      return { success: true, status: 'failed', message: 'Transaksi dibatalkan atau telah kedaluwarsa.' };
    }

    return {
      success: true,
      status: 'pending',
      payment_type: official.payment_type || tx.payment_type,
      payment_details: tx.payment_details,
    };
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

  private async loadItem(itemType: 'exam' | 'material', itemId: string): Promise<UnlockableItem> {
    const rows = itemType === 'exam'
      ? await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT title, COALESCE(is_paid, false) as is_paid, COALESCE(token_price, 0) as token_price,
                 organization_id, is_published, metadata, end_time
          FROM public.cbt_exams
          WHERE id = $1::uuid
        `, itemId)
      : await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT title, COALESCE(is_paid, false) as is_paid, COALESCE(token_price, 0) as token_price,
                 organization_id, status
          FROM public.cbt_learning_materials
          WHERE id = $1::uuid
        `, itemId);
    if (!rows.length) {
      throw new NotFoundException(itemType === 'exam' ? 'Ujian tidak ditemukan.' : 'Bahan ajar tidak ditemukan.');
    }
    const row = rows[0];
    const isPaid = Boolean(row.is_paid);
    const tokenPrice = Number(row.token_price || 0);
    return { ...row, id: itemId, isPaid, tokenPrice, isFree: !isPaid || tokenPrice <= 0 };
  }

  /**
   * Saldo hanya boleh dipotong untuk item yang memang bisa dipakai siswa ini.
   * Aturannya sama dengan memulai ujian (`canAccessExam`) dan membaca bahan
   * ajar (terbit + anggota sekolah). Tanpa ini siswa bisa terpotong token —
   * dan pembuatnya ikut mendapat komisi — untuk ujian draf, ujian sekolah
   * lain, atau ujian yang tidak ditugaskan kepadanya.
   */
  private async assertUnlockable(user: AuthUser, itemType: 'exam' | 'material', item: UnlockableItem) {
    const unavailable = () => new ForbiddenException(
      itemType === 'exam' ? 'Ujian ini tidak tersedia untuk Anda.' : 'Bahan ajar ini tidak tersedia untuk Anda.',
    );
    if (itemType === 'exam') {
      const metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
      const exam = { id: item.id, organization_id: item.organization_id ?? null, is_published: item.is_published === true, metadata };
      if (!canAccessExam(exam, await loadExamAudience(this.db, user))) throw unavailable();
      if (item.end_time && new Date(item.end_time).getTime() <= Date.now()) {
        throw new BadRequestException('Ujian ini sudah berakhir sehingga tidak dapat dibuka lagi.');
      }
      return;
    }
    if (item.status !== 'published') throw unavailable();
    try {
      await this.authz.assertOrgRole(user, item.organization_id, ['Siswa', 'Proktor', 'Admin'], 'Siswa/Proktor/Admin');
    } catch (error) {
      if (error instanceof ForbiddenException) throw unavailable();
      throw error;
    }
  }

  async checkAccess(userId: string, itemType: 'exam' | 'material', itemId: string) {
    const { title, isFree, tokenPrice } = await this.loadItem(itemType, itemId);

    if (isFree) {
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

  async unlockItem(user: AuthUser, dto: UnlockItemDto) {
    const userId = user.id;
    const { itemType, itemId } = dto;
    const access = await this.checkAccess(userId, itemType, itemId);

    if (access.hasAccess) {
      return { success: true, message: 'Item sudah terbuka.', remainingBalance: access.balance || 0 };
    }

    await this.assertUnlockable(user, itemType, await this.loadItem(itemType, itemId));

    const tokenCost = access.tokenPrice;
    const priceChanged = (price: number) => new ConflictException(
      `Harga item ini berubah menjadi ${price} token. Periksa kembali sebelum membuka akses.`,
    );
    if (dto.expectedPrice !== undefined && dto.expectedPrice !== tokenCost) throw priceChanged(tokenCost);
    const itemLabel = itemType === 'exam' ? 'Ujian' : 'Bahan Ajar';
    const desc = `Membuka akses ${itemLabel}: ${access.title}`;
    const insufficient = (balance: number) => new BadRequestException(
      `Saldo token Anda tidak mencukupi (Saldo: ${balance} Token, Dibutuhkan: ${tokenCost} Token). Silakan lakukan top up token terlebih dahulu.`,
    );

    let newBalance = null as number | null;
    await this.prisma.$transaction(async (prisma) => {
      // 0. Kunci baris item dan pastikan harganya masih sama dengan yang akan
      //    dipotong: pembuat bisa mengubah harga di antara pembacaan di atas
      //    dan transaksi ini.
      const table = itemType === 'exam' ? 'cbt_exams' : 'cbt_learning_materials';
      const current = await prisma.$queryRawUnsafe<any[]>(`
        SELECT COALESCE(is_paid, false) as is_paid, COALESCE(token_price, 0) as token_price
        FROM public.${table}
        WHERE id = $1::uuid
        FOR SHARE
      `, itemId);
      const currentPrice = current.length && current[0].is_paid ? Number(current[0].token_price || 0) : 0;
      if (currentPrice !== tokenCost) throw priceChanged(currentPrice);

      // 1. Klaim item lebih dulu. Permintaan paralel untuk item yang sama
      //    menunggu di unique index lalu tidak menyisipkan apa-apa, sehingga
      //    saldo hanya terpotong sekali.
      const inserted = await prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO public.unlocked_items (user_id, item_type, item_id)
        VALUES ($1::uuid, $2, $3)
        ON CONFLICT (user_id, item_type, item_id) DO NOTHING
        RETURNING id
      `, userId, itemType, itemId);
      if (!inserted.length) return;

      // 2. Potong saldo secara atomik dan hanya jika cukup — tidak bisa minus
      //    meskipun beberapa item dibuka bersamaan.
      const debited = await prisma.$queryRawUnsafe<any[]>(`
        UPDATE public.cbt_profiles
        SET token_balance = token_balance - $1
        WHERE id = $2::uuid AND token_balance >= $1
        RETURNING token_balance
      `, tokenCost, userId);
      if (!debited.length) {
        // Melempar di sini membatalkan klaim item pada langkah 1.
        throw insufficient(await this.getUserBalance(userId));
      }
      newBalance = Number(debited[0].token_balance);

      // 3. Catat pemakaian token
      await prisma.$executeRawUnsafe(`
        INSERT INTO public.token_transactions (user_id, amount, type, description, reference_id)
        VALUES ($1::uuid, $2, 'usage', $3, $4)
      `, userId, -tokenCost, desc, itemId);
    });

    if (newBalance === null) {
      return { success: true, message: 'Item sudah terbuka.', remainingBalance: await this.getUserBalance(userId) };
    }
    return {
      success: true,
      message: `Berhasil membuka ${itemLabel} "${access.title}". Saldo token berkurang ${tokenCost}.`,
      remainingBalance: newBalance,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. ADMIN TRACKERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Pola LIKE dari kata kunci admin. `%`, `_`, dan `\` di-escape agar dicari
   * apa adanya (dipasangkan dengan `ESCAPE '\'`), bukan sebagai wildcard.
   * Mengembalikan null bila kata kunci kosong (tanpa filter).
   */
  static likePattern(search: string | undefined | null): string | null {
    const term = String(search ?? '').trim().toLowerCase().slice(0, TRACKER_SEARCH_MAX);
    if (!term) return null;
    return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }

  static trackerPaging(page?: number, pageSize?: number) {
    const size = Math.min(Math.max(Math.trunc(Number(pageSize)) || TRACKER_PAGE_SIZE, 1), TRACKER_PAGE_SIZE_MAX);
    const current = Math.max(Math.trunc(Number(page)) || 1, 1);
    return { page: current, page_size: size, offset: (current - 1) * size };
  }

  async getPurchasesTracker(search = '', page?: number, pageSize?: number) {
    const pattern = TokensService.likePattern(search);
    const paging = TokensService.trackerPaging(page, pageSize);
    // Satu klausa filter dipakai untuk baris, jumlah, DAN statistik, sehingga
    // kartu ringkasan selalu sesuai dengan tabel yang sedang dicari.
    const from = `
      FROM public.payment_transactions pt
      LEFT JOIN public.cbt_profiles p ON p.id = pt.user_id
      WHERE $1::text IS NULL
         OR lower(pt.order_id) LIKE $1 ESCAPE '\\'
         OR lower(COALESCE(NULLIF(p.email, ''), pt.email, '')) LIKE $1 ESCAPE '\\'
         OR lower(COALESCE(pt.customer_name, '')) LIKE $1 ESCAPE '\\'
         OR lower(COALESCE(p.full_name, '')) LIKE $1 ESCAPE '\\'
    `;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        pt.id, pt.order_id, pt.user_id,
        COALESCE(NULLIF(p.email, ''), pt.email) AS email,
        pt.customer_name, pt.package_name, pt.token_amount, pt.amount, pt.status,
        pt.payment_type, pt.paid_at, pt.created_at,
        COALESCE(p.full_name, pt.customer_name, 'Pengguna') AS user_name
      ${from}
      ORDER BY pt.created_at DESC, pt.id DESC
      LIMIT $2::int OFFSET $3::int
    `, pattern, paging.page_size, paging.offset);

    const stats = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(CASE WHEN pt.status = 'success' THEN 1 END)::int AS success_orders,
        COALESCE(SUM(CASE WHEN pt.status = 'success' THEN pt.amount ELSE 0 END), 0)::float8 AS total_revenue,
        COALESCE(SUM(CASE WHEN pt.status = 'success' THEN pt.token_amount ELSE 0 END), 0)::int AS total_tokens_sold
      ${from}
    `, pattern);

    const summary = stats[0] || { total_orders: 0, success_orders: 0, total_revenue: 0, total_tokens_sold: 0 };
    return {
      transactions: rows,
      stats: summary,
      total: Number(summary.total_orders || 0),
      page: paging.page,
      page_size: paging.page_size,
      filtered: pattern !== null,
    };
  }

  async getUsagesTracker(search = '', page?: number, pageSize?: number) {
    const pattern = TokensService.likePattern(search);
    const paging = TokensService.trackerPaging(page, pageSize);
    const from = `
      FROM public.token_transactions tt
      LEFT JOIN public.cbt_profiles p ON p.id = tt.user_id
      WHERE tt.amount < 0 AND (
        $1::text IS NULL
        OR lower(tt.description) LIKE $1 ESCAPE '\\'
        OR lower(COALESCE(p.email, '')) LIKE $1 ESCAPE '\\'
        OR lower(COALESCE(p.full_name, '')) LIKE $1 ESCAPE '\\'
      )
    `;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        tt.id, tt.user_id, tt.amount, tt.type, tt.description,
        tt.reference_id, tt.created_at,
        p.email AS user_email,
        COALESCE(p.full_name, 'Siswa') AS user_name,
        (
          SELECT ui.item_type FROM public.unlocked_items ui
          WHERE ui.user_id = tt.user_id AND ui.item_id = tt.reference_id
          ORDER BY ui.created_at
          LIMIT 1
        ) AS item_type
      ${from}
      ORDER BY tt.created_at DESC, tt.id DESC
      LIMIT $2::int OFFSET $3::int
    `, pattern, paging.page_size, paging.offset);

    const stats = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*)::int AS total_unlocks,
        ABS(COALESCE(SUM(tt.amount), 0))::int AS total_tokens_spent,
        COUNT(DISTINCT tt.user_id)::int AS active_students
      ${from}
    `, pattern);

    const summary = stats[0] || { total_unlocks: 0, total_tokens_spent: 0, active_students: 0 };
    return {
      usages: rows,
      stats: summary,
      total: Number(summary.total_unlocks || 0),
      page: paging.page,
      page_size: paging.page_size,
      filtered: pattern !== null,
    };
  }
}
