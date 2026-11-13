/**
 * Rentang skor dimensi kepribadian yang mungkin dicapai siswa, dihitung dari
 * soal-soal di bank. Cermin aturan poin di `apps/scoring/app/services/grading.py`:
 * skor dimensi satu pengerjaan = JUMLAH poin semua soal yang mengarah ke dimensi itu.
 *
 *  - Likert (dimensi soal)            : nilai pilihan 1–5.
 *  - SJT (dimensi soal)               : bobot opsi terpilih; bobot ≤ 0 tidak menambah poin.
 *  - Pilihan berpasangan / forced choice: bobot opsi terpilih (bawaan 1) ke dimensi opsi itu.
 *  - Checklist                         : jumlah bobot opsi tercentang (bawaan 1) per dimensi opsi.
 *  - Peringkat                         : urutan pertama = n poin, terakhir = 1 poin, per dimensi opsi.
 */

interface RangeOption {
    weight?: number | null;
    metadata?: { dimension_id?: string | null } | null;
    dimension_id?: string | null;
}

interface RangeQuestion {
    type?: string | null;
    dimension_id?: string | null;
    bank_question_options?: RangeOption[] | null;
    options?: RangeOption[] | null;
}

export interface DimensionScoreRange {
    min: number;
    max: number;
    /** Jumlah soal yang menyumbang poin ke dimensi ini. */
    questionCount: number;
}

const optionDimension = (option: RangeOption) => option.metadata?.dimension_id || option.dimension_id || null;
const weightOf = (option: RangeOption, fallback: number) =>
    typeof option.weight === 'number' && Number.isFinite(option.weight) ? option.weight : fallback;

/** Kontribusi satu soal ke satu dimensi, atau null bila soal itu tidak menyentuh dimensinya. */
function questionRange(question: RangeQuestion, dimensionId: string): { min: number; max: number } | null {
    const type = (question.type || '').toLowerCase();
    const options = question.bank_question_options || question.options || [];

    if (type === 'likert') return question.dimension_id === dimensionId ? { min: 1, max: 5 } : null;

    if (type === 'sjt') {
        if (question.dimension_id !== dimensionId || options.length === 0) return null;
        const points = options.map(option => Math.max(weightOf(option, 0), 0));
        return { min: Math.min(...points), max: Math.max(...points) };
    }

    const mine = options.filter(option => optionDimension(option) === dimensionId);
    if (mine.length === 0) return null;

    if (type === 'forced_choice' || type === 'paired_comparison') {
        const points = mine.map(option => weightOf(option, 1));
        // Memilih opsi milik dimensi lain berarti dimensi ini mendapat 0 poin.
        if (mine.length < options.length) points.push(0);
        return { min: Math.min(...points), max: Math.max(...points) };
    }

    if (type === 'checklist') {
        // Setiap opsi boleh dicentang atau tidak: minimum = semua bobot negatif, maksimum = semua bobot positif.
        const points = mine.map(option => weightOf(option, 1));
        return {
            min: points.filter(point => point < 0).reduce((sum, point) => sum + point, 0),
            max: points.filter(point => point > 0).reduce((sum, point) => sum + point, 0),
        };
    }

    if (type === 'ranking') {
        const n = options.length;
        const k = mine.length;
        // Teratas: n + (n−1) + … ; terbawah: 1 + 2 + … + k.
        return { min: (k * (k + 1)) / 2, max: k * n - (k * (k - 1)) / 2 };
    }

    return null;
}

export function dimensionScoreRange(questions: RangeQuestion[], dimensionId: string): DimensionScoreRange | null {
    let min = 0;
    let max = 0;
    let questionCount = 0;
    for (const question of questions) {
        const range = questionRange(question, dimensionId);
        if (!range) continue;
        min += range.min;
        max += range.max;
        questionCount += 1;
    }
    if (questionCount === 0 || max <= min) return null;
    return { min: Math.floor(min), max: Math.ceil(max), questionCount };
}

export interface GeneratedInterpretation {
    min_score: number;
    max_score: number;
    title: string;
    interpretation: string;
}

/**
 * Bagi rentang skor menjadi tingkat Rendah/Sedang/Tinggi yang tidak
 * tumpang-tindih dan tidak berlubang (batas bilangan bulat, inklusif).
 * Narasinya templat umum yang dapat disunting guru setelahnya.
 */
export function generateInterpretations(dimensionName: string, range: DimensionScoreRange): GeneratedInterpretation[] {
    const name = dimensionName.trim() || 'dimensi ini';
    const levels = [
        { key: 'Rendah', text: `Skor ${name} kamu masih rendah. Aspek ini perlu dikembangkan: mulailah dari kebiasaan kecil sehari-hari dan mintalah umpan balik dari guru atau orang tua.` },
        { key: 'Sedang', text: `Skor ${name} kamu berada di tingkat sedang. Kamu sudah menunjukkan aspek ini dalam banyak situasi; tingkatkan konsistensinya, terutama saat menghadapi tekanan.` },
        { key: 'Tinggi', text: `Skor ${name} kamu tinggi. Aspek ini menjadi salah satu kekuatanmu; pertahankan dan jadikan contoh bagi teman-temanmu.` },
    ];
    const span = range.max - range.min + 1;
    const picked = span >= 3 ? levels : span === 2 ? [levels[0], levels[2]] : [levels[1]];
    const size = span / picked.length;
    return picked.map((level, index) => {
        const min_score = range.min + Math.round(size * index);
        const max_score = index === picked.length - 1 ? range.max : range.min + Math.round(size * (index + 1)) - 1;
        return { min_score, max_score, title: `${name} ${level.key.toLowerCase()}`.replace(/^./, c => c.toUpperCase()), interpretation: level.text };
    });
}

/** Skor dalam rentang yang belum memiliki interpretasi (untuk peringatan celah). */
export function uncoveredScores(range: DimensionScoreRange, intervals: Array<{ min_score: number; max_score: number }>): number[] {
    const missing: number[] = [];
    for (let score = range.min; score <= range.max; score += 1) {
        if (!intervals.some(item => score >= item.min_score && score <= item.max_score)) missing.push(score);
    }
    return missing;
}
