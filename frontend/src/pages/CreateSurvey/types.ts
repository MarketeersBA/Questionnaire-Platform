import { TasteTestConfig, ResearchBlueprint } from '../../types/tasteTest';
import { ProductTestConfig } from '../../types/productTest';
import { VoiceCaptureConfig, DEFAULT_VOICE_CAPTURE } from '../../utils/voiceQuestions';
import type { PackagingHeatmapPendingFiles } from '../../utils/packagingHeatmapConfig';
import type { AiFollowupConfig } from '../../utils/aiFollowupConfig';
import { DEFAULT_AI_FOLLOWUP } from '../../utils/aiFollowupConfig';

export { DEFAULT_AI_FOLLOWUP };
export type { AiFollowupConfig };
export { DEFAULT_VOICE_CAPTURE };
export type { VoiceCaptureConfig, ProductTestConfig };
export { DEFAULT_PRODUCT_TEST_CONFIG } from '../../utils/blueprintGenerationGuards';

export const DEFAULT_TASTE_CONFIG: TasteTestConfig = {
    category: '',
    ratingScale: 9,
    attributes: {},
    brands: [],
    own_brand: '',
    internal_brands_data: [],
    competitor_brands_data: [],
    competitive_brands: [],
    language: 'en',
    fixed_questions: [],
    optional_questions: [],
    measures: {},
    module_sequence: ['screening', 'taste_test', 'purchase_funnel', 'brand_usage', 'brand_pricing_behavior', 'brand_analyzer']
};

export interface BrandAnalyzerConfig {
    is_enabled: boolean;
    sync_with_purchase_funnel: boolean;
    selected_attributes: string[];
    custom_attributes?: any[];
    brand_list: { name: string; role: string; is_pf_aided?: boolean }[];
}

export interface PurchaseFunnelConfig {
    enabled: boolean;
    category_name: string;
    brand_list: { name: string }[];
}

export interface QuotaBucket {
    count: number | null;
    pct: number | null;
}

export interface GateQuotas {
    [gateKey: string]: {
        [optionValue: string]: QuotaBucket;
    };
}

export interface SurveyFormData {
    survey_name: string;
    survey_code: string;
    survey_type: 'taste_test' | 'product_test' | 'brand_awareness' | 'usage_attitude' | 'concept_test' | '';
    purchase_funnel_id?: string;
    links_count: number;
    sample_capacity: number;
    gate_quotas: GateQuotas;
    purchase_funnel?: {
        is_enabled: boolean;
        category_name: string;
        brand_list: { name_en: string; name_ar: string }[];
    };
    brand_usage?: {
        is_enabled: boolean;
        target_brand?: string;
        selected_questions?: string[];
    };
    brand_pricing_behavior?: {
        is_enabled: boolean;
        target_brand?: string;
        selected_questions?: string[];
    };
    brand_analyzer?: BrandAnalyzerConfig;
    config: TasteTestConfig | null;
    product_test_config?: ProductTestConfig | null;
    blueprint?: ResearchBlueprint;
    template_snapshot_schema?: any;
    template_snapshot_questions?: any[];
    template_snapshot_l2?: any;
    internal_brands_data: any[];
    competitor_brands_data: any[];
    schema: {
        layer1_structure: { sections: any[]; schema?: any };
        layer2_structure: { sections: any[] };
        layer3_structure?: { sections: any[] };
        layer4_structure?: { sections: any[] };
        layer5_structure?: { sections: any[] };
        layer6_structure?: { sections: any[] };
        layer7_structure?: { sections: any[] };
        product_test_snapshot?: import('../../types/productTestRespondent').ProductTestSnapshot | null;
    };
    layer1_screening_config: {
        full_name: boolean;
        gender: boolean;
        age: boolean;
        location: boolean;
        education: boolean;
        marital_status: boolean;
        family_income: boolean;
        occupation: boolean;
        ses_screening: boolean;
        age_min: number;
        age_max: number;
        allowed_age_ranges: string[];
        allowed_genders: string[];
        allowed_brands?: string[];
        allowed_areas: string[];
        area_mode: 'mcq' | 'free_text';
        allowed_education: string[];
        allowed_marital_status: string[];
        allowed_ses: string[];
    };
    google_form_id: string;
    google_form_url: string;
    quality_control?: {
        is_enabled: boolean;
        min_time_seconds: number;
        max_time_seconds: number;
        min_time_message_en: string;
        min_time_message_ar: string;
        max_time_message_en: string;
        max_time_message_ar: string;
    };
    voice_capture?: VoiceCaptureConfig;
    industry?: string;
    survey_objective?: 'taste_new_product' | 'product_preference' | 'sensory_evaluation' | 'price_sensitivity' | 'improvement_insights' | 'purchase_intent' | 'other' | '';
    survey_objective_other?: string;
    sec_classes?: string[];
    locked_quotas?: Record<string, Record<string, boolean>>;
    sample_intelligence?: boolean;
    ai_followup?: AiFollowupConfig;
    module_sequence?: string[];
}

export interface StepProps {
    formData: SurveyFormData;
    setFormData: React.Dispatch<React.SetStateAction<SurveyFormData>>;
    nextStep?: () => void;
    prevStep?: () => void;
    brandInput?: string;
    setBrandInput?: React.Dispatch<React.SetStateAction<string>>;
    attributeBanksData?: any[];
    selectedBank?: string | null;
    setSelectedBank?: React.Dispatch<React.SetStateAction<string | null>>;
    bankDetails?: any;
    customRatingsCount?: number;
    handleAddCustomRatingL3?: () => void;
    handleAddQuestion?: (sectionIdx: number, layer: 1 | 2) => void;
    loading?: boolean;
    onOpenClone?: () => void;
    handleGenerateSchema?: () => Promise<void>;
    handleSubmit?: () => Promise<void>;
    draftSurveyId?: string | null;
    packagingHeatmapPending?: PackagingHeatmapPendingFiles;
    onPackagingHeatmapPendingChange?: React.Dispatch<React.SetStateAction<PackagingHeatmapPendingFiles>>;
}
export const INITIAL_SCREENING_CONFIG: SurveyFormData['layer1_screening_config'] = {
    full_name: true,
    gender: true,
    age: true,
    location: true,
    education: true,
    marital_status: true,
    family_income: true,
    occupation: true,
    ses_screening: false, // Keep SES as manual as it's a module

    age_min: 18,
    age_max: 65,
    allowed_age_ranges: ['18-25', '26-35', '36-45', '46-55'],
    allowed_genders: ['Male / ذكر', 'Female / أنثى'],
    allowed_areas: [],
    area_mode: 'mcq',
    allowed_education: [],
    allowed_marital_status: [],
    allowed_ses: []
};
