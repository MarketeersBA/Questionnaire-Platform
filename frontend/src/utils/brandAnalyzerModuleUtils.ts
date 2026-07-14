import type { QuestionModule } from '../types/questionModules';
import { moduleRollout } from '../constants/moduleRollout';
import { resolveQuestionModule } from './questionModuleFetch';

const MODULE_ID = 'brand_analyzer';

/** 
 * Fallback for Brand Analyzer. 
 * Since Brand Analyzer is highly dynamic (Grid, Loop), we define the structural shell here.
 * Sub-components like BrandAnalyzerGrid handle the heavy lifting.
 */
export function buildFallbackBrandAnalyzerModule(survey?: any): QuestionModule {
    const selectedAttributes = survey?.brand_analyzer?.selected_attributes || [];
    const customAttributes = survey?.brand_analyzer?.custom_attributes || [];

    const attributeRows = selectedAttributes.map((id: string) => {
        const custom = customAttributes.find((a: any) => a.id === id);
        if (custom) {
            return {
                id: custom.id,
                label: survey?.language === 'ar' ? custom.label_ar : custom.label_en
            };
        }
        return {
            id,
            label: id.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
        };
    });

    return {
        module_id: MODULE_ID,
        name: 'Brand Analyzer Module',
        version: 0,
        is_active: true,
        sections: [
            {
                section_id: 'ba_main',
                title_en: 'Brand Intelligence',
                title_ar: 'ذكاء العلامة التجارية',
                order: 1,
                questions: [
                    {
                        question_id: 'ba_q1_awareness',
                        label: 'Aided Awareness',
                        type: 'mcq',
                        en_text: 'Please select all the brands that you are aware of:',
                        ar_text: 'اختاري كل الماركات اللي تعرفيها:',
                        order: 1,
                        required: true,
                        has_other: true,
                    },
                    {
                        question_id: 'ba_q2_perception',
                        label: 'Brand Perception',
                        type: 'grid',
                        en_text: 'For each statement, select the brand(s) you feel it applies to.',
                        ar_text: 'بالنسبة لكل جملة قدامك، اختاري البراند أو البراندات اللي ينطبق عليها الكلام.',
                        order: 2,
                        required: true,
                        brand_pipeline: {
                            mode: 'include_prior',
                            sources: ['ba_q1_awareness'],
                            strategy: 'union'
                        },
                        questionMeta: {
                            rows: attributeRows,
                        }
                    },
                    {
                        question_id: 'ba_q3_satisfaction',
                        label: 'Customer Satisfaction',
                        type: 'loop',
                        en_text: 'To what extent are you satisfied with the brand [brand]?',
                        ar_text: 'إلى أي مدى أنتِ راضية عن ماركة [brand]؟',
                        order: 3,
                        required: true,
                        brand_pipeline: {
                            mode: 'include_prior',
                            sources: ['ba_q1_awareness'],
                            strategy: 'union'
                        }
                    }
                ]
            }
        ],
        question_count: 3,
    };
}

export async function resolveBrandAnalyzerModule(survey?: any): Promise<QuestionModule> {
    return resolveQuestionModule(MODULE_ID, buildFallbackBrandAnalyzerModule, survey);
}

export function isBrandAnalyzerEnabled(survey: any): boolean {
    if (!moduleRollout.genericRenderer()) return false;
    if (survey?.module_snapshots?.brand_analyzer) return true;
    if (survey?.brand_analyzer?.is_enabled) return true;
    const seq = survey?.config?.module_sequence || survey?.module_sequence || [];
    return seq.includes('brand_analyzer') || seq.includes('premium');
}
