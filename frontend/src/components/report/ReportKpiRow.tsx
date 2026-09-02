import { useMemo } from 'react';
import { Users, Layers, Target, Gauge } from 'lucide-react';
import { formatBrandName } from '../../utils/brandName';

/**
 * At-a-glance report vitals, shown directly under the Key Finding.
 *
 * Everything here is read off the already-computed report payload — no extra
 * request and no AI call — so it stays correct for historical reports too.
 * Each tile carries a small sparkline drawn from the same numbers it reports,
 * so the shape of the data is visible without opening a section.
 */

interface KpiTile {
    key: string;
    label: string;
    value: string;
    sub: string;
    icon: any;
    series: number[];
    tone: 'primary' | 'accent';
}

const clean = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** Pull the first chart of a given type out of the report payload. */
function findChart(charts: any[], predicate: (c: any) => boolean) {
    return (charts || []).find((c) => {
        try {
            return predicate(c);
        } catch {
            return false;
        }
    });
}

export function ReportKpiRow({ report }: { report: any }) {
    const tiles = useMemo<KpiTile[]>(() => {
        const charts: any[] = report?.charts || [];
        const out: KpiTile[] = [];

        const brands: string[] = report?.brands || report?.brand_list || [];
        const baseN = clean(report?.base_n);

        // ── Sample size ─────────────────────────────────────────────────
        if (baseN > 0) {
            out.push({
                key: 'base_n',
                label: 'Respondents',
                value: baseN.toLocaleString(),
                sub: `${brands.length} brand${brands.length === 1 ? '' : 's'} evaluated`,
                icon: Users,
                series: [],
                tone: 'primary',
            });
        }

        // ── Attributes measured, from the driver chart ──────────────────
        const drivers = findChart(charts, (c) => c.chart_type === 'driver_ranking');
        const driverPoints: any[] = drivers?.data?.datasets?.[0]?.data || [];
        if (driverPoints.length) {
            const sorted = [...driverPoints].sort((a, b) => clean(b.x) - clean(a.x));
            out.push({
                key: 'drivers',
                label: 'Attributes Measured',
                value: String(driverPoints.length),
                // Prefer main_attribute: `attribute` still carries the legacy
                // "(Main - Sub)" display string on older reports.
                sub: `Top driver: ${formatBrandName(sorted[0]?.main_attribute || sorted[0]?.attribute || '') || '—'}`,
                icon: Layers,
                series: sorted.slice(0, 8).map((p) => clean(p.x)),
                tone: 'primary',
            });
        }

        // ── Preference split, from the comparison chart ─────────────────
        const preference = findChart(
            charts,
            (c) => c.chart_type === 'horizontal_bar' || c.chart_type === 'preference_bar',
        );
        const prefLabels: string[] = preference?.data?.labels || [];
        const prefValues: number[] = preference?.data?.datasets?.[0]?.data || [];
        if (prefLabels.length && prefValues.length) {
            let leadIdx = 0;
            prefValues.forEach((v, i) => {
                if (clean(v) > clean(prefValues[leadIdx])) leadIdx = i;
            });
            out.push({
                key: 'preference',
                label: 'Preference Leader',
                value: `${Math.round(clean(prefValues[leadIdx]))}%`,
                sub: formatBrandName(prefLabels[leadIdx]) || '—',
                icon: Target,
                series: prefValues.map(clean),
                tone: 'primary',
            });
        }

        // ── Overall score, from the scorecard ───────────────────────────
        const scorecard = findChart(charts, (c) => c.chart_type === 'scorecard');
        const overall = scorecard?.data?.profile?.overall_score
            ?? scorecard?.data?.profile?.overall_likeness;
        if (overall !== undefined && overall !== null && `${overall}`.trim() !== '') {
            const strengths: any[] = scorecard?.data?.strengths || [];
            out.push({
                key: 'overall',
                label: 'Overall Score',
                value: String(overall),
                sub: strengths[0]?.attribute
                    ? `Strongest: ${strengths[0].attribute}`
                    : 'Target brand mean',
                icon: Gauge,
                series: strengths.slice(0, 6).map((sItem: any) => clean(Number(sItem.score))),
                tone: 'accent',
            });
        }

        return out;
    }, [report]);

    if (!tiles.length) return null;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {tiles.map((tile) => {
                const stroke = tile.tone === 'accent' ? '#CD393B' : '#255E91';
                const fill = tile.tone === 'accent' ? '#E79D9E' : '#21A0FF';
                return (
                    <div
                        key={tile.key}
                        className="card-brand rounded-2xl p-5 relative overflow-hidden group transition-all hover:-translate-y-0.5 hover:border-primary/40"
                    >
                        {/* Sparkline sits behind the number, not beside it, so the
                            tile stays compact while still showing the shape. */}
                        {/* Inline SVG rather than a Recharts surface: four
                            ResizeObservers for four decorative sparklines was a
                            measurable cost on this page. */}
                        {tile.series.length > 1 && (
                            <div className="absolute inset-x-0 bottom-0 h-14 opacity-30 pointer-events-none">
                                <Sparkline
                                    values={tile.series}
                                    stroke={stroke}
                                    fill={fill}
                                    bars={tile.key === 'preference'}
                                    id={tile.key}
                                />
                            </div>
                        )}

                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2.5">
                                <div className={`p-1.5 rounded-lg ${tile.tone === 'accent' ? 'bg-accent/10 text-accent-soft' : 'bg-primary/10 text-primary-soft'}`}>
                                    <tile.icon className="w-4 h-4" />
                                </div>
                                <p className="text-[11px] font-black text-ink-subtle uppercase tracking-[0.16em] leading-tight">
                                    {tile.label}
                                </p>
                            </div>
                            <p className="text-4xl font-black font-display text-ink leading-none tracking-tight">
                                {tile.value}
                            </p>
                            <p className="text-[12.5px] font-bold text-ink-muted mt-2 truncate" title={tile.sub}>
                                {tile.sub}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Minimal sparkline / bar strip drawn as raw SVG.
 *
 * Deliberately not Recharts: these marks are decorative context beneath a KPI,
 * and each Recharts surface brings a ResizeObserver and a layout pass that this
 * page does not need multiplied across every tile.
 */
function Sparkline({
    values, stroke, fill, bars = false, id,
}: {
    values: number[];
    stroke: string;
    fill: string;
    bars?: boolean;
    id: string;
}) {
    if (!values.length) return null;
    const max = Math.max(...values, 1);
    const W = 100;
    const H = 30;
    const gid = `spark-${id}`;

    if (bars) {
        const slot = W / values.length;
        return (
            <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                {values.map((v, i) => {
                    const h = Math.max(2, (v / max) * (H - 4));
                    return (
                        <rect
                            key={i}
                            x={i * slot + slot * 0.18}
                            y={H - h}
                            width={slot * 0.64}
                            height={h}
                            rx={1.5}
                            fill={i % 2 === 0 ? stroke : fill}
                        />
                    );
                })}
            </svg>
        );
    }

    const step = values.length > 1 ? W / (values.length - 1) : W;
    const pts = values.map((v, i) => [i * step, H - Math.max(1, (v / max) * (H - 3))]);
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${W},${H} L0,${H} Z`;

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={fill} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0.05} />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gid})`} />
            <path d={line} fill="none" stroke={stroke} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        </svg>
    );
}
