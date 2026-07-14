import type { ChartPayloadLike } from '../types';

/** Realistic report chart payloads for verification tests */

export const LABELS_DATASETS_CHART: ChartPayloadLike = {
    chart_id: 'purchase_intent',
    chart_type: 'stacked_bar',
    title: 'Purchase Intent',
    base_n: 250,
    data: {
        labels: ['Definitely', 'Probably', 'Maybe'],
        datasets: [
            { label: 'Our Brand', data: [45, 30, 25] },
            { label: 'Competitor', data: [30, 35, 35] },
        ],
    },
};

export const TABLE_CHART: ChartPayloadLike = {
    chart_id: 'reference_table',
    chart_type: 'table',
    title: 'Reference Table',
    base_n: 180,
    data: {
        columns: ['Brand', 'Awareness', 'Trial'],
        rows: [
            ['Brand A', 82, 45],
            ['Brand B', 71, 38],
        ],
    },
};

export const SCATTER_CHART: ChartPayloadLike = {
    chart_id: 'overall_scatter',
    chart_type: 'scatter',
    title: 'Overall Scatter',
    base_n: 120,
    data: {
        datasets: [
            {
                label: 'Our Brand',
                data: [
                    { x: 0.8, y: 72, attribute: 'Taste', n: 120 },
                    { x: 0.6, y: 65, attribute: 'Price', n: 120 },
                ],
            },
        ],
    },
};

export const WORD_CLOUD_CHART: ChartPayloadLike = {
    chart_id: 'open_end_likes',
    chart_type: 'wordcloud',
    title: 'Open End Likes',
    data: {
        brand: 'Abu Auf',
        words: [
            { text: 'crispy', value: 24 },
            { text: 'tasty', value: 18 },
        ],
    },
};

export const EMPTY_TABLE_CHART: ChartPayloadLike = {
    chart_id: 'empty_table',
    chart_type: 'table',
    title: 'Empty Table',
    data: {
        columns: ['Metric', 'Value'],
        rows: [],
    },
};

export const UNSUPPORTED_CHART: ChartPayloadLike = {
    chart_id: 'unknown_shape',
    chart_type: 'custom_widget',
    title: 'Unknown Widget',
    data: {},
};

export const NARRATIVE_ONLY_CHART: ChartPayloadLike = {
    chart_id: 'ai_narrative_only',
    title: 'AI Summary',
    data: {
        insight: 'This is narrative-only content and must not export as CSV rows.',
    },
};

export const BRAND_STRATEGIC_COMPARISON_CHART: ChartPayloadLike = {
    chart_id: 'brand_comparison_pi_ol',
    chart_type: 'brand_comparison',
    title: 'Brand Strategic Comparison',
    base_n: 10,
    brands: ['Friday', 'Squizz'],
    data: {
        labels: ['Friday', 'Squizz'],
        datasets: [
            { label: 'Purchase Intent (T2B%)', data: [90.0, 100.0], unit: '%' },
            { label: 'Overall Likability', data: [5.0, 6.0], unit: 'score' },
        ],
        metadata: {
            y_axis_left: { label: 'Purchase Intent', unit: '%', domain: [0, 100] },
            y_axis_right: { label: 'Likability Score', unit: '1-7', domain: [1, 7] },
            pi_diagnostics: {
                matched_row_count: 20,
                brands_with_pi: ['Friday', 'Squizz'],
                brands_missing_pi: [],
            },
        },
    },
};

/** Alternate dataset labels — exercises normalized PI/likability matching */
export const BRAND_STRATEGIC_COMPARISON_ALT_LABELS: ChartPayloadLike = {
    ...BRAND_STRATEGIC_COMPARISON_CHART,
    data: {
        ...BRAND_STRATEGIC_COMPARISON_CHART.data,
        datasets: [
            { label: 'Intent T2B%', data: [0.9, 1.0], unit: '%' },
            { label: 'Brand Affinity Score', data: [5.0, 6.0], unit: 'score' },
        ],
    },
};

/** profile/metrics present — must not hijack brand_comparison CSV routing */
export const BRAND_STRATEGIC_COMPARISON_WITH_PROFILE: ChartPayloadLike = {
    ...BRAND_STRATEGIC_COMPARISON_CHART,
    data: {
        ...BRAND_STRATEGIC_COMPARISON_CHART.data,
        profile: { Brand: 'Friday', Evaluations: 260 },
        metrics: [{ label: 'Overall Score', value: 4.25 }],
    },
};

export const VERIFICATION_CHARTS = {
    labelsDatasets: LABELS_DATASETS_CHART,
    brandComparison: BRAND_STRATEGIC_COMPARISON_CHART,
    brandComparisonAltLabels: BRAND_STRATEGIC_COMPARISON_ALT_LABELS,
    brandComparisonWithProfile: BRAND_STRATEGIC_COMPARISON_WITH_PROFILE,
    table: TABLE_CHART,
    scatter: SCATTER_CHART,
    wordCloud: WORD_CLOUD_CHART,
    empty: EMPTY_TABLE_CHART,
    unsupported: UNSUPPORTED_CHART,
    narrativeOnly: NARRATIVE_ONLY_CHART,
} as const;

export const FIXED_EXPORT_DATE = new Date('2026-05-24T12:00:00Z');
