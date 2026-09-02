import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Link2, Users, CalendarClock, Copy, Check, Loader2, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { analytics, shareLinkUrl, type ReportShareLink } from '../../services/api';

interface ShareLinkModalProps {
    surveyId: string;
    surveyName?: string;
    isOpen: boolean;
    onClose: () => void;
}

const EXPIRY_PRESETS = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
    { label: 'Never', days: null },
];

function isoFromDays(days: number | null): string | null {
    if (days === null) return null;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

async function copyToClipboard(value: string) {
    try {
        await navigator.clipboard.writeText(value);
    } catch {
        // The Clipboard API needs a secure context. On a plain-HTTP staging box
        // it throws, and this fallback is the only way the link still copies.
        const field = document.createElement('textarea');
        field.value = value;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        field.remove();
    }
}

/**
 * The report's share link, and the two restrictions on it.
 *
 * One link per report, exactly like the survey master link — the same URL is
 * given to everyone, and what is controlled is how many people may open it and
 * until when. An earlier version allowed several links per report so different
 * recipients could carry different limits; that made "the link for this report"
 * ambiguous and left the dialog asking people to create something that already
 * existed, so it is gone.
 *
 * Restrictions apply to the link, not to individuals: with a limit of one, the
 * first person to open it consumes the only seat and everyone after is told the
 * link is full.
 *
 * Edits save immediately. Each field is a single independent value, and a limit
 * that silently failed to stick is worse than one that changes as you set it.
 */
export function ShareLinkModal({ surveyId, surveyName, isOpen, onClose }: ShareLinkModalProps) {
    const [share, setShare] = useState<ReportShareLink | null>(null);
    const [loading, setLoading] = useState(true);
    const [resetting, setResetting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                // Idempotent: creates the link on first open, returns it after.
                const link = await analytics.getShareLink(surveyId);
                if (!cancelled) setShare(link);
            } catch (err: any) {
                if (cancelled) return;
                const status = err?.response?.status;
                const detail = err?.response?.data?.detail;
                // 409 carries the specific reason the report cannot be shared —
                // not generated, still running, or empty. Passing it through is
                // the difference between a fixable problem and a dead end.
                setError(
                    typeof detail?.message === 'string'
                        ? detail.message
                        : status === 404
                          ? 'This survey no longer exists, so it cannot be shared.'
                          : status === 403
                            ? 'You do not have permission to share this report.'
                            : 'Could not load the share link.'
                );
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isOpen, surveyId]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    const patch = async (payload: {
        max_viewers?: number | null;
        expires_at?: string | null;
        unlimited_expiry?: boolean;
    }) => {
        try {
            setShare(await analytics.updateShareLink(surveyId, payload));
        } catch {
            toast.error('Could not save that change');
        }
    };

    const reset = async () => {
        setResetting(true);
        try {
            const fresh = await analytics.resetShareLink(surveyId);
            setShare(fresh);
            await copyToClipboard(shareLinkUrl(fresh));
            toast.success('New link created and copied — the old one no longer opens');
        } catch {
            toast.error('Could not reset the link');
        } finally {
            setResetting(false);
        }
    };

    const copy = async () => {
        if (!share) return;
        await copyToClipboard(shareLinkUrl(share));
        setCopied(true);
        toast.success('Report link copied');
        window.setTimeout(() => setCopied(false), 2000);
    };

    const activePreset = (): number | null | undefined => {
        if (!share) return undefined;
        if (!share.expires_at) return null;
        const days = Math.round(
            (new Date(share.expires_at).getTime() - Date.now()) / 86_400_000
        );
        return EXPIRY_PRESETS.find((p) => p.days !== null && Math.abs(p.days - days) <= 1)?.days;
    };

    if (!isOpen) return null;

    const isFull = share?.seats_remaining === 0;

    /*
     * Rendered into document.body rather than in place.
     *
     * This dialog is opened from a control inside the report's sticky header,
     * and that header carries both a transform and a backdrop-blur. Either one
     * makes it the containing block for `position: fixed` descendants, so the
     * overlay was being measured against the header instead of the viewport —
     * which is why it sat clipped and half off-screen. A portal lifts it out of
     * every ancestor transform, filter and z-index in one move.
     */
    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-surface rounded-3xl border border-primary/20 shadow-2xl"
                >
                    <div className="sticky top-0 z-10 bg-surface flex items-start justify-between p-5 border-b border-primary/10">
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-ink flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-primary-soft" />
                                Report link
                            </h2>
                            {surveyName && (
                                <p className="text-xs text-ink-muted mt-0.5 truncate">{surveyName}</p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-primary/10 text-ink-muted transition-colors shrink-0"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-ink-muted p-8">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading link…
                        </div>
                    ) : error || !share ? (
                        <div className="p-8 text-center">
                            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
                            <p className="text-sm text-ink-muted">
                                {error ?? 'Could not load the share link.'}
                            </p>
                        </div>
                    ) : (
                        <div className="p-5 space-y-5">
                            {/* ── The link ─────────────────────────────── */}
                            <div className="flex items-center gap-2 p-2 pl-3 rounded-2xl bg-surface-sunken border border-primary/20">
                                <code
                                    className="flex-1 text-xs text-ink font-mono truncate"
                                    title={shareLinkUrl(share)}
                                >
                                    {shareLinkUrl(share)}
                                </code>
                                <button
                                    onClick={copy}
                                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
                                >
                                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            {isFull && (
                                <p className="flex items-start gap-1.5 text-[11px] text-amber-500 -mt-2">
                                    <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                                    All seats are used. Anyone new opening this link is turned away —
                                    raise the limit below to let more people in.
                                </p>
                            )}

                            {/* ── Restrictions ─────────────────────────── */}
                            <div className="grid sm:grid-cols-2 gap-5">
                                <div>
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-muted mb-2">
                                        <Users className="h-3.5 w-3.5" /> People who can open it
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            min={1}
                                            max={10000}
                                            value={share.max_viewers ?? ''}
                                            placeholder="∞"
                                            onChange={(e) => {
                                                const n = Number(e.target.value);
                                                void patch({
                                                    max_viewers: Number.isFinite(n) && n > 0 ? n : 0,
                                                });
                                            }}
                                            className="w-20 px-3 py-2 rounded-xl bg-surface-sunken border border-primary/20 text-sm text-ink focus:outline-none focus:border-primary/50"
                                        />
                                        <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={share.max_viewers == null}
                                                onChange={(e) =>
                                                    void patch({ max_viewers: e.target.checked ? 0 : 5 })
                                                }
                                            />
                                            No limit
                                        </label>
                                    </div>
                                    <p className="text-[11px] text-ink-muted mt-2 leading-relaxed">
                                        {share.max_viewers == null
                                            ? `${share.seats_used} ${share.seats_used === 1 ? 'person has' : 'people have'} opened it.`
                                            : `${share.seats_used} of ${share.max_viewers} used. Counts people, not visits — returning readers do not use another seat.`}
                                    </p>
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-muted mb-2">
                                        <CalendarClock className="h-3.5 w-3.5" /> Expires
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {EXPIRY_PRESETS.map((preset) => (
                                            <button
                                                key={preset.label}
                                                onClick={() =>
                                                    void patch({
                                                        expires_at: isoFromDays(preset.days),
                                                        unlimited_expiry: preset.days === null,
                                                    })
                                                }
                                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                                                    activePreset() === preset.days
                                                        ? 'bg-primary text-white border-primary'
                                                        : 'bg-surface-sunken text-ink-muted border-primary/20 hover:border-primary/40'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-ink-muted mt-2">
                                        {share.expires_at
                                            ? `Stops working ${new Date(share.expires_at).toLocaleDateString()}.`
                                            : 'Works until you reset it.'}
                                    </p>
                                </div>
                            </div>

                            {/* ── Reset ────────────────────────────────── */}
                            <div className="flex items-center justify-between gap-4 pt-4 border-t border-primary/10">
                                <p className="text-[11px] text-ink-muted leading-relaxed">
                                    Sent it to the wrong person, or want the used seats back? Reset
                                    swaps in a new URL and stops the old one — the limits carry over.
                                </p>
                                <button
                                    onClick={reset}
                                    disabled={resetting}
                                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/40 text-amber-500 text-[11px] font-bold hover:bg-amber-500/10 transition-colors disabled:opacity-60"
                                >
                                    {resetting ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <RotateCcw className="h-3.5 w-3.5" />
                                    )}
                                    Reset link
                                </button>
                            </div>

                            <p className="text-[11px] text-ink-muted leading-relaxed">
                                Anyone holding the link can open the report — the limit caps how many
                                people ever do. Readers are recognised by their browser, so clearing
                                site data frees a seat. It is a sharing control, not a lock.
                            </p>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}

export default ShareLinkModal;
