import { collaborationResourceTable, collaborationGrant, type CollaborationGrant, type CollaborativeResource } from '../common/collaboration-access';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@acca-cbt/shared';
import { DbService } from '../prisma/prisma-db-adapter';
import { CbtRolesService } from './cbt-roles.service';
import { SingleSchoolService } from './single-school.service';
import { assignedPasExamStudents, isPasMonitoringExam } from '../common/pas-monitoring-access';
import { isSemesterAssessmentExam } from '../common/exam-types';

/**
 * Otorisasi per-organisasi, dipindahkan dari `apps/web/lib/server-authz.ts`.
 *
 * Perbedaan penting dengan versi lama: `user` di sini berasal dari token yang
 * sudah diverifikasi, bukan dari `userId` yang dikirim browser. Versi lama
 * dipanggil oleh 10 aksi saja sementara 62 aksi lain menerima `userId` sebagai
 * parameter biasa dan mempercayainya.
 *
 * Kegagalan dilempar sebagai `ForbiddenException`, bukan dikembalikan sebagai
 * `{ ok: false }`. `AllExceptionsFilter` mengubahnya menjadi
 * `{ success: false, error }` sehingga bentuk yang sampai ke frontend tetap
 * sama seperti sebelumnya.
 */
@Injectable()
export class AuthorizationService {
    constructor(
        private readonly db: DbService,
        private readonly roles: CbtRolesService,
        private readonly schoolScope: SingleSchoolService,
    ) {}

    /** Peran platform tetap istimewa, tetapi terikat pada sekolah instalasi. */
    private isElevatedGlobally(user: AuthUser): boolean {
        return user.isPlatformAdmin || user.resolved?.superadmin === true;
    }

    async isRestrictedProctor(user: AuthUser, organizationId: string): Promise<boolean> {
        if (this.isElevatedGlobally(user) || await this.roles.hasOrgRole(user.id, organizationId, ['Admin'])) return false;
        return this.roles.hasOrgRole(user.id, organizationId, ['Proktor']);
    }

    async assertOrgRole(
        user: AuthUser,
        organizationId: string | null | undefined,
        roles: string[],
        label = 'staf',
    ): Promise<void> {
        const schoolId = await this.schoolScope.assertSchoolId(organizationId);
        if (this.isElevatedGlobally(user)) return;
        if (await this.roles.hasOrgRole(user.id, schoolId, roles)) return;
        throw new ForbiddenException(`Anda tidak memiliki izin (khusus ${label}).`);
    }

    /**
     * Operasi TINGKAT SEKOLAH: ASAS/ASAT/AM (PAS), backup, tahun ajaran, kelas
     * utama, konfigurasi ujian sekolah, riwayat login seluruh anggota.
     *
     * Dulu terbuka untuk Proktor (staf madrasah). Di Unelma CBT, Proktor adalah
     * pembuat konten yang disetujui lewat pengajuan publik, sehingga hanya
     * mengelola konten, kelas, dan peserta MILIKNYA sendiri; urusan sekolah
     * khusus Admin. Nama metode dipertahankan agar pemanggil lama tetap sah.
     */
    assertProktor(user: AuthUser, organizationId: string | null | undefined): Promise<void> {
        return this.assertOrgRole(user, organizationId, ['Admin'], 'Admin');
    }

    /** Admin sekolah (atau admin platform)? Tidak melempar. */
    async isSchoolAdmin(user: AuthUser, organizationId: string | null | undefined): Promise<boolean> {
        if (this.isElevatedGlobally(user)) return true;
        if (!organizationId) return false;
        return this.roles.hasOrgRole(user.id, organizationId, ['Admin']);
    }

    /** Operasi tingkat staf: kelola bank soal, kelas, ujian. */
    assertOrgStaff(user: AuthUser, organizationId: string | null | undefined): Promise<void> {
        return this.assertOrgRole(
            user,
            organizationId,
            ['Proktor', 'Admin'],
            'staf sekolah',
        );
    }

    /**
     * Apakah user LAIN (bukan pemanggil) berperan staf aktif (Guru/Proktor/Admin)
     * di sekolah ini. Dipakai saat menunjuk orang, mis. validator bank soal.
     */
    hasOrgStaffRole(userId: string, organizationId: string): Promise<boolean> {
        return this.roles.hasOrgRole(userId, organizationId, ['Proktor', 'Admin']);
    }

    /** Operasi pemantauan staf sekolah: Proktor, Admin, Guru, dan Pengawas. */
    assertOrgMonitoring(user: AuthUser, organizationId: string | null | undefined): Promise<void> {
        return this.assertOrgRole(
            user,
            organizationId,
            ['Proktor', 'Admin', 'Pengawas'],
            'staf pemantauan sekolah',
        );
    }

    assertPlatformAdmin(user: AuthUser): void {
        if (this.isElevatedGlobally(user)) return;
        throw new ForbiddenException('Anda tidak memiliki izin (khusus Admin Platform).');
    }

    /** Ambil `organization_id` sebuah baris, atau lempar bila barisnya tidak ada. */
    private async organizationOf(
        table: string,
        id: string,
        column = 'organization_id',
    ): Promise<string | null> {
        if (!id) throw new NotFoundException('Data tidak ditemukan.');
        const { data } = await this.db.from(table).select(column).eq('id', id).maybeSingle();
        if (!data) throw new NotFoundException('Data tidak ditemukan.');
        return (data as Record<string, string | null>)[column];
    }

    async assertRoleByRecord(
        user: AuthUser,
        table: string,
        id: string,
        roles: string[],
        label: string,
        column = 'organization_id',
    ): Promise<void> {
        const organizationId = await this.organizationOf(table, id, column);
        await this.assertOrgRole(user, organizationId, roles, label);
    }

    /** Varian `assertProktor` per baris: operasi tingkat sekolah, khusus Admin. */
    assertProktorByRecord(user: AuthUser, table: string, id: string, column = 'organization_id') {
        if (table === 'cbt_pas_periods') return this.assertPasPeriodManage(user, id);
        return this.assertRoleByRecord(user, table, id, ['Admin'], 'Admin', column);
    }

    assertStaffByRecord(user: AuthUser, table: string, id: string, column = 'organization_id') {
        return this.assertRoleByRecord(
            user, table, id, ['Proktor', 'Admin'], 'staf sekolah', column,
        );
    }

    /**
     * Organisasinya berjarak dua lompatan: baris ini menunjuk induk lewat
     * `foreignKey`, dan induknyalah yang membawa organisasi — mis. sesi PAS →
     * periode PAS → organisasi.
     */
    private async assertByParent(
        user: AuthUser,
        table: string,
        id: string,
        foreignKey: string,
        parentTable: string,
        roles: string[],
        label: string,
        parentColumn: string,
    ): Promise<void> {
        if (!id) throw new NotFoundException('Data tidak ditemukan.');
        const { data } = await this.db.from(table).select(foreignKey).eq('id', id).maybeSingle();
        const parentId = data ? (data as Record<string, string>)[foreignKey] : null;
        if (!parentId) throw new NotFoundException('Data tidak ditemukan.');
        await this.assertRoleByRecord(user, parentTable, parentId, roles, label, parentColumn);
    }

    assertProktorByParent(
        user: AuthUser, table: string, id: string, foreignKey: string,
        parentTable: string, parentColumn = 'organization_id',
    ) {
        if (parentTable === 'cbt_pas_periods') {
            return this.assertPasPeriodChildManage(user, table, id, foreignKey);
        }
        return this.assertByParent(
            user, table, id, foreignKey, parentTable,
            ['Admin'], 'Admin', parentColumn,
        );
    }

    assertStaffByParent(
        user: AuthUser, table: string, id: string, foreignKey: string,
        parentTable: string, parentColumn = 'organization_id',
    ) {
        return this.assertByParent(
            user, table, id, foreignKey, parentTable,
            ['Proktor', 'Admin'], 'staf sekolah', parentColumn,
        );
    }

    /**
     * Otorisasi akses ke sebuah bank soal beserta SELURUH isinya — soal, opsi,
     * stimulus, petunjuk, kisi-kisi, dimensi, dan tafsirannya.
     *
     * Admin memiliki akses penuh dalam sekolahnya. Pemilik boleh mengelola bank;
     * proktor boleh membaca bank orang lain yang sudah dipublikasikan atau berada
     * di folder publik yang ia buat. Staf lain hanya melihat kartu katalognya.
     *
     * Organisasinya diambil dari BARIS BANK-nya, bukan dari parameter pemanggil.
     * Itu yang mencegah id bank milik sekolah lain diselundupkan bersama
     * `organizationId` milik sendiri.
     *
     * Mengembalikan `organization_id` bank tersebut, karena hampir setiap
     * pemanggil membutuhkannya untuk baris yang akan ia tulis — dan mengambilnya
     * dari sini berarti tidak ada jalur yang memakai organisasi kiriman klien.
     */
    async assertBankAccess(user: AuthUser, bankId: string, access: 'read' | 'write' | 'delete' = 'write', db: Pick<DbService, 'from'> = this.db): Promise<string> {
        if (!bankId) throw new NotFoundException('Bank soal tidak ditemukan.');

        const { data } = await db
            .from('cbt_question_banks')
            .select('organization_id, created_by, is_published, folder_id')
            .eq('id', bankId)
            .maybeSingle();

        if (!data) throw new NotFoundException('Bank soal tidak ditemukan.');

        const bank = data as { organization_id: string; created_by: string | null; is_published?: boolean; folder_id?: string | null };

        await this.assertOrgStaff(user, bank.organization_id);

        const elevated =
            this.isElevatedGlobally(user) ||
            (await this.roles.hasOrgRole(user.id, bank.organization_id, ['Admin']));
        const restrictedProctor = !elevated && await this.roles.hasOrgRole(user.id, bank.organization_id, ['Proktor']);
        // Proktor = pembuat konten mandiri: bank milik Proktor lain (termasuk yang
        // sudah dipublikasikan) TIDAK terbaca, karena isinya — soal dan kunci —
        // adalah konten yang dijual pembuatnya. Akses lintas pembuat hanya lewat
        // undangan kolaborasi dari pemilik bank.

        if (access === 'read' && !elevated && bank.created_by !== user.id && bank.folder_id) {
            const { data: folder, error } = await db.from('bank_folders')
                .select('is_public, created_by').eq('id', bank.folder_id).eq('organization_id', bank.organization_id).maybeSingle();
            if (error) throw new ForbiddenException('Akses folder bank soal belum dapat diperiksa.');
            if (folder?.is_public === true && folder.created_by === user.id) return bank.organization_id;
        }

        if (access === 'delete' && restrictedProctor) {
            throw new ForbiddenException('Proktor tidak dapat menghapus bank soal, termasuk bank soal buatan sendiri.');
        }

        if (!elevated && bank.created_by !== user.id && access !== 'delete') {
            const grant = await collaborationGrant(db, 'bank', bankId, user.id);
            if (grant && (access === 'read' || ['editor', 'manager'].includes(grant.permission))) return bank.organization_id;
        }

        if (!elevated && bank.created_by !== user.id) {
            throw new ForbiddenException(
                'Anda hanya dapat mengelola bank soal buatan sendiri.',
            );
        }

        return bank.organization_id;
    }

    async collaborationPermissions(user: AuthUser, type: CollaborativeResource, resourceId: string) {
        const { data: resource, error } = await this.db.from(collaborationResourceTable(type))
            .select(type === 'bank' ? 'id, organization_id, created_by, is_published, folder_id' : 'id, organization_id, created_by').eq('id', resourceId).maybeSingle();
        if (error || !resource) throw new NotFoundException('Data kolaborasi tidak ditemukan.');
        if (type === 'exam') await this.assertOrgMonitoring(user, resource.organization_id);
        else await this.assertOrgStaff(user, resource.organization_id);
        const staff = this.isElevatedGlobally(user) || await this.roles.hasOrgRole(user.id, resource.organization_id, type === 'period' ? ['Admin'] : ['Proktor', 'Admin']);
        const admin = this.isElevatedGlobally(user) || await this.roles.hasOrgRole(user.id, resource.organization_id, ['Admin']);
        const owner = staff && resource.created_by === user.id;
        // Bank soal tetap tidak boleh dihapus Proktor (kebijakan lama, dipertahankan);
        // selebihnya Proktor setara pemilik konten biasa.
        const proctorBank = type === 'bank' && !admin && await this.roles.hasOrgRole(user.id, resource.organization_id, ['Proktor']);
        const grant = staff && !admin && !owner ? await collaborationGrant(this.db, type, resourceId, user.id) : null;
        return { resource, owner, admin, grant, canShare: admin || owner || grant?.permission === 'manager', canDelete: admin || (owner && !proctorBank) };
    }

    /**
     * Daftar bank/ujian: hasil sama dengan collaborationPermissions, tetapi peran
     * dan grant dihitung sekali per halaman, bukan beberapa kueri per baris.
     */
    async collaborationListContext(user: AuthUser, organizationId: string, type: CollaborativeResource = 'exam') {
        const admin = this.isElevatedGlobally(user) || await this.roles.hasOrgRole(user.id, organizationId, ['Admin']);
        const staff = admin || await this.roles.hasOrgRole(user.id, organizationId, type === 'period' ? ['Admin'] : ['Proktor', 'Admin']);
        const proctorBank = type === 'bank' && !admin && await this.roles.hasOrgRole(user.id, organizationId, ['Proktor']);
        return {
            admin, staff,
            access: (resource: { created_by?: string | null }, grant: CollaborationGrant | null | undefined) => {
                const owner = staff && resource.created_by === user.id;
                const effective = staff && !admin && !owner ? grant || null : null;
                return { owner, admin, grant: effective, canShare: admin || owner || effective?.permission === 'manager', canDelete: admin || (owner && !proctorBank) };
            },
        };
    }

    async assertResourceOwner(user: AuthUser, type: CollaborativeResource, resourceId: string) {
        const permissions = await this.collaborationPermissions(user, type, resourceId);
        if (!permissions.canDelete) throw new ForbiddenException('Hanya pembuat atau Admin yang dapat menghapus data ini.');
    }

    /** Folder ownership is independent of bank/exam collaboration inside it. */
    async assertPasPeriodManage(user: AuthUser, periodId: string, operation: 'write' | 'delete' = 'write'): Promise<void> {
        const access = await this.collaborationPermissions(user, 'period', periodId);
        await this.assertProktor(user, access.resource.organization_id);
        if (access.owner || access.admin) return;
        if (operation === 'delete') throw new ForbiddenException('Folder ujian hanya dapat dihapus oleh pembuat atau Admin.');
        if (operation === 'write' && access.grant && ['editor', 'manager'].includes(access.grant.permission)) return;
        throw new ForbiddenException('Folder ujian ini hanya dapat diubah oleh pembuat, Admin, atau kolaborator dengan izin edit.');
    }

    private async assertPasPeriodChildManage(user: AuthUser, table: string, id: string, foreignKey: string): Promise<void> {
        const { data, error } = await this.db.from(table).select(foreignKey).eq('id', id).maybeSingle();
        if (error || !data?.[foreignKey]) throw new NotFoundException('Data folder ujian tidak ditemukan.');
        await this.assertPasPeriodManage(user, data[foreignKey]);
    }

    /**
     * Varian `assertBankAccess` yang bank-nya ditemukan lewat baris anaknya —
     * mis. satu stimulus, satu dimensi, atau satu soal.
     */
    async assertBankAccessByChild(
        user: AuthUser,
        table: string,
        id: string | null | undefined,
    ): Promise<string> {
        if (!id) throw new NotFoundException('Data tidak ditemukan.');

        const { data } = await this.db.from(table).select('bank_id').eq('id', id).maybeSingle();
        const bankId = (data as { bank_id: string | null } | null)?.bank_id;

        if (!bankId) throw new NotFoundException('Data tidak ditemukan.');
        return this.assertBankAccess(user, bankId);
    }

    /**
     * Otorisasi operasi pada sebuah ujian, dengan aturan kepemilikan:
     *
     *  - PAS/PAT (ASAS/ASAT/AM): hanya Admin (atau admin platform).
     *  - Jenis lain: Admin bebas; Proktor hanya ujian buatannya sendiri atau
     *    yang dibagikan kepadanya dengan izin edit.
     */
    async assertExamStaff(user: AuthUser, examId: string, operation: 'manage' | 'reset' = 'manage', studentId?: string): Promise<void> {
        if (!examId) throw new NotFoundException('Data tidak ditemukan.');

        const { data: exam } = await this.db
            .from('cbt_exams')
            .select('exam_type, created_by, organization_id, is_published')
            .eq('id', examId)
            .maybeSingle();

        if (!exam) throw new NotFoundException('Data tidak ditemukan.');

        const record = { ...exam, id: examId } as {
            id: string;
            exam_type: string | null;
            created_by: string | null;
            organization_id: string | null;
            is_published?: boolean;
        };

        if (operation === 'reset') {
            const scope = await this.getExamResetScope(user, { ...record, id: examId });
            if (scope && (scope.allParticipants || (studentId && scope.studentIds.includes(studentId)))) return;
            throw new ForbiddenException('Reset, pulihkan, dan susulan hanya untuk admin atau pembuat ujian.');
        }
        if (!await this.canManageExam(user, record, operation)) {
            throw new ForbiddenException('Anda hanya dapat mengelola ujian yang Anda buat sendiri. ASAS/ASAT/AM hanya dapat dikelola Admin.');
        }
    }

    /** Ownership of a bank grants monitoring only, never recovery rights. */
    async getExamResetScope(user: AuthUser, record: {
        id?: string; organization_id: string | null; created_by: string | null; exam_type: string | null;
    }, _assignedStudents?: Map<string, string[]>, knownGrant?: CollaborationGrant | null): Promise<{ allParticipants: boolean; studentIds: string[] } | null> {
        const organizationId = await this.schoolScope.assertSchoolId(record.organization_id);
        const full = { allParticipants: true, studentIds: [] };
        if (this.isElevatedGlobally(user) || await this.roles.hasOrgRole(user.id, organizationId, ['Admin'])) return full;
        if (record.created_by !== user.id) {
            if (record.id && knownGrant !== null && await this.roles.hasOrgRole(user.id, organizationId, ['Proktor'])) {
                const grant = knownGrant !== undefined ? knownGrant : await collaborationGrant(this.db, 'exam', record.id, user.id);
                if (grant?.can_reset && ['editor', 'manager'].includes(grant.permission)) return full;
            }
            return null;
        }
        if (await this.roles.hasOrgRole(user.id, organizationId, ['Proktor'])) return full;
        return null;
    }

    /** Same policy for write authorization and monitoring controls. */
    async canManageExam(user: AuthUser, record: {
        id?: string;
        organization_id: string | null;
        created_by: string | null;
        exam_type: string | null;
        is_published?: boolean;
    }, operation: 'manage' | 'reset' = 'manage', assignedStudents?: Map<string, string[]>,
        knownGrant?: CollaborationGrant | null): Promise<boolean> {
        if (operation === 'reset') return Boolean(await this.getExamResetScope(user, record, assignedStudents, knownGrant));
        await this.schoolScope.assertSchoolId(record.organization_id);
        if (this.isElevatedGlobally(user)) return true;
        if (await this.roles.hasOrgRole(user.id, record.organization_id, ['Admin'])) return true;
        // knownGrant: grant yang sudah dimuat sekaligus untuk satu halaman daftar (null = tidak ada).
        if (record.id && record.created_by !== user.id && knownGrant !== null &&
            await this.roles.hasOrgRole(user.id, record.organization_id, ['Proktor'])) {
            const grant = knownGrant !== undefined ? knownGrant : await collaborationGrant(this.db, 'exam', record.id, user.id);
            if (grant && ['editor', 'manager'].includes(grant.permission)) return true;
        }
        // Proktor mengelola ujian buatannya sendiri; ASAS/ASAT/AM adalah urusan sekolah (Admin).
        if (isSemesterAssessmentExam(record)) return false;
        return record.created_by === user.id &&
            await this.roles.hasOrgRole(user.id, record.organization_id, ['Proktor']);
    }

    /**
     * Otorisasi pemantauan ujian dan log pelanggaran.
     * undefined berarti seluruh peserta; array membatasi peserta pengawas ruang.
     * Pemilik bank soal tetap memantau kelas peserta lintas ruang.
     */
    async assertExamMonitoring(user: AuthUser, examId: string): Promise<string[] | undefined> {
        if (!examId) throw new NotFoundException('Data tidak ditemukan.');

        const { data: exam } = await this.db
            .from('cbt_exams')
            .select('exam_type, created_by, organization_id, question_bank_id, is_published')
            .eq('id', examId)
            .maybeSingle();

        if (!exam) throw new NotFoundException('Data tidak ditemukan.');

        const record = exam as {
            exam_type: string | null;
            created_by: string | null;
            organization_id: string | null;
            question_bank_id: string | null;
            is_published?: boolean;
        };

        await this.schoolScope.assertSchoolId(record.organization_id);
        if (this.isElevatedGlobally(user)) return;

        if (await this.roles.hasOrgRole(user.id, record.organization_id, ['Proktor'])) {
            if (await collaborationGrant(this.db, 'exam', examId, user.id)) return;
        }

        // Hanya Admin yang memantau seluruh ujian dan pesertanya.
        const isMonitorStaff = await this.roles.hasOrgRole(user.id, record.organization_id, ['Admin']);
        if (isMonitorStaff) return;

        // Proktor (pembuat konten) memantau ujian buatannya sendiri
        const isTeacher = await this.roles.hasOrgRole(user.id, record.organization_id, ['Proktor']);
        if (isTeacher && record.created_by === user.id) return;

        // ... dan ujian yang menggunakan bank soal miliknya
        if (isTeacher && record.question_bank_id) {
            const { data: bank } = await this.db
                .from('cbt_question_banks')
                .select('created_by')
                .eq('id', record.question_bank_id)
                .maybeSingle();
            if ((bank as { created_by?: string } | null)?.created_by === user.id) return;
            // Kolaborator bank soal juga memantau seluruh pesertanya.
            if (bank && await collaborationGrant(this.db, 'bank', record.question_bank_id, user.id)) return;
        }

        const hasDuty = await this.roles.hasOrgRole(user.id, record.organization_id, ['Pengawas']);
        if ((isTeacher || hasDuty) && record.organization_id && isPasMonitoringExam(record)) {
            const assigned = await assignedPasExamStudents(this.db, user.id, record.organization_id);
            if (assigned.has(examId)) return assigned.get(examId)!;
        }

        throw new ForbiddenException('Anda tidak memiliki izin memantau ujian ini.');
    }
}
