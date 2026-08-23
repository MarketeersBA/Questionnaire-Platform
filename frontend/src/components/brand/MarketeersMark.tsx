/**
 * The Marketeers "M" mark, drawn as inline SVG.
 *
 * Vector rather than the PNG in /brand so it stays crisp at favicon sizes,
 * inherits crisp edges on any background, and can recolour itself for the
 * navy rail (where the blue strokes must lift to white) without shipping a
 * second asset.
 *
 * The mark is a blue M whose central vertex is filled by the red triangle —
 * the two logo colours, nothing else.
 */
export function MarketeersMark({
    className = '',
    /** Render the M in white, for use on the navy rail. */
    onDark = true,
    title = 'Marketeers',
}: {
    className?: string;
    onDark?: boolean;
    title?: string;
}) {
    const stroke = onDark ? '#FFFFFF' : 'rgb(var(--c-primary))';

    return (
        <svg
            viewBox="0 0 48 40"
            className={className}
            role="img"
            aria-label={title}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Outer M strokes */}
            <path
                d="M4 36V6l14 16"
                stroke={stroke}
                strokeWidth={6.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M44 36V6L30 22"
                stroke={stroke}
                strokeWidth={6.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Central triangle — the red accent of the mark */}
            <path d="M17 13h14l-7 13z" fill="rgb(var(--c-accent))" />
        </svg>
    );
}
