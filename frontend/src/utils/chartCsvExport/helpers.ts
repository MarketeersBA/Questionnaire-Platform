export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const asNumber = (value: unknown): string | number => {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
};

export const asString = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value);

/** True when dataset points are XY objects (scatter / bubble / positioning), not scalar series */
export const datasetLooksLikeScatter = (dataset: unknown): boolean => {
    if (!isRecord(dataset) || !Array.isArray(dataset.data) || dataset.data.length === 0) {
        return false;
    }
    const first = dataset.data[0];
    if (!isRecord(first)) return false;
    return (
        'x' in first ||
        'y' in first ||
        'x_val' in first ||
        'y_val' in first ||
        'impact' in first ||
        'performance' in first
    );
};

export const dataHasScatterDatasets = (data: Record<string, unknown>): boolean => {
    const datasets = data.datasets;
    if (Array.isArray(datasets)) {
        return datasets.some(datasetLooksLikeScatter);
    }
    if (isRecord(datasets)) {
        return Object.values(datasets).some(
            (points) => Array.isArray(points) && points.length > 0 && isRecord(points[0]) && ('x' in points[0] || 'y' in points[0])
        );
    }
    return false;
};
