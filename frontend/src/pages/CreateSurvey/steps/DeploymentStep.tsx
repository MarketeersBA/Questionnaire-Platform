import { ShieldCheck, AlertCircle, Clock, Timer, Activity, Zap, Ban, Mic } from 'lucide-react';
import { StepProps } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_VOICE_CAPTURE } from '../types';

export function DeploymentStep({ formData, setFormData }: StepProps) {
    const qc = formData.quality_control || {
        is_enabled: false,
        min_time_seconds: 60,
        max_time_seconds: 1200,
        min_time_message_en: "You weren't focused on the survey",
        min_time_message_ar: "لم تكن مركزاً في الاستبيان",
        max_time_message_en: "Out of time",
        max_time_message_ar: "انتهى الوقت المسموح"
    };

    const secondsToMinutes = (seconds: number) => Math.round(seconds / 60);
    const minutesToSeconds = (minutes: number) => Math.max(0, minutes) * 60;

    const updateQC = (updates: Partial<typeof qc>) => {
        setFormData(prev => ({
            ...prev,
            quality_control: { ...qc, ...updates }
        }));
    };

    const voice = formData.voice_capture || DEFAULT_VOICE_CAPTURE;

    const updateVoice = (updates: Partial<typeof voice>) => {
        setFormData(prev => ({
            ...prev,
            voice_capture: { ...voice, ...updates }
        }));
    };

    const toggleVoice = (enabled: boolean) => {
        updateVoice({
            is_enabled: enabled,
            mode: enabled ? 'text_and_voice' : 'text_only',
            ai_analysis_enabled: enabled ? voice.ai_analysis_enabled : false,
        });
    };

    return (
        <div className="space-y-10 text-left animate-slide-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 relative z-10">
                <div className="flex items-center gap-4 transition-colors">
                    <div className="p-4 rounded-2xl bg-brand-blue/10 text-brand-blue shadow-inner">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-display font-black text-slate-900 dark:text-white line-height-tight transition-colors">Quality <span className="text-brand-blue">Control</span></h3>
                        <p className="text-[10px] text-slate-900 dark:text-slate-100 font-black uppercase tracking-widest transition-colors leading-relaxed">Enforcement & Reliability Nodes</p>
                    </div>
                </div>
            </div>

            {/* Survey Quality Control Module */}
            <section className="animate-slide-up">
                <div className="glass-card bg-slate-50/50 dark:bg-slate-950/40 backdrop-blur-xl rounded-[3rem] border-2 border-slate-200 dark:border-slate-800 overflow-hidden transition-all shadow-premium">
                    {/* Header */}
                    <div className="p-10 border-b-2 border-slate-200 dark:border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/50 dark:bg-slate-900/30">
                        <div className="flex items-center gap-5">
                            <div className={`p-4 rounded-2xl transition-all shadow-lg ${qc.is_enabled ? 'bg-brand-blue text-white shadow-brand-blue/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
                                <Activity className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="text-xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight">Survey Quality Control</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic opacity-80">Enforce performance nodes to ensure respondent cognitive focus.</p>
                            </div>
                        </div>

                        <button
                            onClick={() => updateQC({ is_enabled: !qc.is_enabled })}
                            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${qc.is_enabled
                                ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 hover:scale-[1.02]'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-2 border-slate-300 dark:border-slate-700'
                                }`}
                        >
                            <Zap className={`w-3.5 h-3.5 ${qc.is_enabled ? 'animate-pulse' : ''}`} />
                            {qc.is_enabled ? 'Logic Node Active' : 'Enable QC Engine'}
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        {qc.is_enabled && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.4, ease: "circOut" }}
                            >
                                <div className="p-10 space-y-12">
                                    {/* Time Constraints Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                        {/* Min Time */}
                                        <div className="space-y-6 group">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-3.5 h-3.5 text-brand-blue" />
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">Minimum Duration</label>
                                                </div>
                                                <span className="text-[10px] font-black text-brand-blue bg-brand-blue/10 px-3 py-1 rounded-full uppercase">Cognitive Guard</span>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={secondsToMinutes(qc.min_time_seconds)}
                                                    onChange={e => updateQC({ min_time_seconds: minutesToSeconds(parseInt(e.target.value, 10) || 0) })}
                                                    className="w-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 focus:border-brand-blue rounded-2xl px-6 py-5 text-slate-900 dark:text-white font-black text-lg outline-none transition-all shadow-sm group-hover:border-slate-400 dark:group-hover:border-slate-600"
                                                />
                                                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest pointer-events-none">Minutes</div>
                                            </div>
                                            <div className="p-5 rounded-2xl bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
                                                <div className="flex items-center gap-2 text-[9px] font-black text-rose-500 uppercase tracking-widest">
                                                    <Ban className="w-3 h-3" /> Rejection Payload (Before Min)
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase w-4">EN</span>
                                                        <input
                                                            value={qc.min_time_message_en}
                                                            onChange={e => updateQC({ min_time_message_en: e.target.value })}
                                                            className="flex-1 bg-transparent border-none outline-none text-[11px] font-bold text-slate-600 dark:text-slate-300 italic"
                                                            placeholder="English message..."
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase w-4 text-right">AR</span>
                                                        <input
                                                            dir="rtl"
                                                            value={qc.min_time_message_ar}
                                                            onChange={e => updateQC({ min_time_message_ar: e.target.value })}
                                                            className="flex-1 bg-transparent border-none outline-none text-[11px] font-bold text-slate-600 dark:text-slate-300 italic text-right font-arabic"
                                                            placeholder="Arabic message..."
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Max Time */}
                                        <div className="space-y-6 group">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="flex items-center gap-2">
                                                    <Timer className="w-3.5 h-3.5 text-brand-cyan" />
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">Maximum Duration</label>
                                                </div>
                                                <span className="text-[10px] font-black text-brand-cyan bg-brand-cyan/10 px-3 py-1 rounded-full uppercase">Runtime Limit</span>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={secondsToMinutes(qc.max_time_seconds)}
                                                    onChange={e => updateQC({ max_time_seconds: minutesToSeconds(parseInt(e.target.value, 10) || 0) })}
                                                    className="w-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 focus:border-brand-cyan rounded-2xl px-6 py-5 text-slate-900 dark:text-white font-black text-lg outline-none transition-all shadow-sm group-hover:border-slate-400 dark:group-hover:border-slate-600"
                                                />
                                                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest pointer-events-none">Minutes</div>
                                            </div>
                                            <div className="p-5 rounded-2xl bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
                                                <div className="flex items-center gap-2 text-[9px] font-black text-amber-500 uppercase tracking-widest">
                                                    <AlertCircle className="w-3 h-3" /> Rejection Payload (After Max)
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase w-4">EN</span>
                                                        <input
                                                            value={qc.max_time_message_en}
                                                            onChange={e => updateQC({ max_time_message_en: e.target.value })}
                                                            className="flex-1 bg-transparent border-none outline-none text-[11px] font-bold text-slate-600 dark:text-slate-300 italic"
                                                            placeholder="English message..."
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase w-4 text-right">AR</span>
                                                        <input
                                                            dir="rtl"
                                                            value={qc.max_time_message_ar}
                                                            onChange={e => updateQC({ max_time_message_ar: e.target.value })}
                                                            className="flex-1 bg-transparent border-none outline-none text-[11px] font-bold text-slate-600 dark:text-slate-300 italic text-right font-arabic"
                                                            placeholder="Arabic message..."
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* System Blueprint Notice */}
                                    <div className="flex items-center gap-4 p-6 bg-blue-50 dark:bg-blue-500/10 border-2 border-blue-500/20 rounded-3xl animate-pulse-subtle">
                                        <div className="p-3 rounded-xl bg-blue-500 text-white shadow-lg">
                                            <ShieldCheck className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-blue-900 dark:text-blue-200 uppercase tracking-widest">Automatic Enforcement Node</p>
                                            <p className="text-[9px] text-blue-700 dark:text-blue-400 font-bold mt-0.5">The backend protocol will automatically nullify any results outside these variance nodes upon webhooks receipt.</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </section>

            <section className="animate-slide-up">
                <div className="glass-card bg-slate-50/50 dark:bg-slate-950/40 backdrop-blur-xl rounded-[3rem] border-2 border-slate-200 dark:border-slate-800 overflow-hidden transition-all shadow-premium">
                    <div className="p-10 border-b-2 border-slate-200 dark:border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/50 dark:bg-slate-900/30">
                        <div className="flex items-center gap-5">
                            <div className={`p-4 rounded-2xl transition-all shadow-lg ${voice.is_enabled ? 'bg-indigo-600 text-white shadow-indigo-600/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
                                <Mic className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="text-xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight">AI Voice Analysis</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic opacity-80">
                                    After Taste open-ended brand questions — text plus optional voice recording.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleVoice(!voice.is_enabled)}
                            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${voice.is_enabled
                                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 hover:scale-[1.02]'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-2 border-slate-300 dark:border-slate-700'
                                }`}
                        >
                            <Mic className="w-3.5 h-3.5" />
                            {voice.is_enabled ? 'Voice Enabled' : 'Enable Voice Capture'}
                        </button>
                    </div>
                    <AnimatePresence mode="wait">
                        {voice.is_enabled && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                                <div className="p-10 space-y-8">
                                    <div className="p-6 rounded-3xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                                        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                                            Respondents can type, record, or do both on the same question.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-widest">AI Analysis Pipeline</label>
                                            <button
                                                type="button"
                                                onClick={() => updateVoice({ ai_analysis_enabled: !voice.ai_analysis_enabled })}
                                                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl border-2 ${voice.ai_analysis_enabled ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700'}`}
                                            >
                                                <span className="text-sm font-bold">Run transcription & NLP</span>
                                                <span className="text-[10px] font-black uppercase">{voice.ai_analysis_enabled ? 'On' : 'Off'}</span>
                                            </button>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-widest">Transcription Language</label>
                                            <select
                                                value={voice.transcription_language || 'auto'}
                                                onChange={(e) => updateVoice({ transcription_language: e.target.value as 'auto' | 'en' | 'ar' })}
                                                className="w-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl px-6 py-4 text-sm font-bold"
                                            >
                                                <option value="auto">Auto-detect</option>
                                                <option value="en">English</option>
                                                <option value="ar">Arabic</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </section>
        </div>
    );
}
