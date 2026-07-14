import { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
    NPS_SEGMENT_COLORS,
    NPS_SEGMENT_ORDER,
    extractNpsGaugeBrands,
    formatNpsGaugeScore,
    getNpsScoreBadgeClasses,
    type NpsBrandRow,
    type NpsSegmentKey,
} from '../../utils/npsGauge';

type NpsGaugeProps = {
    data: unknown;
    isFocusMode?: boolean;
    presentationHeight?: number;
};

const MIN_SEGMENT_LABEL_PCT = 8;

function NpsSegmentBar({
    row,
    isDark,
}: {
    row: NpsBrandRow;
    isDark: boolean;
}) {
    const segments = NPS_SEGMENT_ORDER.map((key) => ({
        key,
        label: key,
        value: row[key.toLowerCase() as 'detractors' | 'passives' | 'promoters'],
        color: NPS_SEGMENT_COLORS[key],
    })).filter((segment) => segment.value > 0);

    if (!segments.length) {
        return (
            <div
                className={`flex h-11 w-full items-center justify-center rounded-2xl border text-xs font-bold uppercase tracking-widest ${
                    isDark ? 'border-white/10 bg-white/5 text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
            >
                No responses
            </div>
        );
    }

    return (
        <div
            className={`flex h-11 w-full overflow-hidden rounded-2xl border shadow-inner ${
                isDark ? 'border-white/10 bg-slate-900/40' : 'border-slate-200 bg-white'
            }`}
            role="img"
            aria-label={`${row.brand} NPS segments`}
        >
            {segments.map((segment) => (
                <div
                    key={segment.key}
                    className="relative flex items-center justify-center transition-all duration-300 first:rounded-l-2xl last:rounded-r-2xl"
                    style={{
                        width: `${segment.value}%`,
                        backgroundColor: segment.color,
                        minWidth: segment.value > 0 ? '2px' : undefined,
                    }}
                    title={`${segment.label}: ${Math.round(segment.value)}%`}
                >
                    {segment.value >= MIN_SEGMENT_LABEL_PCT && (
                        <span className="px-1 text-[11px] font-black text-white drop-shadow-sm">
                            {Math.round(segment.value)}%
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function NpsBrandRowView({
    row,
    isDark,
}: {
    row: NpsBrandRow;
    isDark: boolean;
}) {
    return (
        <div className="grid grid-cols-[minmax(5rem,7rem)_1fr_auto] items-center gap-4 md:gap-6">
            <div
                className={`truncate text-sm font-black uppercase tracking-wide ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                }`}
                title={row.brand}
            >
                {row.brand}
            </div>
            <NpsSegmentBar row={row} isDark={isDark} />
            <div className={getNpsScoreBadgeClasses(row.nps, isDark)} aria-label={`${row.brand} NPS`}>
                {formatNpsGaugeScore(row.nps)}
            </div>
        </div>
    );
}

function NpsLegend({ isDark }: { isDark: boolean }) {
    return (
        <div
            className={`flex flex-wrap items-center justify-center gap-6 rounded-2xl border px-5 py-4 text-[10px] font-black uppercase tracking-[0.25em] ${
                isDark ? 'border-white/5 bg-white/[0.02] text-slate-400' : 'border-slate-100 bg-slate-50 text-slate-500'
            }`}
        >
            {NPS_SEGMENT_ORDER.map((key: NpsSegmentKey) => (
                <div key={key} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NPS_SEGMENT_COLORS[key] }} />
                    <span>{key}</span>
                </div>
            ))}
        </div>
    );
}

export function NpsGauge({ data, isFocusMode, presentationHeight }: NpsGaugeProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const brands = useMemo(() => extractNpsGaugeBrands(data), [data]);

    if (!brands.length) {
        return (
            <div
                className={`flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-16 text-center ${
                    isDark ? 'border-white/10 bg-white/[0.02] text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
            >
                <p className="text-sm font-black uppercase tracking-[0.35em]">No NPS Data</p>
                <p className="mt-3 max-w-md text-xs font-medium normal-case tracking-normal">
                    Likelihood-to-recommend responses are not available for this report slice.
                </p>
            </div>
        );
    }

    const containerStyle = isFocusMode && presentationHeight ? { minHeight: Math.max(320, presentationHeight - 40) } : undefined;

    return (
        <div className="flex w-full flex-col justify-center gap-8 px-2 py-4" style={containerStyle}>
            <div className="space-y-5 md:space-y-6">
                {brands.map((row) => (
                    <NpsBrandRowView key={row.brand} row={row} isDark={isDark} />
                ))}
            </div>
            <NpsLegend isDark={isDark} />
        </div>
    );
}
