import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { AuthUser } from '@acca-cbt/shared';
import { DbService } from '../prisma/prisma-db-adapter';
import { loadExamAudience } from '../students/exam-access';

export interface CreateNotificationInput {
    userId: string;
    organizationId?: string;
    type: string;
    title: string;
    message?: string;
    data?: Record<string, unknown>;
    priority?: string;
    actionUrl?: string;
    expiresInHours?: number;
}

/**
 * Notifikasi pengguna.
 *
 * Dipindahkan dari `apps/web/app/actions/notifications.ts`, di mana 11 dari 14
 * fungsi tidak memeriksa apa pun. Lima di antaranya bisa dipanggil langsung dari
 * browser dengan `userId` pilihan pemanggil — cukup untuk membaca, menandai, dan
 * menghapus notifikasi milik orang lain.
 *
 * Di sini tidak ada satu pun metode yang menerima `userId` dari luar: semuanya
 * ter-scope ke `user.id` hasil verifikasi token. Satu-satunya pengecualian
 * adalah `create` dan `createBulk`, yang memang mengirim notifikasi KEPADA orang
 * lain — keduanya sengaja tidak diekspos sebagai endpoint (lihat catatannya).
 */
@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(private readonly db: DbService) {}

    /** Discover newly available exams through the same audience policy as the student schedule.
     * This also covers PAS activation, newly assigned participants, and joining a class later.
     */
    async syncAvailableExams(user: AuthUser): Promise<void> {
        if (!user.roles?.includes('SISWA')) return;
        const audience = await loadExamAudience(this.db, user);
        if (!audience.organizationId) return;
        await this.db.raw(`
            WITH candidates AS (
                SELECT e.id, e.organization_id, e.title, e.end_time
                FROM public.cbt_exams e
                WHERE e.organization_id = $2::uuid AND e.is_published = true
                  AND e.status <> 'archived' AND (e.end_time IS NULL OR e.end_time > now())
                  AND (e.metadata->'is_public' = 'true'::jsonb OR e.id = ANY($3::uuid[]))
                  AND (e.metadata->'key_correction'->>'state' IS NULL OR e.metadata->'key_correction'->>'state' = 'ready')
                  AND COALESCE((SELECT exam_reminder FROM public.cbt_notification_preferences WHERE user_id = $1::uuid), true)
                  AND NOT EXISTS (SELECT 1 FROM public.cbt_exam_attempts a WHERE a.exam_id = e.id AND a.user_id = $1::uuid
                    AND a.status IN ('submitted', 'auto_submitted', 'graded'))
                  AND NOT EXISTS (SELECT 1 FROM public.cbt_exam_notification_deliveries d WHERE d.user_id = $1::uuid AND d.exam_id = e.id)
                  AND NOT EXISTS (SELECT 1 FROM public.cbt_notifications n WHERE n.user_id = $1::uuid AND n.type = 'exam_available' AND n.data->>'exam_id' = e.id::text)
                ORDER BY e.created_at DESC, e.id LIMIT 50
            ), claimed AS (
                INSERT INTO public.cbt_exam_notification_deliveries (user_id, exam_id)
                SELECT $1::uuid, id FROM candidates ON CONFLICT DO NOTHING RETURNING exam_id
            )
            INSERT INTO public.cbt_notifications (user_id, organization_id, type, title, message, data, priority, action_url, expires_at)
            SELECT $1::uuid, c.organization_id, 'exam_available', 'Ujian baru: ' || c.title,
                'Ujian telah diterbitkan. Periksa jadwal dan petunjuk sebelum mengerjakan.',
                jsonb_build_object('exam_id', c.id::text), 'normal', '/dashboard/siswa/schedule', c.end_time
            FROM candidates c JOIN claimed d ON d.exam_id = c.id RETURNING id`,
            user.id, audience.organizationId, [...audience.assignedExamIds]);
    }

    /** Saring notifikasi yang sudah kedaluwarsa, kecuali diminta sebaliknya. */
    private notExpired(query: any) {
        return query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    }

    async list(
        user: AuthUser,
        options: { limit?: number; offset?: number; type?: string; unreadOnly?: boolean; includeExpired?: boolean } = {},
    ) {
        await this.syncAvailableExams(user);
        const { limit = 20, offset = 0, type, unreadOnly = false, includeExpired = false } = options;

        let query = this.db
            .from('cbt_notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }).order('id', { ascending: false });

        if (unreadOnly) query = query.eq('is_read', false);
        if (type) query = query.eq('type', type);
        if (!includeExpired) query = this.notExpired(query);

        const { data, error } = await query.range(offset, offset + limit - 1);

        if (error) {
            this.logger.error(`Gagal membaca notifikasi: ${error.message}`);
            throw new InternalServerErrorException('Notifikasi tidak dapat dimuat.');
        }
        return (data as unknown[]) || [];
    }

    async unreadCount(user: AuthUser, syncExams = true): Promise<number> {
        if (syncExams) await this.syncAvailableExams(user);
        const { count, error } = await this.notExpired(
            this.db
                .from('cbt_notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false),
        );

        if (error) {
            this.logger.error(`Gagal menghitung notifikasi: ${error.message}`);
            throw new InternalServerErrorException('Jumlah notifikasi belum dapat dimuat.');
        }
        return count || 0;
    }

    async markRead(user: AuthUser, notificationId: string) {
        // `user_id` ikut disaring, jadi id milik orang lain tidak cocok dengan
        // baris mana pun dan tidak ada yang berubah.
        const { error } = await this.db
            .from('cbt_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', notificationId)
            .eq('user_id', user.id);

        if (error) throw new InternalServerErrorException('Gagal menandai notifikasi.');
    }

    async markAllRead(user: AuthUser) {
        const { error } = await this.db
            .from('cbt_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) throw new InternalServerErrorException('Gagal menandai notifikasi.');
    }

    async remove(user: AuthUser, notificationId: string) {
        const { error } = await this.db
            .from('cbt_notifications')
            .delete()
            .eq('id', notificationId)
            .eq('user_id', user.id);

        if (error) throw new InternalServerErrorException('Gagal menghapus notifikasi.');
    }

    async removeAllRead(user: AuthUser) {
        const { error } = await this.db
            .from('cbt_notifications')
            .delete()
            .eq('user_id', user.id)
            .eq('is_read', true);

        if (error) throw new InternalServerErrorException('Gagal menghapus notifikasi.');
    }

    async preferences(user: AuthUser) {
        const { data, error } = await this.db
            .from('cbt_notification_preferences')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            this.logger.error(`Gagal membaca preferensi: ${error.message}`);
            return null;
        }
        return data ?? null;
    }

    async updatePreferences(user: AuthUser, preferences: Record<string, unknown>) {
        const values: Record<string, unknown> = {};
        const booleans = ['email_enabled', 'push_enabled', 'exam_reminder', 'class_updates',
            'results_notifications', 'achievement_notifications', 'marketing_notifications'];
        for (const key of booleans) {
            if (preferences[key] === undefined) continue;
            if (typeof preferences[key] !== 'boolean') throw new BadRequestException(`${key} harus boolean.`);
            values[key] = preferences[key];
        }
        if (preferences.exam_reminder_minutes !== undefined) {
            const minutes = preferences.exam_reminder_minutes;
            if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 0 || minutes > 10080) {
                throw new BadRequestException('Waktu pengingat tidak valid.');
            }
            values.exam_reminder_minutes = minutes;
        }
        for (const key of ['quiet_hours_start', 'quiet_hours_end']) {
            const value = preferences[key];
            if (value === undefined) continue;
            if (value !== null && value !== '' &&
                (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value))) {
                throw new BadRequestException('Jam tenang tidak valid.');
            }
            values[key] = value || null;
        }
        const { error } = await this.db.from('cbt_notification_preferences').upsert(
            { ...values, user_id: user.id, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
        );

        if (error) throw new InternalServerErrorException('Gagal menyimpan preferensi.');
    }

    /**
     * Kirim notifikasi kepada seorang pengguna.
     *
     * SENGAJA TIDAK diekspos sebagai endpoint HTTP. Ia mengirim pesan kepada
     * ORANG LAIN, jadi membukanya berarti menyediakan sarana menanam pesan
     * apa pun di kotak notifikasi siapa pun — dan versi lama memang tidak
     * memeriksa apa pun. Dipanggil dari service lain yang sudah memeriksa izin,
     * mis. saat ujian dijadwalkan atau nilai diumumkan.
     */
    async create(input: CreateNotificationInput): Promise<string | null> {
        const expiresAt = input.expiresInHours
            ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString()
            : null;

        const { data, error } = await this.db
            .from('cbt_notifications')
            .insert({
                user_id: input.userId,
                organization_id: input.organizationId ?? null,
                type: input.type,
                title: input.title,
                message: input.message ?? null,
                data: input.data ?? {},
                priority: input.priority ?? 'normal',
                action_url: input.actionUrl ?? null,
                expires_at: expiresAt,
            })
            .select('id')
            .single();

        if (error) {
            this.logger.error(`Gagal membuat notifikasi: ${error.message}`);
            return null;
        }
        return (data as { id: string }).id;
    }

    /** Kirim notifikasi yang sama kepada banyak pengguna. Internal, seperti `create`. */
    async createBulk(userIds: string[], input: Omit<CreateNotificationInput, 'userId'>) {
        if (userIds.length === 0) return 0;

        const expiresAt = input.expiresInHours
            ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString()
            : null;

        // Satu pernyataan INSERT multi-baris, bukan perulangan per penerima.
        const { data, error } = await this.db.from('cbt_notifications').insert(
            userIds.map((userId) => ({
                user_id: userId,
                organization_id: input.organizationId ?? null,
                type: input.type,
                title: input.title,
                message: input.message ?? null,
                data: input.data ?? {},
                priority: input.priority ?? 'normal',
                action_url: input.actionUrl ?? null,
                expires_at: expiresAt,
            })),
        );

        if (error) {
            this.logger.error(`Gagal membuat notifikasi massal: ${error.message}`);
            return 0;
        }
        return ((data as unknown[]) || []).length;
    }
}
