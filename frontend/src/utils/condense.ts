/**
 * Shorten verbose AI narrative down to a scannable clause.
 *
 * Reports generated before the prompt's brevity contract contain multi-sentence
 * paragraphs with inline "1. … 2. …" enumerations and Markdown markup. The UI
 * needs one short statement per point, so this trims to the first meaningful
 * sentence and caps the word count — without ever rewriting the words
 * themselves, so nothing is fabricated.
 */

/** Remove Markdown markup and collapse whitespace. */
function stripMarkup(text: string): string {
    return String(text || '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/[*_`#>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Split a blob into its individual points.
 *
 * Handles both inline enumerations ("1. A 2. B") and plain multi-sentence
 * prose, so a single finding can yield several bullets.
 */
export function splitPoints(text: string): string[] {
    const clean = stripMarkup(text);
    if (!clean) return [];

    const markers = clean.match(/(?:^|\s)\d+\.\s+/g);
    if (markers && markers.length >= 2) {
        return clean
            .split(/(?:^|\s)(?=\d+\.\s+)/)
            .map((p) => p.replace(/^\s*\d+\.\s*/, '').trim())
            .filter(Boolean);
    }

    // Sentence split that tolerates decimals ("4.45") and abbreviations.
    return clean
        .split(/(?<![\d])\.(?:\s+|$)/)
        .map((p) => p.trim())
        .filter((p) => p.length > 12);
}

/**
 * Trim to at most `maxWords`, cutting on a word boundary and marking elision.
 */
export function condense(text: string, maxWords = 22): string {
    const clean = stripMarkup(text);
    if (!clean) return '';

    const words = clean.split(' ');
    if (words.length <= maxWords) {
        return clean.replace(/[.;,]$/, '');
    }
    return `${words.slice(0, maxWords).join(' ').replace(/[.;,]$/, '')}…`;
}

/**
 * A headline label plus its condensed supporting clause.
 * Used for the "what we found" / "what to do" cards.
 */
export interface CondensedPoint {
    label: string;
    detail: string;
}

/**
 * Turn one verbose finding into a labelled, condensed point.
 *
 * When the body itself starts with a "Label: detail" pattern (which the AI
 * emits often), that label is preferred over the generic finding title.
 */
export function condensePoint(label: string, body: string, maxWords = 20): CondensedPoint {
    const points = splitPoints(body);
    const first = points[0] || stripMarkup(body);

    const inline = first.match(/^([^:]{3,48}):\s*(.+)$/);
    if (inline) {
        return { label: inline[1].trim(), detail: condense(inline[2], maxWords) };
    }
    return { label: stripMarkup(label), detail: condense(first, maxWords) };
}

/** Expand a verbose blob into several condensed points, capped at `limit`. */
export function condenseAll(
    label: string,
    body: string,
    limit = 3,
    maxWords = 18,
): CondensedPoint[] {
    const points = splitPoints(body);
    if (points.length <= 1) {
        const single = condensePoint(label, body, maxWords);
        return single.detail ? [single] : [];
    }

    return points.slice(0, limit).map((p) => {
        const inline = p.match(/^([^:]{3,48}):\s*(.+)$/);
        return inline
            ? { label: inline[1].trim(), detail: condense(inline[2], maxWords) }
            : { label: '', detail: condense(p, maxWords) };
    });
}
