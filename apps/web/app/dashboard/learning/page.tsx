'use client';

import DashboardPageTitle from '@/app/components/DashboardPageTitle';
import { StudentDashboardOverview } from '@/app/components/student/StudentDashboardOverview';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, BookOpen, Briefcase, CheckCircle2, ChevronDown, Code2, GraduationCap, Landmark, Languages, LayoutGrid, Pencil, Plus, School, Search, ShieldCheck, Sparkles, Target, Trash2, type LucideIcon } from 'lucide-react';
import { deleteMaterial, learningRequest, type LearningMaterial } from '@/lib/learning-api';
import { groupLearningChapters, learningGradeLabel, learningGrades, learningKey, learningProgramOf, learningPrograms, type LearningChapter, type LearningProgram } from '@/lib/learning-catalog';
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

/** Ikon dan rona tiap program belajar. */
const PROGRAM_STYLE: Record<LearningProgram | 'all' | 'untukmu', { icon: LucideIcon; hue: number }> = {
    all: { icon: LayoutGrid, hue: 222 }, untukmu: { icon: Target, hue: 262 }, sekolah: { icon: GraduationCap, hue: 217 }, snpdb: { icon: School, hue: 175 }, utbk: { icon: Target, hue: 262 },
    cpns: { icon: Landmark, hue: 160 }, pppk: { icon: Briefcase, hue: 24 }, kedinasan: { icon: ShieldCheck, hue: 200 },
    bahasa: { icon: Languages, hue: 330 }, umum: { icon: Sparkles, hue: 45 },
};
type ProgramFilter = LearningProgram | 'all' | 'untukmu';
/** Program awal dari tautan, misalnya `/dashboard/learning?program=cpns` dari beranda. */
function initialProgram(): ProgramFilter {
    if (typeof window === 'undefined') return 'all';
    const value = new URLSearchParams(window.location.search).get('program');
    return learningPrograms.some(item => item.value === value) ? value as LearningProgram : 'all';
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
    const [program, setProgram] = useState<ProgramFilter>(initialProgram);
    const [goalPrograms, setGoalPrograms] = useState<LearningProgram[]>([]);
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
            if (selected.length && !programTouched.current && !new URLSearchParams(window.location.search).has('program')) {
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
    const chapters = useMemo(() => groupLearningChapters(materials), [materials]);
    const matchesProgram = useCallback((value: string) => program === 'all' || (program === 'untukmu'
        ? goalPrograms.includes(learningProgramOf(value))
        : learningProgramOf(value) === program), [program, goalPrograms]);
    const programChapters = useMemo(() => chapters.filter(chapter => matchesProgram(chapter.grade)), [chapters, matchesProgram]);
    const inScope = (value: string) => matchesProgram(value) && (grade === 'all' || value === grade);
    const subjects = [...new Set(materials.filter(item => inScope(item.grade_level || '')).map(item => item.subject).filter(Boolean))].sort();
    const visible = chapters.filter(chapter => inScope(chapter.grade) && (!subject || learningKey(chapter.subject) === learningKey(subject)) &&
        learningKey([chapter.title, chapter.subject, ...chapter.items.map(item => `${item.title} ${item.subtopic} ${item.description}`)].join(' ')).includes(learningKey(query)));
    const gradeGroups = [...new Set(visible.map(chapter => chapter.grade))];
    const programChoices = [
        ...(goalPrograms.length && !manage ? [{ value: 'untukmu' as const, label: 'Untukmu', hint: 'Sesuai tujuan belajar di dashboard' }] : []),
        { value: 'all' as const, label: 'Semua', hint: 'Seluruh program' },
        ...learningPrograms,
    ];
    // Tingkatan hanya ditampilkan bila ada lebih dari satu tingkatan berisi (mis. Kelas X dan XI).
    const levelChoices = [...learningGrades,
        ...[...new Set(materials.map(item => item.grade_level).filter(value => value && !learningGrades.some(item => item.value === value)))].map(value => ({ value, label: learningGradeLabel(value) }))]
        .filter(item => matchesProgram(item.value) && chapters.some(chapter => chapter.grade === item.value));
    const activeProgram = learningPrograms.find(item => item.value === program);
    const scopedItems = programChapters.flatMap(chapter => chapter.items);
    const completed = scopedItems.filter(item => item.completed).length;
    const drafts = materials.filter(item => item.status === 'draft').length;
    // Kartu "Lanjutkan": BAB yang sedang dipelajari, atau BAB pertama yang belum selesai.
    const resume = useMemo(() => {
        if (manage) return null;
        const inProgress = programChapters.find(chapter => chapter.completed > 0 && chapter.completed < chapter.items.length);
        const chapter = inProgress || programChapters.find(chapter => chapter.completed < chapter.items.length);
        if (!chapter) return null;
        return { chapter, item: chapter.items.find(item => !item.completed) || chapter.items[0], started: Boolean(inProgress) };
    }, [programChapters, manage]);
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
                    : 'Materi sekolah, UTBK, CPNS, PPPK, kedinasan, hingga bahasa dalam satu tempat.'}
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
            <nav className="lc-programs" aria-label="Program belajar">{programChoices.map(item => {
                const count = item.value === 'untukmu' ? chapters.filter(chapter => goalPrograms.includes(learningProgramOf(chapter.grade))).length
                    : chapters.filter(chapter => item.value === 'all' || learningProgramOf(chapter.grade) === item.value).length;
                const style = PROGRAM_STYLE[item.value];
                const Icon = style.icon;
                return <button type="button" key={item.value} aria-pressed={program === item.value} className={`lc-program${count ? '' : ' is-empty'}`}
                    style={{ '--mark-hue': style.hue } as CSSProperties} title={item.hint}
                    onClick={() => { programTouched.current = true; setProgram(item.value); setGrade('all'); setSubject(''); }}>
                    <span className="lc-program-icon" aria-hidden="true"><Icon size={16} /></span>
                    <span className="lc-program-text"><strong>{item.label}</strong><small>{count} BAB</small></span>
                </button>;
            })}</nav>
            {levelChoices.length > 1 && <nav className="lc-tabs" aria-label="Tingkatan">
                <button type="button" aria-pressed={grade === 'all'} onClick={() => { setGrade('all'); setSubject(''); }}>Semua tingkatan</button>
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
        {loading ? <div className="learn-loading" role="status">Memuat ruang belajar…</div> : visible.length ? gradeGroups.map(group => <section key={group} className="lc-section" aria-label={learningGradeLabel(group)}>
            <header className="lc-section-heading"><h2>{learningGradeLabel(group)}</h2><span>{visible.filter(chapter => chapter.grade === group).length} BAB</span></header>
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
        </section>) : !error && <div className="learn-empty"><BookOpen size={36} /><h2>{query || subject ? 'BAB tidak ditemukan' : program === 'untukmu' ? 'Materi untuk tujuanmu sedang disiapkan' : activeProgram ? `Materi ${activeProgram.label} sedang disiapkan` : 'Belum ada materi'}</h2><p>{manage ? 'Tambahkan subbab pertama, lalu pilih tingkatan dan nama BAB-nya.' : program === 'untukmu' ? 'Belum ada BAB untuk tujuan belajarmu. Sambil menunggu, jelajahi program lain.' : activeProgram ? `Cakupan: ${activeProgram.hint}. Sambil menunggu, jelajahi program lain.` : 'BAB dan subbab yang diterbitkan akan muncul di sini.'}</p>{query || subject ? <button type="button" onClick={() => { setQuery(''); setSubject(''); }}>Hapus pencarian</button> : program !== 'all' ? <button type="button" onClick={() => { programTouched.current = true; setProgram('all'); setGrade('all'); }}>Lihat semua program</button> : null}</div>}
        {htmlEditing && <HtmlSourceEditorModal materialId={htmlEditing.id} title={htmlEditing.title} onClose={() => setHtmlEditing(null)}
            onSaved={saved => setMaterials(previous => previous.map(row => row.id === saved.id ? { ...row, ...saved, canEdit: row.canEdit, completed: row.completed } : row))} />}
        {creating && <CreateSubchapterModal materials={materials} chapter={creating.chapter} initialGrade={grade !== 'all' ? grade : program !== 'all' && program !== 'sekolah' ? learningGrades.find(item => item.program === program)?.value ?? '10' : '10'} onClose={() => setCreating(null)} onUploaded={() => void load()} />}
    </main>;
}
