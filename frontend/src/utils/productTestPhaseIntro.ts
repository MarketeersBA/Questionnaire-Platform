import type { ProductTestTimingPhase } from '../types/productTestRespondent';
import { applyProductTestPlaceholders } from './productTestPlaceholderEngine';

export interface ProductTestPhaseIntroCopy {
    title: string;
    body: string;
    hint: string;
}

const PHASE_INTRO: Record<ProductTestTimingPhase, { en: ProductTestPhaseIntroCopy; ar: ProductTestPhaseIntroCopy }> = {
    before_use: {
        en: {
            title: 'Before Use',
            body: 'Evaluate the product before your first use. Focus on appearance, packaging condition, and first impressions.',
            hint: 'Take a moment to inspect the product as you would when opening it at home.',
        },
        ar: {
            title: 'قبل الاستخدام',
            body: 'قيّم المنتج قبل الاستخدام الأول. ركّز على المظهر وحالة العبوة والانطباع الأول.',
            hint: 'تفحّص المنتج كما تفعل عند فتحه في المنزل.',
        },
    },
    during_use: {
        en: {
            title: 'During Use',
            body: 'Use the product as you normally would, then rate preparation, ease of use, and in-use performance.',
            hint: 'Follow your usual routine — we want authentic usage feedback.',
        },
        ar: {
            title: 'أثناء الاستخدام',
            body: 'استخدم المنتج كما تفعل عادةً، ثم قيّم التحضير وسهولة الاستخدام والأداء أثناء الاستخدام.',
            hint: 'اتبع روتينك المعتاد — نريد feedback حقيقي من الاستخدام.',
        },
    },
    after_use: {
        en: {
            title: 'After Use',
            body: 'Share how the product performed after use — results, sensory experience, and overall satisfaction.',
            hint: 'Include any notes on how your skin/hair/surface felt after application.',
        },
        ar: {
            title: 'بعد الاستخدام',
            body: 'شاركنا أداء المنتج بعد الاستخدام — النتائج والتجربة الحسية والرضا العام.',
            hint: 'أضف أي ملاحظات عن شعورك بعد الاستخدام.',
        },
    },
    packaging: {
        en: {
            title: 'Packaging & Presentation',
            body: 'Evaluate the pack design, clarity of information, and overall presentation of the product.',
            hint: 'Consider shelf appeal, readability of labels, and ease of opening.',
        },
        ar: {
            title: 'التعبئة والتغليف',
            body: 'قيّم تصميم العبوة ووضوح المعلومات والعرض العام للمنتج.',
            hint: 'فكّر في جاذبية العرض وسهولة القراءة وفتح العبوة.',
        },
    },
};

export interface ProductTestPhaseIntroOptions {
    /** Respondent-facing brand label (name or blind sample code). */
    brandDisplay?: string;
    category?: string;
    language?: 'en' | 'ar';
}

export function getProductTestPhaseIntro(
    timing: ProductTestTimingPhase,
    language: 'en' | 'ar',
    options: ProductTestPhaseIntroOptions = {},
): ProductTestPhaseIntroCopy {
    const base = { ...PHASE_INTRO[timing][language] };
    const brandDisplay = options.brandDisplay?.trim();

    if (!brandDisplay) {
        return base;
    }

    const placeholderCtx = {
        brand: brandDisplay,
        category: options.category,
        language,
    };

    return {
        title: base.title,
        body: applyProductTestPlaceholders(base.body, placeholderCtx),
        hint: applyProductTestPlaceholders(base.hint, placeholderCtx),
    };
}

/** Flat section index across all phases for progress calculation. */
export function computeProductTestProgress(
    phaseCount: number,
    sectionsPerPhase: number[],
    phaseIndex: number,
    sectionIndex: number,
    wizardMode: 'intro' | 'section',
): number {
    let total = 0;
    let completed = 0;

    sectionsPerPhase.forEach((count, pi) => {
        total += count;
        if (pi < phaseIndex) {
            completed += count;
        } else if (pi === phaseIndex) {
            if (wizardMode === 'section') {
                completed += sectionIndex;
            }
        }
    });

    if (total === 0) return 0;
    return Math.min(100, Math.round((completed / total) * 100));
}

export function countTotalSections(sectionsPerPhase: number[]): number {
    return sectionsPerPhase.reduce((sum, n) => sum + n, 0);
}
