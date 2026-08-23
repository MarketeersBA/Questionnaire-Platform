import { useEffect, useState } from 'react';

/**
 * Track which of the given element ids is currently the "active" section.
 *
 * Uses IntersectionObserver and picks the entry closest to the top of the
 * viewport among those currently intersecting, which behaves correctly when
 * several short sections are on screen at once — a plain "first intersecting"
 * rule flickers in that case.
 *
 * @param ids       Element ids to watch, in document order.
 * @param topOffset Height of any sticky header, so a section counts as active
 *                  once it clears the chrome rather than the viewport edge.
 */
export function useScrollSpy(ids: string[], topOffset = 120): string | null {
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        if (!ids.length || typeof IntersectionObserver === 'undefined') return;

        const visible = new Map<string, number>();

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        visible.set(entry.target.id, entry.boundingClientRect.top);
                    } else {
                        visible.delete(entry.target.id);
                    }
                });

                if (!visible.size) return;
                // Closest to the top edge of the content area wins.
                const best = Array.from(visible.entries()).sort(
                    (a, b) => Math.abs(a[1] - topOffset) - Math.abs(b[1] - topOffset),
                )[0];
                if (best) setActiveId(best[0]);
            },
            {
                rootMargin: `-${topOffset}px 0px -55% 0px`,
                threshold: [0, 0.15, 0.5],
            },
        );

        const nodes = ids
            .map((id) => document.getElementById(id))
            .filter((n): n is HTMLElement => Boolean(n));

        nodes.forEach((n) => observer.observe(n));
        return () => observer.disconnect();
    }, [ids.join('|'), topOffset]);

    return activeId;
}
