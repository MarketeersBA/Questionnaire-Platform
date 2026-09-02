export type QuestionModuleId =
    | 'purchase_funnel'
    | 'brand_usage'
    | 'brand_pricing_behavior'
    | 'brand_analyzer';

export type ModuleQuestionType =
    | 'open_single'
    | 'open_loop'
    | 'scq'
    | 'mcq'
    | 'grid'
    | 'loop'
    | 'linear_scale';

export interface ModuleBrandPipeline {
    mode: 'exclude_prior' | 'include_prior';
    sources: string[];
    strategy?: 'cascade' | 'union' | 'intersection';
}

export interface QuestionOption {
    value: string;
    ar_label: string;
    en_label: string;
    allows_specify?: boolean;
    order: number;
}

export interface ModuleQuestion {
    question_id: string;
    label?: string;
    type: ModuleQuestionType;
    ar_text: string;
    en_text: string;
    order: number;
    required: boolean;
    analytical_role?: string;
    options?: QuestionOption[];
    brand_pipeline?: ModuleBrandPipeline;
    has_stop?: boolean;
    has_other?: boolean;
    cati_instruction?: string;
    /** Optional finer breakdown under the owning section's main attribute. */
    sub_attribute?: string | null;
    /** linear_scale only; ignored for every other question type. */
    scale_variant?: 'linear' | 'bipolar' | 'jar';
    scale_min?: number;
    scale_max?: number;
    min_label?: string;
    max_label?: string;
    questionMeta?: any;
}

export interface ModuleSection {
    section_id: string;
    title_en: string;
    title_ar: string;
    order: number;
    questions: ModuleQuestion[];
}

export interface QuestionModule {
    _id?: string;
    module_id: QuestionModuleId | string;
    name: string;
    description?: string;
    version: number;
    is_active: boolean;
    sections: ModuleSection[];
    question_count: number;
    created_by?: string;
    updated_by?: string;
    created_at?: string;
    updated_at?: string;
}

export interface QuestionModuleSummary {
    module_id: string;
    name: string;
    description?: string;
    version: number;
    is_active: boolean;
    question_count: number;
    section_count: number;
    updated_at: string;
}

export interface QuestionModuleUpdatePayload {
    name: string;
    description?: string;
    sections: ModuleSection[];
}

export interface ModuleSnapshot extends Omit<QuestionModule, '_id' | 'created_by' | 'updated_by'> {
    snapshotted_at: string;
    source_version: number;
}

export type ModuleSnapshots = Record<string, ModuleSnapshot>;
