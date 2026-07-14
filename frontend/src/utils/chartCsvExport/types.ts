export interface ChartPayloadLike {
    chart_id: string;
    chart_type?: string;
    title?: string;
    subtitle?: string;
    data?: unknown;
    brands?: string[];
    base_n?: number;
    metadata?: Record<string, unknown>;
}

export interface CsvColumnDef {
    header: string;
    key: string;
}

export interface ChartCsvTabular {
    columns: CsvColumnDef[];
    rows: Record<string, unknown>[];
    source: ChartCsvSource;
}

export type ChartCsvSource =
    | 'raw_criteria'
    | 'table'
    | 'wordcloud'
    | 'heatmap'
    | 'scatter'
    | 'brand_comparison'
    | 'profile'
    | 'labels_datasets'
    | 'flatten';

/** @deprecated Use `heatmap` — kept for telemetry backward compatibility */
export type ChartCsvSourceLegacy = ChartCsvSource | 'affinity_heatmap' | 'importance_matrix' | 'scorecard';

export type ChartCsvExportStatus = 'exported' | 'empty' | 'unsupported';

export interface ChartCsvExportResult {
    status: ChartCsvExportStatus;
    filename?: string;
    rowCount?: number;
    source?: ChartCsvSource;
    reason?: string;
}

export interface ShapeConverterContext {
    chart: ChartPayloadLike;
}

export type ShapeConverterResult = ChartCsvTabular | null;

export type ShapeConverterFn = (
    data: Record<string, unknown>,
    ctx: ShapeConverterContext
) => ShapeConverterResult;
