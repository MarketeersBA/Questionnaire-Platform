import { useEffect, useState } from 'react';

/**
 * Track which of the given element ids is currently the "active" section
 * inside a scrollable container (defaults to the viewport).
 *
 * Uses a scroll listener rather than IntersectionObserver so it works
 * correctly with nested overflow containers and with content that mounts
 * after the hook (e.g. a loading skeleton that later becomes real sections).
 *
 * @param ids        Element ids to watch, in document order.
 * @param topOffset  Height of any sticky header (px).
 * @param rootId     Optional id of the scrollable container. Pass this when
 *                   scrolling happens inside a custom overflow-y-auto div.
 */
export function useScrollSpy(
    ids: string[],
    topOffset = 80,
    rootId?: string,
): string | null {
    const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);

    useEffect(() => {
        if (!ids.length) {
            setActiveId(null);
            return;
        }

        // Seed with the first section so something is highlighted immediately.
        setActiveId(ids[0]);

        const getRoot = (): HTMLElement | null => {
            if (rootId) return document.getElementById(rootId);
            // App shell scrolls inside #main-content, not the window.
            return document.getElementById('main-content');
        };

        const pickActive = () => {
            const root = getRoot();
            const rootTop = root ? root.getBoundingClientRect().top : 0;
            const probe = rootTop + topOffset;

            let bestId: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) continue;
                const top = el.getBoundingClientRect().top;
                // Prefer the section whose top has crossed (or nearly crossed)
                // the probe line and is closest to it.
                const dist = probe - top;
                if (dist >= -8 && dist < bestDist) {
                    bestDist = dist;
                    bestId = id;
                }
            }

            // Nothing has crossed the probe yet — stay on the first section.
            if (!bestId) {
                for (const id of ids) {
                    if (document.getElementById(id)) {
                        bestId = id;
                        break;
                    }
                }
            }

            if (bestId) setActiveId(bestId);
        };

        const root = getRoot();
        const scrollTarget: HTMLElement | Window = root ?? window;

        scrollTarget.addEventListener('scroll', pickActive, { passive: true });
        window.addEventListener('resize', pickActive);

        // Dashboard (and similar pages) may mount section nodes after a loading
        // skeleton. Re-run when the scroll container's children change.
        let observer: MutationObserver | null = null;
        if (root && typeof MutationObserver !== 'undefined') {
            observer = new MutationObserver(pickActive);
            observer.observe(root, { childList: true, subtree: true });
        }

        pickActive();
        const timers = [50, 200, 600].map((ms) => window.setTimeout(pickActive, ms));

        return () => {
            scrollTarget.removeEventListener('scroll', pickActive);
            window.removeEventListener('resize', pickActive);
            observer?.disconnect();
            timers.forEach((t) => window.clearTimeout(t));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ids.join('|'), topOffset, rootId]);

    return activeId;
}
