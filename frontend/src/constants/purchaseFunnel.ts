export type BrandPipelineMode = 'exclude_prior' | 'include_prior';
export type IncludeStrategy = 'cascade' | 'union' | 'intersection';

export interface BrandPipeline {
    mode: BrandPipelineMode;
    sources: string[];
    /** Used with include_prior. Cascade keeps only the immediate prior stage. */
    strategy?: IncludeStrategy;
}

export interface PurchaseFunnelQuestion {
    id: string;
    section: 'Awareness' | 'Purchase Behaviour';
    type: 'open_single' | 'open_loop' | 'mcq' | 'scq';
    ar_text: string;
    en_text: string;
    hasOther?: boolean;
    hasStop?: boolean;
    brandPipeline?: BrandPipeline;
    /** @deprecated Use brandPipeline */
    ancSource?: string[];
    /** @deprecated Use brandPipeline */
    ancExclude?: string[];
    /** @deprecated Use brandPipeline */
    ancFilter?: string[];
}

/**
 * @deprecated Runtime source is `question_modules.purchase_funnel` (pf_q1–pf_q7).
 * Retained for seed fallback via purchaseFunnelModuleUtils.buildFallbackPurchaseFunnelModule().
 */
export const PURCHASE_FUNNEL_QUESTIONS: PurchaseFunnelQuestion[] = [
    {
        id: 'aw_q1',
        section: 'Awareness',
        type: 'open_single',
        ar_text: 'إيه هى أول ماركة [Category] اللى تخطر على بالك؟',
        en_text: 'What is the first [Category] brand that comes to your mind?',
    },
    {
        id: 'aw_q2',
        section: 'Awareness',
        type: 'open_loop',
        ar_text: 'ايه هى الماركات التانية اللى حضرتك تعرفها في [Category]؟',
        en_text: 'What other [Category] brands do you know?',
        hasStop: true, // "I don't know any more brands"
        brandPipeline: { mode: 'exclude_prior', sources: ['aw_q1'] },
    },
    {
        id: 'aw_q3',
        section: 'Awareness',
        type: 'mcq',
        ar_text: 'طيب ايه من الماركات دي تعرفها؟',
        en_text: 'Which of these brands are you familiar with?',
        brandPipeline: { mode: 'exclude_prior', sources: ['aw_q1', 'aw_q2'] },
    },
    {
        id: 'pb_q1',
        section: 'Purchase Behaviour',
        type: 'mcq',
        ar_text: 'ايه هى الماركات اللى ممكن تاخدها في اعتبارك وانت بتختار تشتري [Product]؟',
        en_text: 'Which brands would you consider when choosing to buy [product]?',
        hasOther: true
    },
    {
        id: 'pb_q2',
        section: 'Purchase Behaviour',
        type: 'mcq',
        ar_text: 'أيه من الماركات دي استخدمتها خلال السنة اللى فاتت / ال 12 شهر اللي فاتوا؟',
        en_text: 'Which of these brands have you used in the past year / last 12 months?',
        hasOther: true,
        brandPipeline: { mode: 'include_prior', sources: ['pb_q1'], strategy: 'cascade' },
    },
    {
        id: 'pb_q3',
        section: 'Purchase Behaviour',
        type: 'mcq',
        ar_text: 'طيب، ايه هى الماركات اللى حضرتك استخدمتها خلال ال3 أشهر اللى فاتوا؟',
        en_text: 'Which brands have you used in the past three months?',
        hasOther: true,
        brandPipeline: { mode: 'include_prior', sources: ['pb_q2'], strategy: 'cascade' },
    },
    {
        id: 'pb_q4',
        section: 'Purchase Behaviour',
        type: 'scq',
        ar_text: 'ايه هى اكثر ماركة [Category] حضرتك بتستخدمها في الأغلب؟',
        en_text: 'Which brand do you use most regularly?',
        brandPipeline: { mode: 'include_prior', sources: ['pb_q3'], strategy: 'cascade' },
    }
];

export const getFormattedQuestion = (question: PurchaseFunnelQuestion, category: string, lang: 'en' | 'ar') => {
    const text = lang === 'ar' ? question.ar_text : question.en_text;
    return text.replace(/\[Category\]/gi, category).replace(/\[Product\]/gi, category);
};
