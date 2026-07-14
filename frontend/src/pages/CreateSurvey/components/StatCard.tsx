

export default function StatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
    return (
        <div className="p-8 rounded-[2rem] glass-card bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-premium space-y-2 group hover:shadow-premium-blue transition-all duration-500 border border-white/40 dark:border-slate-800/50">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 group-hover:text-brand-blue transition-colors">{label}</p>
            <p className="text-3xl font-display font-black text-slate-900 dark:text-white transition-colors">{value}</p>
            <p className="text-[10px] font-bold text-slate-300 dark:text-slate-700 uppercase tracking-widest transition-colors">{sub}</p>
        </div>
    );
}
