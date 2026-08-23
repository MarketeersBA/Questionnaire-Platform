import { motion, type Variants } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface WelcomeScreenProps {
    language: 'ar' | 'en';
    onStart: () => void;
}

const COPY = {
    ar: {
        greeting: 'مرحبا!',
        title: 'رأيك يهمنا',
        subtitle: 'شاركنا رأيك في دقايق بسيطة وخلّي صوتك يوصل',
        cta: 'يلا نبدأ',
    },
    en: {
        greeting: 'Hey there!',
        title: 'Your voice matters',
        subtitle: 'Share your thoughts in just a few minutes.',
        cta: "Let's Go",
    },
};

const containerVariants: Variants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.15, delayChildren: 0.1 },
    },
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

/**
 * Hand-built pen-and-paper animation (no external Lottie asset): a document
 * fades in, then a pen glides across three lines, "writing" each one via an
 * animated stroke — reads as "filling out a survey" without a third-party
 * asset dependency or licensing to track.
 */
function WritingSurveyIllustration() {
    const lineWidths = [58, 42, 50];

    return (
        <motion.svg
            width="168"
            height="140"
            viewBox="0 0 168 140"
            fill="none"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
            <rect x="24" y="10" width="120" height="120" rx="14" className="fill-white dark:fill-slate-800" stroke="currentColor" strokeOpacity="0.12" strokeWidth="2" />
            <circle cx="84" cy="34" r="6" className="fill-brand-red/70" />
            {lineWidths.map((w, i) => (
                <motion.line
                    key={i}
                    x1="44"
                    y1={58 + i * 20}
                    x2={44 + w}
                    y2={58 + i * 20}
                    stroke="currentColor"
                    strokeOpacity="0.35"
                    strokeWidth="4"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 + i * 0.35, ease: 'easeInOut' }}
                />
            ))}
            <motion.g
                initial={{ x: 34, y: 52 }}
                animate={{
                    x: [34, 44 + lineWidths[0], 34, 44 + lineWidths[1], 34, 44 + lineWidths[2]],
                    y: [52, 52, 72, 72, 92, 92],
                }}
                transition={{ duration: 2.1, delay: 0.55, ease: 'easeInOut', times: [0, 0.28, 0.35, 0.62, 0.7, 1] }}
            >
                <path
                    d="M0 12 L9 1 L12 4 L3 15 L0 16 Z"
                    className="fill-brand-blue"
                    stroke="white"
                    strokeWidth="1"
                />
            </motion.g>
        </motion.svg>
    );
}

export default function WelcomeScreen({ language, onStart }: WelcomeScreenProps) {
    const isAr = language === 'ar';
    const copy = COPY[isAr ? 'ar' : 'en'];
    const Arrow = isAr ? ArrowLeft : ArrowRight;

    return (
        <motion.div
            key="welcome"
            dir={isAr ? 'rtl' : 'ltr'}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="m-auto relative z-10 w-full max-w-lg min-h-screen md:min-h-0 bg-surface rounded-none md:rounded-[2.5rem] p-8 md:p-14 border-0 md:border border-line/80 dark:border-line/10 text-center shadow-none md:shadow-2xl transition-colors flex flex-col items-center justify-center"
        >
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex flex-col items-center gap-6">
                <motion.div variants={itemVariants}>
                    <WritingSurveyIllustration />
                </motion.div>

                <motion.p
                    variants={itemVariants}
                    className="text-sm font-black uppercase tracking-[0.3em] text-primary-soft"
                >
                    {copy.greeting}
                </motion.p>

                <motion.h1
                    variants={itemVariants}
                    className={`font-display font-black text-ink ${isAr ? 'text-4xl md:text-5xl leading-[1.3]' : 'text-3xl md:text-4xl'}`}
                >
                    {copy.title}
                </motion.h1>

                <motion.p
                    variants={itemVariants}
                    className={`text-ink-muted font-medium leading-relaxed max-w-sm ${isAr ? 'text-lg' : 'text-base'}`}
                >
                    {copy.subtitle}
                </motion.p>

                <motion.button
                    variants={itemVariants}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={onStart}
                    className="btn-premium mt-4 flex items-center gap-3 px-10 py-4 text-lg"
                >
                    <span>{copy.cta}</span>
                    <Arrow className="w-5 h-5" />
                </motion.button>
            </motion.div>
        </motion.div>
    );
}
