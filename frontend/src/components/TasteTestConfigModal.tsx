import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
    X,
    Sparkles,
    Tag,
    ChevronRight,
    Beaker,
    Palette
} from 'lucide-react';
import { TasteTestConfig, BrandMetadata } from '../types/tasteTest';

interface TasteTestConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (config: TasteTestConfig) => void;
}

export default function TasteTestConfigModal({ isOpen, onClose, onConfirm }: TasteTestConfigModalProps) {
    const [config, setConfig] = useState<TasteTestConfig>({
        category: '',
        ratingScale: 9,
        attributes: {},
        brands: [], // Legacy compat
        own_brand: '', // Legacy compat
        internal_brands_data: [],
        competitor_brands_data: [],
        competitive_brands: [],
        language: 'ar',
        bipolarPairs: []
    });

    const [brandInput, setBrandInput] = useState('');
    const [brandRole, setBrandRole] = useState<'internal' | 'competitor'>('competitor');
    const [attrInput, setAttrInput] = useState('');

    if (!isOpen) return null;

    const handleAddBrand = () => {
        if (!brandInput.trim()) return;

        const newBrand: BrandMetadata = {
            name: brandInput.trim(),
            role: brandRole
        };

        if (brandRole === 'internal') {
            const newData = [...config.internal_brands_data, newBrand];
            setConfig({
                ...config,
                internal_brands_data: newData,
                own_brand: newData.length > 0 ? newData[0].name : ''
            });
        } else {
            // Avoid duplicates
            if (!config.competitor_brands_data.find(b => b.name === newBrand.name)) {
                const newData = [...config.competitor_brands_data, newBrand];
                setConfig({
                    ...config,
                    competitor_brands_data: newData,
                    brands: [config.own_brand, ...newData.map(b => b.name)].filter(Boolean)
                });
            }
        }
        setBrandInput('');
    };

    const handleRemoveBrand = (name: string, role: string) => {
        if (role === 'internal') {
            const newData = config.internal_brands_data.filter(b => b.name !== name);
            setConfig({
                ...config,
                internal_brands_data: newData,
                own_brand: newData.length > 0 ? newData[0].name : ''
            });
        } else {
            const newData = config.competitor_brands_data.filter(b => b.name !== name);
            setConfig({
                ...config,
                competitor_brands_data: newData,
                brands: [config.own_brand, ...newData.map(b => b.name)].filter(Boolean)
            });
        }
    };

    const handleAddAttribute = () => {
        if (attrInput.trim() && !config.attributes[attrInput.trim()]) {
            setConfig({ ...config, attributes: { ...config.attributes, [attrInput.trim()]: [] } });
            setAttrInput('');
        }
    };

    const handleRemoveAttribute = (attr: string) => {
        const newAttrs = { ...config.attributes };
        delete newAttrs[attr];
        setConfig({ ...config, attributes: newAttrs });
    };

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                className="relative w-full max-w-4xl bg-white dark:bg-slate-950 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors"
            >
                {/* Header */}
                <div className="p-10 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between transition-colors">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue flex items-center justify-center shadow-inner">
                            <Sparkles className="w-7 h-7" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight transition-colors">
                                Research <span className="text-brand-blue">Architect</span>
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium transition-colors">Configure your multi-product taste test logic.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white transition-all shadow-sm">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar transition-colors">
                    {/* Basic Info */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 transition-colors">
                                <Tag className="w-3 h-3" /> Product Category
                            </label>
                            <input
                                type="text"
                                value={config.category}
                                onChange={e => setConfig({ ...config, category: e.target.value })}
                                placeholder="e.g. Premium Chocolate"
                                className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-brand-blue/30 focus:bg-white dark:focus:bg-slate-800 rounded-2xl px-6 py-4 text-lg font-bold outline-none transition-all dark:text-white dark:placeholder:text-slate-700"
                            />
                        </div>

                    </section>

                    {/* Scale Selection */}
                    <section className="space-y-6">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 transition-colors">
                            <Beaker className="w-3 h-3" /> Measurement Scale
                        </label>
                        <div className="flex gap-4">
                            {[5, 7, 9, 10].map(scale => (
                                <button
                                    key={scale}
                                    onClick={() => setConfig({ ...config, ratingScale: scale as any })}
                                    className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black border-2 transition-all ${config.ratingScale === scale
                                        ? 'bg-slate-900 dark:bg-brand-blue border-slate-900 dark:border-brand-blue text-white hover:scale-105 shadow-xl'
                                        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}
                                >
                                    {scale}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Brands Management Enhanced */}
                    <section className="space-y-8 bg-slate-50/50 dark:bg-slate-900/50 p-8 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-800 transition-colors">
                        <div className="flex flex-col gap-6">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 transition-colors">
                                <Palette className="w-3 h-3" /> Managed Brands
                            </label>

                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-1 space-y-4">
                                    <input
                                        type="text"
                                        value={brandInput}
                                        onChange={e => setBrandInput(e.target.value)}
                                        onKeyPress={e => e.key === 'Enter' && handleAddBrand()}
                                        placeholder="Add brand name..."
                                        className="w-full bg-white dark:bg-slate-950 border-2 border-transparent focus:border-brand-blue/30 rounded-2xl px-6 py-4 text-sm font-bold outline-none transition-all dark:text-white dark:placeholder:text-slate-800 shadow-sm"
                                    />

                                    <div className="flex items-center gap-6 px-2">
                                        <button
                                            onClick={() => setBrandRole(brandRole === 'internal' ? 'competitor' : 'internal')}
                                            className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${brandRole === 'internal' ? 'text-brand-blue' : 'text-slate-400'}`}
                                        >
                                            <div className={`w-10 h-5 rounded-full relative transition-all ${brandRole === 'internal' ? 'bg-brand-blue/20' : 'bg-slate-200 dark:bg-slate-800'}`}>
                                                <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${brandRole === 'internal' ? 'right-1 bg-brand-blue' : 'left-1 bg-slate-400'}`} />
                                            </div>
                                            Internal Brand
                                        </button>

                                    </div>
                                </div>
                                <button
                                    onClick={handleAddBrand}
                                    disabled={!brandInput.trim()}
                                    className="bg-brand-blue text-white px-10 rounded-2xl font-black text-sm shadow-xl shadow-brand-blue/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                                >
                                    Add Brand
                                </button>
                            </div>
                        </div>

                        {/* Managed Brands Chips */}
                        <div className="flex flex-wrap gap-3">
                            {config.internal_brands_data.map(brand => (
                                <motion.div
                                    layout
                                    key={brand.name}
                                    className="flex items-center gap-3 bg-brand-blue/10 text-brand-blue px-6 py-4 rounded-2xl border border-brand-blue/20 group"
                                >
                                    <div className="flex flex-col">
                                        <span className="text-[8px] font-black uppercase tracking-tighter opacity-60">Internal</span>
                                        <span className="font-bold text-sm tracking-tight">{brand.name}</span>
                                    </div>
                                    <button onClick={() => handleRemoveBrand(brand.name, 'internal')} className="hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                        <X className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ))}
                            {config.competitor_brands_data.map(brand => (
                                <motion.div
                                    layout
                                    key={brand.name}
                                    className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-6 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 group"
                                >
                                    <div className="flex flex-col">
                                        <span className="text-[8px] font-black uppercase tracking-tighter opacity-40">Competitor</span>
                                        <span className="font-bold text-sm tracking-tight text-slate-700 dark:text-slate-300">{brand.name}</span>
                                    </div>
                                    <button onClick={() => handleRemoveBrand(brand.name, 'competitor')} className="hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                        <X className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    </section>

                    {/* Attribute Management */}
                    <section className="space-y-6">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 transition-colors">
                            <Sparkles className="w-3 h-3" /> Research Attributes
                        </label>
                        <div className="flex gap-4">
                            <input
                                type="text"
                                value={attrInput}
                                onChange={e => setAttrInput(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && handleAddAttribute()}
                                placeholder="Add attribute (e.g. Aroma)..."
                                className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-brand-blue/30 focus:bg-white dark:focus:bg-slate-800 rounded-2xl px-6 py-4 text-sm font-bold outline-none transition-all dark:text-white dark:placeholder:text-slate-700 font-display"
                            />
                            <button
                                onClick={handleAddAttribute}
                                className="bg-brand-blue text-white px-8 rounded-2xl font-black text-sm shadow-lg shadow-brand-blue/20 hover:scale-105 transition-all"
                            >
                                Add
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {Object.keys(config.attributes).map(attr => (
                                <span key={attr} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 transition-colors">
                                    {attr}
                                    <button onClick={() => handleRemoveAttribute(attr)} className="hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                                </span>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="p-10 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-5 transition-colors">
                    <button
                        onClick={onClose}
                        className="px-8 py-4 text-sm font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(config)}
                        disabled={!config.category || (config.internal_brands_data.length === 0 && config.competitor_brands_data.length === 0) || Object.keys(config.attributes).length === 0}
                        className="btn-premium flex items-center gap-3 bg-slate-900 dark:bg-brand-blue hover:bg-black dark:hover:bg-brand-blue/80 text-white px-10 py-5 rounded-[2rem] shadow-2xl shadow-slate-900/20 dark:shadow-brand-blue/20 disabled:opacity-30 transition-all font-black text-sm border-none"
                    >
                        Blueprint Schema
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </motion.div>
        </div>
        , document.body);
}
