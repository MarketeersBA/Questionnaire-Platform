import { useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
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

/** Public path of the welcome animation. */
const WELCOME_VIDEO_SRC = '/assets/video/survey-welcome.mp4';

/**
 * First frame of that animation, 480x480 to match its square container.
 *
 * Shown before the video has buffered, and — the reason it exists — as the
 * still image a respondent sees when their OS asks for reduced motion. Without
 * a poster, a non-autoplaying `<video>` renders however the browser decides,
 * which in practice is an empty box.
 */
const WELCOME_VIDEO_POSTER = '/assets/video/survey-welcome-poster.png';

/**
 * Looping welcome animation.
 *
 * `muted` is required twice over: the source carries an audio track that must
 * not play, and browsers refuse to autoplay anything unmuted. `playsInline`
 * keeps iOS from hijacking it into a fullscreen player.
 *
 * Respondents who asked their OS to reduce motion get a still frame instead of
 * a loop, and if the file ever fails to load the block removes itself rather
 * than leaving a broken placeholder above the greeting.
 */
function WelcomeAnimation() {
    const prefersReducedMotion = useReducedMotion();
    const [failed, setFailed] = useState(false);

    if (failed) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="w-44 h-44 md:w-52 md:h-52 rounded-[2rem] overflow-hidden bg-surface-sunken"
        >
            <video
                src={WELCOME_VIDEO_SRC}
                poster={WELCOME_VIDEO_POSTER}
                autoPlay={!prefersReducedMotion}
                loop={!prefersReducedMotion}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                onError={() => setFailed(true)}
                className="w-full h-full object-cover"
            />
        </motion.div>
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
                    <WelcomeAnimation />
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
