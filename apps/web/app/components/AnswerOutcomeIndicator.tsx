'use client';

import { BarChart3, CheckCircle, HelpCircle, MinusCircle, XCircle } from 'lucide-react';
import { isAnswerUnanswered, isPsychometricType, type AnswerOutcome } from '@/lib/answer-stats';

export function AnswerOutcomeIndicator({ answer }: { answer: AnswerOutcome }) {
    const unanswered = isAnswerUnanswered(answer);
    if (!unanswered && isPsychometricType(answer.bank_questions?.type)) {
        const label = 'Soal kepribadian: tidak dinilai benar/salah';
        return <div title={label} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-indigo-500 text-white shadow-sm"><BarChart3 size={16} /></div>;
    }
    const essay = ['essay', 'esay', 'uraian'].includes(answer.bank_questions?.type || '');
    const pending = !unanswered && (essay || answer.is_correct == null);
    const label = unanswered ? 'Tidak dijawab' : essay ? 'Esai' : pending ? 'Menunggu penilaian' : answer.is_correct ? 'Benar' : 'Salah';
    const Icon = unanswered ? MinusCircle : pending ? HelpCircle : answer.is_correct ? CheckCircle : XCircle;
    const color = unanswered ? 'bg-slate-200 text-slate-600' : pending ? 'bg-[#030C4D] text-white' : answer.is_correct ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white';
    return <div title={label} aria-label={label} className={`flex h-10 w-10 items-center justify-center rounded-full border-4 border-white shadow-sm ${color}`}><Icon size={16} /></div>;
}
