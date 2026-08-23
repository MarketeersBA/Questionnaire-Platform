export function SectionDivider({ title, comparator }: { title: string, comparator?: string }) {
    return (
        <div className="relative py-10 flex items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
            <div className="mx-6 flex flex-col items-center">
                {comparator && (
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">
                        {comparator} Comparative
                    </span>
                )}
                <span className="text-xl font-bold text-ink-subtle uppercase tracking-widest whitespace-nowrap">
                    {title}
                </span>
            </div>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
        </div>
    );
}
