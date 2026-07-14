import { BrandAnalyzerConfig } from '../pages/CreateSurvey/types';
import { brandAttributes } from '../services/api';

export async function generateBrandAnalyzerSchema(
    config: BrandAnalyzerConfig,
    baseConfig: { language: 'en' | 'ar'; category: string },
    pfActive: boolean
) {
    const isAr = baseConfig.language === 'ar';
    const sections: any[] = [];

    // 1. Aided Awareness
    if (!(config.sync_with_purchase_funnel && pfActive)) {
        const brandOptions = (config.brand_list || []).map(b => b.name).filter(Boolean);
        if (brandOptions.length > 0) {
            sections.push({
                title: isAr ? "الوعي بالعلامة التجارية" : "Brand Awareness",
                module: "brand_analyzer",
                questions: [{
                    id: "aidedawareness",
                    text: isAr ? `اختاري كل الماركات اللي تعرفيها:` : `Please select all the brands that you are aware of:`,
                    en_text: `Please select all the brands that you are aware of:`,
                    ar_text: `اختاري كل الماركات اللي تعرفيها:`,
                    type: "mcq",
                    required: true,
                    options: brandOptions,
                    questionMeta: {
                        inputType: "checkbox",
                        analytical_role: "aided_awareness"
                    }
                }]
            });
        }
    }

    // 2. Perception Grid
    const selectedAttrIds = config.selected_attributes || [];
    const STANDARD_ATTRIBUTES = [
        { id: 'trustworthy', en: 'A trustworthy brand', ar: 'براند موثوق فيه' },
        { id: 'innovative', en: 'An innovative brand', ar: 'براند مبتكر' },
        { id: 'expert', en: 'An expert brand', ar: 'براند خبير' },
        { id: 'well_known', en: 'A well-known brand', ar: 'براند مشهور' },
        { id: 'youthful', en: 'A youthful and fun brand', ar: 'براند شبابي وممتع' },
        { id: 'natural', en: 'A brand that uses natural ingredients', ar: 'براند بيستخدم مكونات طبيعية' },
        { id: 'special', en: 'Makes me feel special when using it', ar: 'بحس إني مميز وأنا بستخدمه' },
        { id: 'chic', en: 'A chic and elegant brand', ar: 'براند شيك وأنيق' },
        { id: 'value', en: 'Value for money', ar: 'قيمة مقابل السعر' },
        { id: 'high_quality', en: 'High quality', ar: 'جودة عالية' },
        { id: 'affordable', en: 'An affordable brand', ar: 'براند اقتصادي' }
    ];

    const finalAttrsToResolve = selectedAttrIds.length > 0
        ? selectedAttrIds
        : (config.is_enabled ? STANDARD_ATTRIBUTES.map(a => a.id) : []);

    if (finalAttrsToResolve.length > 0) {
        // Fetch labels from bank (optimistic resolution)
        let bank: any = null;
        try {
            bank = await brandAttributes.getBank();
        } catch (e) {
            console.error("Failed to fetch bank for schema generation", e);
        }

        const resolvedRows = finalAttrsToResolve.map((aid: string) => {
            // First check standard
            const std = STANDARD_ATTRIBUTES.find(a => a.id === aid);
            if (std) return { id: aid, label: isAr ? std.ar : std.en };

            // Then check bank
            const attr = (bank?.attributes || []).find((a: any) => a.id === aid);
            return {
                id: aid,
                label: attr ? (isAr ? attr.label_ar : attr.label_en) : aid
            };
        });

        sections.push({
            title: isAr ? "تصور العلامة التجارية" : "Brand Perception",
            module: "brand_analyzer",
            questions: [{
                id: "ba_q2_perception",
                text: isAr
                    ? "بالنسبة لكل جملة قدامك، اختاري البراند أو البراندات اللي ينطبق عليها الكلام. ممكن تختاري براند واحد أو أكتر لكل جملة."
                    : "For each statement, select the brand(s) you feel it applies to. You may choose one or more brands per statement.",
                en_text: "For each statement, select the brand(s) you feel it applies to. You may choose one or more brands per statement.",
                ar_text: "بالنسبة لكل جملة قدامك، اختاري البراند أو البراندات اللي ينطبق عليها الكلام. ممكن تختاري براند واحد أو أكتر لكل جملة.",
                type: "grid",
                required: true,
                questionMeta: {
                    inputType: "perception_grid",
                    rows: resolvedRows,
                    brandPipeline: {
                        mode: "include_prior",
                        sources: ["pf_q1", "ba_q1_awareness"],
                        strategy: "union"
                    }
                }
            }]
        });
    }

    // 3. Satisfaction Loop
    sections.push({
        title: isAr ? "رضا العملاء" : "Customer Satisfaction",
        module: "brand_analyzer",
        questions: [{
            id: "Satisfied",
            text: isAr ? "الى اي مدى انتي راضية عن ماركة [brand]؟" : "To what extent are you satisfied with the brand [brand]?",
            en_text: "To what extent are you satisfied with the brand [brand]?",
            ar_text: "الى اي مدى انتي راضية عن ماركة [brand]؟",
            type: "loop",
            required: true,
            questionMeta: {
                inputType: "satisfaction_scale",
                scaleText: true,
                options: isAr ? [
                    "راضية جدا",
                    "راضية",
                    "لا راضية ولا مش راضية",
                    "مش راضية",
                    "مش راضية خالص"
                ] : [
                    "Very Satisfied",
                    "Satisfied",
                    "Neither Satisfied nor Dissatisfied",
                    "Dissatisfied",
                    "Very Dissatisfied"
                ],
                brandPipeline: {
                    mode: "include_prior",
                    sources: ["pf_q1", "aidedawareness"],
                    strategy: "union"
                }
            }
        }]
    });

    return { sections };
}
