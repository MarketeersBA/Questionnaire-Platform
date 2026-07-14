import type { ChartCsvTabular, ChartPayloadLike, ShapeConverterFn } from './types';
import { finalizeTabular } from './safety';
import { brandComparisonToRows } from './converters/brandComparison';
import { flattenRecords } from './converters/flatten';
import { heatmapToRows } from './converters/heatmap';
import { labelsDatasetsToRows } from './converters/labelsDatasets';
import { profileToRows } from './converters/profile';
import { scatterToRows } from './converters/scatter';
import { tableToRows } from './converters/table';
import { wordCloudToRows } from './converters/wordCloud';
import { isRecord } from './helpers';

/**
 * Shape detectors run in priority order (first match wins).
 * Order is data-driven — not tied to React chart component names.
 */
export const SHAPE_CONVERTER_PIPELINE: ShapeConverterFn[] = [
    (data) => tableToRows(data),
    (data) => wordCloudToRows(data),
    (data) => heatmapToRows(data),
    (data, ctx) => scatterToRows(data, ctx),
    (data, ctx) => brandComparisonToRows(data, ctx),
    (data, ctx) => profileToRows(data, ctx),
    (data) => labelsDatasetsToRows(data),
    (data) => flattenRecords(data),
];

export const resolveChartCsvTabular = (chart: ChartPayloadLike): ChartCsvTabular | null => {
    const data = chart?.data;
    if (data === null || data === undefined) return null;

    if (Array.isArray(data)) {
        const result = flattenRecords(data);
        return result ? finalizeTabular(result) : null;
    }

    if (!isRecord(data)) return null;

    const ctx = { chart };
    let emptyShapeMatch: ChartCsvTabular | null = null;

    for (const convert of SHAPE_CONVERTER_PIPELINE) {
        const result = convert(data, ctx);
        if (!result) continue;
        if (result.rows.length > 0) return finalizeTabular(result);
        if (!emptyShapeMatch) emptyShapeMatch = finalizeTabular(result);
    }

    return emptyShapeMatch;
};
