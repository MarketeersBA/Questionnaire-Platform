

export default function StepItem({ num, title, desc, active }: { num: number; title: string; desc: string; active: boolean }) {
    return (
        <div className={`flex gap-5 p-5 rounded-3xl border transition-all duration-500 ${active ? "bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 shadow-inner" : "glass-panel bg-white/10 dark:bg-white/5 border-white/5 dark:border-slate-800/50 shadow-sm"}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm transition-all duration-500 ${active ? "bg-emerald-600 text-white" : "bg-white/50 dark:bg-slate-800 text-slate-400 dark:text-slate-500"}`}>
                {num}
            </div>
            <div className="space-y-1 transition-colors">
                <p className={`text-[10px] font-black uppercase tracking-widest transition-colors ${active ? "text-emerald-700 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>{title}</p>
                <p className={`text-[10px] font-bold leading-tight transition-colors ${active ? "text-emerald-600/70 dark:text-emerald-500/50" : "text-slate-400 dark:text-slate-600"}`}>{desc}</p>
            </div>
        </div>
    );
}
