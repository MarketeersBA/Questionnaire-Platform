import { Trash2, GripVertical, CheckCircle2, Type, Hash, List, ShieldCheck, Plus, Sparkles, Info, Palette, Tag, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface QuestionBlockProps {
    question: any;
    showGatekeeper?: boolean;
    readOnly?: boolean;
    language?: 'en' | 'ar';
    onUpdate: (data: any) => void;
    onDelete?: () => void;
}

const TYPE_CONFIG: any = {
    mcq: { icon: List, label: 'Multiple Choice', color: 'text-brand-glow', bg: 'bg-brand-glow/10', border: 'border-brand-glow/20' },
    scale: { icon: Hash, label: 'Rating Scale', color: 'text-brand-cyan', bg: 'bg-brand-cyan/10', border: 'border-brand-cyan/20' },
    bipolar: { icon: Hash, label: 'Bipolar Scale', color: 'text-brand-cyan', bg: 'bg-brand-cyan/10', border: 'border-brand-cyan/20' },
    number: { icon: Hash, label: 'Numeric Input', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    text: { icon: Type, label: 'Short Answer', color: 'text-brand-accent', bg: 'bg-brand-accent/10', border: 'border-brand-accent/20' },
    grid: { icon: Layers, label: 'Perception Grid', color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    loop: { icon: Sparkles, label: 'Satisfaction Loop', color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' }
};

export default function QuestionBlock({ question, showGatekeeper = true, readOnly = false, language = 'en', onUpdate, onDelete }: QuestionBlockProps) {
    const qType = question.type || 'mcq';
    const config = TYPE_CONFIG[qType] || TYPE_CONFIG.mcq;

    const renderHighlightedText = (text: string) => {
        if (!text) return "";
        const parts = text.split(/({brand}|{category}|\[.*?\])/g);
        return parts.map((part, i) => {
            if (part === '{brand}') {
                return (
                    <span key={i} className="inline-flex items-center gap-1 bg-brand-blue/20 dark:bg-brand-blue/30 text-brand-blue dark:text-brand-cyan px-2 py-0.5 rounded-md border border-brand-blue/30 dark:border-brand-blue/40 text-sm font-black mx-1 transition-colors">
                        <Palette className="w-3 h-3" />
                        BRAND
                    </span>
                );
            }
            if (part === '{category}') {
                return (
                    <span key={i} className="inline-flex items-center gap-1 bg-brand-cyan/20 dark:bg-brand-cyan/30 text-brand-cyan px-2 py-0.5 rounded-md border border-brand-cyan/30 dark:border-brand-cyan/40 text-sm font-black mx-1 transition-colors">
                        <Tag className="w-3 h-3" />
                        CATEGORY
                    </span>
                );
            }
            if (part.startsWith('[') && part.endsWith(']')) {
                return (
                    <span key={i} className="inline-flex items-center gap-1 bg-brand-accent/20 dark:bg-brand-accent/30 text-brand-accent px-2 py-0.5 rounded-md border border-brand-accent/30 dark:border-brand-accent/40 text-sm font-black mx-1 transition-colors">
                        <Sparkles className="w-3 h-3" />
                        {part.slice(1, -1)}
                    </span>
                );
            }
            return part;
        });
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="group relative"
        >
            <div className="glass-card rounded-[2.5rem] p-8 shadow-premium hover:shadow-premium-blue transition-all duration-500 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Visual Accent */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${config.bg} ${config.color.replace('text-', 'bg-')} shadow-[0_0_15px_rgba(var(--brand-glow-rgb),0.3)]`} />

                <div className="flex gap-8">
                    {/* Reorder Handle */}
                    <div className="hidden md:flex flex-col items-center gap-2 pt-2">
                        <div className="cursor-grab active:cursor-grabbing p-2 rounded-xl hover:bg-white/5 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-500 hover:text-white dark:hover:text-slate-300 transition-all opacity-0 group-hover:opacity-100">
                            <GripVertical className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="flex-1 space-y-8">
                        {/* Question Header */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`px-3 py-1 rounded-full ${config.bg} ${config.color} text-[10px] font-black uppercase tracking-widest border-2 ${config.border.replace('/20', '/40')} flex items-center gap-1.5 shadow-sm`}>
                                        <config.icon className="w-3 h-3" />
                                        {config.label}
                                    </div>
                                    {question.questionMeta?.nature && (
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border-2 flex items-center gap-1.5 
                                            ${question.questionMeta.nature === 'fixed' ? 'bg-slate-900 text-slate-100 border-slate-700' :
                                                question.questionMeta.nature === 'dynamic' ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30' :
                                                    'bg-brand-accent/10 text-brand-accent border-brand-accent/30'}`}>
                                            {question.questionMeta.nature}
                                        </div>
                                    )}
                                    <span className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest ml-2">ID: {question.id}</span>
                                </div>

                                {/* Sub-attributes Metadata Badges */}
                                {question.questionMeta?.sub_attributes && Array.isArray(question.questionMeta.sub_attributes) && question.questionMeta.sub_attributes.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {question.questionMeta.sub_attributes.map((sub: string, idx: number) => (
                                            <div
                                                key={idx}
                                                className="px-2 py-0.5 rounded-md bg-brand-blue/10 border-2 border-brand-blue/30 text-[8px] font-black uppercase tracking-widest text-brand-blue flex items-center gap-1 shadow-sm"
                                            >
                                                <Sparkles className="w-2 h-2" />
                                                {sub === "All" ? "All Sub-Attributes" : sub}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!readOnly && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                                        className="p-2 text-slate-900 dark:text-slate-100 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-xl transition-all opacity-0 group-hover:opacity-100 ring-2 ring-transparent hover:ring-rose-500/20"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <div className="relative group/input min-h-[4rem] flex font-display font-black text-2xl text-slate-900 dark:text-white transition-colors">
                                <div className="absolute inset-0 z-0 pointer-events-none whitespace-pre-wrap py-2">
                                    {renderHighlightedText(
                                        language === 'ar'
                                            ? (question.ar_text || question.label || question.text || '')
                                            : (question.en_text || question.label || question.text || '')
                                    )}
                                </div>
                                <textarea
                                    value={
                                        language === 'ar'
                                            ? (question.ar_text || question.label || question.text || '')
                                            : (question.en_text || question.label || question.text || '')
                                    }
                                    onChange={(e) => {
                                        if (readOnly) return;
                                        const updateField = language === 'ar' ? 'ar_text' : 'en_text';
                                        onUpdate({ ...question, [updateField]: e.target.value, label: e.target.value, text: e.target.value });
                                    }}
                                    readOnly={readOnly}
                                    placeholder="Enter your question here..."
                                    rows={1}
                                    style={{ height: 'auto' }}
                                    className={`w-full bg-transparent text-2xl font-display font-black text-transparent caret-brand-blue border-b-2 border-transparent focus:border-brand-blue transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 relative z-10 resize-none overflow-hidden ${readOnly ? 'cursor-default' : ''}`}
                                />
                            </div>
                        </div>

                        {/* Question Content */}
                        <div className="flex flex-col xl:flex-row gap-10">
                            {/* Controls / Options */}
                            <div className="flex-1 space-y-6 min-w-0">
                                <AnimatePresence mode="wait">
                                    {qType === 'text' ? (
                                        <motion.div
                                            key="text"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-black shadow-inner-soft"
                                        >
                                            Participants will provide a short text response.
                                        </motion.div>
                                    ) : qType === 'number' ? (
                                        <motion.div
                                            key="number"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="space-y-4"
                                        >
                                            <div className="bg-slate-100 dark:bg-slate-900 p-6 rounded-2xl border-2 border-slate-300 dark:border-slate-700 space-y-6 shadow-inner-soft">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 shadow-inner-soft border border-emerald-500/20">
                                                        <Hash className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <div className="text-xs font-black uppercase text-slate-900 dark:text-slate-100 mb-1">Strict Numeric Input</div>
                                                        <div className="text-[10px] text-slate-700 dark:text-slate-300 font-black">Validation will ensure only numbers are accepted.</div>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        placeholder="Numeric Value..."
                                                        disabled
                                                        className="bg-white dark:bg-slate-950 border-2 border-slate-400 dark:border-slate-600 rounded-xl px-4 py-3 text-lg font-black w-32 outline-none cursor-not-allowed opacity-50 shadow-inner-soft text-right text-slate-900 dark:text-white"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 pt-4 border-t-2 border-slate-200 dark:border-slate-800">
                                                    <div className="space-y-2 text-left">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 ml-1">Minimum Value</label>
                                                        <input
                                                            type="number"
                                                            value={question.questionMeta?.min ?? ''}
                                                            onChange={(e) => !readOnly && onUpdate({ ...question, questionMeta: { ...question.questionMeta, min: e.target.value === '' ? undefined : Number(e.target.value) } })}
                                                            readOnly={readOnly}
                                                            placeholder="No min"
                                                            className={`w-full bg-white dark:bg-slate-950 border-2 border-slate-400 dark:border-slate-600 rounded-xl px-4 py-3 text-xs font-black outline-none focus:border-emerald-500 transition-all placeholder:text-slate-500 ${readOnly ? 'cursor-default' : ''}`}
                                                        />
                                                    </div>
                                                    <div className="space-y-2 text-left">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 ml-1 text-right block">Maximum Value</label>
                                                        <input
                                                            type="number"
                                                            value={question.questionMeta?.max ?? ''}
                                                            onChange={(e) => !readOnly && onUpdate({ ...question, questionMeta: { ...question.questionMeta, max: e.target.value === '' ? undefined : Number(e.target.value) } })}
                                                            readOnly={readOnly}
                                                            placeholder="No max"
                                                            className={`w-full bg-white dark:bg-slate-950 border-2 border-slate-400 dark:border-slate-600 rounded-xl px-4 py-3 text-xs font-black outline-none focus:border-emerald-500 transition-all text-right placeholder:text-slate-500 ${readOnly ? 'cursor-default' : ''}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : (qType === 'scale' || qType === 'bipolar') ? (
                                        <motion.div
                                            key="scale-slider"
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="space-y-10"
                                        >
                                            {qType === 'bipolar' && (
                                                <div className="flex items-center justify-between gap-6 p-6 rounded-2xl bg-brand-blue/10 border-2 border-brand-blue/30 shadow-inner-soft">
                                                    <div className="flex-1 space-y-2 text-left">
                                                        <label className="text-[8px] font-black uppercase text-slate-900 dark:text-slate-100">Left Anchor (e.g. Too Weak)</label>
                                                        <input
                                                            type="text"
                                                            value={question.questionMeta?.bipolarLeft || ''}
                                                            onChange={(e) => !readOnly && onUpdate({ ...question, questionMeta: { ...question.questionMeta, bipolarLeft: e.target.value } })}
                                                            readOnly={readOnly}
                                                            placeholder="Left Value..."
                                                            className={`w-full bg-white dark:bg-slate-950 border-2 border-slate-400 dark:border-slate-600 rounded-xl px-4 py-2 text-xs font-black outline-none focus:border-brand-blue transition-all shadow-sm placeholder:text-slate-500 ${readOnly ? 'cursor-default' : ''}`}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col items-center justify-center pt-4">
                                                        <div className="w-4 h-4 rounded-full border-2 border-brand-blue flex items-center justify-center">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-brand-blue" />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 space-y-2 text-right">
                                                        <label className="text-[8px] font-black uppercase text-slate-900 dark:text-slate-100 text-right block">Right Anchor (e.g. Too Strong)</label>
                                                        <input
                                                            type="text"
                                                            value={question.questionMeta?.bipolarRight || ''}
                                                            onChange={(e) => !readOnly && onUpdate({ ...question, questionMeta: { ...question.questionMeta, bipolarRight: e.target.value } })}
                                                            readOnly={readOnly}
                                                            placeholder="Right Value..."
                                                            className={`w-full bg-white dark:bg-slate-950 border-2 border-slate-400 dark:border-slate-600 rounded-xl px-4 py-2 text-xs font-black outline-none focus:border-brand-blue transition-all shadow-sm text-right placeholder:text-slate-500 ${readOnly ? 'cursor-default' : ''}`}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-1 text-left">
                                                        <div className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">Magnitude Input</div>
                                                        <div className="text-4xl font-display font-black text-slate-900 dark:text-white flex items-baseline gap-2">
                                                            {question.value || 5}
                                                            <span className="text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-tighter">/ {question.questionMeta?.scaleMax || 10}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-950/80 border-2 border-slate-600 text-center min-w-[80px]">
                                                            <div className="text-[8px] font-black text-slate-200 dark:text-slate-300 uppercase">Min Label</div>
                                                            <input
                                                                type="text"
                                                                value={question.questionMeta?.minLabel || ''}
                                                                onChange={(e) => !readOnly && onUpdate({ ...question, questionMeta: { ...question.questionMeta, minLabel: e.target.value } })}
                                                                readOnly={readOnly}
                                                                className={`bg-transparent text-[10px] font-black text-white text-center w-full outline-none placeholder:text-slate-500 ${readOnly ? 'cursor-default' : ''}`}
                                                                placeholder="Min Label..."
                                                            />
                                                        </div>
                                                        <div className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-600 text-center min-w-[80px] shadow-sm">
                                                            <div className="text-[8px] font-black text-slate-900 dark:text-slate-100 uppercase">Max Label</div>
                                                            <input
                                                                type="text"
                                                                value={question.questionMeta?.maxLabel || ''}
                                                                onChange={(e) => !readOnly && onUpdate({ ...question, questionMeta: { ...question.questionMeta, maxLabel: e.target.value } })}
                                                                readOnly={readOnly}
                                                                className={`bg-transparent text-[10px] font-black text-slate-900 dark:text-white text-center w-full outline-none placeholder:text-slate-400 ${readOnly ? 'cursor-default' : ''}`}
                                                                placeholder="Max Label..."
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="relative h-20 flex items-center group/slider">
                                                    {/* Track Background */}
                                                    <div className="absolute inset-x-0 h-4 bg-slate-300 dark:bg-slate-700 rounded-full shadow-inner overflow-hidden border border-slate-400/20">
                                                        <motion.div
                                                            className="absolute left-0 inset-y-0 bg-gradient-to-r from-brand-cyan to-brand-blue shadow-[0_0_10px_rgba(var(--brand-cyan-rgb),0.5)]"
                                                            initial={{ width: "50%" }}
                                                            animate={{ width: `${((question.value || 5) / (question.questionMeta?.scaleMax || 10)) * 100}%` }}
                                                        />
                                                    </div>

                                                    {/* Scale Ticks */}
                                                    <div className="absolute inset-x-0 px-2 flex justify-between">
                                                        {Array.from({ length: (question.questionMeta?.scaleMax || 10) }, (_, i) => (
                                                            <div key={i} className="w-0.5 h-2 bg-slate-300 dark:bg-slate-700/50 rounded-full" />
                                                        ))}
                                                    </div>

                                                    {/* The Input */}
                                                    <input
                                                        type="range"
                                                        min="1"
                                                        max={question.questionMeta?.scaleMax || 10}
                                                        value={question.value || 5}
                                                        onChange={(e) => !readOnly && onUpdate({ ...question, value: parseInt(e.target.value) })}
                                                        disabled={readOnly}
                                                        className={`absolute inset-x-0 w-full h-12 opacity-0 z-20 ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                                                    />

                                                    {/* Premium Thumb */}
                                                    <motion.div
                                                        className="absolute w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_0_40px_rgba(var(--brand-cyan-rgb),0.6)] border-4 border-brand-cyan flex items-center justify-center pointer-events-none z-10"
                                                        style={{
                                                            left: `calc(${((question.value || 5) / (question.questionMeta?.scaleMax || 10)) * 100}% - 24px)`
                                                        }}
                                                        initial={false}
                                                        animate={{ scale: 1 }}
                                                        whileHover={{ scale: 1.15 }}
                                                    >
                                                        <GripVertical className="w-5 h-5 text-brand-cyan" />
                                                    </motion.div>
                                                </div>

                                                <div className="flex items-center gap-3 px-5 py-4 bg-slate-100 dark:bg-slate-900/60 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-inner-soft text-left">
                                                    <Info className="w-4 h-4 text-brand-cyan" />
                                                    <p className="text-[11px] text-slate-900 dark:text-slate-100 font-black leading-relaxed">
                                                        Standard {question.questionMeta?.masterType || 'Linear Scale'} interface with end-point anchors. {qType === 'bipolar' ? 'Bipolar scales measure between two opposing attributes.' : 'Linear scales measure intensity or satisfaction.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="options"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="space-y-6"
                                        >
                                            {showGatekeeper && !question.questionMeta?.masterType?.includes("Multiple Choice") && (
                                                <div className="flex items-center justify-between px-4 bg-slate-100 dark:bg-slate-900 py-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-inner-soft">
                                                    <div className="flex items-center gap-3 text-left">
                                                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white leading-none mb-1">Gatekeeper Protocol</div>
                                                            <div className="text-[9px] text-slate-800 dark:text-slate-300 font-black">Select the required answer for qualification</div>
                                                        </div>
                                                    </div>
                                                    {question.correct_answer && (
                                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border-2 border-emerald-500 shadow-sm">
                                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                                                                {Array.isArray(question.correct_answer) ? `${question.correct_answer.length} Gates Active` : 'Logic Active'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Smart Hint */}
                                            {question.questionMeta?.masterType && (
                                                <div className="flex items-center gap-3 px-4 py-3 bg-brand-glow/10 border-2 border-brand-glow/30 rounded-xl shadow-sm text-left">
                                                    <div className="p-1.5 rounded-lg bg-brand-glow/20 text-brand-glow border border-brand-glow/20">
                                                        <Info className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-[10px] font-black text-brand-glow uppercase tracking-[0.1em] mb-0.5">Action Requirement</div>
                                                        <div className="text-[11px] text-slate-900 dark:text-white font-black leading-tight">
                                                            {question.questionMeta.masterType.includes("- Select")
                                                                ? `HINT: User must ${question.questionMeta.masterType.split("-").pop()?.trim()}`
                                                                : `Question Type: ${question.questionMeta.masterType}`
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {qType === 'grid' && (
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Perception Attributes ({question.questionMeta?.rows?.length || 0})</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        {(question.questionMeta?.rows || []).map((row: any, rIdx: number) => (
                                                            <div key={rIdx} className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                                                                <div className="w-5 h-5 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center text-[8px] font-black border border-indigo-500/20">
                                                                    {rIdx + 1}
                                                                </div>
                                                                <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{row.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {qType === 'loop' && (
                                                <div className="p-6 rounded-2xl bg-rose-500/5 border-2 border-rose-500/10 space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500">
                                                            <Sparkles className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Dynamic Satisfaction Loop</p>
                                                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">This question will repeat for every brand selected in previous layers.</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 rounded-xl border border-rose-200/50 shadow-sm">
                                                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                                        <span className="text-[9px] font-black text-slate-900 dark:text-white uppercase">Linear Rating Automation Active</span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="space-y-4">
                                                {(question.options || []).map((opt: string, i: number) => (
                                                    <div key={i} className="flex items-center gap-4 group/option">
                                                        <div className="flex-1 space-y-3">
                                                            <div className="flex items-center gap-3">
                                                                <button
                                                                    type="button"
                                                                    disabled={!showGatekeeper}
                                                                    onClick={() => {
                                                                        if (!showGatekeeper) return;

                                                                        let currentCorrect = question.correct_answer;
                                                                        let nextCorrect;

                                                                        if (Array.isArray(currentCorrect)) {
                                                                            if (currentCorrect.includes(opt)) {
                                                                                nextCorrect = currentCorrect.filter(c => c !== opt);
                                                                                if (nextCorrect.length === 0) nextCorrect = null;
                                                                            } else {
                                                                                nextCorrect = [...currentCorrect, opt];
                                                                            }
                                                                        } else {
                                                                            // Transition single value to array or toggle
                                                                            if (currentCorrect === opt) {
                                                                                nextCorrect = null;
                                                                            } else if (currentCorrect) {
                                                                                nextCorrect = [currentCorrect, opt];
                                                                            } else {
                                                                                nextCorrect = [opt];
                                                                            }
                                                                        }

                                                                        onUpdate({ ...question, correct_answer: nextCorrect });
                                                                    }}
                                                                    className={`w-14 h-14 rounded-2xl border flex flex-col items-center justify-center transition-all duration-500 relative overflow-hidden ${showGatekeeper
                                                                        ? ((Array.isArray(question.correct_answer) ? question.correct_answer.includes(opt) : question.correct_answer === opt) && opt !== ''
                                                                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-premium'
                                                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 group/gatekeeper cursor-pointer')
                                                                        : 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-default'
                                                                        }`}
                                                                >
                                                                    <div className="flex flex-col items-center gap-1">
                                                                        {(Array.isArray(question.correct_answer) ? question.correct_answer.includes(opt) : question.correct_answer === opt) && opt !== '' ? <ShieldCheck className="w-6 h-6" /> : <span className="text-sm font-black">{i + 1}</span>}
                                                                    </div>
                                                                </button>

                                                                <div className="flex-1 relative">
                                                                    <input
                                                                        type="text"
                                                                        value={opt}
                                                                        onChange={(e) => {
                                                                            if (readOnly) return;
                                                                            const oldVal = opt;
                                                                            const newVal = e.target.value;
                                                                            const newOpts = [...(question.options || [])];
                                                                            newOpts[i] = newVal;

                                                                            // Sync correct_answer if name changes
                                                                            let nextCorrect = question.correct_answer;
                                                                            if (Array.isArray(nextCorrect)) {
                                                                                nextCorrect = nextCorrect.map(c => c === oldVal ? newVal : c);
                                                                            } else if (nextCorrect === oldVal) {
                                                                                nextCorrect = newVal;
                                                                            }

                                                                            onUpdate({ ...question, options: newOpts, correct_answer: nextCorrect });
                                                                        }}
                                                                        readOnly={readOnly}
                                                                        className={`w-full bg-white dark:bg-slate-950 border-2 rounded-[1.25rem] px-6 py-5 text-sm font-black outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-sm ${(Array.isArray(question.correct_answer) ? question.correct_answer.includes(opt) : question.correct_answer === opt) && opt !== ''
                                                                            ? 'border-emerald-500 ring-4 ring-emerald-500/10'
                                                                            : 'border-slate-300 dark:border-slate-700 focus:border-brand-blue'
                                                                            } ${readOnly ? 'cursor-default' : ''}`}
                                                                        placeholder={`Option Value...`}
                                                                    />
                                                                </div>

                                                                {!readOnly && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => onUpdate({ ...question, options: (question.options || []).filter((_: any, idx: number) => idx !== i) })}
                                                                        className="p-4 text-slate-400 hover:text-rose-400 hover:bg-rose-400/5 rounded-2xl transition-all opacity-0 group-hover/option:opacity-100"
                                                                    >
                                                                        <Trash2 className="w-5 h-5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {!readOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onUpdate({ ...question, options: [...(question.options || []), ''] })}
                                                        className="w-full py-4 rounded-2xl border-2 border-slate-300 dark:border-slate-700 hover:border-brand-blue bg-white dark:bg-slate-950 text-[10px] font-black uppercase text-slate-900 dark:text-slate-100 hover:text-brand-blue flex items-center justify-center gap-3 transition-all shadow-sm"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        Add Option
                                                    </button>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Configuration */}
                            <div className="xl:w-64 space-y-6 shrink-0 border-l-2 border-slate-200 dark:border-slate-800 pl-8">
                                <div className="space-y-4 text-left">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 ml-1">Behavior Mode</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {Object.entries(TYPE_CONFIG).map(([key, cfg]: [string, any]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                disabled={readOnly}
                                                onClick={(e) => {
                                                    if (readOnly) return;
                                                    e.stopPropagation();
                                                    const update: any = { type: key };
                                                    if (key === 'text' || key === 'number' || key === 'scale' || key === 'bipolar') {
                                                        update.options = [];
                                                    } else if (!question.options || question.options.length === 0) {
                                                        update.options = ['Option 1'];
                                                    }
                                                    onUpdate({ ...question, ...update });
                                                }}
                                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left group/btn ${readOnly ? 'cursor-default' : ''} ${qType === key
                                                    ? `${cfg.bg} ${cfg.border.replace('/20', '/40')} shadow-lg shadow-brand-blue/10`
                                                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                                            >
                                                <div className={`p-2 rounded-xl transition-colors ${qType === key ? cfg.bg : 'bg-slate-100 dark:bg-slate-800'}`}>
                                                    <cfg.icon className={`w-4 h-4 ${qType === key ? cfg.color : 'text-slate-400 group-hover/btn:text-slate-600'}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-[10px] font-black uppercase tracking-widest truncate ${qType === key ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>{cfg.label}</div>
                                                    <div className={`text-[8px] font-bold truncate ${qType === key ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>
                                                        {key === 'mcq' ? 'Fixed Choices' :
                                                            key === 'scale' ? 'Linear Rating' :
                                                                key === 'bipolar' ? 'Sensory JAR' :
                                                                    key === 'number' ? 'Numeric Value' : 'Free Form'}
                                                    </div>
                                                </div>
                                                {qType === key && <CheckCircle2 className={`w-4 h-4 ${cfg.color}`} />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
