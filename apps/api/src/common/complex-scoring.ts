/**
 * Aturan penskoran Benar-Salah dan Kategorisasi untuk satu ujian.
 *
 * `official` (ujian lama tanpa bidang aturan; ujian baru bawaannya
 * `proportional`): satu soal dinilai sebagai satu soal, mengikuti Kepdirjen
 * Pendis 781/2021 dan Desain Pengembangan Soal AKM 2020 — soal ≤ 5 pernyataan
 * semua-atau-nol; soal > 5 pernyataan skor penuh / setengah (salah 1–2) / nol.
 *
 * `proportional`: aturan lama, skor = pernyataan benar ÷ jumlah pernyataan.
 * Dipasang oleh migrasi 20261030_01 pada setiap ujian yang sudah memiliki
 * pengerjaan saat aturan resmi diberlakukan, supaya nilai yang sudah ada tidak
 * bergeser bila ujian itu dinilai ulang.
 *
 * Aturan disimpan di `cbt_exams.metadata.complex_scoring_rule`, lalu dicap pada
 * SALINAN soal beku (`metadata.complex_scoring`) sehingga setiap pemanggil
 * layanan penilaian dan IRT membawanya tanpa mengubah payload masing-masing.
 * Snapshot tersimpan tidak pernah ditulis ulang.
 *
 * Penanda yang sama juga mempertahankan parameter tebakan IRT 3PL lama untuk
 * PG Kompleks, Isian Singkat, dan Urutan, sehingga Kalkulasi IRT ulang pada
 * ujian lama memberi hasil yang sama seperti sebelumnya.
 */
export const COMPLEX_SCORING_RULE_KEY = 'complex_scoring_rule';
export const COMPLEX_SCORING_FLAG = 'complex_scoring';
/** Tipe yang penilaian atau parameter IRT-nya berbeda antara aturan lama dan baru. */
export const LEGACY_MARKED_TYPES = ['true_false', 'categorization', 'mcq_complex', 'short_answer', 'ordering'];

export type ComplexScoringRule = 'official' | 'proportional';

/** Aturan Benar-Salah. Ujian tanpa bidang ini (ujian lama) = `official`. */
export function examComplexScoringRule(examMetadata: unknown): ComplexScoringRule {
    return !!examMetadata && typeof examMetadata === 'object' &&
        (examMetadata as Record<string, unknown>)[COMPLEX_SCORING_RULE_KEY] === 'proportional'
        ? 'proportional' : 'official';
}

/**
 * Kategorisasi diatur terpisah dari Benar-Salah. Ujian yang belum memiliki
 * bidang ini (dibuat sebelum pemisahan) mengikuti aturan Benar-Salah-nya,
 * sehingga nilainya tidak bergeser saat dinilai ulang.
 */
export const CATEGORIZATION_SCORING_RULE_KEY = 'categorization_scoring_rule';

export function examCategorizationScoringRule(examMetadata: unknown): ComplexScoringRule {
    const value = !!examMetadata && typeof examMetadata === 'object'
        ? (examMetadata as Record<string, unknown>)[CATEGORIZATION_SCORING_RULE_KEY] : undefined;
    return value === 'official' || value === 'proportional' ? value : examComplexScoringRule(examMetadata);
}

/**
 * Parameter tebakan IRT 3PL lama untuk PG Kompleks, Isian Singkat, dan Urutan.
 * Dulu ikut terpasang setiap kali aturan Benar-Salah proporsional. Ujian yang
 * dibuat setelah proporsional menjadi bawaan menyimpan `legacy_irt_guess: false`
 * supaya memilih proporsional tidak lagi mengubah parameter tebakan tipe lain;
 * ujian lama tanpa bidang itu tetap seperti sebelumnya.
 */
export const LEGACY_IRT_GUESS_KEY = 'legacy_irt_guess';
const LEGACY_GUESS_TYPES = ['mcq_complex', 'short_answer', 'ordering'];

export interface ExamStatementScoringRules {
    trueFalse: ComplexScoringRule;
    categorization: ComplexScoringRule;
    legacyIrtGuess: boolean;
}

export function examStatementScoringRules(examMetadata: unknown): ExamStatementScoringRules {
    const trueFalse = examComplexScoringRule(examMetadata);
    return {
        trueFalse,
        categorization: examCategorizationScoringRule(examMetadata),
        legacyIrtGuess: trueFalse === 'proportional' &&
            (examMetadata as Record<string, unknown>)[LEGACY_IRT_GUESS_KEY] !== false,
    };
}

/**
 * Cap penanda proporsional pada salinan soal bertipe terkait; tidak pernah
 * mengubah objek asli. Layanan penilaian membaca penanda yang sama untuk
 * Benar-Salah dan Kategorisasi, jadi pemisahan aturan dilakukan di sini per tipe.
 */
export function applyComplexScoringRule<T extends { type?: unknown; metadata?: unknown }>(
    question: T,
    rules: ExamStatementScoringRules,
): T {
    const type = String(question.type || '').toLowerCase();
    const marked = type === 'true_false' ? rules.trueFalse === 'proportional'
        : type === 'categorization' ? rules.categorization === 'proportional'
            : LEGACY_GUESS_TYPES.includes(type) && rules.legacyIrtGuess;
    if (!marked) return question;
    const metadata = question.metadata && typeof question.metadata === 'object'
        ? question.metadata as Record<string, unknown> : {};
    return { ...question, metadata: { ...metadata, [COMPLEX_SCORING_FLAG]: 'proportional' } };
}

/** Menjodohkan diatur terpisah; tanpa penanda tetap proporsional seperti ujian lama. */
export const MATCHING_SCORING_RULE_KEY = 'matching_scoring_rule';
export const MATCHING_SCORING_FLAG = 'matching_scoring';

export function examMatchingScoringRule(examMetadata: unknown): ComplexScoringRule {
    return !!examMetadata && typeof examMetadata === 'object' &&
        (examMetadata as Record<string, unknown>)[MATCHING_SCORING_RULE_KEY] === 'official'
        ? 'official' : 'proportional';
}

/** Aturan ujian mengalahkan penanda bank/snapshot, tanpa menulis ulang snapshot. */
export function applyMatchingScoringRule<T extends { type?: unknown; metadata?: unknown }>(
    question: T, rule: ComplexScoringRule,
): T {
    if (String(question.type || '').toLowerCase() !== 'matching') return question;
    const metadata = question.metadata && typeof question.metadata === 'object'
        ? question.metadata as Record<string, unknown> : {};
    if (rule === 'proportional' && metadata[MATCHING_SCORING_FLAG] !== 'official') return question;
    return { ...question, metadata: { ...metadata, [MATCHING_SCORING_FLAG]: rule } };
}
