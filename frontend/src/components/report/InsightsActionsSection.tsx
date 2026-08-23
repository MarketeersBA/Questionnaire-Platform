import { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, Tooltip,
    PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { Search, Rocket } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { chartChrome } from '../../constants/brandPalette';
import { formatBrandName } from '../../utils/brandName';
import { condenseAll, condense, type CondensedPoint } from '../../utils/condense';

/**
 * Insights & Actions.
 *
 * Two ideas, each stated once and shown once: what the data says, and what to
 * do about it. Text is deliberately thin — three short lines per card — with
 * the evidence carried by charts rather than prose.
 *
 * Performance note: only five Recharts surfaces are mounted here in total.
 * An earlier revision drew a chart per bullet, which put ~17 ResponsiveContainer
 * instances (and their ResizeObservers) on one page and visibly slowed the
 * report. Small decorative marks are plain inline SVG instead.
 */

interface Finding {
    label: string;
    finding: string;
    impact?: string;
}

interface MiniChart {
    key: string;
    title: string;
    caption: string;
    kind: 'bar' | 'donut' | 'radar';
    data: { name: string; value: number }[];
}

const BLUE = '#255E91';
const BLUE_LIGHT = '#21A0FF';
const RED = '#CD393B';
const RED_LIGHT = '#E79D9E';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function findChart(charts: any[], predicate: (c: any) => boolean) {
    return (charts || []).find((c) => {
        try { return predicate(c); } catch { return false; }
    });
}

/** Shorten an attribute name so radar/axis labels stay legible. */
const shortLabel = (s: string, max = 14) =>
    s.length > max ? `${s.slice(0, max - 1)}…` : s;

/** Build the three headline charts from the existing report payload. */
function buildCharts(report: any): MiniChart[] {
    const charts: any[] = report?.charts || [];
    const out: MiniChart[] = [];

    // 1 ── Attribute impact, from the driver ranking.
    const drivers = findChart(charts, (c) => c.chart_type === 'driver_ranking');
    const driverPoints: any[] = drivers?.data?.datasets?.[0]?.data || [];
    if (driverPoints.length) {
        const top = [...driverPoints]
            .sort((a, b) => num(b.x) - num(a.x))
            .slice(0, 5)
            .map((p) => ({
                name: formatBrandName(p.main_attribute || p.attribute || ''),
                value: Math.round(num(p.x)),
            }))
            .filter((d) => d.name);
        if (top.length) {
            out.push({
                key: 'drivers',
                title: 'What drives preference',
                caption: `${top[0].name} carries the most weight`,
                kind: 'bar',
                data: top,
            });
        }
    }

    // 2 ── Preference split, from the comparison chart.
    const pref = findChart(
        charts,
        (c) => c.chart_type === 'horizontal_bar' || c.chart_type === 'preference_bar',
    );
    const labels: string[] = pref?.data?.labels || [];
    const values: number[] = pref?.data?.datasets?.[0]?.data || [];
    if (labels.length && values.length) {
        const data = labels
            .map((l, i) => ({ name: formatBrandName(l), value: Math.round(num(values[i])) }))
            .filter((d) => d.name && d.value > 0);
        if (data.length) {
            const leader = [...data].sort((a, b) => b.value - a.value)[0];
            out.push({
                key: 'preference',
                title: 'Who wins preference',
                caption: `${leader.name} leads at ${leader.value}%`,
                kind: 'donut',
                data,
            });
        }
    }

    // 3 ── Attribute profile as a radar: a shape shows balance across
    //      attributes in a way a ranked bar list cannot.
    const scorecard = findChart(charts, (c) => c.chart_type === 'scorecard');
    const strengths: any[] = scorecard?.data?.strengths || [];
    let radarData = strengths
        .slice(0, 6)
        .map((s) => ({ name: shortLabel(String(s.attribute || '')), value: num(Number(s.score)) }))
        .filter((d) => d.name && d.value > 0);

    // Fall back to driver impact so the radar still renders when no scorecard
    // strengths exist for this study.
    if (radarData.length < 3 && driverPoints.length) {
        radarData = [...driverPoints]
            .sort((a, b) => num(b.x) - num(a.x))
            .slice(0, 6)
            .map((p) => ({
                name: shortLabel(formatBrandName(p.main_attribute || p.attribute || '')),
                value: Math.round(num(p.x)),
            }))
            .filter((d) => d.name && d.value > 0);
    }

    if (radarData.length >= 3) {
        const best = [...radarData].sort((a, b) => b.value - a.value)[0];
        const worst = [...radarData].sort((a, b) => a.value - b.value)[0];
        out.push({
            key: 'profile',
            title: 'Attribute balance',
            caption: `Strongest ${best.name}, weakest ${worst.name}`,
            kind: 'radar',
            data: radarData,
        });
    }

    return out.slice(0, 3);
}

function MiniChartCard({ chart, index }: { chart: MiniChart; index: number }) {
    const { theme } = useTheme();
    const chrome = chartChrome(theme === 'dark');
    const palette = index % 2 === 0 ? [BLUE_LIGHT, BLUE] : [RED_LIGHT, RED];

    const tooltipStyle = {
        borderRadius: 12,
        border: `1px solid ${chrome.tooltipBorder}`,
        backgroundColor: chrome.tooltipBg,
        color: chrome.label,
        fontWeight: 700,
        fontSize: 12,
    };

    return (
        <div className="card-brand rounded-2xl p-5 flex flex-col">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-ink-subtle mb-1">
                {chart.title}
            </p>
            <p className="text-[15px] font-black text-ink mb-3 leading-snug" title={chart.caption}>
                {chart.caption}
            </p>

            <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                    {chart.kind === 'donut' ? (
                        <PieChart>
                            <defs>
                                <linearGradient id={`donut-${chart.key}-0`} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor={BLUE_LIGHT} />
                                    <stop offset="100%" stopColor={BLUE} />
                                </linearGradient>
                                <linearGradient id={`donut-${chart.key}-1`} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor={RED_LIGHT} />
                                    <stop offset="100%" stopColor={RED} />
                                </linearGradient>
                            </defs>
                            <Pie
                                data={chart.data}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="55%"
                                outerRadius="88%"
                                paddingAngle={chart.data.length > 1 ? 3 : 0}
                                strokeWidth={0}
                                isAnimationActive={false}
                            >
                                {chart.data.map((_, i) => (
                                    <Cell key={i} fill={`url(#donut-${chart.key}-${i % 2})`} />
                                ))}
                            </Pie>
                            <Tooltip cursor={false} contentStyle={tooltipStyle} formatter={(v: any) => `${v}%`} />
                        </PieChart>
                    ) : chart.kind === 'radar' ? (
                        <RadarChart data={chart.data} outerRadius="78%">
                            <defs>
                                <linearGradient id={`radar-${chart.key}`} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor={BLUE_LIGHT} stopOpacity={0.75} />
                                    <stop offset="100%" stopColor={RED} stopOpacity={0.55} />
                                </linearGradient>
                            </defs>
                            <PolarGrid stroke={chrome.grid} />
                            <PolarAngleAxis
                                dataKey="name"
                                tick={{ fill: chrome.axis, fontSize: 9, fontWeight: 800 }}
                            />
                            <PolarRadiusAxis tick={false} axisLine={false} />
                            <Radar
                                dataKey="value"
                                stroke={BLUE}
                                strokeWidth={2}
                                fill={`url(#radar-${chart.key})`}
                                isAnimationActive={false}
                            />
                            <Tooltip cursor={false} contentStyle={tooltipStyle} />
                        </RadarChart>
                    ) : (
                        <BarChart data={chart.data} layout="vertical" margin={{ left: 4, right: 12 }}>
                            <defs>
                                <linearGradient id={`mini-${chart.key}`} x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor={palette[0]} />
                                    <stop offset="100%" stopColor={palette[1]} />
                                </linearGradient>
                            </defs>
                            <XAxis type="number" hide />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={94}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: chrome.axis, fontSize: 10, fontWeight: 800 }}
                            />
                            <Tooltip cursor={false} contentStyle={tooltipStyle} />
                            <Bar
                                dataKey="value"
                                radius={[0, 6, 6, 0]}
                                barSize={13}
                                fill={`url(#mini-${chart.key})`}
                                isAnimationActive={false}
                            />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/**
 * A ranked evidence chart for one of the two summary cards.
 *
 * Plain inline SVG: these are simple ranked bars, and mounting two more
 * Recharts surfaces here measurably slowed the page.
 */
function EvidenceBars({
    rows,
    tone,
}: {
    rows: { name: string; value: number }[];
    tone: 'primary' | 'accent';
}) {
    if (!rows.length) return null;
    const max = Math.max(...rows.map((r) => r.value), 1);
    const from = tone === 'accent' ? RED_LIGHT : BLUE_LIGHT;
    const to = tone === 'accent' ? RED : BLUE;
    const gid = `ev-${tone}`;

    return (
        <div className="space-y-2 mb-4">
            <svg width="0" height="0" className="absolute" aria-hidden="true">
                <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={from} />
                        <stop offset="100%" stopColor={to} />
                    </linearGradient>
                </defs>
            </svg>
            {rows.map((r) => (
                <div key={r.name} className="flex items-center gap-3">
                    <span className="text-[12px] font-bold text-ink-muted w-28 shrink-0 truncate" title={r.name}>
                        {r.name}
                    </span>
                    <svg className="flex-1 h-3" preserveAspectRatio="none" viewBox="0 0 100 12">
                        <rect x="0" y="3" width="100" height="6" rx="3" fill="rgb(var(--c-primary) / 0.10)" />
                        <rect
                            x="0" y="3"
                            width={Math.max(2, (r.value / max) * 100)}
                            height="6" rx="3"
                            fill={`url(#${gid})`}
                        />
                    </svg>
                    <span className="text-[12px] font-black text-ink tabular-nums w-10 text-right shrink-0">
                        {Math.round(r.value)}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Two full-sentence points — never truncated, never clamp-ellipsis. */
function PointLines({ points, tone }: { points: CondensedPoint[]; tone: 'primary' | 'accent' }) {
    if (!points.length) {
        return (
            <p className="text-[14px] text-ink-subtle font-medium">
                Not enough narrative in this report to summarise.
            </p>
        );
    }
    const dot = tone === 'accent' ? 'bg-accent' : 'bg-primary';
    return (
        <ul className="space-y-3">
            {points.map((p, i) => (
                <li key={i} className="flex gap-2.5 items-start">
                    <span className={`mt-[0.55em] w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                    <span className="text-[14px] leading-relaxed">
                        {p.label && (
                            <span className="font-black text-ink">{p.label}
                                <span className="text-ink-subtle font-bold"> — </span>
                            </span>
                        )}
                        <span className="text-ink-muted font-medium">{p.detail}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

export function InsightsActionsSection({
    findings = [],
    opportunityInsights = [],
    report,
}: {
    findings?: Finding[];
    opportunityInsights?: any[];
    report: any;
}) {
    const charts = useMemo(() => buildCharts(report), [report]);

    /** Evidence for "what happens": the measured drivers, ranked. */
    const evidenceRows = useMemo(() => {
        const all: any[] = report?.charts || [];
        const drivers = findChart(all, (c) => c.chart_type === 'driver_ranking');
        const points: any[] = drivers?.data?.datasets?.[0]?.data || [];
        return [...points]
            .sort((a, b) => num(b.x) - num(a.x))
            .slice(0, 3)
            .map((p) => ({
                name: formatBrandName(p.main_attribute || p.attribute || ''),
                value: num(p.x),
            }))
            .filter((r) => r.name);
    }, [report]);

    /** Evidence for "what we need": the same attributes by performance gap. */
    const actionRows = useMemo(() => {
        const all: any[] = report?.charts || [];
        const drivers = findChart(all, (c) => c.chart_type === 'driver_ranking');
        const points: any[] = drivers?.data?.datasets?.[0]?.data || [];
        return [...points]
            .filter((p) => typeof p.y === 'number')
            .sort((a, b) => num(a.y) - num(b.y))       // weakest performance first
            .slice(0, 3)
            .map((p) => ({
                name: formatBrandName(p.main_attribute || p.attribute || ''),
                value: num(p.y),
            }))
            .filter((r) => r.name);
    }, [report]);

    const observations = useMemo<CondensedPoint[]>(() => {
        const negativeFirst = [...findings].sort((a, b) => {
            const rank = (f: Finding) => (String(f.impact).toLowerCase() === 'negative' ? 0 : 1);
            return rank(a) - rank(b);
        });
        return negativeFirst
            .flatMap((f) => condenseAll(f.label, f.finding, 1, 30))
            .filter((p) => p.detail)
            .slice(0, 2);  // exactly 2 strong, full-sentence insights
    }, [findings]);

    const actions = useMemo<CondensedPoint[]>(() => {
        const seen = new Set<string>();
        const fromOpportunities: CondensedPoint[] = (opportunityInsights || []).flatMap((o: any) => {
            const acts = Array.isArray(o?.actions) ? o.actions : [];
            return acts
                .slice(0, 1)
                .map((a: any) => ({
                    label: condense(o?.title || '', 8),
                    detail: condense(a?.action || a?.text || a?.description || '', 30),
                }))
                .filter((p: CondensedPoint) => {
                    if (!p.detail || seen.has(p.detail)) return false;
                    seen.add(p.detail);
                    return true;
                });
        });
        if (fromOpportunities.length) return fromOpportunities.slice(0, 2);  // exactly 2 full recommendations

        return findings
            .filter((f) => String(f.impact).toLowerCase() !== 'negative')
            .flatMap((f) => condenseAll(f.label, f.finding, 1, 30))
            .filter((p) => p.detail)
            .slice(0, 2);
    }, [opportunityInsights, findings]);

    if (!observations.length && !actions.length && !charts.length) return null;

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-4 px-2">
                <div
                    className="h-0.5 w-12 rounded-full"
                    style={{ background: 'linear-gradient(90deg, rgb(var(--c-primary)), rgb(var(--c-accent)))' }}
                />
                <h2 className="text-sm font-black text-ink-subtle uppercase tracking-[0.4em]">
                    Insights &amp; Actions
                </h2>
            </div>

            {charts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {charts.map((c, i) => (
                        <MiniChartCard key={c.key} chart={c} index={i} />
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card-brand rounded-2xl p-6">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 grid place-items-center">
                            <Search className="w-4.5 h-4.5 text-primary-soft" />
                        </div>
                        <h3 className="text-[17px] font-black text-ink">What drives preference</h3>
                    </div>
                    <EvidenceBars rows={evidenceRows} tone="primary" />
                    <PointLines points={observations} tone="primary" />
                </div>

                <div className="card-brand rounded-2xl p-6">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-accent/10 grid place-items-center">
                            <Rocket className="w-4.5 h-4.5 text-accent-soft" />
                        </div>
                        <h3 className="text-[17px] font-black text-ink">What to improve</h3>
                    </div>
                    <EvidenceBars rows={actionRows} tone="accent" />
                    <PointLines points={actions} tone="accent" />
                </div>
            </div>
        </div>
    );
}
