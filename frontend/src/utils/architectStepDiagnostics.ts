import { SurveyFormData } from '../pages/CreateSurvey/types';
import {
    countLayerQuestions,
    ProductTestBankStatusSnapshot,
} from './blueprintGenerationGuards';
import {
    countProductTestSnapshotStats,
    resolveBlueprintProductTestSnapshot,
    snapshotHasBlueprintContent,
} from './productTestBlueprintUtils';
import { countPackagingHeatmapQuestions } from './packagingHeatmapConfig';

export interface ProductTestBlueprintSnapshot {
    l1QuestionCount: number;
    /** @deprecated L2 counts — use phaseCount/sectionCount/questionCount for product test */
    l2SectionCount: number;
    l2QuestionCount: number;
    phaseCount: number;
    sectionCount: number;
    questionCount: number;
    hasSnapshot: boolean;
    selectedAttributeCount: number;
    packageTestEnabled: boolean;
    packageAttributeCount: number;
    packagingHeatmapEnabled: boolean;
    packagingHeatmapQuestionCount: number;
}

export interface LayerEmptyDiagnostic {
    title: string;
    message: string;
    statsLine?: string;
}

export function buildProductTestBlueprintSnapshot(formData: SurveyFormData): ProductTestBlueprintSnapshot {
    const schema = formData.schema;
    const ptConfig = formData.product_test_config;
    const snapshot = resolveBlueprintProductTestSnapshot(formData);
    const stats = countProductTestSnapshotStats(snapshot);

    return {
        l1QuestionCount: countLayerQuestions(schema, 'layer1_structure'),
        l2SectionCount: stats.sectionCount || schema?.layer2_structure?.sections?.length || 0,
        l2QuestionCount: stats.questionCount || countLayerQuestions(schema, 'layer2_structure'),
        phaseCount: stats.phaseCount,
        sectionCount: stats.sectionCount,
        questionCount: stats.questionCount,
        hasSnapshot: snapshotHasBlueprintContent(snapshot),
        selectedAttributeCount: ptConfig?.selected_attributes?.length || 0,
        packageTestEnabled: Boolean(ptConfig?.package_test_enabled),
        packageAttributeCount: ptConfig?.package_test_attributes?.length || 0,
        packagingHeatmapEnabled: Boolean(ptConfig?.packaging_heatmap_enabled),
        packagingHeatmapQuestionCount: countPackagingHeatmapQuestions(ptConfig),
    };
}

function buildProductTestStatsLine(
    snapshot: ProductTestBlueprintSnapshot,
    bankStatus: ProductTestBankStatusSnapshot | null,
    bankStatusLoading: boolean,
): string | undefined {
    const parts: string[] = [];

    if (snapshot.hasSnapshot) {
        parts.push(
            `${snapshot.phaseCount} phase${snapshot.phaseCount === 1 ? '' : 's'}`,
            `${snapshot.sectionCount} section${snapshot.sectionCount === 1 ? '' : 's'}`,
            `${snapshot.questionCount} question${snapshot.questionCount === 1 ? '' : 's'}`,
        );
    } else {
        parts.push(`${snapshot.sectionCount} section${snapshot.sectionCount === 1 ? '' : 's'}`);
    }

    if (bankStatusLoading) {
        parts.push('bank status loading…');
    } else if (bankStatus) {
        parts.push(`${bankStatus.fixed_count} fixed in bank`);
    } else {
        parts.push('bank status unknown');
    }

    parts.push(`${snapshot.selectedAttributeCount} attribute${snapshot.selectedAttributeCount === 1 ? '' : 's'} selected`);

    return parts.join(' · ');
}

/**
 * Context-aware empty-layer copy for ArchitectStep (replaces generic "Phase Empty" message).
 */
export function resolveLayerEmptyDiagnostic(
    activeLayer: string,
    formData: SurveyFormData,
    bankStatus: ProductTestBankStatusSnapshot | null,
    bankStatusLoading: boolean,
): LayerEmptyDiagnostic {
    const surveyType = formData.survey_type;
    const snapshot = buildProductTestBlueprintSnapshot(formData);

    if (activeLayer === 'screening') {
        return {
            title: 'Screening Layer Empty',
            message: 'Screening layer not built — check demographics config.',
            statsLine: snapshot.l1QuestionCount > 0
                ? `${snapshot.l1QuestionCount} questions configured in screening config`
                : '0 screening questions in blueprint',
        };
    }

    if (activeLayer === 'product_test' || (activeLayer === 'taste_test' && surveyType === 'product_test')) {
        const statsLine = buildProductTestStatsLine(snapshot, bankStatus, bankStatusLoading);

        if (bankStatusLoading) {
            return {
                title: 'Product Test Blueprint Empty',
                message: 'Product test questions have not been generated yet.',
                statsLine,
            };
        }

        if (!bankStatus || bankStatus.product_count === 0 || !bankStatus.seeded) {
            return {
                title: 'Product Test Blueprint Empty',
                message: 'Question bank is empty — seed required.',
                statsLine,
            };
        }

        return {
            title: 'Product Test Blueprint Empty',
            message: 'No questions matched your attribute selections. Re-open configuration or refresh.',
            statsLine,
        };
    }

    if (activeLayer === 'taste_test') {
        return {
            title: 'Taste Test Layer Empty',
            message: 'Taste test sections have not been generated. Return to Parameters, verify category, brands, and attributes, then refresh.',
            statsLine: `${snapshot.l2SectionCount} sections · ${snapshot.l2QuestionCount} questions in blueprint`,
        };
    }

    const layerLabel = activeLayer.replace(/_/g, ' ');
    return {
        title: 'Phase Empty',
        message: `No content composed for the ${layerLabel} layer yet. Enable the module in Parameters or refresh the blueprint.`,
    };
}
