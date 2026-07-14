import type { PackagingHeatmapIntent, PackagingImageSide } from '../types/productTest';

export const PACKAGING_HEATMAP_GRID_SIZE = 32;

export const INTENT_LABELS: Record<PackagingHeatmapIntent, string> = {
    attraction: 'Attraction',
    dislikes: 'Dislikes',
    improve: 'Improve',
};

export const INTENT_COLORS: Record<PackagingHeatmapIntent, { rgb: [number, number, number]; marker: string }> = {
    attraction: { rgb: [16, 185, 129], marker: 'bg-emerald-500 border-emerald-300' },
    dislikes: { rgb: [244, 63, 94], marker: 'bg-rose-500 border-rose-300' },
    improve: { rgb: [245, 158, 11], marker: 'bg-amber-500 border-amber-300' },
};

export type HeatmapQuadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const QUADRANT_LABELS: Record<HeatmapQuadrant, string> = {
    'top-left': 'Top Left',
    'top-right': 'Top Right',
    'bottom-left': 'Bottom Left',
    'bottom-right': 'Bottom Right',
};

/** Map normalized (x,y) to flat bin index — mirrors backend bin_click. */
export function binClick(x: number, y: number, gridSize = PACKAGING_HEATMAP_GRID_SIZE): number {
    const clampedX = Math.min(1, Math.max(0, x));
    const clampedY = Math.min(1, Math.max(0, y));
    const col = Math.min(gridSize - 1, Math.floor(clampedX * gridSize));
    const row = Math.min(gridSize - 1, Math.floor(clampedY * gridSize));
    return row * gridSize + col;
}

/** Separable Gaussian blur for smooth heat overlay (client-side only). */
export function gaussianBlurGrid(
    bins: number[],
    gridSize = PACKAGING_HEATMAP_GRID_SIZE,
    sigma = 1.2,
): number[] {
    if (!bins.length) return [];

    const kernelRadius = Math.ceil(sigma * 2);
    const kernel: number[] = [];
    let kernelSum = 0;
    for (let i = -kernelRadius; i <= kernelRadius; i += 1) {
        const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
        kernel.push(weight);
        kernelSum += weight;
    }
    const normalizedKernel = kernel.map((w) => w / kernelSum);

    const grid = Array.from({ length: gridSize }, (_, row) =>
        Array.from({ length: gridSize }, (_, col) => bins[row * gridSize + col] ?? 0),
    );

    const temp = grid.map((row) => [...row]);
    const out = grid.map((row) => [...row]);

    for (let row = 0; row < gridSize; row += 1) {
        for (let col = 0; col < gridSize; col += 1) {
            let sum = 0;
            for (let k = -kernelRadius; k <= kernelRadius; k += 1) {
                const c = Math.min(gridSize - 1, Math.max(0, col + k));
                sum += grid[row][c] * normalizedKernel[k + kernelRadius];
            }
            temp[row][col] = sum;
        }
    }

    for (let row = 0; row < gridSize; row += 1) {
        for (let col = 0; col < gridSize; col += 1) {
            let sum = 0;
            for (let k = -kernelRadius; k <= kernelRadius; k += 1) {
                const r = Math.min(gridSize - 1, Math.max(0, row + k));
                sum += temp[r][col] * normalizedKernel[k + kernelRadius];
            }
            out[row][col] = sum;
        }
    }

    return out.flat();
}

export function maxBinValue(bins: number[]): number {
    return bins.reduce((max, v) => Math.max(max, v), 0);
}

/** Density as % of respondents who clicked each cell (at least once). */
export function binsToRespondentPercent(bins: number[], responseCount: number): number[] {
    if (!responseCount) return bins.map(() => 0);
    return bins.map((count) => (count / responseCount) * 100);
}

export function resolveQuadrant(row: number, col: number, gridSize: number): HeatmapQuadrant {
    const mid = gridSize / 2;
    const top = row < mid;
    const left = col < mid;
    if (top && left) return 'top-left';
    if (top && !left) return 'top-right';
    if (!top && left) return 'bottom-left';
    return 'bottom-right';
}

export function topHotspotQuadrant(
    bins: number[],
    gridSize = PACKAGING_HEATMAP_GRID_SIZE,
): { quadrant: HeatmapQuadrant; label: string; peakValue: number } | null {
    const peak = maxBinValue(bins);
    if (peak <= 0) return null;

    let peakIdx = bins.indexOf(peak);
    for (let i = 0; i < bins.length; i += 1) {
        if (bins[i] === peak) {
            peakIdx = i;
            break;
        }
    }

    const row = Math.floor(peakIdx / gridSize);
    const col = peakIdx % gridSize;
    const quadrant = resolveQuadrant(row, col, gridSize);
    return { quadrant, label: QUADRANT_LABELS[quadrant], peakValue: peak };
}

export function aggregateForSideIntent(
    aggregates: Array<{ image_side: string; intent: string; bins: number[]; total_clicks: number; response_count: number }>,
    side: PackagingImageSide,
    intent: PackagingHeatmapIntent,
) {
    return aggregates.find((row) => row.image_side === side && row.intent === intent) ?? null;
}

export interface DrawHeatmapOverlayOptions {
    bins: number[];
    gridSize?: number;
    intent: PackagingHeatmapIntent;
    mode: 'density' | 'percent';
    responseCount?: number;
    blur?: boolean;
    maxAlpha?: number;
}

/** Paint heat overlay onto canvas context (image already drawn). */
export function drawHeatmapOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    options: DrawHeatmapOverlayOptions,
): void {
    const {
        bins,
        gridSize = PACKAGING_HEATMAP_GRID_SIZE,
        intent,
        mode,
        responseCount = 0,
        blur = true,
        maxAlpha = 0.72,
    } = options;

    const processed = blur ? gaussianBlurGrid(bins, gridSize) : [...bins];
    const values =
        mode === 'percent' && responseCount > 0
            ? binsToRespondentPercent(processed, responseCount)
            : processed;

    const peak = maxBinValue(values);
    if (peak <= 0) return;

    const [r, g, b] = INTENT_COLORS[intent].rgb;
    const cellW = width / gridSize;
    const cellH = height / gridSize;

    for (let row = 0; row < gridSize; row += 1) {
        for (let col = 0; col < gridSize; col += 1) {
            const value = values[row * gridSize + col];
            if (value <= 0) continue;
            const alpha = (value / peak) * maxAlpha;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
            ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
        }
    }
}

export function drawClickMarkers(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    clicks: Array<{ x: number; y: number }>,
    intent: PackagingHeatmapIntent,
): void {
    const [r, g, b] = INTENT_COLORS[intent].rgb;
    const radius = Math.max(4, Math.min(width, height) * 0.012);

    clicks.forEach((click, index) => {
        const x = click.x * width;
        const y = click.y * height;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, radius)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), x, y);
    });
}
