'use client';

import DashboardPageTitle from '@/app/components/DashboardPageTitle';
import { StudentDashboardOverview } from '@/app/components/student/StudentDashboardOverview';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, Code2, LayoutGrid, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { deleteMaterial, learningRequest, type LearningMaterial } from '@/lib/learning-api';
import { groupLearningChapters, learningCategoriesOf, learningCategoryOf, learningGradeHeading, learningGradeLabel, learningGrades, learningKey, learningProgramOf, SCHOOL_STAGES, useLearningPrograms, type LearningCategory, type LearningChapter, type LearningProgram } from '@/lib/learning-catalog';
import { loadLearningGoal, programLabel } from '@/lib/learning-goal';
import { getSessionUser } from '@/lib/session';
import { deleteConfirmDialog } from '@/lib/confirm-dialog';
import { CreateSubchapterModal } from '@/app/components/learning/CreateSubchapterModal';
import { HTML_EDITABLE_FORMATS, HtmlSourceEditorModal } from '@/app/components/learning/HtmlSourceEditorModal';
import { InlineSelect } from '@/app/components/ui/inlineselect';
import '@/app/components/learning/learning.css';
import { useCreationLimits } from '@/lib/useCreationLimits';

/** Singkatan mata pelajaran yang umum; mapel lain memakai inisial kata atau tiga huruf pertama. */
const SUBJECT_ABBR: Record<string, string> = {
    matematika: 'MTK', fisika: 'FIS', kimia: 'KIM', biologi: 'BIO', informatika: 'INF',
    'bahasa indonesia': 'BIN', 'bahasa inggris': 'BIG', 'bahasa arab': 'BAR',
    sejarah: 'SEJ', geografi: 'GEO', ekonomi: 'EKO', sosiologi: 'SOS',
};
const SUBJECT_HUES = [217, 160, 262, 24, 330, 190, 45, 290];

/** Penanda kartu BAB: singkatan dan rona warna yang selalu sama untuk satu mata pelajaran. */
function subjectMark(subject: string): { abbr: string; style: CSSProperties } {
    const key = learningKey(subject);
    const words = key.split(' ').filter(Boolean);
    const abbr = (SUBJECT_ABBR[key] || (words.length > 1 ? words.slice(0, 3).map(word => word[0]).join('') : key.slice(0, 3))).toUpperCase() || '—';
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return { abbr, style: { '--mark-hue': SUBJECT_HUES[hash % SUBJECT_HUES.length] } as CSSProperties };
}

/** Kategori terpilih: jenjang (SD/SMP/SMA), kode program, 'all', atau 'untukmu'. */
type ProgramFilter = string;
/** Program dari tautan, misalnya `/dashboard/learning?program=cpns` dari beranda. */
const programFromUrl = () => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('program');
/** Nilai yang tidak tersedia sebagai kategori dikembalikan ke "Semua"/"Untukmu" saat render. */
const initialProgram = (): ProgramFilter => programFromUrl() || 'all';
const SCHOOL_STAGE_VALUES = new Set(SCHOOL_STAGES.map(stage => stage.value));

/** Tingkatan awal formulir subbab: tingkatan terpilih, kelas pertama jenjang, atau tingkatan program terpilih. */
function initialGradeFor(grade: string, program: ProgramFilter): string {
    if (grade !== 'all') return grade;
    const stage = SCHOOL_STAGES.find(item => item.value === program);
    if (stage) return String(stage.from);
    return program !== 'all' && program !== 'untukmu' ? learningGrades.find(item => item.program === program)?.value ?? '10' : '10';
}

function chapterStatus(chapter: LearningChapter, manage: boolean): { label: string; tone: 'idle' | 'progress' | 'done' | 'draft' } {
    if (manage) {
        const drafts = chapter.items.filter(item => item.status === 'draft').length;
        return drafts ? { label: `${drafts} draf`, tone: 'draft' } : { label: 'Terbit', tone: 'done' };
    }
    if (chapter.completed === chapter.items.length) return { label: 'Selesai', tone: 'done' };
    if (chapter.completed) return { label: `${chapter.completed} dari ${chapter.items.length} subbab`, tone: 'progress' };
    return { label: 'Belum mulai', tone: 'idle' };
}

export default function LearningLibrary() {
    const [manage, setManage] = useState(false);
    return <LearningLibraryContent key={String(manage)} manage={manage} setManage={setManage} />;
}

function LearningLibraryContent({ manage, setManage }: { manage: boolean; setManage: (value: boolean) => void }) {
    // Akses menerbitkan bahan ajar diatur Admin (Komisi → Proktor).
    const { limits: creationLimits } = useCreationLimits(manage);
    const canCreateMaterial = creationLimits?.canCreateMaterials !== false;
    const request = useRef<AbortController | null>(null);
    const [materials, setMaterials] = useState<LearningMaterial[]>([]);
    const [canManage, setCanManage] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedProgram, setProgram] = useState<ProgramFilter>(initialProgram);
    const activePrograms = useLearningPrograms();
    const [savedGoals, setGoalPrograms] = useState<LearningProgram[]>([]);
    // Program yang disembunyikan Admin tidak lagi dihitung sebagai tujuan.
    const goalPrograms = savedGoals.filter(value => activePrograms.some(item => item.value === value));
    // Siswa yang sudah memilih tujuan hanya melihat program tujuannya (plus "Umum" untuk semua siswa).
    const goalOnly = !manage && goalPrograms.length > 0;
    // Pilihan kategori: "Sekolah" tampil sebagai SD, SMP, SMA; program lain apa adanya.
    const categories = learningCategoriesOf(goalOnly ? activePrograms.filter(item => goalPrograms.includes(item.value)) : activePrograms);
    const program: ProgramFilter = categories.some(item => item.value === selectedProgram) ? selectedProgram : goalOnly ? 'untukmu' : 'all';
    const programTouched = useRef(false);
    const [grade, setGrade] = useState('all');
    const [subject, setSubject] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [creating, setCreating] = useState<{ chapter?: LearningChapter } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [htmlEditing, setHtmlEditing] = useState<{ id: string; title: string } | null>(null);
    const load = useCallback(async () => {
        request.current?.abort();
        const controller = new AbortController(); request.current = controller;
        setLoading(true); setError('');
        try {
            const data = await learningRequest<{ materials: LearningMaterial[]; canManage: boolean }>(manage ? '?manage=1' : '', { signal: controller.signal });
            if (!controller.signal.aborted) { setMaterials(data.materials); setCanManage(data.canManage); }
        } catch (err) { if (!controller.signal.aborted) setError((err as Error).message); }
        finally { if (!controller.signal.aborted) setLoading(false); }
    }, [manage]);
    useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => { window.clearTimeout(timer); request.current?.abort(); }; }, [load]);
    useEffect(() => {
        if (manage) return;
        let active = true;
        void getSessionUser().then(async user => {
            if (!user?.roles?.some(role => String(role).toUpperCase() === 'SISWA')) return;
            const goal = await loadLearningGoal(user.id);
            if (!active) return;
            const selected = goal?.programs ?? [];
            setGoalPrograms(selected);
            const linked = programFromUrl();
            if (selected.length && !programTouched.current && !(linked && selected.includes(linked))) {
                setProgram('untukmu');
            }
        }).catch(() => { /* Katalog tetap dapat dijelajahi bila tujuan belum tersedia. */ });
        return () => { active = false; };
    }, [manage]);
    const remove = async (item: LearningMaterial) => {
        if (!await deleteConfirmDialog('Hapus subbab?', `Subbab “${item.subtopic || item.title}” beserta file dan progresnya akan dihapus. Subbab lain dalam BAB ini tetap tersedia.`)) return;
        setDeletingId(item.id); setError('');
        try { await deleteMaterial(item.id); setMaterials(previous => previous.filter(row => row.id !== item.id)); }
        catch (err) { setError((err as Error).message); }
        finally { setDeletingId(null); }
    };
    const goalKey = goalPrograms.join(',');
    // Ruang belajar hanya memuat materi berlabel program yang ditampilkan; materi
    // siswa bertujuan disaring ke program tujuannya. Kelola materi memuat semuanya.
    const allChapters = useMemo(() => groupLearningChapters(materials), [materials]);
    const chapters = allChapters.filter(chapter => {
        if (manage) return true;
        const value = learningProgramOf(chapter.grade);
        if (!activePrograms.some(item => item.value === value)) return false;
        return !goalKey || value === 'umum' || goalKey.split(',').includes(value);
    });
    const matchesProgram = useCallback((value: string) => program === 'all' || program === 'untukmu' || learningCategoryOf(value) === program, [program]);
    const programChapters = chapters.filter(chapter => matchesProgram(chapter.grade));
    const inScope = (value: string) => matchesProgram(value) && (grade === 'all' || value === grade);
    const subjects = [...new Set(materials.filter(item => inScope(item.grade_level || '')).map(item => item.subject).filter(Boolean))].sort();
    const visible = chapters.filter(chapter => inScope(chapter.grade) && (!subject || learningKey(chapter.subject) === learningKey(subject)) &&
        learningKey([chapter.title, chapter.subject, ...chapter.items.map(item => `${item.title} ${item.subtopic} ${item.description}`)].join(' ')).includes(learningKey(query)));
    const gradeGroups = [...new Set(visible.map(chapter => chapter.grade))];
    const countOf = (value: ProgramFilter) => value === 'all' || value === 'untukmu' ? chapters.length : chapters.filter(chapter => learningCategoryOf(chapter.grade) === value).length;
    const overall: LearningCategory = goalOnly
        ? { value: 'untukmu', label: 'Untukmu', hint: 'Sesuai tujuan belajar di dashboard', program: 'umum' }
        : { value: 'all', label: 'Semua', hint: 'Seluruh jenjang dan program', program: 'umum' };
    // Dua baris: Jenjang (SD/SMP/SMA) dan Program; chip "Semua"/"Untukmu" membuka baris pertama.
    const categoryGroups = [
        { key: 'jenjang', label: 'Jenjang', items: categories.filter(item => SCHOOL_STAGE_VALUES.has(item.value)) },
        { key: 'program', label: 'Program', items: categories.filter(item => !SCHOOL_STAGE_VALUES.has(item.value)) },
    ].filter(group => group.items.length).map((group, index) => index ? group : { ...group, items: [overall, ...group.items] });
    // Tingkatan (mis. Kelas VII, VIII, IX) tampil setelah satu kategori dipilih dan berisi lebih dari satu tingkatan.
    const levelChoices = program === 'all' ? [] : [...learningGrades,
        ...[...new Set(materials.map(item => item.grade_level).filter(value => value && !learningGrades.some(item => item.value === value)))].map(value => ({ value, label: learningGradeLabel(value) }))]
        .filter(item => matchesProgram(item.value) && chapters.some(chapter => chapter.grade === item.value))
        .map(item => ({ ...item, label: program === 'untukmu' ? learningGradeHeading(item.value) : item.label }));
    const activeProgram = categories.find(item => item.value === program);
    const scopedItems = programChapters.flatMap(chapter => chapter.items);
    const completed = scopedItems.filter(item => item.completed).length;
    const drafts = materials.filter(item => item.status === 'draft').length;
    // Kartu "Lanjutkan": BAB yang sedang dipelajari, atau BAB pertama yang belum selesai.
    const resume = (() => {
        if (manage) return null;
        const inProgress = programChapters.find(chapter => chapter.completed > 0 && chapter.completed < chapter.items.length);
        const chapter = inProgress || programChapters.find(chapter => chapter.completed < chapter.items.length);
        if (!chapter) return null;
        return { chapter, item: chapter.items.find(item => !item.completed) || chapter.items[0], started: Boolean(inProgress) };
    })();
    const resumeMark = resume ? subjectMark(resume.chapter.subject) : null;
    const summary = loading ? 'Memuat…' : manage
        ? `${chapters.length} BAB · ${materials.length} subbab${drafts ? ` · ${drafts} draf` : ''}`
        : `${programChapters.length} BAB · ${completed} dari ${scopedItems.length} subbab selesai`;

    return <main className="learning learn-library">
        {manage ? <header className="lc-header">
            <div className="lc-hero-main">
                <div>
                    <h1><DashboardPageTitle /></h1>
                    <p>Kelola materi · {summary}</p>
                </div>
            </div>
            {canManage && <div className="lc-header-actions">
                <div className="lc-segmented" role="group" aria-label="Tampilan bahan ajar">
                    <button type="button" aria-pressed={!manage} onClick={() => setManage(false)}>Ruang belajar</button>
                    <button type="button" aria-pressed={manage} onClick={() => setManage(true)}>Kelola materi</button>
                </div>
                {manage && canCreateMaterial && <button type="button" className="learn-primary lc-add" onClick={() => setCreating({})}><Plus size={16} />Tambah subbab</button>}
            </div>}
        </header> : <div className="lc-overview">
            <StudentDashboardOverview
                icon={BookOpen}
                headingAs="h1"
                ariaLabel="Ringkasan ruang belajar"
                eyebrow={loading ? 'Memuat materi…' : 'Belajar sesuai tujuanmu'}
                title={<DashboardPageTitle />}
                description={program === 'untukmu' && goalPrograms.length
                    ? `Materi sesuai tujuan belajarmu: ${goalPrograms.map(programLabel).join(', ')}.`
                    : `Materi ${categories.slice(0, 5).map(item => item.label).join(', ')}${categories.length > 5 ? ', dan lainnya' : ''} dalam satu tempat.`}
                actions={canManage && <div className="lc-segmented" role="group" aria-label="Tampilan bahan ajar">
                    <button type="button" aria-pressed={!manage} onClick={() => setManage(false)}>Ruang belajar</button>
                    <button type="button" aria-pressed={manage} onClick={() => setManage(true)}>Kelola materi</button>
                </div>}
                stats={[
                    { label: 'BAB tersedia', value: loading ? '…' : error ? '—' : programChapters.length, icon: BookOpen, gradient: 'from-emerald-700 to-teal-700' },
                    { label: 'Total subbab', value: loading ? '…' : error ? '—' : scopedItems.length, icon: LayoutGrid, gradient: 'from-blue-600 to-indigo-600' },
                    { label: 'Subbab selesai', value: loading ? '…' : error ? '—' : completed, icon: CheckCircle2, gradient: 'from-violet-600 to-fuchsia-700' },
                ]}
            />
        </div>}

        {!loading && resume && resumeMark && <section className="lc-continue" aria-label="Lanjutkan belajar">
            <span className="lc-mark" style={resumeMark.style} aria-hidden="true">{resumeMark.abbr}</span>
            <div className="lc-continue-text">
                <span>{resume.started ? 'Lanjutkan belajar' : 'Mulai dari sini'}</span>
                <strong>{resume.item.subtopic || resume.item.title}</strong>
                <small>{resume.chapter.subject} · {resume.chapter.title} · {learningGradeLabel(resume.chapter.grade)}</small>
            </div>
            <Link className="lc-continue-action" href={`/dashboard/learning/${resume.item.id}`}>{resume.started ? 'Lanjutkan' : 'Mulai'}<ArrowRight size={15} /></Link>
        </section>}

        <div className="lc-controls">
            <nav className="lc-categories" aria-label="Jenjang dan program belajar">{categoryGroups.map(group =>
                <div key={group.key} className="lc-chip-group" role="group" aria-label={group.label}>
                    <span className="lc-chip-caption" aria-hidden="true">{group.label}</span>
                    <div className="lc-chip-row">{group.items.map(item => {
                        const count = countOf(item.value);
                        return <button type="button" key={item.value} aria-pressed={program === item.value} className={`lc-chip${count ? '' : ' is-empty'}`} title={item.hint}
                            onClick={() => { programTouched.current = true; setProgram(item.value); setGrade('all'); setSubject(''); }}>
                            {item.label}<span className="lc-chip-count">{count}</span>
                        </button>;
                    })}</div>
                </div>)}
            </nav>
            {levelChoices.length > 1 && <nav className="lc-tabs" aria-label="Tingkatan">
                <button type="button" aria-pressed={grade === 'all'} onClick={() => { setGrade('all'); setSubject(''); }}>{activeProgram && SCHOOL_STAGE_VALUES.has(activeProgram.value) ? `Semua kelas ${activeProgram.label}` : 'Semua tingkatan'}</button>
                {levelChoices.map(item => {
                    const count = chapters.filter(chapter => chapter.grade === item.value).length;
                    return <button type="button" key={item.value} aria-pressed={grade === item.value}
                        onClick={() => { setGrade(item.value); setSubject(''); }}>{item.label}<span className="lc-tab-count">{count}</span></button>;
                })}
            </nav>}
            <div className="lc-filters">
                <label className="lc-search"><Search size={16} aria-hidden="true" /><input aria-label="Cari BAB atau subbab" placeholder="Cari BAB, subbab, atau mata pelajaran…" value={query} onChange={event => setQuery(event.target.value)} /></label>
                <InlineSelect className="lc-select" aria-label="Mata pelajaran" value={subject} onChange={setSubject} minWidth="240px" height="40px"
                    options={[{ value: '', label: 'Semua mata pelajaran' }, ...subjects.map(item => ({ value: item, label: item }))]} />
            </div>
        </div>

        {error && <div className="learn-error" role="alert">{error}<button type="button" onClick={() => void load()}>Coba lagi</button></div>}
        {loading ? <div className="learn-loading" role="status">Memuat ruang belajar…</div> : visible.length ? gradeGroups.map(group => <section key={group} className="lc-section" aria-label={learningGradeHeading(group)}>
            <header className="lc-section-heading"><h2>{learningGradeHeading(group)}</h2><span>{visible.filter(chapter => chapter.grade === group).length} BAB</span></header>
            <div className="lc-grid">{visible.filter(chapter => chapter.grade === group).map(chapter => {
                const isOpen = expanded.has(chapter.key) || !!query.trim();
                const percent = Math.round(chapter.completed / chapter.items.length * 100);
                const next = chapter.items.find(item => !item.completed) || chapter.items[0];
                const status = chapterStatus(chapter, manage);
                const mark = subjectMark(chapter.subject);
                const listId = `subchapters-${chapter.items[0].id}`;
                const toggle = () => setExpanded(previous => { const copy = new Set(previous); if (copy.has(chapter.key)) copy.delete(chapter.key); else copy.add(chapter.key); return copy; });
                return <article className={`lc-card${isOpen ? ' is-open' : ''}`} key={chapter.key}>
                    <div className="lc-card-main">
                        <span className="lc-mark" style={mark.style} aria-hidden="true">{mark.abbr}</span>
                        <div className="lc-card-body">
                            <span className="lc-card-subject">{chapter.subject}</span>
                            <h3>{manage
                                ? <button type="button" className="lc-card-title" aria-expanded={isOpen} aria-controls={listId} onClick={toggle}>{chapter.title}</button>
                                : <Link className="lc-card-title" href={`/dashboard/learning/${next.id}`}>{chapter.title}</Link>}</h3>
                            <div className="lc-card-meta">
                                <span className={`lc-status is-${status.tone}`}>{status.tone === 'done' && <CheckCircle2 size={12} aria-hidden="true" />}{status.label}</span>
                                <span>{chapter.items.length} subbab</span>
                            </div>
                        </div>
                    </div>
                    {!manage && <div className="lc-progress" role="progressbar" aria-label={`Progres BAB ${chapter.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>}
                    <div className="lc-card-footer">
                        <button type="button" className="lc-toggle" aria-expanded={isOpen} aria-controls={listId} onClick={toggle}>Daftar subbab<ChevronDown size={15} className={isOpen ? 'learn-chevron-open' : ''} /></button>
                        {manage
                            ? <button type="button" className="lc-link" onClick={() => setCreating({ chapter })}><Plus size={14} />Subbab</button>
                            : <Link className="lc-link" href={`/dashboard/learning/${next.id}`}>{chapter.completed ? chapter.completed === chapter.items.length ? 'Pelajari ulang' : 'Lanjutkan' : 'Mulai belajar'}<ArrowRight size={14} /></Link>}
                    </div>
                    {isOpen && <ol className="learn-subchapter-list" id={listId}>{chapter.items.map((item, index) => <li key={item.id}>
                        <span className={`learn-subchapter-number ${item.completed ? 'is-complete' : ''}`}>{item.completed ? <CheckCircle2 size={14} /> : item.subtopic_order || index + 1}</span>
                        <Link className="learn-subchapter-link" href={`/dashboard/learning/${item.id}${manage && item.canEdit ? '/edit' : ''}`}>
                            <strong>{item.subtopic || item.title}</strong>
                            {(manage || item.materialUpdated || item.completed) && <span>{manage ? (item.status === 'published' ? 'Terbit' : 'Draf') : item.materialUpdated ? 'Diperbarui' : 'Selesai dipelajari'}</span>}
                        </Link>
                        {manage ? item.canEdit ? <span className="lc-row-actions">
                            {HTML_EDITABLE_FORMATS.includes(item.format) && <button type="button" className="lc-icon-btn" aria-label={`Edit HTML subbab ${item.subtopic || item.title}`} title="Edit HTML di halaman ini"
                                onClick={() => setHtmlEditing({ id: item.id, title: item.subtopic || item.title })}><Code2 size={14} /></button>}
                            <Link className="lc-icon-btn" href={`/dashboard/learning/${item.id}/edit`} aria-label={`Edit subbab ${item.subtopic || item.title}`} title="Edit subbab"><Pencil size={14} /></Link>
                            <button type="button" className="learn-btn-icon-danger" aria-label={`Hapus subbab ${item.subtopic || item.title}`} title="Hapus subbab" disabled={deletingId === item.id} onClick={() => void remove(item)}><Trash2 size={14} /></button>
                        </span> : <span className="lc-row-note">Milik guru lain</span> : <ArrowRight size={15} />}
                    </li>)}</ol>}
                </article>;
            })}</div>
        </section>) : !error && <div className="learn-empty"><BookOpen size={36} /><h2>{query || subject ? 'BAB tidak ditemukan' : program === 'untukmu' ? 'Materi untuk tujuanmu sedang disiapkan' : activeProgram ? `Materi ${activeProgram.label} sedang disiapkan` : 'Belum ada materi'}</h2><p>{manage ? 'Tambahkan subbab pertama, lalu pilih tingkatan dan nama BAB-nya.' : goalOnly ? 'Belum ada BAB untuk tujuan belajarmu. Ubah tujuan belajar di Beranda untuk melihat program lain.' : activeProgram ? `Cakupan: ${activeProgram.hint}. Sambil menunggu, jelajahi program lain.` : 'BAB dan subbab yang diterbitkan akan muncul di sini.'}</p>{query || subject ? <button type="button" onClick={() => { setQuery(''); setSubject(''); }}>Hapus pencarian</button> : goalOnly ? <Link href="/dashboard/siswa">Ubah tujuan belajar</Link> : program !== 'all' ? <button type="button" onClick={() => { programTouched.current = true; setProgram('all'); setGrade('all'); }}>Lihat semua program</button> : null}</div>}
        {htmlEditing && <HtmlSourceEditorModal materialId={htmlEditing.id} title={htmlEditing.title} onClose={() => setHtmlEditing(null)}
            onSaved={saved => setMaterials(previous => previous.map(row => row.id === saved.id ? { ...row, ...saved, canEdit: row.canEdit, completed: row.completed } : row))} />}
        {creating && <CreateSubchapterModal materials={materials} chapter={creating.chapter} initialGrade={initialGradeFor(grade, program)} onClose={() => setCreating(null)} onUploaded={() => void load()} />}
    </main>;
}
