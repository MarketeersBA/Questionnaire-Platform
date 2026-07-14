import type { ModuleSection } from '../../types/questionModules';

/** Minimal brand_usage slice for isolated renderer / runner demos. */
export const MOCK_BRAND_USAGE_SECTIONS: ModuleSection[] = [
    {
        section_id: 'usage',
        title_en: 'Usage',
        title_ar: 'الاستخدام',
        order: 1,
        questions: [
            {
                question_id: 'us_q1',
                label: 'Last Time Used',
                type: 'scq',
                ar_text: 'أمتى استخدمت (المنتج) أخر مرة؟',
                en_text: 'When was the last time you used [product]?',
                order: 1,
                required: true,
                options: [
                    { value: 'today', ar_label: 'النهاردة', en_label: 'Today', order: 0 },
                    { value: 'last_week', ar_label: 'الأسبوع اللي فات', en_label: 'Last week', order: 1 },
                ],
            },
            {
                question_id: 'us_q3',
                label: 'Usage Timing',
                type: 'mcq',
                ar_text: 'ي العادي بتستخدم (المنتج) في أني وقت من اليوم؟',
                en_text: 'Typically, at what time of the day do you use [product]?',
                order: 2,
                required: true,
                options: [
                    { value: 'morning', ar_label: 'الصبح', en_label: 'Morning', order: 0 },
                    { value: 'as_needed', ar_label: 'حسب الحاجة (حدد)', en_label: 'As needed (Specify)', allows_specify: true, order: 1 },
                ],
            },
        ],
    },
];

/** Purchase funnel slice with brand pipeline (pf_q4 consideration). */
export const MOCK_PURCHASE_FUNNEL_SECTIONS: ModuleSection[] = [
    {
        section_id: 'purchase_behaviour',
        title_en: 'Purchase Behaviour',
        title_ar: 'سلوك الشراء',
        order: 2,
        questions: [
            {
                question_id: 'pf_q4',
                label: 'Consideration',
                type: 'mcq',
                ar_text: 'ايه هى الماركات اللى ممكن تاخدها في اعتبارك؟',
                en_text: 'Which brands would you consider when choosing to buy [product]?',
                order: 4,
                required: true,
                analytical_role: 'consideration',
                has_other: true,
            },
        ],
    },
];
