import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { surveys } from '../services/api';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import {
  Plus,
  BarChart3,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import SurveysPage from './Surveys';

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
        // Full list feeds the pipeline chart status breakdown.
        setAllSurveys(Array.isArray(surveyData) ? surveyData : []);
      } catch (err) {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!loading && window.location.hash === '#all-surveys') {
      document.getElementById('all-surveys')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]);

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
      {/* All Surveys Skeleton */}
      <div className="h-[600px] bg-surface/40 border border-primary/15 dark:border-line/10 rounded-[2rem] w-full"></div>
    </div>
  );

  const chartData = stats.engagement_chart;
  const chartMax = Math.max(1, ...chartData.map((d: any) => d.surveys || 0));
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
      <div id="dash-overview" className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
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

      <div id="dash-metrics" className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard title="Total Surveys" value={stats.total_surveys} trend="+12% vs last month" delay={0.1} />
        <MetricCard title="Active Surveys" value={stats.active_surveys} trend="Currently live" delay={0.2} />
        <MetricCard title="Total Responses" value={stats.total_responses.toLocaleString()} trend={`${stats.match_rate}% match rate`} delay={0.3} />
      </div>

      {/* ── The two charts, side by side ── */}
      <div id="dash-charts" className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
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
                  <linearGradient id="barGradLow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E06264" />
                    <stop offset="100%" stopColor="#CD393B" />
                  </linearGradient>
                  <linearGradient id="barGradMid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8ACAEC" />
                    <stop offset="100%" stopColor="#53B5FF" />
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

      {/* All Surveys table */}
      <div id="all-surveys">
        <SurveysPage embedded />
      </div>
    </div>
  );
}

function MetricCard({ title, value, trend, delay = 0 }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`${CARD} rounded-[2rem] p-6 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_20px_45px_-20px_rgba(205,57,59,0.30)] transition-all duration-500 cursor-default group relative overflow-hidden`}
    >
      <div
        className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-2xl opacity-70 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            'radial-gradient(circle, rgba(231,157,158,0.50) 0%, rgba(205,57,59,0.18) 55%, transparent 78%)',
        }}
      />
      <div className="flex flex-col gap-4 relative z-10">
        <div>
          <p className="text-[10px] font-black text-ink-muted uppercase tracking-[0.2em] mb-1">{title}</p>
          <p className="text-4xl font-display font-black text-ink tracking-tight">{value}</p>
          <div className="mt-4 flex items-center gap-2 text-[9px] font-bold text-ink bg-surface-sunken w-fit px-3 py-2 rounded-xl border border-primary/20 dark:border-line/10">
            <span className="uppercase tracking-widest">{trend}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
