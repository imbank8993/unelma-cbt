import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthUser } from '@acca-cbt/shared';
import { DbService } from '../prisma/prisma-db-adapter';
import type { LearningGoalDto } from './dto/students.dto';

export interface LearningGoalView {
    programs: string[];
    target?: string;
    targetDate?: string;
}

/** Tabel belum dibuat (migrasi 20261112_01 belum dijalankan). */
const isMissingTable = (error: unknown) =>
    /does not exist|42P01|42703/i.test(String((error as { message?: string })?.message || error || ''));

/**
 * Tujuan belajar milik pemegang token sendiri. Disimpan di server agar
 * ikut terbawa ketika siswa berganti perangkat.
 */
@Injectable()
export class LearningGoalsService {
    constructor(private readonly db: DbService) {}

    async get(user: AuthUser): Promise<{ goal: LearningGoalView | null; stored: boolean }> {
        const { data, error } = await this.db.from('cbt_learning_goals')
            .select('programs, target, target_date')
            .eq('user_id', user.id)
            .maybeSingle();
        if (error) {
            if (isMissingTable(error)) return { goal: null, stored: false };
            throw new InternalServerErrorException('Tujuan belajar belum dapat dimuat.');
        }
        const row = data as { programs: string[] | null; target: string | null; target_date: string | Date | null } | null;
        if (!row || !row.programs?.length) return { goal: null, stored: true };
        return { goal: toView(row), stored: true };
    }

    async save(user: AuthUser, dto: LearningGoalDto): Promise<{ goal: LearningGoalView }> {
        const programs = [...new Set(dto.programs)];
        const { error } = await this.db.from('cbt_learning_goals').upsert({
            user_id: user.id,
            programs,
            target: (dto.target || '').trim().slice(0, 120),
            target_date: dto.targetDate || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (error) {
            if (isMissingTable(error)) throw new ServiceUnavailableException('Penyimpanan tujuan belajar belum diaktifkan di server.');
            throw new InternalServerErrorException('Tujuan belajar belum dapat disimpan.');
        }
        return { goal: { programs, target: dto.target?.trim() || undefined, targetDate: dto.targetDate || undefined } };
    }
}

function toView(row: { programs: string[] | null; target: string | null; target_date: string | Date | null }): LearningGoalView {
    const date = row.target_date instanceof Date
        ? row.target_date.toISOString().slice(0, 10)
        : typeof row.target_date === 'string' ? row.target_date.slice(0, 10) : undefined;
    return { programs: row.programs || [], target: row.target || undefined, targetDate: date };
}
