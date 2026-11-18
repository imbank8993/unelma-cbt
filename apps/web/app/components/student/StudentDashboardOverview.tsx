import Link from 'next/link';
import { ArrowUpRight, Sparkles, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface OverviewStat {
    label: string;
    value: ReactNode;
    icon: LucideIcon;
    href?: string;
    action?: string;
    gradient: string;
}

/** Shared student page overview with gradient summary cards and an optional next action. */
export function StudentDashboardOverview({ icon: PageIcon = Sparkles, ariaLabel = 'Ringkasan dashboard', headingAs: Heading = 'h2', eyebrow, title, description, actions, stats, children }: {
    icon?: LucideIcon;
    ariaLabel?: string;
    headingAs?: 'h1' | 'h2';
    eyebrow: ReactNode;
    title: ReactNode;
    description: ReactNode;
    stats: OverviewStat[];
    actions?: ReactNode;
    children?: ReactNode;
}) {
    return <section aria-label={ariaLabel} className="student-overview space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#030C4D] via-[#123A8E] to-[#1D4ED8] p-5 text-white shadow-sm sm:p-6">
                <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full border-[32px] border-white/[0.06]" />
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-12 h-40 w-40 rounded-full bg-sky-300/10 blur-2xl" />
                <div className="relative flex items-start gap-3.5">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-[rgba(255,255,255,0.1)] sm:flex">
                        <PageIcon size={21} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                        <p className="text-xs font-medium text-blue-100">{eyebrow}</p>
                        <Heading className="student-overview-title mt-1 text-2xl font-semibold tracking-tight text-white">{title}</Heading>
                        <div className="mt-3 text-xs leading-relaxed text-blue-100">{description}</div>
                        {actions && <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div>}
                    </div>
                </div>
            </div>

            <dl className="grid grid-cols-3 gap-2 sm:gap-3">
                {stats.map(({ icon: Icon, ...stat }) => <div key={stat.label} className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-gradient-to-br p-3 text-left text-white shadow-sm sm:p-4 ${stat.gradient}`}>
                    <div aria-hidden="true" className="pointer-events-none absolute -right-7 -top-8 h-24 w-24 rounded-full bg-[rgba(255,255,255,0.08)]" />
                    <Icon size={19} className="absolute right-3.5 top-3.5 hidden text-white/70 xl:block" aria-hidden="true" />
                    <dt className="relative min-h-8 text-[11px] font-medium leading-4 text-white/90 sm:text-xs xl:pr-6">{stat.label}</dt>
                    <dd className="relative flex flex-1 flex-col">
                        <span className="mt-1 block text-[28px] font-semibold leading-none tracking-tight tabular-nums sm:text-3xl">{stat.value}</span>
                        {stat.href && stat.action && <Link href={stat.href} aria-label={`${stat.action} · ${stat.label}`} className="mt-auto inline-flex w-fit items-center gap-1 rounded-md pt-4 text-[11px] font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent">
                            {stat.action}<ArrowUpRight size={13} aria-hidden="true" />
                        </Link>}
                    </dd>
                </div>)}
            </dl>
        </div>

        {children && <div className="rounded-2xl border border-blue-100/80 bg-gradient-to-r from-blue-50/80 via-white to-white p-4 shadow-sm dark:border-slate-800 dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900 sm:px-5">
            {children}
        </div>}
    </section>;
}
