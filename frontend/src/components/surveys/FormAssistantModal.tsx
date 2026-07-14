import { useState, useEffect } from 'react';
import { X, Check, HelpCircle } from 'lucide-react';

interface FormAssistantModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (prefillUrl: string) => void;
    initialUrl: string;
}

export default function FormAssistantModal({ isOpen, onClose, onSave, initialUrl }: FormAssistantModalProps) {
    const [rawUrl, setRawUrl] = useState('');
    const [fields, setFields] = useState<{ key: string, label: string, mapping: string }[]>([]);
    const [previewUrl, setPreviewUrl] = useState('');

    useEffect(() => {
        if (isOpen) {
            setRawUrl(initialUrl || '');
        }
    }, [isOpen, initialUrl]);

    const parseUrl = (url: string) => {
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            const detectedFields: { key: string, label: string, mapping: string }[] = [];

            params.forEach((value, key) => {
                if (key.startsWith('entry.')) {
                    // Try to guess label from value if it's a placeholder
                    let label = `Field ${key}`;
                    if (value && value !== '{{token}}' && value !== '{{phone}}') {
                        label = value;
                    }
                    detectedFields.push({ key, label, mapping: value || '' });
                }
            });

            setFields(detectedFields);
        } catch (e) {
            setFields([]);
        }
    };

    useEffect(() => {
        parseUrl(rawUrl);
    }, [rawUrl]);

    useEffect(() => {
        try {
            if (!rawUrl) {
                setPreviewUrl('');
                return;
            }
            const urlObj = new URL(rawUrl);
            const params = new URLSearchParams(urlObj.search);

            fields.forEach(f => {
                if (f.mapping) {
                    params.set(f.key, f.mapping);
                }
            });

            urlObj.search = params.toString();
            setPreviewUrl(urlObj.toString());
        } catch (e) {
            setPreviewUrl('');
        }
    }, [fields, rawUrl]);

    if (!isOpen) return null;

    const mappingOptions = [
        { value: '', label: 'None' },
        { value: '{{token}}', label: 'Participant Token' },
        { value: '{{phone}}', label: 'Phone Number' },
        { value: '{{survey_id}}', label: 'Survey ID' }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md shadow-2xl" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <header className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="text-left">
                        <h2 className="text-xl font-display font-black text-slate-900">Survey Link <span className="text-brand-blue">Assistant</span></h2>
                        <p className="text-sm font-medium text-slate-400">Map Layer 1 data to specific destination survey fields</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all border border-transparent hover:border-slate-100 shadow-sm text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </header>

                <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                    <section className="space-y-4 text-left">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-brand-blue uppercase tracking-widest ml-1">1. Paste Pre-filled URL</label>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 font-bold uppercase tracking-widest">
                                <HelpCircle className="w-3 h-3" />
                                URL Mapping Tool
                            </div>
                        </div>
                        <textarea
                            className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs font-mono text-slate-600 outline-none focus:ring-4 focus:ring-brand-blue/5 focus:border-brand-blue/50 transition-all shadow-inner"
                            placeholder="https://survey-tool.com/viewform?entry.123=..."
                            value={rawUrl}
                            onChange={(e) => setRawUrl(e.target.value)}
                        />
                    </section>

                    {fields.length > 0 && (
                        <section className="space-y-4 text-left">
                            <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1">2. Map Fields</label>
                            <div className="space-y-3">
                                {fields.map((field, idx) => (
                                    <div key={field.key} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
                                        <div className="flex-1">
                                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{field.label}</p>
                                            <code className="text-[10px] text-slate-400 font-mono">{field.key}</code>
                                        </div>
                                        <select
                                            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all cursor-pointer shadow-sm"
                                            value={field.mapping}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[idx].mapping = e.target.value;
                                                setFields(newFields);
                                            }}
                                        >
                                            {mappingOptions.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {rawUrl && fields.length === 0 && (
                        <div className="p-5 bg-orange-50 border border-orange-100 rounded-2xl flex items-start gap-4">
                            <HelpCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-orange-600 font-medium leading-relaxed">
                                No pre-fill fields detected. Ensure your URL contains query parameters (e.g., ?entry.ID=value)
                                that the assistant can identify for automated mapping.
                            </p>
                        </div>
                    )}
                </div>

                <footer className="p-8 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="text-[10px] text-slate-400 font-mono truncate max-w-[50%] bg-white px-3 py-2 rounded-lg border border-slate-100 shadow-inner">
                        {previewUrl || 'Waiting for valid URL...'}
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSave(previewUrl)}
                            disabled={!previewUrl}
                            className="bg-brand-blue hover:bg-blue-700 disabled:opacity-30 px-8 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-xl hover:shadow-brand-blue/20 transition-all flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            Apply Mapping
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
