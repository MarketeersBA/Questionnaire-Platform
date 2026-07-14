import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { surveys } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Plus,
  Zap,
  CheckCircle2,
  BarChart3,
  Layers,
  TrendingUp,
  ArrowRight,
  FileText
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>({
    total_surveys: 0,
    active_surveys: 0,
    total_responses: 0,
    match_rate: 0,
    engagement_chart: [],
    uptime: '0.0',
    accuracy: 0
  });
  const [recentSurveys, setRecentSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsData, surveyData] = await Promise.all([
          surveys.stats(),
          surveys.list()
        ]);
        setStats(statsData);
        setRecentSurveys(surveyData.slice(0, 4));
      } catch (err) {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-48 bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-slate-800/20 rounded-[2.5rem] w-full"></div>
        ))}
      </div>
      {/* Panels Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-96 bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-slate-800/20 rounded-[2.5rem] w-full"></div>
        <div className="h-96 bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-slate-800/20 rounded-[2.5rem] w-full"></div>
      </div>
    </div>
  );

  const chartData = stats.engagement_chart;

  return (
    <div className="space-y-10 pb-20">
      {/* Hero */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue border border-brand-blue/10 dark:border-brand-blue/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300 font-display">
              Intelligence <span className="text-brand-blue">Hub</span>
            </div>
          </div>
          <h1 className="text-5xl font-display font-black tracking-tight leading-none text-slate-900 dark:text-white">
            Operational <span className="text-slate-600 dark:text-slate-400 font-light italic">Intelligence</span>
          </h1>
          <p className="mt-4 text-slate-800 dark:text-slate-300 max-w-xl font-bold leading-relaxed">
            Real-time diagnostic overview of your research intelligence ecosystem and active deployment performance.
          </p>
        </div>
        <Link
          to="/create-survey"
          className="btn-premium flex items-center justify-center gap-3 group shadow-xl shadow-brand-blue/20 font-black tracking-widest uppercase text-xs self-start xl:self-auto hover:-translate-y-0.5 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
          Create Survey
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <MetricCard title="Total Surveys" value={stats.total_surveys} icon={Layers} trend="+12% vs last month" color="coral" delay={0.1} />
        <MetricCard title="Active Surveys" value={stats.active_surveys} icon={Zap} trend="Currently live" color="cyan" delay={0.2} />
        <MetricCard title="Total Responses" value={stats.total_responses.toLocaleString()} icon={CheckCircle2} trend={`${stats.match_rate}% match rate`} color="grey" delay={0.3} />
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Activity Chart */}
        <div className="bg-white/60 dark:bg-slate-900/50 backdrop-blur-2xl rounded-[2.5rem] p-10 border border-white/50 dark:border-slate-800/50 shadow-premium relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8">
            <div className="w-24 h-24 bg-brand-blue/5 rounded-full blur-3xl group-hover:bg-brand-blue/10 transition-all duration-1000"></div>
          </div>
          <div className="flex items-center justify-between mb-10 relative z-10">
            <div>
              <h3 className="text-2xl font-black font-display text-slate-900 dark:text-white">Engagement Volume</h3>
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest mt-1">Monthly participation metrics</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-brand-blue bg-brand-blue/5 border border-brand-blue/10 px-5 py-2.5 rounded-2xl">
              <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse"></span>
              LIVE SYNC
            </div>
          </div>
          <div className="h-[350px] relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="8 8" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 900 }} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 900 }} />
                <Tooltip
                  cursor={{ fill: 'currentColor', radius: 8 }}
                  content={({ active, payload, label }) => {
                    if (active && payload?.length) {
                      return (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xl">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">{label}</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white">{payload[0].value} <span className="text-slate-400 dark:text-slate-500 font-bold ml-1">Participations</span></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="surveys" fill="url(#barGrad)" radius={[12, 12, 12, 12]} barSize={40} />
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#21A0FF" />
                    <stop offset="100%" stopColor="#08306B" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Campaigns */}
      <div className="bg-white/60 dark:bg-slate-900/50 backdrop-blur-2xl rounded-[2.5rem] border border-white/50 dark:border-slate-800/50 shadow-premium overflow-hidden">
        <div className="p-8 border-b border-white/40 dark:border-slate-800/40 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black font-display text-slate-900 dark:text-white">Recent Surveys</h3>
            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest mt-1">Recent activity</p>
          </div>
          <button
            onClick={() => navigate('/surveys')}
            className="flex items-center gap-2 text-brand-blue font-black text-xs uppercase tracking-widest hover:gap-3 hover:-translate-y-0.5 active:scale-95 transition-all"
          >
            View All <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="divide-y divide-slate-100/50 dark:divide-slate-800/50">
          {recentSurveys.length === 0 ? (
            <div className="py-24 text-center flex flex-col items-center justify-center">
              <div className="relative mb-6 group cursor-default">
                <div className="absolute inset-0 bg-brand-blue/10 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center border border-white/80 shadow-xl relative z-10 group-hover:-translate-y-1 transition-transform duration-500">
                  <FileText className="w-8 h-8 text-slate-300" strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="text-xl font-display font-black text-slate-900 mb-2">No active deployments</h3>
              <p className="text-slate-500 font-medium mb-8 max-w-sm">
                Your research registry is empty. Deploy your first survey to start gathering intelligence.
              </p>
              <Link to="/create-survey" className="btn-premium flex items-center justify-center gap-3 group shadow-xl shadow-brand-blue/20 font-black tracking-widest uppercase text-xs hover:-translate-y-0.5 active:scale-95 transition-all">
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
                Create First Survey
              </Link>
            </div>
          ) : (
            recentSurveys.map((survey, idx) => (
              <motion.div
                key={survey._id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between px-8 py-5 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-100 dark:border-slate-800 group-hover:border-brand-blue/30 group-hover:bg-brand-blue/5 transition-all font-black text-slate-400 group-hover:text-brand-blue text-sm">
                    {survey.company_name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 dark:text-white text-sm group-hover:text-brand-blue transition-colors">{survey.company_name}</p>
                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                      {new Date(survey.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${survey.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50'
                    : survey.status === 'draft' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-700'
                    }`}>
                    {survey.status}
                  </span>
                  <button
                    onClick={() => navigate(`/surveys/${survey._id}`)}
                    className="p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 hover:text-brand-blue hover:bg-white dark:hover:bg-slate-700 active:scale-95 hover:-translate-y-0.5 transition-all border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, trend, color, delay = 0 }: any) {
  const colors: any = {
    coral: 'text-brand-glow bg-brand-glow/5 border-brand-glow/10',
    cyan: 'text-brand-cyan bg-brand-cyan/5 border-brand-cyan/10',
    grey: 'text-brand-grey bg-brand-grey/5 border-brand-grey/10',
    blue: 'text-brand-blue bg-brand-blue/5 border-brand-blue/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white/60 dark:bg-slate-900/50 backdrop-blur-2xl rounded-[2.5rem] p-8 hover:-translate-y-1 hover:shadow-2xl transition-all duration-500 cursor-default group border border-white/50 dark:border-slate-800/50 shadow-premium relative overflow-hidden"
    >
      <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-1000">
        <Icon className="w-40 h-40 rotate-12" />
      </div>
      <div className="flex flex-col gap-6 relative z-10">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${colors[color] || colors.coral} group-hover:scale-110 transition-transform duration-500 shadow-sm`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-[0.2em] mb-1">{title}</p>
          <p className="text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
          <div className="mt-4 flex items-center gap-2 text-[9px] font-bold text-slate-900 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 w-fit px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span className="uppercase tracking-widest">{trend}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
