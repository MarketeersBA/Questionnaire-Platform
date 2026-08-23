import React from 'react';

/**
 * Render the light Markdown the AI layer sometimes emits inside plain-string
 * fields.
 *
 * The god prompt now forbids Markdown in JSON string values, but every report
 * already generated still contains `**bold**` runs and inline "1. … 2. …"
 * enumerations, which previously rendered as literal characters in the UI.
 * This keeps those historical reports readable without re-running generation.
 */

/** Split a string into bold / plain runs on `**…**`. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const pattern = /\*\*(.+?)\*\*/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > cursor) {
            nodes.push(text.slice(cursor, match.index));
        }
        nodes.push(
            <strong key={`${keyPrefix}-b${i++}`} className="font-black text-ink">
                {match[1]}
            </strong>,
        );
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes.length ? nodes : [text];
}

/**
 * Split a blob on inline enumerations so "1. A 2. B 3. C" becomes real list
 * items instead of one unreadable paragraph.
 */
export function splitEnumerated(text: string): string[] {
    const trimmed = String(text || '').trim();
    if (!trimmed) return [];

    // Only treat it as a list when there are at least two markers; a lone "1."
    // is usually part of a sentence.
    const markers = trimmed.match(/(?:^|\s)\d+\.\s+/g);
    if (!markers || markers.length < 2) return [trimmed];

    return trimmed
        .split(/(?:^|\s)(?=\d+\.\s+)/)
        .map((part) => part.replace(/^\s*\d+\.\s*/, '').trim())
        .filter(Boolean);
}

/** Strip Markdown markup entirely — for tooltips, exports and PPTX text. */
export function toPlainText(text: string): string {
    return String(text || '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/[*_`#]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Render an AI string as readable rich text: bold runs honoured, inline
 * enumerations promoted to a list.
 */
export function RichText({
    text,
    className = '',
}: {
    text?: string | null;
    className?: string;
}) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const items = splitEnumerated(raw);

    if (items.length === 1) {
        return <p className={className}>{renderInline(items[0], 'p')}</p>;
    }

    return (
        <ul className={`space-y-2 ${className}`}>
            {items.map((item, i) => (
                <li key={i} className="flex gap-2.5">
                    <span className="mt-[0.55em] w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                    <span>{renderInline(item, `l${i}`)}</span>
                </li>
            ))}
        </ul>
    );
}
