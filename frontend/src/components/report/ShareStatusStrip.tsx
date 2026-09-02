import { Users, CalendarClock, Link2, ChevronRight, Loader2 } from 'lucide-react';
import type { ReportShareLink } from '../../services/api';

interface ShareStatusStripProps {
    share: ReportShareLink | null | undefined;
    loading?: boolean;
    onManage: () => void;
}

/**
 * At-a-glance sharing state for a report card.
 *
 * The viewer limit and expiry used to live only inside a dialog behind an
 * unlabelled icon, which meant the two settings that decide who can read a
 * client's data were invisible until you went looking. They belong on the card:
 * an analyst scanning the list should be able to see that a report is shared
 * with a 5-person cap that lapses next month without opening anything.
 *
 * Clicking through opens the editor. This strip stays read-only on purpose —
 * changing a live link's limit is a decision, not something to nudge by
 * mis-clicking a stepper in a grid.
 */
export function ShareStatusStrip({ share, loading, onManage }: ShareStatusStripProps) {
    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-2xl bg-surface-raised/50 border border-line/80 dark:border-line/10 text-[11px] text-ink-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking share links…
            </div>
        );
    }

    const live =
        share && ['active', 'unopened', 'full'].includes(share.status) ? share : null;

    if (!live) {
        return (
            <button
                onClick={onManage}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 mb-4 rounded-2xl bg-surface-raised/50 border border-dashed border-line/80 dark:border-line/10 hover:border-primary/40 hover:bg-primary/[0.04] transition-all group"
            >
                <span className="flex items-center gap-2 text-[11px] font-bold text-ink-muted group-hover:text-primary-soft">
                    <Link2 className="w-3.5 h-3.5" />
                    Set viewers &amp; expiry
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-ink-subtle group-hover:text-primary-soft group-hover:translate-x-0.5 transition-all" />
            </button>
        );
    }

    const anyFull = live.status === 'full';

    return (
        <button
            onClick={onManage}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 mb-4 rounded-2xl border transition-all group ${
                anyFull
                    ? 'bg-amber-500/[0.07] border-amber-500/30 hover:border-amber-500/50'
                    : 'bg-surface-raised/50 border-line/80 dark:border-line/10 hover:border-primary/40 hover:bg-primary/[0.04]'
            }`}
        >
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
                <span
                    className={`flex items-center gap-1.5 text-[11px] font-bold ${
                        anyFull ? 'text-amber-500' : 'text-ink-muted'
                    }`}
                >
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    {live.max_viewers == null
                        ? `${live.seats_used} viewers · no limit`
                        : `${live.seats_used} of ${live.max_viewers} viewers`}
                </span>

                <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-muted">
                    <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                    {live.expires_at
                        ? `Expires ${new Date(live.expires_at).toLocaleDateString()}`
                        : 'No expiry'}
                </span>
            </span>

            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-subtle group-hover:text-primary-soft group-hover:translate-x-0.5 transition-all" />
        </button>
    );
}

export default ShareStatusStrip;
