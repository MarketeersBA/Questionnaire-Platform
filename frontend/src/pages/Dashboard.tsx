import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { surveys } from '../services/api';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import {
  Plus,
  Zap,
  CheckCircle2,
  BarChart3,
  Layers,
  TrendingUp,
  ArrowRight,
  FileText,
  Eye,
  EyeClosed
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

/** Shared card chrome — see `.card-brand` in index.css. */
const CARD = 'card-brand';

/** Survey lifecycle states, in pipeline order, with their brand colours. */
const STATUS_META: { key: string; label: string; color: string }[] = [
  { key: 'active', label: 'Active', color: '#21A0FF' },
  { key: 'draft', label: 'Draft', color: '#8ACAEC' },
  { key: 'completed', label: 'Completed', color: '#255E91' },
  { key: 'closed', label: 'Closed', color: '#CD393B' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [stats, setStats] = useState<any>({
    total_surveys: 0,
    active_surveys: 0,
    total_responses: 0,
    match_rate: 0,
    engagement_chart: [],
    uptime: '0.0',
    accuracy: 0
  });
  const [allSurveys, setAllSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsData, surveyData] = await Promise.all([
          surveys.stats(),
          surveys.list()
        ]);
        setStats(statsData);
        // Keep the whole list: the recent panel shows a slice of it, while the
        // pipeline chart needs every survey to break down by status.
        setAllSurveys(Array.isArray(surveyData) ? surveyData : []);
      } catch (err) {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const recentSurveys = useMemo(() => allSurveys.slice(0, 6), [allSurveys]);

  /** Survey counts per lifecycle status, for the pipeline donut. */
  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    allSurveys.forEach((s) => {
      const key = String(s?.status || 'draft').toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const known = STATUS_META
      .map((m) => ({ ...m, value: counts.get(m.key) || 0 }))
      .filter((m) => m.value > 0);

    // Anything the platform starts emitting later still shows up, rather than
    // silently vanishing from the total.
    const otherTotal = Array.from(counts.entries())
      .filter(([k]) => !STATUS_META.some((m) => m.key === k))
      .reduce((sum, [, v]) => sum + v, 0);

    return otherTotal > 0
      ? [...known, { key: 'other', label: 'Other', color: '#94A3B8', value: otherTotal }]
      : known;
  }, [allSurveys]);

  if (loading) return (
    <div className="space-y-10 pb-20 animate-pulse">
      {/* Hero Skeleton */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div className="space-y-4 w-full max-w-xl">
          <div className="h-8 w-32 bg-slate-200/50 dark:bg-slate-800/50 rounded-lg"></div>
          <div className="h-14 w-3/4 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl"></div>
          <div className="h-6 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-lg"></div>
        </div>
        <div className="h-12 w-44 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl"></div>
      </div>
      {/* Metrics Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 bg-surface/40 border border-primary/15 dark:border-line/10 rounded-[2rem] w-full"></div>
        ))}
      </div>
      {/* Panels Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 bg-surface/40 border border-primary/15 dark:border-line/10 rounded-[2rem] w-full"></div>
        <div className="h-96 bg-surface/40 border border-primary/15 dark:border-line/10 rounded-[2rem] w-full"></div>
      </div>
      {/* Recent Skeleton */}
      <div className="h-56 bg-surface/40 border border-primary/15 dark:border-line/10 rounded-[2rem] w-full"></div>
    </div>
  );

  const chartData = stats.engagement_chart;
  const chartMax = Math.max(1, ...chartData.map((d: any) => d.surveys || 0));
  // Sequential (single-hue, magnitude-encoded) gradients — richer for higher
  // months rather than one flat color repeated on every bar. The peak month
  // gets the brand accent as a single focal highlight, not a rainbow of
  // per-bar identity colors.
  const barGradients = ['barGradLow', 'barGradMid', 'barGradHigh'];
  const gradientForValue = (val: number) => {
    const ratio = val / chartMax;
    if (ratio >= 0.66) return barGradients[2];
    if (ratio >= 0.33) return barGradients[1];
    return barGradients[0];
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Hero */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary-soft border border-primary/10 dark:border-primary/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted font-display">
              Intelligence <span className="text-primary-soft">Hub</span>
            </div>
          </div>
          <h1 className="text-5xl font-pangram font-black tracking-tight leading-none text-ink">
            Operational <span className="text-ink-muted font-light italic">Intelligence</span>
          </h1>
          <p className="mt-4 text-slate-800 dark:text-slate-300 max-w-xl font-bold leading-relaxed">
            Real-time diagnostic overview of your research intelligence ecosystem and active deployment performance.
          </p>
        </div>
        <Link
          to="/create-survey"
          className="btn-premium flex items-center justify-center gap-3 group shadow-xl shadow-primary/20 font-black tracking-widest uppercase text-xs self-start xl:self-auto hover:-translate-y-0.5 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
          Create Survey
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard title="Total Surveys" value={stats.total_surveys} icon={Layers} trend="+12% vs last month" color="coral" delay={0.1} />
        <MetricCard title="Active Surveys" value={stats.active_surveys} icon={Zap} trend="Currently live" color="cyan" delay={0.2} />
        <MetricCard title="Total Responses" value={stats.total_responses.toLocaleString()} icon={CheckCircle2} trend={`${stats.match_rate}% match rate`} color="grey" delay={0.3} />
      </div>

      {/* ── The two charts, side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Engagement volume — spans two thirds */}
        <div className={`${CARD} lg:col-span-2 rounded-[2rem] p-8 relative overflow-hidden`}>
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div>
              <h3 className="text-2xl font-black font-display text-ink">Engagement Volume</h3>
              <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-1">Monthly participation metrics</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-primary-soft bg-primary/5 border border-primary/10 px-5 py-2.5 rounded-2xl">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              LIVE SYNC
            </div>
          </div>
          <div className="h-[330px] relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="8 8" stroke="currentColor" className="text-primary/15 dark:text-slate-800" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 900 }} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 900 }} />
                <Tooltip
                  /* No hover plate: the filled cursor rectangle rendered as a dark
                     navy block in dark mode and a white block in light mode, both
                     of which swallowed the bar behind them. */
                  cursor={false}
                  content={({ active, payload, label }) => {
                    if (active && payload?.length) {
                      return (
                        <div className={`${CARD} p-4 rounded-2xl`}>
                          <p className="text-[10px] font-black text-ink-subtle uppercase tracking-widest mb-2 border-b border-primary/15 dark:border-line/10 pb-2">{label}</p>
                          <p className="text-sm font-black text-ink">{payload[0].value} <span className="text-ink-subtle font-bold ml-1">Participations</span></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="surveys" radius={[12, 12, 12, 12]} barSize={40}>
                  {chartData.map((entry: any, index: number) => (
                    <Cell key={index} fill={`url(#${gradientForValue(entry.surveys || 0)})`} />
                  ))}
                </Bar>

                {/* Trend line riding the bar tops, with a point per month. Gives
                    the chart a readable month-over-month shape that a set of
                    detached bars can't show on its own. */}
                <Line
                  type="monotone"
                  dataKey="surveys"
                  stroke={isDark ? '#8ACAEC' : '#255E91'}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={{
                    r: 4.5,
                    fill: isDark ? '#0C1426' : '#FFFFFF',
                    stroke: isDark ? '#8ACAEC' : '#255E91',
                    strokeWidth: 2.5,
                  }}
                  activeDot={{
                    r: 7,
                    fill: '#CD393B',
                    stroke: isDark ? '#0C1426' : '#FFFFFF',
                    strokeWidth: 3,
                  }}
                />
                <defs>
                  {/* Blue-only magnitude ramp — taller months deepen within
                      the brand blue family, no red stop. */}
                  <linearGradient id="barGradLow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8ACAEC" />
                    <stop offset="100%" stopColor="#53B5FF" />
                  </linearGradient>
                  <linearGradient id="barGradMid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#21A0FF" />
                    <stop offset="100%" stopColor="#255E91" />
                  </linearGradient>
                  <linearGradient id="barGradHigh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#21A0FF" />
                    <stop offset="55%" stopColor="#2E7BB8" />
                    <stop offset="100%" stopColor="#255E91" />
                  </linearGradient>
                </defs>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline status — derived from the survey list, so it needs no new
            endpoint, and answers what the metric cards can't: how much of the
            portfolio is still sitting in draft. */}
        <div className={`${CARD} rounded-[2rem] p-7 relative overflow-hidden flex flex-col`}>
          <div className="mb-4">
            <h3 className="text-xl font-black font-display text-ink">Survey Pipeline</h3>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-1">Portfolio by status</p>
          </div>

          {statusBreakdown.length === 0 ? (
            <div className="flex-1 grid place-items-center text-center px-4">
              <p className="text-xs font-bold text-ink-subtle">
                No surveys yet — the pipeline breakdown appears once you create one.
              </p>
            </div>
          ) : (
            <>
              {/* flex-1 so the donut grows into whatever height the taller
                  engagement card sets, instead of leaving a gap below. */}
              <div className="flex-1 min-h-[190px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      dataKey="value"
                      nameKey="label"
                      innerRadius="62%"
                      outerRadius="92%"
                      paddingAngle={statusBreakdown.length > 1 ? 3 : 0}
                      strokeWidth={0}
                    >
                      {statusBreakdown.map((s) => (
                        <Cell key={s.key} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      cursor={false}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d: any = payload[0].payload;
                        return (
                          <div className={`${CARD} px-4 py-3 rounded-xl`}>
                            <p className="text-[10px] font-black text-ink-subtle uppercase tracking-widest mb-1">{d.label}</p>
                            <p className="text-sm font-black text-ink">
                              {d.value} <span className="text-ink-subtle font-bold ml-1">
                                {d.value === 1 ? 'Survey' : 'Surveys'}
                              </span>
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Total, centred in the donut hole */}
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-3xl font-display font-black text-ink leading-none">{allSurveys.length}</p>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle mt-1">Total</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {statusBreakdown.map((s) => {
                  const pct = allSurveys.length ? Math.round((s.value / allSurveys.length) * 100) : 0;
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider flex-1 truncate">
                        {s.label}
                      </span>
                      <span className="text-[11px] font-black text-ink tabular-nums">{s.value}</span>
                      <span className="text-[10px] font-bold text-ink-subtle tabular-nums w-9 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Recent surveys — full width, one row per survey ──
          The horizontal middle of each row carries a "reached" meter
          (respondent_count against sample_capacity), which both fills the space
          a full-width list would otherwise waste and answers the question the
          list previously begged: how far along is each survey? */}
      <div className={`${CARD} rounded-[2rem] overflow-hidden`}>
        <div className="px-6 py-5 border-b border-primary/15 dark:border-line/10 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black font-display text-ink">Recent Surveys</h3>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Recent activity</p>
          </div>
          <button
            onClick={() => navigate('/surveys')}
            className="flex items-center gap-2 text-primary-soft font-black text-xs uppercase tracking-widest hover:gap-3 hover:-translate-y-0.5 active:scale-95 transition-all"
          >
            View All <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {recentSurveys.length === 0 ? (
          <div className="py-14 text-center flex flex-col items-center justify-center px-6">
            <div className="relative mb-5 group cursor-default">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center border border-primary/20 shadow-lg relative z-10 group-hover:-translate-y-1 transition-transform duration-500">
                <FileText className="w-7 h-7 text-ink-subtle" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-lg font-display font-black text-ink mb-1.5">No active deployments</h3>
            <p className="text-ink-muted text-sm font-medium mb-6 max-w-sm">
              Your research registry is empty. Deploy your first survey to start gathering intelligence.
            </p>
            <Link to="/create-survey" className="btn-premium flex items-center justify-center gap-3 group shadow-xl shadow-primary/20 font-black tracking-widest uppercase text-xs hover:-translate-y-0.5 active:scale-95 transition-all">
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
              Create First Survey
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-primary/10 dark:divide-line/5">
            {recentSurveys.map((survey, idx) => (
              <motion.div
                key={survey._id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                onClick={() => navigate(`/surveys/${survey._id}/responses`)}
                className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-primary/[0.05] transition-colors group"
              >
                <div className="w-11 h-11 shrink-0 bg-surface rounded-xl flex items-center justify-center border border-primary/20 dark:border-line/10 group-hover:border-primary/40 group-hover:bg-primary/10 transition-all font-black text-ink-subtle group-hover:text-primary-soft text-base">
                  {String(survey.company_name || '?').charAt(0)}
                </div>

                <div className="min-w-0 w-[13rem] shrink-0">
                  <p className="font-black text-ink text-[17px] leading-tight truncate group-hover:text-primary-soft transition-colors">
                    {survey.company_name}
                  </p>
                  <p className="text-[11px] font-bold text-ink-subtle uppercase tracking-widest mt-1">
                    {new Date(survey.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>

                {/* Fills the middle of the row */}
                <ReachMeter
                  reached={Number(survey.respondent_count) || 0}
                  target={Number(survey.sample_capacity) || 0}
                />

                <span className={`shrink-0 inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${survey.status === 'active'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                  : survey.status === 'draft'
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50'
                    : 'bg-surface-sunken text-ink-subtle border border-primary/15 dark:border-line/10'
                  }`}>
                  {survey.status}
                </span>

                <RevealEyeButton
                  label={`View responses for ${survey.company_name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/surveys/${survey._id}/responses`);
                  }}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Per-survey completion meter: responses collected against the configured
 * sample capacity. Both values come straight off the survey document
 * (`respondent_count` / `sample_capacity`), so no extra request is needed.
 *
 * Surveys with no capacity configured show the raw response count instead of a
 * bar — a percentage of an unknown target would be invented, not measured.
 */
function ReachMeter({ reached, target }: { reached: number; target: number }) {
  const hasTarget = target > 0;
  const pct = hasTarget ? Math.min(100, Math.round((reached / target) * 100)) : 0;
  const met = hasTarget && reached >= target;

  return (
    <div className="hidden md:flex flex-1 justify-center min-w-0">
      <div className="w-44 max-w-full">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-ink-subtle shrink-0">
          {met ? 'Met' : 'Reached'}
        </span>
        <span className="text-[10px] font-black text-ink tabular-nums truncate">
          {reached.toLocaleString()}
          {hasTarget && (
            <>
              <span className="text-ink-subtle font-bold"> / {target.toLocaleString()}</span>
              <span className={`ml-2 ${met ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-subtle'}`}>
                {pct}%
              </span>
            </>
          )}
          {!hasTarget && <span className="text-ink-subtle font-bold ml-1.5">responses</span>}
        </span>
      </div>

      {hasTarget ? (
        <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden border border-primary/10 dark:border-line/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full"
            style={{
              background: met
                ? '#2E7D32'
                : 'linear-gradient(90deg, #21A0FF 0%, #255E91 70%, #CD393B 140%)',
            }}
          />
        </div>
      ) : (
        <div className="h-1.5 rounded-full bg-surface-sunken border border-dashed border-primary/20 dark:border-line/10" />
        )}
      </div>
    </div>
  );
}

/**
 * "View responses" control.
 *
 * Rests as a closed, lashed eye and opens when the row is hovered or the button
 * itself is focused — the affordance reads as "reveal this survey". Both icons
 * are stacked and cross-faded so the button never changes size mid-transition.
 */
function RevealEyeButton({
  onClick,
  label,
}: {
  onClick: (e: React.MouseEvent) => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title="View responses"
      aria-label={label}
      className="relative shrink-0 w-10 h-10 grid place-items-center rounded-xl bg-surface-raised/80 border border-primary/20 dark:border-line/10 text-ink-subtle shadow-sm transition-all hover:bg-primary/10 hover:border-primary/45 hover:text-primary-soft hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <EyeClosed
        className="w-5 h-5 absolute opacity-100 scale-100 transition-all duration-300 group-hover:opacity-0 group-hover:scale-75 group-focus-within:opacity-0"
        strokeWidth={2.2}
      />
      <Eye
        className="w-5 h-5 absolute opacity-0 scale-75 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100"
        strokeWidth={2.2}
      />
    </button>
  );
}

function MetricCard({ title, value, icon: Icon, trend, color, delay = 0 }: any) {
  const colors: any = {
    coral: 'text-brand-glow bg-brand-glow/5 border-brand-glow/10',
    cyan: 'text-brand-cyan bg-brand-cyan/5 border-brand-cyan/10',
    grey: 'text-brand-grey bg-brand-grey/5 border-brand-grey/10',
    blue: 'text-primary-soft bg-primary/5 border-primary/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`${CARD} rounded-[2rem] p-6 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_20px_45px_-20px_rgba(205,57,59,0.30)] transition-all duration-500 cursor-default group relative overflow-hidden`}
    >
      {/* Top-right graphic sitting in a soft red bloom; the drop-shadow is
          what lifts it off the card instead of reading as a flat watermark. */}
      <div
        className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-2xl opacity-70 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            'radial-gradient(circle, rgba(231,157,158,0.50) 0%, rgba(205,57,59,0.18) 55%, transparent 78%)',
        }}
      />
      <Icon
        className="pointer-events-none absolute -top-3 -right-3 w-28 h-28 rotate-12 text-accent/[0.18] group-hover:text-accent/[0.28] transition-colors duration-500"
        style={{ filter: 'drop-shadow(0 10px 22px rgba(205,57,59,0.32))' }}
        strokeWidth={1.5}
      />
      <div className="flex flex-col gap-4 relative z-10">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${colors[color] || colors.coral} group-hover:scale-110 transition-transform duration-500 shadow-sm`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[10px] font-black text-ink-muted uppercase tracking-[0.2em] mb-1">{title}</p>
          <p className="text-4xl font-display font-black text-ink tracking-tight">{value}</p>
          <div className="mt-4 flex items-center gap-2 text-[9px] font-bold text-ink bg-surface-sunken w-fit px-3 py-2 rounded-xl border border-primary/20 dark:border-line/10">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span className="uppercase tracking-widest">{trend}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
