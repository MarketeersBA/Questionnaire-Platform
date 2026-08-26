import { TasteTestConfig, QuestionMeta } from '../types/tasteTest';
import {
    extractTasteTestModuleMeta,
    resolveTasteTestQuestionId,
    type TasteTestModuleMetadata,
} from './tasteTestModuleUtils';
import { localizeTasteTestAttribute } from './tasteTestAttributeLabels';

const FALLBACK_FIXED_QUESTIONS = [
    {
        question_id: 'tt_fallback_purchase_intent',
        en_text: 'How likely are you to purchase this product?',
        ar_text: 'ما مدى احتمالية شرائك لهذا المنتج؟',
        question_type: 'Scale 1-5',
        timing: 'After Taste',
        question_status: 'fixed'
    },
    {
        question_id: 'tt_fallback_overall_liking',
        en_text: 'Overall, how much do you like this product?',
        ar_text: 'بشكل عام، ما مدى إعجابك بهذا المنتج؟',
        question_type: 'Scale 1-9',
        timing: 'After Taste',
        question_status: 'fixed'
    }
];

export function generateTasteTestModuleSchema(
    config: TasteTestConfig,
    masterData: Record<string, any[]>,
    moduleMeta?: TasteTestModuleMetadata,
) {
    const safeMasterData = masterData && Object.keys(masterData).length > 0 ? masterData : { fixed: FALLBACK_FIXED_QUESTIONS };
    const meta = moduleMeta || extractTasteTestModuleMeta(safeMasterData);
    const { category, internal_brands_data, competitor_brands_data, attributes, language, own_brand, competitive_brands } = config;

    // Use safeMasterData instead of masterData
    const masterFixed = safeMasterData['fixed'] || FALLBACK_FIXED_QUESTIONS;

    // Support new structure with legacy fallback
    const internalNames = internal_brands_data?.map(b => b.name) || (own_brand ? [own_brand] : []);
    const competitorNames = competitor_brands_data?.map(b => b.name) || competitive_brands || [];
    const allBrands = [...internalNames, ...competitorNames].filter(Boolean);

    // Placeholder Logic
    const replacePlaceholders = (text: string, brandName: string, attrName: string = "") => {
        if (!text) return "";
        let result = text;

        // English placeholders
        result = result.replace(/product/gi, brandName || "product");
        result = result.replace(/\[Category\]/gi, category || "Category");
        result = result.replace(/\[Attribute\]/gi, attrName);

        // Arabic placeholders
        result = result.replace(/المنتج/g, brandName || "المنتج");
        result = result.replace(/منتج/g, brandName || "منتج");

        return result;
    };

    // Helper to map backend question to frontend schema
    const mapQuestion = (q: any, brandName: string, attrName: string = "") => {
        const isArabic = language === 'ar';
        const text = isArabic ? q.ar_text || q.en_text : q.en_text;
        const rawOptions = isArabic ? q.ar_options : q.en_options;

        // Parse question type and scale
        const qTypeStr = (q.question_type || "").toLowerCase();
        const isScale = qTypeStr.includes('scale');
        const isNumeric = qTypeStr.includes('numeric');
        const isBipolar = qTypeStr.includes('bipolar');
        const isOpenEnded = qTypeStr.includes('open-end') || qTypeStr.includes('text');

        // Extract scale max from type string (e.g., "Scale 1-5" -> 5)
        let extractedScaleMax = 5;
        const scaleMatch = qTypeStr.match(/(\d+)-(\d+)/);
        if (scaleMatch && scaleMatch[2]) {
            extractedScaleMax = parseInt(scaleMatch[2]);
        } else if (qTypeStr.includes('10')) {
            extractedScaleMax = 10;
        }

        // Parse options if they are stored as strings like "1 = Bad, 5 = Good"
        let options = rawOptions || [];
        if (typeof options === 'string') {
            options = options.split(',').map((o: string) => o.trim());
        }

        // Determine final question type. If explicitly open-ended or numeric/scale/bipolar
        let finalType = 'mcq';
        if (isOpenEnded) finalType = 'open-ended';
        else if (isNumeric) finalType = 'number';
        else if (isScale) finalType = 'scale';
        else if (isBipolar) finalType = 'bipolar';

        // Safety check: if it's MCQ but only has "Open-End" as an option, it's actually open-ended
        if (finalType === 'mcq' && options.length === 1 && options[0].toLowerCase() === 'open-end') {
            finalType = 'open-ended';
        }

        // For open-ended questions, we DON'T want MCQ buttons, so clear the options
        if (finalType === 'open-ended') {
            options = [];
        }

        let minLabel = isArabic ? (q.ar_min_label || "") : (q.en_min_label || "");
        let maxLabel = isArabic ? (q.ar_max_label || "") : (q.en_max_label || "");

        if (!minLabel || !maxLabel) {
            if (typeof rawOptions === 'string' && rawOptions.includes('=')) {
                const parts = rawOptions.split(',').map(o => o.trim());
                parts.forEach(p => {
                    const labelMatch = p.split('=')[1]?.trim();
                    if (p.startsWith('1=')) minLabel = minLabel || labelMatch || "";
                    if (p.startsWith(`${extractedScaleMax}=`) || (p.includes('=') && parts.indexOf(p) === parts.length - 1)) {
                        maxLabel = maxLabel || labelMatch || "";
                    }
                });
            }
        }

        const canonicalId = resolveTasteTestQuestionId(q, meta);
        const legacyId =
            q.legacy_id ||
            (q.question_id && q.question_id !== canonicalId ? q.question_id : undefined);

        return {
            id: canonicalId || `q_${Math.random().toString(36).substr(2, 9)}`,
            text: replacePlaceholders(text, brandName, attrName),
            type: finalType,
            options: options,
            required: true,
            timing: q.timing,
            questionMeta: {
                nature: q.question_status === 'fixed' ? 'fixed' : 'dynamic',
                inputType: finalType === 'open-ended' ? 'open-ended' : (isNumeric ? 'numeric' : (isScale ? 'scale' : (isBipolar ? 'bipolar' : 'single-choice'))),
                options: options,
                scaleMax: isScale ? extractedScaleMax : undefined,
                minLabel: minLabel,
                maxLabel: maxLabel,
                bipolarLeft: isBipolar ? minLabel : undefined,
                bipolarRight: isBipolar ? maxLabel : undefined,
                canonicalQuestionId: canonicalId,
                legacyQuestionId: legacyId,
                questionIdPrefix: meta.question_id_prefix,
            } as QuestionMeta
        };
    };

    const layer1Sections = [
        {
            title: language === 'ar' ? "الوعي وعادات الاستخدام" : "Awareness & Usage Habits",
            module: 'taste_test',
            questions: masterFixed
                .filter((q: any) => q.timing === 'Layer 1' && !q.question_id?.toLowerCase().includes('email') && !q.en_text?.toLowerCase().includes('email'))
                .map((q: any) => mapQuestion(q, ""))
        }
    ];

    const layer2Sections: any[] = [];

    // 1. Before Taste Section (Common questions not tied to a specific brand)
    const beforeTasteQs = masterFixed
        .filter((q: any) => q.timing === 'Before Taste')
        .map((q: any) => mapQuestion(q, ""));

    if (beforeTasteQs.length > 0) {
        layer2Sections.push({
            title: language === 'ar' ? "قبل التذوق" : "Before Taste",
            module: 'taste_test',
            questions: beforeTasteQs
        });
    }

    // 2. The Brand Loop
    allBrands.forEach((brand) => {
        // Instruction Block per brand
        layer2Sections.push({
            title: `${brand} - ${language === 'ar' ? "تعليمات" : "Instructions"}`,
            isInstruction: true,
            module: 'taste_test',
            content: language === 'ar'
                ? `يرجى تذوق ${brand} الآن.`
                : `Please taste ${brand} now.`
        });

        // Unify the Sequence Loop
        const sequence = config.attribute_sequence && config.attribute_sequence.length > 0
            ? config.attribute_sequence
            : [
                ...Object.entries(attributes).map(([mainAttr, sub_attributes]) => ({ main_attribute: mainAttr, sub_attributes, source: 'library' as const })),
                ...(config.custom_research_attributes || []).filter(c => !attributes[c.main_attribute]).map(c => ({ main_attribute: c.main_attribute, sub_attributes: c.sub_attributes.map(s => s.label), source: 'custom' as const }))
            ];

        // Loop through sequence to output exactly defined runtime order
        sequence.forEach((seqItem) => {
            const mainAttr = seqItem.main_attribute;
            const source = seqItem.source;
            const subAttrLabels = seqItem.sub_attributes || [];

            // 1. Fetch any diagnostic library questions linked to this attribute
            let libraryQuestions: any[] = [];
            if (source === 'library') {
                libraryQuestions = (safeMasterData[mainAttr] || [])
                    .filter(q => q.timing !== 'Layer 1')
                    .map(q => mapQuestion(q, brand, mainAttr));
            }

            const attrQuestions = [...libraryQuestions];

            // 2. Identify custom dimensions 
            const matchingCustom = (config.custom_research_attributes || []).find(c => c.main_attribute === mainAttr);
            const isArabic = config.language === 'ar';
            const displayAttr = localizeTasteTestAttribute(mainAttr, language);

            if (source === 'custom' || matchingCustom) {

                // Fallback Main Evaluation: If this uses purely custom sub-attributes or library had 0 hits
                if (libraryQuestions.length === 0) {
                    attrQuestions.unshift({
                        id: `${brand}_fallback_${mainAttr.replace(/\s+/g, '_')}_${Math.random().toString(36).substr(2, 4)}`,
                        type: 'scale',
                        text: isArabic
                            ? `ما رأيك في (${displayAttr}) الخاصة بـ ${brand}؟`
                            : `What do you think about (${mainAttr}) for ${brand}?`,
                        options: [],
                        required: true,
                        timing: 'After Taste',
                        questionMeta: {
                            nature: 'dynamic',
                            inputType: 'scale',
                            minLabel: isArabic ? "لا يعجبني" : "Dislikes",
                            maxLabel: isArabic ? "يعجبني" : "Likes",
                            scaleMax: 10
                        }
                    });
                }

                // Add Custom Sub-Attributes explicitly in sequence order
                subAttrLabels.forEach(label => {
                    const subObj = matchingCustom?.sub_attributes.find(s => s.label === label);
                    const minL = subObj ? subObj.minLabel : (isArabic ? 'سيء' : 'Poor');
                    const maxL = subObj ? subObj.maxLabel : (isArabic ? 'ممتاز' : 'Excellent');

                    attrQuestions.push({
                        id: `${brand}_custom_sub_${label.replace(/\s+/g, '_')}_${Math.random().toString(36).substr(2, 4)}`,
                        type: 'scale',
                        text: isArabic
                            ? `${displayAttr} - ${label} (${minL} - ${maxL})`
                            : `${mainAttr}: How is the ${label}? (${minL} - ${maxL})`,
                        options: [],
                        required: true,
                        timing: 'After Taste',
                        questionMeta: {
                            nature: 'dynamic',
                            inputType: 'scale',
                            minLabel: minL,
                            maxLabel: maxL,
                            scaleMax: 5
                        }
                    });
                });
            } else if (libraryQuestions.length === 0) {
                // If it's a library dimension but had ZERO master questions and NO custom details
                attrQuestions.unshift({
                    id: `${brand}_fallback_${mainAttr.replace(/\s+/g, '_')}_${Math.random().toString(36).substr(2, 4)}`,
                    type: 'scale',
                    text: isArabic
                        ? `ما رأيك في (${displayAttr}) الخاصة بـ ${brand}؟`
                        : `What do you think about (${mainAttr}) for ${brand}?`,
                    options: [],
                    required: true,
                    timing: 'After Taste',
                    questionMeta: {
                        nature: 'dynamic',
                        inputType: 'scale',
                        minLabel: isArabic ? "لا يعجبني" : "Dislikes",
                        maxLabel: isArabic ? "يعجبني" : "Likes",
                        scaleMax: 10
                    }
                });
            }

            if (attrQuestions.length > 0) {
                layer2Sections.push({
                    title: `${brand}: ${displayAttr}`,
                    brand: brand,
                    module: 'taste_test',
                    attribute: mainAttr,
                    questions: attrQuestions
                });
            }
        });

        // Brand-specific fixed questions (After Taste)
        const brandFixedAfter = masterFixed
            .filter(q => q.timing === 'After Taste')
            .map(q => mapQuestion(q, brand));

        if (brandFixedAfter.length > 0) {
            layer2Sections.push({
                title: `${brand}: ${language === 'ar' ? "تقييم عام" : "General Evaluation"}`,
                brand: brand,
                module: 'taste_test',
                questions: brandFixedAfter
            });
        }
    });

    // 3. Overall Preference (if multiple brands)
    if (allBrands.length > 1) {
        layer2Sections.push({
            title: language === 'ar' ? "التفضيل" : "Preference",
            module: 'taste_test',
            questions: [
                {
                    id: "overall_preference",
                    text: language === 'ar' ? "أي منتج تفضله أكثر؟" : "Which product did you prefer the most?",
                    type: "mcq",
                    options: allBrands,
                    required: true,
                    questionMeta: {
                        nature: "fixed",
                        inputType: "single-choice",
                        options: allBrands
                    }
                }
            ]
        });
    }

    return {
        layer1_structure: { sections: layer1Sections },
        layer2_structure: { sections: layer2Sections }
    };
}

