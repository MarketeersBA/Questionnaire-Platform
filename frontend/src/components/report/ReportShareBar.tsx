import { useEffect, useState } from 'react';
import { Link2, Check, Copy, Users, CalendarClock, Loader2, Settings2 } from 'lucide-react';
import ShareLinkModal from './ShareLinkModal';
import { toast } from 'sonner';
import { analytics, shareLinkUrl, type ReportShareLink } from '../../services/api';

interface ReportShareBarProps {
    surveyId: string;
}

/**
 * Copy the client link, from inside the report.
 *
 * The link also lives in the reports table, but the analyst is usually looking
 * at the report when they decide to send it — making them navigate away to
 * fetch a URL for the thing already on screen is the kind of small friction
 * that ends with links being pasted from memory.
 *
 * Shows the active link's seat usage alongside it, because "how many people can
 * still open this" is the thing you want to know at the moment you share it.
 */
export function ReportShareBar({ surveyId }: ReportShareBarProps) {
    const [share, setShare] = useState<ReportShareLink | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    useEffect(() => {
        if (settingsOpen) return; // refetch once it closes, not while it is open
        let cancelled = false;

        (async () => {
            try {
                // Idempotent: the report has one link, created on first ask.
                const link = await analytics.getShareLink(surveyId);
                if (!cancelled) setShare(link);
            } catch {
                if (!cancelled) setShare(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [surveyId, settingsOpen]);

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            // Clipboard API needs a secure context; on plain HTTP (a LAN demo,
            // a staging box without TLS) it throws and this is the only way to
            // still put the link on the clipboard.
            const field = document.createElement('textarea');
            field.value = value;
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            document.execCommand('copy');
            field.remove();
        }
        setCopied(true);
        toast.success('Report link copied');
        window.setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading share link…
            </div>
        );
    }

    if (!share) return null;

    const seats =
        share.max_viewers == null
            ? 'Unlimited viewers'
            : `${share.seats_used} of ${share.max_viewers} viewers used`;
    const expiry = share.expires_at
        ? `Expires ${new Date(share.expires_at).toLocaleDateString()}`
        : 'No expiry';
    const isFull = share.seats_remaining === 0;

    return (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-2xl border border-primary/20 bg-surface/70">
            <Link2 className="h-4 w-4 text-primary-soft shrink-0" />

            <code
                className="text-xs text-ink-muted font-mono truncate max-w-[18rem]"
                title={shareLinkUrl(share)}
            >
                {shareLinkUrl(share)}
            </code>

            <button
                onClick={() => copy(shareLinkUrl(share))}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-xs font-semibold text-primary-soft"
            >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
            </button>

            <span className="h-4 w-px bg-primary/20" aria-hidden />

            <span
                className={`flex items-center gap-1.5 text-xs ${
                    isFull ? 'text-amber-500 font-semibold' : 'text-ink-muted'
                }`}
                title={
                    isFull
                        ? 'Nobody new can open this link. Raise the limit or issue another one.'
                        : undefined
                }
            >
                <Users className="h-3.5 w-3.5" />
                {seats}
            </span>

            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                <CalendarClock className="h-3.5 w-3.5" />
                {expiry}
            </span>

            <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/20 hover:border-primary/50 hover:bg-primary/[0.06] transition-colors text-xs font-semibold text-ink-muted hover:text-primary-soft"
                title="Change who can open this report and when the link expires"
            >
                <Settings2 className="h-3.5 w-3.5" />
                Settings
            </button>

            {settingsOpen && (
                <ShareLinkModal
                    surveyId={surveyId}
                    isOpen
                    onClose={() => setSettingsOpen(false)}
                />
            )}
        </div>
    );
}

export default ReportShareBar;
