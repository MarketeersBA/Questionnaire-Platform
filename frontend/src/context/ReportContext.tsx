import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type HiddenItemKind = 'section' | 'card';

export interface HiddenItem {
    id: string;
    label: string;
    kind: HiddenItemKind;
}

interface ReportContextType {
    activeGroupIndex: number;
    setActiveGroupIndex: (index: any) => void;
    activeTabMap: Record<string, number>;
    setActiveTab: (groupName: string, tabIndex: number) => void;
    navigateToChart: (chartId: string) => void;
    registerChartLocation: (chartId: string, groupIndex: number, tabIndex: number, groupName: string) => void;

    /** When true (print/export), nothing is treated as hidden. */
    suppressHiding: boolean;
    setSuppressHiding: (value: boolean) => void;
    hiddenItems: HiddenItem[];
    hideItem: (id: string, label: string, kind?: HiddenItemKind) => void;
    showItem: (id: string) => void;
    isItemHidden: (id: string) => boolean;
    clearHiddenItems: () => void;
}

const ReportContext = createContext<ReportContextType | undefined>(undefined);

export const ReportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeGroupIndex, setActiveGroupIndex] = useState(0);
    const [activeTabMap, setActiveTabMap] = useState<Record<string, number>>({});
    const chartLocations = useMemo(() => new Map<string, { groupIndex: number; tabIndex: number; groupName: string }>(), []);
    const [hiddenMap, setHiddenMap] = useState<Record<string, HiddenItem>>({});
    const [suppressHiding, setSuppressHiding] = useState(false);

    const setActiveTab = useCallback((groupName: string, tabIndex: number) => {
        setActiveTabMap(prev => ({ ...prev, [groupName]: tabIndex }));
    }, []);

    const registerChartLocation = useCallback((chartId: string, groupIndex: number, tabIndex: number, groupName: string) => {
        chartLocations.set(chartId, { groupIndex, tabIndex, groupName });
    }, [chartLocations]);

    const navigateToChart = useCallback((chartId: string) => {
        const location = chartLocations.get(chartId);
        if (location) {
            setActiveGroupIndex(location.groupIndex);
            setActiveTab(location.groupName, location.tabIndex);
            setTimeout(() => {
                const element = document.getElementById(`group-${location.groupIndex}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    }, [chartLocations, setActiveTab]);

    const hideItem = useCallback((id: string, label: string, kind: HiddenItemKind = 'card') => {
        setHiddenMap(prev => ({
            ...prev,
            [id]: { id, label: label.trim() || id, kind },
        }));
    }, []);

    const showItem = useCallback((id: string) => {
        setHiddenMap(prev => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    const isItemHidden = useCallback((id: string) => {
        if (suppressHiding) return false;
        return Boolean(hiddenMap[id]);
    }, [hiddenMap, suppressHiding]);

    const clearHiddenItems = useCallback(() => setHiddenMap({}), []);

    const hiddenItems = useMemo(
        () => Object.values(hiddenMap).sort((a, b) => a.label.localeCompare(b.label)),
        [hiddenMap],
    );

    return (
        <ReportContext.Provider value={{
            activeGroupIndex,
            setActiveGroupIndex,
            activeTabMap,
            setActiveTab,
            navigateToChart,
            registerChartLocation,
            suppressHiding,
            setSuppressHiding,
            hiddenItems,
            hideItem,
            showItem,
            isItemHidden,
            clearHiddenItems,
        }}>
            {children}
        </ReportContext.Provider>
    );
};

export const useReport = () => {
    const context = useContext(ReportContext);
    if (!context) throw new Error('useReport must be used within a ReportProvider');
    return context;
};

/** Safe for components that may render outside the report page (e.g. export frame). */
export const useReportVisibility = () => {
    const context = useContext(ReportContext);
    return {
        isItemHidden: (id: string) => (context ? context.isItemHidden(id) : false),
        hideItem: (id: string, label: string, kind: HiddenItemKind = 'card') => {
            context?.hideItem(id, label, kind);
        },
        showItem: (id: string) => {
            context?.showItem(id);
        },
    };
};
