import { useState, useEffect } from 'react';
import { ShieldAlert, ChevronRight, Clock, Code, X } from 'lucide-react';
import { analytics } from '../../services/api';

interface OrphanAuditProps {
    data: {
        total_attempts: number;
        categories: any[];
    } | null;
}

export default function OrphanAuditTable({ data }: OrphanAuditProps) {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [details, setDetails] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [activePayload, setActivePayload] = useState<any | null>(null);

    useEffect(() => {
        if (selectedCategory) {
            setLoadingDetails(true);
            analytics.getOrphanDetails(selectedCategory)
                .then(setDetails)
                .catch(console.error)
                .finally(() => setLoadingDetails(false));
        } else {
            setDetails([]);
        }
    }, [selectedCategory]);

    if (!data) return null;

    return (
        <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-xl overflow-hidden flex flex-col h-full relative text-left">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-display font-black flex items-center gap-2 text-slate-900">
                    <ShieldAlert className="w-5 h-5 text-brand-red" />
                    Security Audit Logs
                </h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Failed webhooks & bot vectors</p>
            </div>

            <div className="flex-1 overflow-auto">
                <div className="min-h-full">
                    {data.categories.map((cat: any) => (
                        <div key={cat._id} className="border-b border-slate-50 last:border-0">
                            <button
                                className={`w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors ${selectedCategory === cat._id ? 'bg-slate-50' : ''}`}
                                onClick={() => setSelectedCategory(cat._id === selectedCategory ? null : cat._id)}
                            >
                                <div className="flex items-center gap-3">
                                    <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${selectedCategory === cat._id ? 'rotate-90 text-brand-red' : ''}`} />
                                    <span className="text-slate-600 font-bold text-sm lowercase first-letter:uppercase">{cat._id.replace('invalid_transition_', '').replace(/_/g, ' ')}</span>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="px-3 py-1 bg-brand-red/5 text-brand-red font-mono text-xs font-black rounded-lg border border-brand-red/10">{cat.count}</span>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right leading-tight hidden sm:block">
                                        <p>{new Date(cat.latest_attempt).toLocaleDateString()}</p>
                                        <p className="text-slate-300">{new Date(cat.latest_attempt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            </button>

                            {selectedCategory === cat._id && (
                                <div className="bg-slate-50/50 px-6 pb-6 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="space-y-2 mt-2">
                                        {loadingDetails ? (
                                            <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Scanning incident history...</div>
                                        ) : (
                                            details.map((log) => (
                                                <div key={log._id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 hover:border-brand-red/20 transition-all group shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <Clock className="w-4 h-4 text-slate-300" />
                                                        <span className="text-xs text-slate-900 font-mono font-bold">
                                                            {new Date(log.timestamp).toLocaleTimeString()}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => setActivePayload(log)}
                                                        className="p-2 bg-slate-50 rounded-lg hover:bg-brand-red hover:text-white text-slate-400 opacity-0 group-hover:opacity-100 transition shadow-sm"
                                                        title="Inspect Payload"
                                                    >
                                                        <Code className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {data.categories.length === 0 && (
                        <div className="px-8 py-16 text-center text-slate-400 italic">No security incidents recorded.</div>
                    )}
                </div>
            </div>

            {/* Payload Inspector Modal */}
            {activePayload && (
                <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md p-8 overflow-auto animate-in fade-in zoom-in duration-200 shadow-2xl">
                    <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-6">
                        <h4 className="font-display font-black flex items-center gap-3 text-brand-red text-xl uppercase tracking-wider">
                            <Code className="w-6 h-6" />
                            Incident Context
                        </h4>
                        <button
                            onClick={() => setActivePayload(null)}
                            className="p-2 hover:bg-slate-100 rounded-xl transition text-slate-400"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    <div className="bg-slate-50 rounded-[2rem] p-8 border border-slate-200 font-mono text-xs overflow-auto max-h-[500px] shadow-inner">
                        <pre className="text-slate-700 leading-relaxed font-bold">{JSON.stringify(activePayload, null, 2)}</pre>
                    </div>
                    <div className="mt-8 space-y-2 px-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Temporal Marker</label>
                        <p className="text-sm text-slate-900 font-bold">{new Date(activePayload.timestamp).toLocaleString()}</p>
                    </div>
                </div>
            )}

            <div className="p-6 bg-slate-50/80 border-t border-slate-100">
                <div className="flex items-center justify-between px-6 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Global Incident Count</span>
                    <span className="text-xl font-display font-black text-brand-red">{data.total_attempts}</span>
                </div>
            </div>
        </div>
    );
}
