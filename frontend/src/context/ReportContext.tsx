import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface ReportContextType {
    activeGroupIndex: number;
    setActiveGroupIndex: (index: any) => void;
    activeTabMap: Record<string, number>;
    setActiveTab: (groupName: string, tabIndex: number) => void;
    navigateToChart: (chartId: string) => void;
    registerChartLocation: (chartId: string, groupIndex: number, tabIndex: number, groupName: string) => void;
}

const ReportContext = createContext<ReportContextType | undefined>(undefined);

export const ReportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeGroupIndex, setActiveGroupIndex] = useState(0);
    const [activeTabMap, setActiveTabMap] = useState<Record<string, number>>({});
    const chartLocations = useMemo(() => new Map<string, { groupIndex: number; tabIndex: number; groupName: string }>(), []);

    const setActiveTab = useCallback((groupName: string, tabIndex: number) => {
        setActiveTabMap(prev => ({ ...prev, [groupName]: tabIndex }));
    }, []);

    const registerChartLocation = useCallback((chartId: string, groupIndex: number, tabIndex: number, groupName: string) => {
        chartLocations.set(chartId, { groupIndex, tabIndex, groupName });
    }, [chartLocations]);

    const navigateToChart = useCallback((chartId: string) => {
        const location = chartLocations.get(chartId);
        if (location) {
            // Update group
            setActiveGroupIndex(location.groupIndex);

            // Update tab within group
            setActiveTab(location.groupName, location.tabIndex);

            // Scroll to group element
            setTimeout(() => {
                const element = document.getElementById(`group-${location.groupIndex}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    }, [chartLocations, setActiveTab]);

    return (
        <ReportContext.Provider value={{
            activeGroupIndex,
            setActiveGroupIndex,
            activeTabMap,
            setActiveTab,
            navigateToChart,
            registerChartLocation
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
