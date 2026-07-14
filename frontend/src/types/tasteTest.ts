export interface QuestionMeta {
    nature: "fixed" | "dynamic" | "open";
    inputType: "scale" | "single-choice" | "multi-choice" | "bipolar" | "open-ended" | "numeric" | "packaging-heatmap";
    scaleMax?: number;
    min?: number;
    max?: number;
    minLabel?: string;
    maxLabel?: string;
    bipolarLeft?: string;
    bipolarRight?: string;
    options?: string[];
    masterType?: string;
    canonicalQuestionId?: string;
    legacyQuestionId?: string;
    questionIdPrefix?: string;
    imageSide?: 'front' | 'back';
    heatmapIntent?: 'attraction' | 'dislikes' | 'improve';
    maxClicks?: number;
    imageAssetId?: string;
    imageWidth?: number;
    imageHeight?: number;
}

export interface CustomSubAttribute {
    label: string;
    minLabel: string;
    maxLabel: string;
    root_attribute_id?: string;
}

export interface CustomResearchAttribute {
    main_attribute: string;
    sub_attributes: CustomSubAttribute[];
    root_attribute_id?: string;
}

export interface ResearchBlueprint {
    category: string;
    ratingScale: number;
    own_brand: string | null;
    brands: BrandMetadata[];
    attributes: Record<string, string[]>;
    custom_research_attributes: CustomResearchAttribute[];
}

export interface BrandMetadata {
    name: string;
    role: 'internal' | 'competitor';
    is_pf_aided?: boolean;
}

export interface TasteTestConfig {
    category: string;
    ratingScale: 5 | 7 | 9 | 10;
    attributes: Record<string, string[]>;
    brands: string[]; // Legacy
    own_brand: string; // Legacy
    internal_brands_data: BrandMetadata[];
    competitor_brands_data: BrandMetadata[];
    competitive_brands: string[]; // Legacy
    language: "en" | "ar";
    fixed_questions?: string[];
    optional_questions?: string[];
    measures?: Record<string, string>;
    custom_research_attributes?: CustomResearchAttribute[];
    library_custom_subs?: Record<string, CustomSubAttribute[]>;
    attribute_sequence?: { main_attribute: string, sub_attributes: string[], source: 'library' | 'custom' }[];
    module_sequence?: string[];
    bipolarPairs?: [string, string][];
    // Added missing fields based on common taste test configurations
    testing_protocol?: 'branded' | 'blind';
    blind_codes?: Record<string, string>;
    product_codes?: string[];
    attribute_bank_id?: string;
    custom_attributes?: { attribute_id: string; label: string; scale_type: string }[];
    blocks_config?: {
        include_awareness: boolean;
        include_usage_habits: boolean;
        include_category_behavior: boolean;
        include_brand_metrics: boolean;
        include_purchase_intent: boolean;
    };
    editor_settings?: {
        allow_wording_edits: boolean;
        analyst_only: boolean;
        locked_after?: string;
    };
    /** Snapshot of tt_q* module metadata from question bank (Phase 8). */
    module_metadata?: {
        module_id: string;
        question_id_prefix: string;
        legacy_id_aliases: Record<string, string>;
    };
    question_id_prefix?: string;
}

// Keeping existing Phase 1 interfaces for compatibility if needed elsewhere, 
// but adding a "v2" or specific name if they clash.
// For the new task, we'll use the prompt-specific one.

export interface Attribute {
    attribute_id: string;
    label: string;
    description?: string;
    scale_type: string;
    is_required: boolean;
    diagnostic_group: string;
}

export interface AttributeBank {
    category: string;
    display_name: string;
    version: number;
    core_attributes: Attribute[];
    sub_attributes: Attribute[];
}

export interface ProductConfig {
    product_code: string;
    blind_code: string;
    brand_name?: string;
    expose_brand: boolean;
}

export interface CustomAttributeConfig {
    attribute_id: string;
    label: string;
    scale_type: string;
}

export interface TasteTestBlocksConfig {
    include_awareness: boolean;
    include_usage_habits: boolean;
    include_category_behavior: boolean;
    include_brand_metrics: boolean;
    include_purchase_intent: boolean;
}

export interface EditorSettings {
    allow_wording_edits: boolean;
    analyst_only: boolean;
    locked_after?: string;
}

// This is likely what we'll use in the template document
export interface TasteTestSurveyConfig extends TasteTestConfig {
    generated_at?: string;
    version: number;
}
