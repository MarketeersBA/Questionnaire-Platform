import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { useReport } from '../../context/ReportContext';

interface ReportSectionCardProps {
    id: string;
    title: ReactNode;
    eyebrow?: ReactNode;
    badge?: ReactNode;
    children: ReactNode;
    className?: string;
    /** When true (print/export), always show content and hide the toggle. */
    forceVisible?: boolean;
}

/**
 * Card wrapper for a top-level report section.
 * Hide removes the section from the page; restore via the Hidden tray or sidebar.
 */
export function ReportSectionCard({
    id,
    title,
    eyebrow,
    badge,
    children,
    className = '',
    forceVisible = false,
}: ReportSectionCardProps) {
    const { isItemHidden, hideItem } = useReport();
    const titleText = typeof title === 'string' ? title : id;
    const isHidden = !forceVisible && isItemHidden(id);

    if (isHidden) return null;

    return (
        <section id={id} className={`scroll-mt-40 animate-fade-in ${className}`}>
            <div className="rounded-2xl border overflow-hidden transition-colors border-line/80 dark:border-line/10 bg-surface/90 dark:bg-slate-900/50 shadow-sm">
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line/60 dark:border-line/10">
                    <div className="min-w-0 flex items-center gap-3">
                        <div
                            className="h-1 w-10 rounded-full shrink-0"
                            style={{ background: 'linear-gradient(90deg, rgb(var(--c-primary)), rgb(var(--c-accent)))' }}
                        />
                        <div className="min-w-0">
                            {eyebrow && (
                                <div className="text-[10px] font-black text-primary-soft uppercase tracking-[0.25em] mb-0.5">
                                    {eyebrow}
                                </div>
                            )}
                            <h2 className="font-black tracking-tight text-ink truncate text-xl sm:text-2xl font-display">
                                {title}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {badge}
                        {!forceVisible && (
                            <button
                                type="button"
                                onClick={() => hideItem(id, titleText, 'section')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-line/80 dark:border-line/20 bg-surface-raised text-ink-muted hover:text-ink hover:border-primary/30 transition-all"
                                title="Hide section"
                                aria-label={`Hide ${titleText}`}
                            >
                                <EyeOff className="w-3.5 h-3.5" />
                                Hide
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-5 sm:p-6">
                    {children}
                </div>
            </div>
        </section>
    );
}
