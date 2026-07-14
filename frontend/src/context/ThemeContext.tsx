import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    isForced: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({
    children,
    forcedTheme,
}: {
    children: React.ReactNode;
    forcedTheme?: Theme;
}) {
    const [theme, setTheme] = useState<Theme>(() => {
        if (forcedTheme) {
            return forcedTheme;
        }
        const saved = localStorage.getItem('theme');
        if (saved === 'dark' || saved === 'light') return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    const effectiveTheme = forcedTheme ?? theme;

    useEffect(() => {
        const root = window.document.documentElement;
        if (effectiveTheme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        if (!forcedTheme) {
            localStorage.setItem('theme', effectiveTheme);
        }
    }, [effectiveTheme, forcedTheme]);

    const value = useMemo(
        () => ({
            theme: effectiveTheme,
            toggleTheme: () => {
                if (forcedTheme) {
                    return;
                }
                setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
            },
            isForced: Boolean(forcedTheme),
        }),
        [effectiveTheme, forcedTheme],
    );

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
