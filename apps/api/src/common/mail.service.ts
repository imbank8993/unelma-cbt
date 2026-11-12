import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
    to: string;
    subject: string;
    /** Judul besar di dalam email. */
    heading: string;
    /** Paragraf isi (teks biasa; di-escape). */
    paragraphs: string[];
    /** Tombol ajakan opsional. */
    action?: { label: string; url: string };
}

const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/**
 * Pengirim email transaksional lewat SMTP.
 *
 * Diatur dengan variabel lingkungan: SMTP_HOST, SMTP_PORT (bawaan 587),
 * SMTP_SECURE ("true" untuk port 465), SMTP_USER, SMTP_PASS, MAIL_FROM.
 * Bila SMTP_HOST kosong, email tidak dikirim (hanya dicatat) sehingga alur
 * utama seperti persetujuan proktor tetap berjalan.
 */
@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private transporter: Transporter | null | undefined;

    private get from() {
        return process.env.MAIL_FROM || 'Unelma Edu Indonesia <no-reply@unelma.id>';
    }

    get appUrl() {
        return (process.env.APP_URL || 'https://unelma.id').replace(/\/$/, '');
    }

    private getTransporter(): Transporter | null {
        if (this.transporter !== undefined) return this.transporter;
        const host = process.env.SMTP_HOST;
        if (!host) {
            this.transporter = null;
            return null;
        }
        const port = Number(process.env.SMTP_PORT) || 587;
        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: process.env.SMTP_SECURE === 'true' || port === 465,
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
        });
        return this.transporter;
    }

    /** Kirim email; tidak pernah melempar galat ke pemanggil. Mengembalikan true bila terkirim. */
    async send(message: MailMessage): Promise<boolean> {
        const to = (message.to || '').trim();
        if (!to) return false;
        const transporter = this.getTransporter();
        if (!transporter) {
            this.logger.warn(`SMTP belum diatur; email "${message.subject}" ke ${to} tidak dikirim.`);
            return false;
        }
        try {
            await transporter.sendMail({
                from: this.from,
                to,
                subject: message.subject,
                text: [message.heading, '', ...message.paragraphs, ...(message.action ? ['', `${message.action.label}: ${message.action.url}`] : [])].join('\n'),
                html: renderHtml(message),
            });
            return true;
        } catch (error) {
            this.logger.error(`Gagal mengirim email "${message.subject}" ke ${to}: ${(error as Error).message}`);
            return false;
        }
    }
}

/** Templat email sederhana dan bersih, sesuai warna Unelma. */
export function renderHtml(message: MailMessage): string {
    const paragraphs = message.paragraphs
        .map((text) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#334155">${escapeHtml(text)}</p>`)
        .join('');
    const action = message.action
        ? `<p style="margin:24px 0 0"><a href="${escapeHtml(message.action.url)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#030C4D;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none">${escapeHtml(message.action.label)}</a></p>`
        : '';
    return `<!doctype html><html lang="id"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Poppins,Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0">
<tr><td style="padding:28px 32px 8px;font-size:16px;font-weight:700;color:#030C4D">Unelma Edu Indonesia</td></tr>
<tr><td style="padding:8px 32px 32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#0f172a">${escapeHtml(message.heading)}</h1>
${paragraphs}${action}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Email ini dikirim otomatis, mohon tidak dibalas.</p>
</td></tr></table></body></html>`;
}
