import { useState } from 'react';
import { Eye, EyeOff, X, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReport, type HiddenItem } from '../../context/ReportContext';

/**
 * Floating tray listing items removed from the report so the user can restore them.
 */
export function HiddenItemsTray() {
    const { hiddenItems, showItem, clearHiddenItems } = useReport();
    const [open, setOpen] = useState(false);

    if (hiddenItems.length === 0) return null;

    const sections = hiddenItems.filter((i) => i.kind === 'section');
    const cards = hiddenItems.filter((i) => i.kind === 'card');

    const restore = (item: HiddenItem) => {
        showItem(item.id);
        if (item.kind === 'section') {
            requestAnimationFrame(() => {
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    };

    return (
        <div className="fixed right-6 bottom-24 z-50 flex flex-col items-end gap-2">
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.96 }}
                        transition={{ duration: 0.18 }}
                        className="w-[min(100vw-2rem,22rem)] max-h-[min(60vh,28rem)] overflow-hidden rounded-2xl border border-line/80 dark:border-line/20 bg-surface shadow-2xl shadow-black/20"
                    >
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line/60 dark:border-line/10">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary-soft">
                                    Hidden from report
                                </p>
                                <p className="text-xs font-bold text-ink-muted mt-0.5">
                                    Restore anything you removed
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="p-1.5 rounded-lg text-ink-muted hover:bg-surface-raised hover:text-ink"
                                aria-label="Close hidden items"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="overflow-y-auto max-h-[min(48vh,22rem)] p-2 space-y-3">
                            {sections.length > 0 && (
                                <div>
                                    <p className="px-2 pb-1 text-[9px] font-black uppercase tracking-widest text-ink-subtle">
                                        Sections
                                    </p>
                                    <ul className="space-y-1">
                                        {sections.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => restore(item)}
                                                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left hover:bg-primary/10 transition-colors group"
                                                >
                                                    <Eye className="w-3.5 h-3.5 text-primary-soft shrink-0" />
                                                    <span className="flex-1 text-sm font-bold text-ink truncate">{item.label}</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary-soft opacity-0 group-hover:opacity-100">
                                                        Restore
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {cards.length > 0 && (
                                <div>
                                    <p className="px-2 pb-1 text-[9px] font-black uppercase tracking-widest text-ink-subtle">
                                        Cards
                                    </p>
                                    <ul className="space-y-1">
                                        {cards.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => restore(item)}
                                                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left hover:bg-primary/10 transition-colors group"
                                                >
                                                    <Eye className="w-3.5 h-3.5 text-primary-soft shrink-0" />
                                                    <span className="flex-1 text-sm font-bold text-ink truncate">{item.label}</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary-soft opacity-0 group-hover:opacity-100">
                                                        Restore
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {hiddenItems.length > 1 && (
                            <div className="border-t border-line/60 dark:border-line/10 p-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearHiddenItems();
                                        setOpen(false);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-ink-muted hover:bg-surface-raised hover:text-ink transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Restore all
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-full border border-line/80 dark:border-line/20 bg-surface text-ink shadow-xl hover:-translate-y-0.5 active:scale-95 transition-transform"
                title="Show hidden items"
                aria-label={`Show ${hiddenItems.length} hidden items`}
                aria-expanded={open}
            >
                <span className="relative">
                    <EyeOff className="w-4 h-4 text-primary-soft" />
                    <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-primary text-white text-[9px] font-black grid place-items-center">
                        {hiddenItems.length}
                    </span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest">
                    Hidden
                </span>
            </button>
        </div>
    );
}
