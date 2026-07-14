import type { ModuleQuestion, QuestionModule } from '../types/questionModules';
import { formatModuleQuestionText } from './moduleQuestionUtils';

export interface ModuleSchemaBaseConfig {
    language: 'en' | 'ar';
    category: string;
    brand: string;
}

/** Build preview / template schema sections from a question module document. */
export function generateSchemaSectionsFromModule(
    module: QuestionModule,
    moduleId: string,
    baseConfig: ModuleSchemaBaseConfig
) {
    const product = baseConfig.category || 'Category';
    const { language } = baseConfig;

    return {
        sections: (module.sections || [])
            .sort((a, b) => a.order - b.order)
            .map((section) => ({
                title: language === 'ar' ? section.title_ar || section.title_en : section.title_en,
                module: moduleId,
                section_id: section.section_id,
                questions: [...(section.questions || [])]
                    .sort((a, b) => a.order - b.order)
                    .map((q: ModuleQuestion) => ({
                        id: q.question_id,
                        text: formatModuleQuestionText(
                            language === 'ar' ? q.ar_text || q.en_text : q.en_text,
                            { product, category: product, brand: baseConfig.brand }
                        ),
                        type: q.type === 'open_loop' || q.type === 'open_single' ? 'text' : q.type,
                        required: q.required,
                        options: q.options?.map((o) =>
                            language === 'ar' ? o.ar_label || o.en_label : o.en_label
                        ),
                        questionMeta: {
                            nature: 'fixed',
                            section: section.section_id,
                            analytical_role: q.analytical_role,
                            brandPipeline: q.brand_pipeline,
                            hasStop: q.has_stop,
                            hasOther: q.has_other,
                            allowsSpecify: q.options?.some((o) => o.allows_specify),
                        },
                    })),
            })),
    };
}
