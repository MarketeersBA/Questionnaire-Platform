import { useState } from 'react';
import { Filter, X, ChevronDown, Check } from 'lucide-react';

interface FilterPanelProps {
    availableFilters: Record<string, string[]>;
    brands: string[];
    activeFilters: { brands?: string[]; demographics?: Record<string, string[]>; group_by?: string };
    onChange: (filters: { brands?: string[]; demographics?: Record<string, string[]>; group_by?: string }) => void;
    onApply: () => void;
    isApplying: boolean;
}

export function FilterPanel({ availableFilters, brands, activeFilters, onChange, onApply, isApplying }: FilterPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ brands: true, groupByAxis: true });

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const handleBrandChange = (brand: string) => {
        const currentBrands = activeFilters.brands || [...brands]; // Default is all if none specified
        let newBrands;
        if (currentBrands.includes(brand)) {
            newBrands = currentBrands.filter(b => b !== brand);
        } else {
            newBrands = [...currentBrands, brand];
        }
        onChange({ ...activeFilters, brands: newBrands.length === brands.length ? undefined : newBrands });
    };

    const handleDemoChange = (field: string, value: string) => {
        const currentDemos = { ...(activeFilters.demographics || {}) };
        const fieldValues = currentDemos[field] || [];

        if (fieldValues.includes(value)) {
            currentDemos[field] = fieldValues.filter(v => v !== value);
            if (currentDemos[field].length === 0) delete currentDemos[field];
        } else {
            currentDemos[field] = [...fieldValues, value];
        }

        onChange({
            ...activeFilters,
            demographics: Object.keys(currentDemos).length > 0 ? currentDemos : undefined
        });
    };

    // Calculate active count
    const activeCount =
        (activeFilters.brands && activeFilters.brands.length < brands.length ? activeFilters.brands.length : 0) +
        Object.values(activeFilters.demographics || {}).reduce((acc, curr) => acc + curr.length, 0);

    return (
        <div className="relative">
            {/* Filter Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 h-11 px-4 border transition-all rounded-2xl text-[13px] font-black uppercase tracking-wider ${activeCount > 0
                    ? 'text-white border-transparent shadow-lg shadow-primary/25'
                    : 'bg-surface text-ink-muted border-primary/20 hover:border-primary/50 hover:text-primary-soft hover:bg-primary/[0.06]'}`}
                style={activeCount > 0
                    ? { background: 'linear-gradient(135deg, rgb(var(--c-primary)), rgb(var(--c-accent)))' }
                    : undefined}
            >
                <Filter className="w-4 h-4" />
                Filter Matrix
                {activeCount > 0 && (
                    <span className="bg-white/25 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black">
                        {activeCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-3 w-80 max-h-[80vh] overflow-y-auto bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-50 p-4">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                        <h3 className="text-white font-black uppercase tracking-widest text-xs">Dataset Filters</h3>
                        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/5 rounded-lg text-slate-400">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* Brands Filter */}
                        {brands?.length > 0 && (
                            <div className="space-y-2">
                                <button className="flex w-full justify-between items-center text-xs font-bold text-slate-300 uppercase" onClick={() => toggleGroup('brands')}>
                                    Brands
                                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedGroups['brands'] ? 'rotate-180' : ''}`} />
                                </button>
                                {expandedGroups['brands'] && (
                                    <div className="space-y-1 mt-2">
                                        {brands.map(brand => {
                                            const isActive = !(activeFilters.brands) || activeFilters.brands.includes(brand);
                                            return (
                                                <div key={brand} onClick={() => handleBrandChange(brand)} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isActive ? 'bg-primary border-primary text-white' : 'border-slate-600'}`}>
                                                        {isActive && <Check className="w-3 h-3" />}
                                                    </div>
                                                    <span className="text-sm text-slate-300">{brand}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Cross-Tab (Group By) Selector */}
                        <div className="space-y-2 pt-2 border-t border-white/5">
                            <button className="flex w-full justify-between items-center text-xs font-bold text-primary-soft uppercase" onClick={() => toggleGroup('groupByAxis')}>
                                Cross-Tab By
                                <ChevronDown className={`w-4 h-4 transition-transform ${expandedGroups['groupByAxis'] ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedGroups['groupByAxis'] && (
                                <div className="space-y-1 mt-2">
                                    <div
                                        onClick={() => onChange({ ...activeFilters, group_by: undefined })}
                                        className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer"
                                    >
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${!activeFilters.group_by ? 'border-primary' : 'border-slate-600'}`}>
                                            {!activeFilters.group_by && <div className="w-2 h-2 rounded-full bg-primary" />}
                                        </div>
                                        <span className="text-sm text-slate-300">None</span>
                                    </div>
                                    {Object.keys(availableFilters || {}).map(field => {
                                        const isActive = activeFilters.group_by === field;
                                        return (
                                            <div key={`group-${field}`} onClick={() => onChange({ ...activeFilters, group_by: field })} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? 'border-primary' : 'border-slate-600'}`}>
                                                    {isActive && <div className="w-2 h-2 rounded-full bg-primary" />}
                                                </div>
                                                <span className="text-sm text-slate-300 break-words">{field.replace(/_auto|calculated_/g, '').replace(/_/g, ' ')}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Demographics Filters */}
                        {Object.entries(availableFilters || {}).map(([field, values]) => {
                            if (!values || values.length === 0) return null;
                            const isGroupOpen = expandedGroups[field];

                            return (
                                <div key={field} className="space-y-2 pt-2 border-t border-white/5">
                                    <button className="flex w-full justify-between items-center text-xs font-bold text-slate-300 uppercase" onClick={() => toggleGroup(field)}>
                                        {field.replace(/_auto|calculated_/g, '').replace(/_/g, ' ')}
                                        <ChevronDown className={`w-4 h-4 transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isGroupOpen && (
                                        <div className="space-y-1 mt-2">
                                            {values.map(val => {
                                                const isActive = activeFilters.demographics?.[field]?.includes(val);
                                                return (
                                                    <div key={val} onClick={() => handleDemoChange(field, val)} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${isActive ? 'bg-brand-accent border-brand-accent text-white' : 'border-slate-600'}`}>
                                                            {isActive && <Check className="w-3 h-3" />}
                                                        </div>
                                                        <span className="text-sm text-slate-300 break-words">{val}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-6 pt-4 border-t border-white/5 flex gap-3 sticky bottom-0 bg-slate-900 pb-2">
                        <button
                            onClick={() => onChange({ brands: undefined, demographics: undefined })}
                            className="flex-1 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                        >
                            Reset
                        </button>
                        <button
                            onClick={() => {
                                onApply();
                                setIsOpen(false);
                            }}
                            disabled={isApplying}
                            className="flex-1 py-2 bg-primary hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-lg transition-all"
                        >
                            {isApplying ? 'Slicing...' : 'Apply Slice'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
