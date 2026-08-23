import { motion } from 'framer-motion';

export interface FollowUpRoundsSliderProps {
    /** Admin-configured ceiling for this question — the slider can never exceed it. */
    maxAllowed: number;
    value: number;
    onChange: (rounds: number) => void;
    language: 'en' | 'ar';
}

const COPY = {
    en: { label: 'How many follow-ups are you up for?' },
    ar: { label: 'كام سؤال إضافي تحب تجاوب عليه؟' },
};

/**
 * Respondent-facing control (1-3) for how many AI follow-up rounds this
 * person is willing to answer on a given text box. This is independent of
 * — and can only narrow — the admin's configured "Moderation Depth" ceiling.
 */
export default function FollowUpRoundsSlider({ maxAllowed, value, onChange, language }: FollowUpRoundsSliderProps) {
    const copy = COPY[language];
    const options = [1, 2, 3].filter((n) => n <= Math.max(1, maxAllowed));

    if (options.length <= 1) return null;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">
                {copy.label}
            </span>
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-surface-sunken/80">
                {options.map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => onChange(n)}
                        aria-pressed={value === n}
                        className="relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black transition-colors"
                    >
                        {value === n && (
                            <motion.div
                                layoutId="follow-up-rounds-pill"
                                className="absolute inset-0 rounded-full bg-primary"
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                        )}
                        <span className={`relative z-10 ${value === n ? 'text-white' : 'text-ink-muted'}`}>
                            {n}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
