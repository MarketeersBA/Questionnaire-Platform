import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown, FileText, Presentation, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type ExportFormat = 'pptx' | 'pdf';

interface ExportMenuProps {
    onExport: (format: ExportFormat) => void | Promise<void>;
    /** True once a PPTX artifact exists, so the label can say "Download" not "Export". */
    hasPptx?: boolean;
    disabled?: boolean;
}

/**
 * Export control for the report: one button, two destinations.
 *
 * PPTX and PDF are not the same artifact and the choice is not cosmetic. The
 * deck is rebuilt slide by slide for presenting; the PDF is the report page
 * itself printed, so charts keep their labels as selectable text and each
 * insight stays next to the chart it describes. That makes the PDF the better
 * choice when the file will be read, quoted, or parsed downstream — which is
 * why it is offered as a peer of PPTX rather than buried.
 */
export function ExportMenu({ onExport, hasPptx, disabled }: ExportMenuProps) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<ExportFormat | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Dismiss on outside click and on Escape — a menu that traps focus in a
    // report people read for a long time is worse than no menu.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const run = async (format: ExportFormat) => {
        setOpen(false);
        setBusy(format);
        try {
            await onExport(format);
        } finally {
            setBusy(null);
        }
    };

    const options: Array<{
        format: ExportFormat;
        icon: typeof FileText;
        title: string;
        blurb: string;
    }> = [
        {
            format: 'pdf',
            icon: FileText,
            title: 'PDF',
            blurb: 'Full report with insights. Text stays selectable.',
        },
        {
            // Always offered, in both the analyst view and a shared link. It was
            // previously hidden when no deck existed yet, which made the option
            // look unavailable when in fact it just needed building first.
            format: 'pptx' as const,
            icon: Presentation,
            title: 'PowerPoint',
            blurb: hasPptx
                ? 'Editable slides with charts and insights.'
                : 'Builds the deck, then downloads it.',
        },
    ];

    return (
        <div ref={containerRef} className="relative" data-export-menu>
            <button
                onClick={() => setOpen((v) => !v)}
                disabled={disabled || busy !== null}
                aria-haspopup="menu"
                aria-expanded={open}
                className="btn-premium flex items-center gap-3 active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
                title="Export this report"
            >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                <span className="uppercase tracking-widest text-sm font-bold">
                    {busy === 'pdf' ? 'Preparing PDF' : busy === 'pptx' ? 'Preparing PPTX' : 'Export'}
                </span>
                <ChevronDown
                    className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: -8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-72 z-50 bg-surface border border-primary/20 rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {options.map(({ format, icon: Icon, title, blurb }) => (
                            <button
                                key={format}
                                role="menuitem"
                                onClick={() => run(format)}
                                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-primary/[0.07] transition-colors border-b border-primary/10 last:border-b-0"
                            >
                                <Icon className="h-5 w-5 mt-0.5 text-primary-soft shrink-0" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-ink">
                                        {title}
                                    </span>
                                    <span className="block text-xs text-ink-muted mt-0.5">
                                        {blurb}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default ExportMenu;
