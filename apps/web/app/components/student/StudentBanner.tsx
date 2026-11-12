import type { ReactNode } from 'react';

/**
 * Banner bersama halaman siswa (Beranda, Kelas, Jadwal): gradasi navy yang tenang,
 * satu ornamen garis tipis, dan tipografi yang sama di setiap halaman.
 */
export function StudentBanner({ eyebrow, title, description, actions, aside, children }: {
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
        <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#030C4D_0%,#0B1A66_55%,#1E3A8A_100%)] px-5 py-6 text-white shadow-[0_8px_30px_rgba(3,12,77,0.18)] sm:px-8 sm:py-7">
            <svg className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 text-white/[0.07]" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                <circle cx="100" cy="100" r="98" stroke="currentColor" strokeWidth="1" />
                <circle cx="100" cy="100" r="72" stroke="currentColor" strokeWidth="1" />
                <circle cx="100" cy="100" r="46" stroke="currentColor" strokeWidth="1" />
            </svg>
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 text-left">
                    {eyebrow && <p className="text-xs font-medium text-blue-200/90">{eyebrow}</p>}
                    <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                    {description && <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-blue-100/80">{description}</div>}
                </div>
                {(actions || aside) && (
                    <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center">
                        {aside}
                        {actions}
                    </div>
                )}
            </div>
            {children && <div className="relative mt-6">{children}</div>}
        </section>
    );
}

/** Ringkasan angka di banner: dipisah garis tipis, tanpa kotak. */
export function BannerStats({ items }: { items: { label: string; value: ReactNode; action?: ReactNode }[] }) {
    return (
        <dl className="flex divide-x divide-white/15">
            {items.map(item => (
                <div key={item.label} className="flex flex-col-reverse px-3 text-left first:pl-0 last:pr-0 sm:px-6">
                    <dt className="mt-1.5 whitespace-nowrap text-[11px] font-medium text-blue-200/90">{item.label}{item.action}</dt>
                    <dd className="text-xl font-semibold tabular-nums leading-none sm:text-2xl">{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** Tombol utama di banner: putih dengan teks navy. */
export const BANNER_BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#030C4D] shadow-sm transition-colors hover:bg-blue-50';
