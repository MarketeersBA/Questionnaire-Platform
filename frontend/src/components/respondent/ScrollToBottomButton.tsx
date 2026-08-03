import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScrollToBottomButtonProps {
    language?: 'en' | 'ar';
    /** Extra bottom offset when a sticky nav bar is present (px). */
    bottomOffsetPx?: number;
}

/**
 * Fixed corner control that smooth-scrolls to the page end.
 * Hides when the viewport is already near the bottom or the page isn't tall enough.
 */
export default function ScrollToBottomButton({
    language = 'en',
    bottomOffsetPx = 12,
}: ScrollToBottomButtonProps) {
    const [visible, setVisible] = useState(false);
    const isArabic = language === 'ar';

    useEffect(() => {
        const updateVisibility = () => {
            const viewportBottom = window.scrollY + window.innerHeight;
            const docHeight = document.documentElement.scrollHeight;
            const canScroll = docHeight > window.innerHeight + 160;
            const nearBottom = viewportBottom >= docHeight - 100;
            setVisible(canScroll && !nearBottom);
        };

        updateVisibility();
        window.addEventListener('scroll', updateVisibility, { passive: true });
        window.addEventListener('resize', updateVisibility);

        const observer = new ResizeObserver(updateVisibility);
        observer.observe(document.documentElement);

        return () => {
            window.removeEventListener('scroll', updateVisibility);
            window.removeEventListener('resize', updateVisibility);
            observer.disconnect();
        };
    }, []);

    const scrollToEnd = () => {
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth',
        });
    };

    return (
        <AnimatePresence>
            {visible && (
                <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 12, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    onClick={scrollToEnd}
                    style={{ bottom: bottomOffsetPx }}
                    className="fixed z-[60] end-2 md:end-3 w-11 h-11 rounded-xl bg-brand-blue text-white shadow-lg shadow-brand-blue/30 border border-white/20 flex items-center justify-center hover:bg-brand-blue/90 active:scale-95 transition-colors"
                    aria-label={isArabic ? 'الانتقال إلى نهاية الصفحة' : 'Scroll to end of page'}
                    title={isArabic ? 'إلى النهاية' : 'Go to end'}
                >
                    <ChevronDown className="w-5 h-5 animate-bounce" strokeWidth={2.5} />
                </motion.button>
            )}
        </AnimatePresence>
    );
}
