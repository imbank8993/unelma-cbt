import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Banner bersama halaman siswa (Beranda, Kelas, Jadwal): kartu terang dengan
 * ikon, judul yang tegas, dan aksen halus (pola grid tipis dan sapuan biru di
 * kanan atas). Judul banner melengkapi judul header, bukan mengulanginya.
 */
export function StudentBanner({ icon: Icon, eyebrow, title, description, actions, aside, children }: {
    icon?: LucideIcon;
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    /** Tombol di kanan judul (desktop) atau di bawahnya (HP). */
    actions?: ReactNode;
    /** Konten kanan, misalnya ringkasan angka. */
    aside?: ReactNode;
    /** Konten tambahan di bawah, misalnya strip kalender. */
    children?: ReactNode;
}) {
    return (
        <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(3,12,77,0.12)] dark:border-slate-800 dark:bg-slate-900">
            {/* Aksen: sapuan biru lembut dan pola grid tipis yang memudar ke kiri bawah */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_100%_0%,rgba(37,99,235,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_120%_at_100%_0%,rgba(59,130,246,0.16),transparent_70%)]" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(3,12,77,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(3,12,77,0.05)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(70%_100%_at_100%_0%,black,transparent_75%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)]" aria-hidden="true" />

            <div className="relative px-5 py-6 sm:px-8 sm:py-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4 text-left">
                        {Icon && (
                            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#030C4D] text-white shadow-[0_6px_16px_-6px_rgba(3,12,77,0.5)] sm:flex dark:bg-blue-600">
                                <Icon size={22} strokeWidth={1.75} />
                            </span>
                        )}
                        <div className="min-w-0">
                            {eyebrow && <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{eyebrow}</p>}
                            <h2 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-white">{title}</h2>
                            {description && <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{description}</div>}
                        </div>
                    </div>
                    {(actions || aside) && (
                        <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center">
                            {aside}
                            {actions}
                        </div>
                    )}
                </div>
                {children && <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">{children}</div>}
            </div>
        </section>
    );
}

/** Ringkasan angka di banner: dipisah garis tipis, tanpa kotak. */
export function BannerStats({ items }: { items: { label: string; value: ReactNode; action?: ReactNode }[] }) {
    return (
        <dl className="grid w-full grid-cols-3 divide-x divide-slate-200 sm:flex sm:w-auto dark:divide-slate-700">
            {items.map(item => (
                <div key={item.label} className="flex min-w-0 flex-col-reverse px-3 text-left first:pl-0 last:pr-0 sm:px-6">
                    <dt className="mt-1.5 text-xs font-medium sm:whitespace-nowrap text-slate-500 dark:text-slate-400">{item.label}{item.action}</dt>
                    <dd className="text-xl font-semibold tabular-nums leading-none text-slate-900 sm:text-2xl dark:text-white">{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** Tombol utama di banner. */
export const BANNER_BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#030C4D] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0B1A66] dark:bg-blue-600 dark:hover:bg-blue-500';
