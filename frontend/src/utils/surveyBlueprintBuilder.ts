import { SurveyFormData } from '../pages/CreateSurvey/types';
import { ResearchBlueprint } from '../types/tasteTest';
import type { ProductTestConfig } from '../types/productTest';
import type { ProductTestSnapshot } from '../types/productTestRespondent';
import { normalizeTrialMediaCapture } from './trialMediaCaptureConfig';
import { resolveBlueprintProductTestSnapshot } from './productTestBlueprintUtils';

/** Product test fields embedded in survey blueprint for clone/analytics parity. */
export interface ProductTestBlueprintExtension {
    language: ProductTestConfig['language'];
    selected_attributes: string[];
    fixed_questions: string[];
    optional_questions: string[];
    package_test_enabled: boolean;
    package_test_attributes: string[];
    packaging_heatmap_enabled: boolean;
    packaging_heatmap_images: ProductTestConfig['packaging_heatmap_images'];
    trial_media_capture: ProductTestConfig['trial_media_capture'];
    version?: number;
    status?: string;
}

export type SurveyBlueprintPayload = ResearchBlueprint & {
    survey_type?: string;
    product_test?: ProductTestBlueprintExtension | null;
};

/**
 * Build the survey blueprint payload persisted on submit.
 * Includes taste-test core fields plus product_test block when applicable.
 */
export function buildSurveyBlueprint(formData: SurveyFormData): SurveyBlueprintPayload {
    const base: SurveyBlueprintPayload = {
        category: formData.config?.category || '',
        ratingScale: formData.config?.ratingScale || 10,
        own_brand: formData.config?.own_brand || null,
        brands: [
            ...(formData.config?.internal_brands_data || formData.internal_brands_data || []),
            ...(formData.config?.competitor_brands_data || formData.competitor_brands_data || []),
        ],
        attributes: formData.config?.attributes || {},
        custom_research_attributes: formData.config?.custom_research_attributes || [],
        survey_type: formData.survey_type || undefined,
        product_test: null,
    };

    if (formData.survey_type === 'product_test' && formData.product_test_config) {
        const pt = formData.product_test_config;
        base.product_test = {
            language: pt.language,
            selected_attributes: pt.selected_attributes || [],
            fixed_questions: pt.fixed_questions || [],
            optional_questions: pt.optional_questions || [],
            package_test_enabled: Boolean(pt.package_test_enabled),
            package_test_attributes: pt.package_test_attributes || [],
            packaging_heatmap_enabled: Boolean(pt.packaging_heatmap_enabled),
            packaging_heatmap_images: pt.packaging_heatmap_images || { front: null, back: null },
            trial_media_capture: normalizeTrialMediaCapture(pt.trial_media_capture),
            version: pt.version,
            status: pt.status,
        };
        // Product test surveys store locale on PT config; mirror to blueprint root for analytics
        if (pt.language) {
            (base as ResearchBlueprint & { language?: string }).language = pt.language;
        }
    }

    return base;
}

/**
 * Restore product_test_config from cloned survey document or blueprint extension.
 */
export function restoreProductTestConfigFromSurvey(survey: Record<string, any>): ProductTestConfig | null {
    if (survey.product_test_config) {
        return {
            ...(survey.product_test_config as ProductTestConfig),
            trial_media_capture: normalizeTrialMediaCapture(
                survey.product_test_config.trial_media_capture,
            ),
        };
    }

    const ptBlueprint = survey.blueprint?.product_test;
    if (!ptBlueprint) return null;

    return {
        version: ptBlueprint.version ?? 1,
        language: ptBlueprint.language ?? 'en',
        selected_attributes: ptBlueprint.selected_attributes || [],
        fixed_questions: ptBlueprint.fixed_questions || [],
        optional_questions: ptBlueprint.optional_questions || [],
        package_test_enabled: Boolean(ptBlueprint.package_test_enabled),
        package_test_attributes: ptBlueprint.package_test_attributes || [],
        packaging_heatmap_enabled: Boolean(ptBlueprint.packaging_heatmap_enabled),
        packaging_heatmap_images: ptBlueprint.packaging_heatmap_images || { front: null, back: null },
        trial_media_capture: normalizeTrialMediaCapture(ptBlueprint.trial_media_capture),
        status: ptBlueprint.status || 'draft',
    };
}

/**
 * Resolve L2 schema snapshot for clone — product test prefers template_snapshot_l2.
 */
export function resolveClonedL2Snapshot(survey: Record<string, any>, surveyType: string) {
    if (surveyType === 'product_test') {
        return (
            survey.template_snapshot_l2
            || survey.template_snapshot_schema?.layer2_structure
            || survey.layer2_structure
            || { sections: [] }
        );
    }
    return (
        survey.template_snapshot_l2
        || survey.layer2_structure
        || survey.template_snapshot_schema?.layer2_structure
        || { sections: [] }
    );
}

export interface BlueprintSubmitSnapshots {
    template_snapshot_schema: Record<string, unknown>;
    template_snapshot_questions: Record<string, unknown>[];
    template_snapshot_l2: Record<string, unknown>;
    product_test_snapshot: ProductTestSnapshot | null;
}

/** Package architect-step schema for survey create so manual edits survive orchestration. */
export function buildBlueprintSubmitSnapshots(formData: SurveyFormData): BlueprintSubmitSnapshots | null {
    const schema = formData.schema;
    if (!schema) return null;

    const l1Sections = schema.layer1_structure?.sections || [];
    const l1Questions = l1Sections.flatMap((section: { questions?: unknown[] }) => section.questions || []);

    return {
        template_snapshot_schema: schema as Record<string, unknown>,
        template_snapshot_questions: l1Questions as Record<string, unknown>[],
        template_snapshot_l2: (schema.layer2_structure || { sections: [] }) as Record<string, unknown>,
        product_test_snapshot: resolveBlueprintProductTestSnapshot(schema),
    };
}
