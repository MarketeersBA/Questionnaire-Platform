import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, LayoutDashboard, Plus, Layers, Settings, ChevronRight, ClipboardList, FileText } from 'lucide-react';
import { surveys, templates } from '../services/api';

export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [dynamicActions, setDynamicActions] = useState<any[]>([]);
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(true);
            }
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100);

            // Load dynamic content when opened
            const loadData = async () => {
                try {
                    const [surveyList, templateList] = await Promise.all([
                        surveys.list(),
                        templates.list()
                    ]);

                    const surveyActions = surveyList.slice(0, 5).map((s: any) => ({
                        id: `survey-${s._id}`,
                        name: s.company_name,
                        icon: ClipboardList,
                        path: `/surveys/${s._id}`,
                        category: 'Recent Surveys'
                    }));

                    const templateActions = templateList.slice(0, 5).map((t: any) => ({
                        id: `template-${t._id}`,
                        name: t.name,
                        icon: FileText,
                        path: '/templates',
                        category: 'Templates'
                    }));

                    setDynamicActions([...surveyActions, ...templateActions]);
                } catch (e) {
                    console.error('Failed to load command palette data', e);
                }
            };
            loadData();
        } else {
            setQuery('');
        }
    }, [open]);

    const staticActions = [
        { id: 'dashboard', name: 'Go to Dashboard', icon: LayoutDashboard, path: '/dashboard', category: 'Navigation' },
        { id: 'templates', name: 'Open Template Architect', icon: Layers, path: '/templates', category: 'Navigation' },
        { id: 'create', name: 'Create New Survey', icon: Plus, path: '/create-survey', category: 'Actions' },
        { id: 'settings', name: 'Platform Settings', icon: Settings, path: '/dashboard', category: 'System' }
    ];

    const actions = [...staticActions, ...dynamicActions];

    const filtered = actions.filter(a => a.name.toLowerCase().includes(query.toLowerCase()) || a.category.toLowerCase().includes(query.toLowerCase()));

    const handleSelect = (path: string) => {
        setOpen(false);
        navigate(path);
    };

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setOpen(false)}
                        className="absolute inset-0 bg-slate-900/40 dark:bg-black/80 backdrop-blur-sm transition-colors"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/50 dark:border-slate-800/50 overflow-hidden transition-colors"
                    >
                        <div className="flex items-center px-8 py-6 border-b border-line/80 dark:border-line/10 transition-colors">
                            <Search className="w-6 h-6 text-primary-soft/50 mr-4" />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Type a command or search..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                className="flex-1 bg-transparent border-none outline-none text-xl font-display font-black text-ink placeholder:text-slate-200 dark:placeholder:text-slate-700 transition-colors"
                            />
                            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-300 dark:text-slate-600 tracking-widest bg-surface-sunken/50 px-3 py-1.5 rounded-lg transition-colors">
                                <span>ESC</span>
                            </div>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-6 space-y-4">
                            {filtered.length === 0 ? (
                                <div className="text-center py-12 text-ink-subtle font-medium transition-colors">No results found for "{query}"</div>
                            ) : (
                                <div className="space-y-4">
                                    {['Navigation', 'Actions', 'Recent Surveys', 'Templates', 'System'].map(category => {
                                        const group = filtered.filter(a => a.category === category);
                                        if (group.length === 0) return null;
                                        return (
                                            <div key={category} className="mb-6 last:mb-0">
                                                <div className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-ink-subtle mb-2 transition-colors">
                                                    {category}
                                                </div>
                                                <div className="space-y-1">
                                                    {group.map((action) => (
                                                        <div
                                                            key={action.id}
                                                            onClick={() => handleSelect(action.path)}
                                                            className={`flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer group hover:bg-primary dark:hover:bg-primary/90 hover:text-white transition-all duration-300`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="p-2.5 rounded-xl bg-surface-raised/50 text-ink-muted group-hover:bg-white/20 dark:group-hover:bg-white/10 group-hover:text-white transition-colors">
                                                                    <action.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                                                                </div>
                                                                <span className="font-bold text-ink-muted group-hover:text-white transition-colors">{action.name}</span>
                                                            </div>
                                                            <ChevronRight className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-300" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-50/80 dark:bg-slate-950/80 px-8 py-5 border-t border-line/80 dark:border-line/10 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.3em] text-ink-subtle transition-colors">
                            <div className="flex items-center gap-6">
                                <span className="flex items-center gap-2 group cursor-default"><span className="p-1 px-1.5 rounded bg-surface border border-line/80 dark:border-line/10 shadow-sm leading-none group-hover:text-primary-soft transition-colors">↑↓</span> Navigate</span>
                                <span className="flex items-center gap-2 group cursor-default"><span className="p-1 px-1.5 rounded bg-surface border border-line/80 dark:border-line/10 shadow-sm leading-none group-hover:text-primary-soft transition-colors">↵</span> Select</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                PALETTE CONTROL
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
