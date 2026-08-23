import { useMemo, useState } from 'react';
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { X, ChevronRight, MousePointerClick } from 'lucide-react';
import { seriesColor, seriesShape, chartChrome } from '../../constants/brandPalette';
import {
    normKey,
    resolveMainKey,
    countSubAttributes,
    collectSubScatterMainKeys,
    buildGroups,
    padDomain,
    type AttrGroup,
} from './keyPreferenceDriversLogic';

/* ─────────────────────────────────────────────────────────────────────────
 *  Key Preference Drivers
 *
 *  Mirrors the legacy Marketeers deck layout: every attribute is drawn as a
 *  vertical box spanning the evaluation range of all brands at that
 *  attribute's importance, with one marker per brand inside the box. Clicking
 *  a main attribute opens a second panel to its right containing the same
 *  treatment applied to that attribute's sub-attributes — the "zoom" callout
 *  from the original slide.
 * ──────────────────────────────────────────────────────────────────────── */

/* ─── Marker shapes ─── */
function MarkerPath({ shape, cx, cy, fill, size = 6 }: {
    shape: string; cx: number; cy: number; fill: string; size?: number;
}) {
    const common = { fill, stroke: fill, strokeWidth: 1.5 };
    switch (shape) {
        case 'square':
            return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} {...common} />;
        case 'triangle':
            return <polygon points={`${cx},${cy - size * 1.15} ${cx - size},${cy + size * 0.85} ${cx + size},${cy + size * 0.85}`} {...common} />;
        case 'diamond':
            return <polygon points={`${cx},${cy - size * 1.25} ${cx + size},${cy} ${cx},${cy + size * 1.25} ${cx - size},${cy}`} {...common} />;
        case 'star': {
            const pts = Array.from({ length: 10 }, (_, i) => {
                const r = i % 2 === 0 ? size * 1.25 : size * 0.55;
                const a = (Math.PI / 5) * i - Math.PI / 2;
                return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
            }).join(' ');
            return <polygon points={pts} {...common} />;
        }
        case 'cross':
            return (
                <g {...common}>
                    <rect x={cx - size} y={cy - size / 3} width={size * 2} height={size / 1.5} />
                    <rect x={cx - size / 3} y={cy - size} width={size / 1.5} height={size * 2} />
                </g>
            );
        default:
            return <circle cx={cx} cy={cy} r={size} {...common} />;
    }
}

/* ─── Tooltip ─── */
const DriverTooltip = ({ active, payload, isDark }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const chrome = chartChrome(isDark);

    return (
        <div
            className="px-4 py-3 rounded-xl shadow-2xl min-w-[190px] border"
            style={{
                background: chrome.tooltipBg,
                borderColor: chrome.tooltipBorder,
                borderLeftColor: d._color,
                borderLeftWidth: 3,
            }}
        >
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-0.5">{d._brand}</p>
            <p className="font-black text-sm text-ink mb-2.5">{d._label}</p>
            <div className="space-y-1.5">
                <div className="flex justify-between items-center gap-6">
                    <span className="text-slate-400 text-[9px] font-black uppercase tracking-wider">Importance</span>
                    <span className="font-mono text-xs font-black" style={{ color: chartChrome(isDark).label }}>
                        {d.x.toFixed(3)}
                    </span>
                </div>
                <div className="flex justify-between items-center gap-6">
                    <span className="text-slate-400 text-[9px] font-black uppercase tracking-wider">Avg. Evaluation</span>
                    <span className="font-mono text-xs font-black" style={{ color: d._color }}>
                        {d.y.toFixed(1)}
                    </span>
                </div>
            </div>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────────────── */

export function KeyPreferenceDriversChart({ data, brands, isFocusMode, presentationHeight }: any) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const chrome = chartChrome(isDark);
    const [selected, setSelected] = useState<string | null>(null);

    const brandOrder: string[] = useMemo(() => {
        if (Array.isArray(brands) && brands.length) return brands;
        const found = new Set<string>();
        [data?.main_scatter?.datasets, data?.sub_scatter?.datasets].forEach((dss: any) =>
            (dss || []).forEach((ds: any) => ds?.brand && found.add(ds.brand)),
        );
        return Array.from(found);
    }, [brands, data]);

    /* Sub-attribute count per main attribute, from the report's attribute config. */
    const subCounts = useMemo(() => countSubAttributes(data), [data]);

    /** Every main-attribute key that actually appears in the sub-scatter. */
    const subScatterMainKeys = useMemo(() => collectSubScatterMainKeys(data), [data]);

    const mainGroups = useMemo(
        () => buildGroups(data?.main_scatter?.datasets, brandOrder, {
            labelOf: (pt) => pt.attribute,
            keyOf: (pt) => pt.main_key || normKey(pt.attribute),
            subCountOf: (key) => {
                const resolved = resolveMainKey(key, subScatterMainKeys);
                return (resolved && subCounts.get(resolved)) || subCounts.get(key) || 0;
            },
        }),
        [data, brandOrder, subCounts, subScatterMainKeys],
    );

    const subGroups = useMemo(() => {
        if (!selected) return [];
        // Resolve across vocabularies before filtering, so pre-existing reports
        // drill down rather than returning an empty panel.
        const target = resolveMainKey(selected, subScatterMainKeys) ?? selected;
        return buildGroups(data?.sub_scatter?.datasets, brandOrder, {
            filter: (pt) => {
                const key = pt.main_key || normKey(pt.main_attribute || '');
                if (key !== target) return false;
                // Flat attributes echo their own name — not a real breakdown.
                return pt.is_distinct !== false
                    && normKey(pt.sub_attribute || '') !== normKey(pt.main_attribute || '');
            },
            labelOf: (pt) => pt.sub_attribute || pt.attribute,
            keyOf: (pt) => pt.sub_key || normKey(pt.sub_attribute || pt.attribute),
        });
    }, [data, brandOrder, selected, subScatterMainKeys]);

    const selectedGroup = mainGroups.find((g) => g.key === selected) || null;

    /** Single entry point for selection, shared by markers, boxes and chips. */
    const toggleSelect = (key: string) => {
        if (!key) return;
        setSelected((prev) => (prev === key ? null : key));
    };

    if (!mainGroups.length) {
        return <div className="text-slate-500 text-center py-20">No key driver data available.</div>;
    }

    const chartHeight = isFocusMode ? (presentationHeight || 520) : 480;

    /* ─── One panel ─── */
    const renderPanel = (groups: AttrGroup[], interactive: boolean, tone: 'base' | 'zoom') => {
        const xs = groups.map((g) => g.x);
        const ys = groups.flatMap((g) => [g.minY, g.maxY]);
        const [x0, x1] = padDomain(xs, 0.18, true);
        const [y0, y1] = padDomain(ys, 0.18);

        const avgX = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
        const avgY = ys.reduce((a, b) => a + b, 0) / (ys.length || 1);
        const boxHalf = Math.max((x1 - x0) * 0.014, 1e-6);
        const yPad = (y1 - y0) * 0.035;

        /* One flat series so every marker shares a tooltip/scale. */
        const points = groups.flatMap((g) =>
            g.marks.map((m) => ({
                x: g.x,
                y: m.y,
                _label: g.label,
                _brand: m.brand,
                _key: g.key,
                _color: seriesColor(m.brandIndex, isDark),
                _shape: seriesShape(m.brandIndex),
            })),
        );

        return (
            <ResponsiveContainer width="100%" height={chartHeight}>
                <ScatterChart margin={{ top: 34, right: 26, left: 10, bottom: 46 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={chrome.grid} />

                    <XAxis
                        type="number" dataKey="x" name="Importance" domain={[x0, x1]}
                        tick={{ fill: chrome.axis, fontSize: 10, fontWeight: 700 }}
                        axisLine={{ stroke: chrome.axis }} tickLine={false}
                        tickFormatter={(v: number) => v.toFixed(2)}
                        label={{
                            value: 'Importance*', position: 'bottom', offset: 24,
                            fill: chrome.label, fontSize: 11, fontWeight: 700, fontStyle: 'italic',
                        }}
                    />
                    <YAxis
                        type="number" dataKey="y" name="Average Evaluation" domain={[y0, y1]}
                        tick={{ fill: chrome.axis, fontSize: 10, fontWeight: 700 }}
                        axisLine={{ stroke: chrome.axis }} tickLine={false}
                        tickFormatter={(v: number) => v.toFixed(0)}
                        label={{
                            value: 'Average Evaluation', angle: -90,
                            position: 'insideLeft', offset: 4,
                            fill: chrome.label, fontSize: 11, fontWeight: 700,
                        }}
                    />

                    <Tooltip
                        content={<DriverTooltip isDark={isDark} />}
                        cursor={{ strokeDasharray: '3 3', stroke: chrome.refLine }}
                    />

                    {/* Quadrant crosshair at the panel means */}
                    <ReferenceLine x={avgX} stroke={chrome.refLine} strokeDasharray="6 4" />
                    <ReferenceLine y={avgY} stroke={chrome.refLine} strokeDasharray="6 4" />

                    {/* One box per attribute, spanning the brand spread */}
                    {groups.map((g) => {
                        const active = interactive && g.key === selected;
                        const stroke = active
                            ? seriesColor(0, isDark)
                            : (isDark ? 'rgba(148,163,184,0.55)' : 'rgba(51,65,85,0.55)');
                        return (
                            <ReferenceArea
                                key={g.key}
                                x1={g.x - boxHalf} x2={g.x + boxHalf}
                                y1={g.minY - yPad} y2={g.maxY + yPad}
                                stroke={stroke}
                                strokeWidth={active ? 2 : 1}
                                fill={active ? seriesColor(0, isDark) : chrome.quadrantFill}
                                fillOpacity={active ? 0.1 : 1}
                                ifOverflow="extendDomain"
                                label={{
                                    value: g.label,
                                    position: 'top',
                                    fill: active ? seriesColor(0, isDark) : chrome.label,
                                    fontSize: 10,
                                    fontWeight: 800,
                                }}
                            />
                        );
                    })}

                    <Scatter
                        data={points}
                        isAnimationActive={false}
                        className={interactive ? 'cursor-pointer' : undefined}
                        /* Recharts hands the datum through in different shapes
                           depending on version, so read both spellings. */
                        onClick={(p: any) => {
                            const key = p?._key ?? p?.payload?._key;
                            if (interactive && key) toggleSelect(key);
                        }}
                        shape={(props: any) => {
                            const { cx, cy, payload } = props;
                            if (cx == null || cy == null) return <g />;
                            const dim = interactive && selected && payload._key !== selected;
                            return (
                                <g
                                    opacity={dim ? 0.28 : 1}
                                    style={{
                                        transition: 'opacity .25s',
                                        cursor: interactive ? 'pointer' : 'default',
                                    }}
                                    onClick={(e) => {
                                        if (!interactive) return;
                                        // The marker owns the click directly, so
                                        // selection never depends on Recharts
                                        // event plumbing reaching the Scatter.
                                        e.stopPropagation();
                                        toggleSelect(payload._key);
                                    }}
                                >
                                    {/* Invisible, generous hit target: a 6px glyph
                                        is far too small to click reliably. */}
                                    {interactive && (
                                        <circle cx={cx} cy={cy} r={15} fill="transparent" />
                                    )}
                                    <MarkerPath
                                        shape={payload._shape}
                                        cx={cx} cy={cy}
                                        fill={payload._color}
                                        size={tone === 'zoom' ? 6 : 5.5}
                                    />
                                </g>
                            );
                        }}
                    />
                </ScatterChart>
            </ResponsiveContainer>
        );
    };

    /* ─── Shared legend ─── */
    const legend = (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-1">
            {brandOrder.map((b, i) => (
                <div key={b} className="flex items-center gap-2">
                    <svg width={16} height={16} viewBox="0 0 16 16" className="shrink-0">
                        <MarkerPath shape={seriesShape(i)} cx={8} cy={8} fill={seriesColor(i, isDark)} size={5.5} />
                    </svg>
                    <span className="text-[11px] font-bold text-ink-muted">{b}</span>
                </div>
            ))}
        </div>
    );

    /* ─── Attribute selector ───
       Clicking a 6px marker inside a chart is a poor primary affordance and
       gives the user no way to tell which attributes can even be expanded.
       These chips are the explicit control: every driver is listed, ones with a
       real breakdown are badged with their sub-attribute count, and flat ones
       are visibly disabled instead of silently doing nothing when clicked. */
    const selector = (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle mr-1">
                Drill into
            </span>
            {mainGroups.map((g) => {
                const isActive = g.key === selected;
                const expandable = g.subCount > 0;
                return (
                    <button
                        key={g.key}
                        onClick={() => expandable && toggleSelect(g.key)}
                        disabled={!expandable}
                        title={expandable
                            ? `${g.label} — ${g.subCount} sub-attribute${g.subCount === 1 ? '' : 's'}`
                            : `${g.label} has no sub-attributes in this survey`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all
                            ${isActive
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : expandable
                                    ? 'bg-surface text-ink-muted border-primary/25 hover:border-primary/60 hover:text-primary-soft hover:-translate-y-px'
                                    : 'bg-surface-sunken text-ink-subtle/60 border-transparent cursor-not-allowed'}`}
                    >
                        {g.label}
                        {expandable && (
                            <span className={`min-w-[14px] h-[14px] px-1 rounded-full text-[8px] grid place-items-center
                                ${isActive ? 'bg-white/25' : 'bg-primary/15 text-primary-soft'}`}>
                                {g.subCount}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );

    const panelShell = isDark
        ? 'bg-white/[0.03] border-white/10'
        : 'bg-slate-50/80 border-slate-200';
    const zoomShell = isDark
        ? 'bg-[#255E91]/[0.10] border-[#4E9BD6]/30'
        : 'bg-[#8ACAEC]/20 border-[#255E91]/25';

    return (
        <div className="w-full flex flex-col">
            {legend}
            {selector}

            <div className="w-full flex items-stretch gap-3">
                {/* ── Main attributes ── */}
                <motion.div
                    layout
                    animate={{ width: selectedGroup ? '56%' : '100%' }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={`rounded-2xl border p-3 ${panelShell}`}
                >
                    <div className="flex items-center justify-between px-3 pt-1 pb-2">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-yellow/25 text-slate-700 dark:text-brand-yellow border border-brand-yellow/40">
                            Overall Likeness
                            <span className="font-semibold opacity-70"> · Dependent Variable</span>
                        </span>
                        {!selectedGroup && (
                            <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                                <MousePointerClick className="w-3 h-3" />
                                Click an attribute to expand
                            </span>
                        )}
                    </div>
                    {renderPanel(mainGroups, true, 'base')}
                </motion.div>

                {/* ── Sub-attribute zoom ── */}
                <AnimatePresence>
                    {selectedGroup && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: '44%', opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className={`relative rounded-2xl border p-3 overflow-hidden ${zoomShell}`}
                        >
                            {/* Callout connector back to the parent box */}
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10">
                                <div className="w-6 h-6 rounded-full bg-primary text-white grid place-items-center shadow-lg">
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </div>
                            </div>

                            <div className="flex items-start justify-between px-3 pt-1 pb-2 gap-2">
                                <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-yellow/25 text-slate-700 dark:text-brand-yellow border border-brand-yellow/40">
                                    {selectedGroup.label}
                                    <span className="font-semibold opacity-70"> · Dependent Variable</span>
                                </span>
                                <button
                                    onClick={() => setSelected(null)}
                                    aria-label="Close sub-attribute breakdown"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-accent-soft hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {subGroups.length ? (
                                renderPanel(subGroups, false, 'zoom')
                            ) : (
                                <div
                                    className="flex flex-col items-center justify-center gap-2 text-center px-6"
                                    style={{ height: chartHeight }}
                                >
                                    <p className="text-sm font-bold text-ink-muted">
                                        No sub-attributes for “{selectedGroup.label}”
                                    </p>
                                    <p className="text-xs text-slate-500 max-w-[240px]">
                                        This survey measured {selectedGroup.label} as a single attribute, with no
                                        finer breakdown defined in its attribute configuration.
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 px-1">
                <p className="text-[10px] italic text-ink-subtle">
                    * Importance was derived using regression equation · evaluation shown as top-2-box %
                </p>
                {mainGroups.some((g) => g.subCount > 0) && (
                    <p className="text-[10px] font-semibold text-ink-subtle">
                        {mainGroups.filter((g) => g.subCount > 0).length} of {mainGroups.length} attributes expandable
                    </p>
                )}
            </div>
        </div>
    );
}
