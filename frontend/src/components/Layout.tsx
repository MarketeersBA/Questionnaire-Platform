import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useScrollSpy } from '../hooks/useScrollSpy';
import {
    LayoutDashboard,
    LogOut,
    Users,
    Database,
    Activity,
    ChevronDown,
    Menu,
    Sun,
    Moon,
    Zap,
    Layers,
    ShieldCheck,
    PlusCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../services/api';
import CommandPalette from './CommandPalette';
import { useTheme } from '../context/ThemeContext';

interface LayoutProps {
    children: React.ReactNode;
}

const adminItems = [
    { icon: Users, label: 'Team', path: '/user-management', description: 'Manage user access and roles' },
    { icon: Activity, label: 'Platform Stats', path: '/admin/analytics', description: 'Global ecosystem intelligence' },
    { icon: Zap, label: 'AI Telemetry', path: '/admin/ai-telemetry', description: 'Neural quota & cost monitoring' },
    { icon: Database, label: 'Product Bank', path: '/admin/attributes', description: 'Configure research attributes' },
    { icon: Layers, label: 'Custom Modules', path: '/module-builder', description: 'Build and manage custom logic modules' },
];

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();
    return (
        <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:text-primary-soft dark:hover:text-primary-soft hover:bg-primary/5 dark:hover:bg-primary/10 hover:border-primary/20 dark:hover:border-primary/50 transition-all shadow-sm group"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
            {theme === 'light' ? (
                <Moon size={18} className="group-hover:scale-110 group-hover:rotate-12 transition-transform" />
            ) : (
                <Sun size={18} className="group-hover:scale-110 group-hover:rotate-12 transition-transform text-primary-soft" />
            )}
        </button>
    );
};

export default function Layout({ children }: LayoutProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const role = localStorage.getItem('role') || 'user';
    const isAdmin = role === 'admin';
    const isAnalyst = role === 'analyst';
    const isClient = role === 'client';

    const sidebarOpen = true;
    const [sidebarVisible, setSidebarVisible] = useState(true);
    const [adminOpen, setAdminOpen] = useState(false);
    const [username, setUsername] = useState(() => localStorage.getItem('username') || '');

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;
        auth.me()
            .then((user) => {
                setUsername(user.username);
                localStorage.setItem('username', user.username);
            })
            .catch(() => {});
    }, []);

    // Keep the Administration group open while inside an admin route.
    useEffect(() => {
        const inAdmin = location.pathname.startsWith('/admin') || location.pathname === '/user-management';
        if (inAdmin) setAdminOpen(true);
    }, [location.pathname]);



    const handleLogout = async () => {
        try {
            await auth.logout();
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('username');
            navigate('/');
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    const topNavItems = [
        { icon: PlusCircle, label: 'Create Survey', path: '/create-survey', description: 'Build a new study' },
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', description: 'Performance overview' },
        // Comparative Hub temporarily hidden from the rail.
        // Comparative Hub is a real route (/analytics/compare) that previously had
        // no entry point in the rail — it was only reachable by URL.
        // ...(!isClient
        //     ? [{ icon: GitCompare, label: 'Comparative Hub', path: '/analytics/compare', description: 'Cross-survey benchmarking' }]
        //     : []),
    ];

    const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname === '/user-management';
    const isDashboard = location.pathname === '/dashboard';

    const DASH_SECTIONS = [
        { id: 'dash-overview', label: 'Overview' },
        { id: 'all-surveys', label: 'All Surveys' },
    ];

    const spyDashSection = useScrollSpy(
        isDashboard ? DASH_SECTIONS.map((s) => s.id) : [],
        80,
        'main-content',   // the overflow-y-auto scroll container in Layout
    );
    // Click override so the highlight updates immediately on tab press,
    // before the smooth scroll finishes and the spy catches up.
    const [clickedDashSection, setClickedDashSection] = useState<string | null>(null);
    useEffect(() => {
        if (!isDashboard) {
            setClickedDashSection(null);
            return;
        }
        if (!clickedDashSection) return;
        const t = window.setTimeout(() => setClickedDashSection(null), 700);
        return () => window.clearTimeout(t);
    }, [isDashboard, clickedDashSection]);
    const activeDashSection = isDashboard
        ? (clickedDashSection ?? spyDashSection ?? 'dash-overview')
        : null;

    const pageTitle = () => {
        if (location.pathname === '/dashboard') return 'Dashboard';
        if (location.pathname === '/create-survey') return 'Create Survey';
        if (location.pathname === '/templates') return 'Templates';
        if (location.pathname === '/analytics/compare') return 'Comparative Hub';
        if (location.pathname.startsWith('/admin')) return 'Admin Portal';

        // Survey Sub-routes (Specific to General order)
        if (location.pathname.match(/\/surveys\/[^/]+\/responses/)) return 'Responses';
        if (location.pathname.match(/\/surveys\/[^/]+\/report/)) return 'Report';
        if (location.pathname.match(/\/surveys\/[^/]+\/tokens/)) return 'Token Management';
        if (location.pathname.match(/\/surveys\/[^/]+/)) return 'Survey Details';

        if (location.pathname.startsWith('/analytics/')) return 'Analytics';
        return 'Platform';
    };

    return (
        <div className="flex min-h-screen bg-canvas text-ink overflow-hidden font-sans transition-colors duration-500">
            <CommandPalette />
            {/* Background Mesh — the two logo colours, kept faint */}
            <div className="bg-mesh pointer-events-none fixed inset-0 z-0">
                <div className="mesh-orb w-[60%] h-[60%] -top-[10%] -left-[10%] bg-primary/10 blur-[120px]"></div>
                <div className="mesh-orb w-[70%] h-[70%] top-[40%] -right-[15%] bg-accent/[0.07] blur-[150px]" style={{ animationDelay: '-5s' }}></div>
                <div className="mesh-orb w-[50%] h-[50%] -bottom-[10%] left-[20%] bg-primary/[0.06] blur-[100px]" style={{ animationDelay: '-10s' }}></div>
            </div>

            {/* ── Mini / Expanded Sidebar ── */}
            <aside
                className={`brand-rail relative z-20 flex flex-col h-screen shrink-0 border-r border-white/5 shadow-xl shadow-black/20 transition-[width,transform,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${!sidebarVisible ? 'w-0 opacity-0 -translate-x-full overflow-hidden border-none shadow-none' : sidebarOpen ? 'w-72' : 'w-[88px]'
                    }`}
            >
                <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden scrollbar-none">

                    {/* Logo — centred and sized to fill the rail head rather than
                        sitting small in a large empty block. */}
                    <div className={`shrink-0 flex items-center justify-center border-b border-white/[0.06] ${sidebarOpen ? 'px-5 py-6' : 'px-3 py-5'}`}>
                        <div className="flex items-center justify-center cursor-pointer group/logo w-full" onClick={() => navigate('/create-survey')} title="Create Survey">
                            <div className="relative flex-shrink-0 grid place-items-center">
                                <div className="absolute inset-0 bg-primary/25 blur-xl rounded-full scale-75 group-hover/logo:scale-125 transition-transform duration-700 opacity-0 group-hover/logo:opacity-100"></div>
                                {/* The logo artwork is navy, close to the rail
                                    (#00265E), so it needs a white plate to read
                                    at all. Full lockup when expanded, icon alone
                                    when collapsed. */}
                                {sidebarOpen ? (
                                    <div className="relative bg-white rounded-2xl px-5 py-4 shadow-lg shadow-black/25 transition-transform duration-500 group-hover/logo:scale-[1.03]">
                                        <img
                                            src="/brand/logo-full.png"
                                            alt="Marketeers"
                                            className="h-20 w-auto max-w-[16rem] object-contain"
                                        />
                                    </div>
                                ) : (
                                    <div className="relative w-16 h-16 rounded-2xl bg-white shadow-lg shadow-black/25 grid place-items-center p-1.5 transition-transform duration-500 group-hover/logo:scale-105">
                                        <img
                                            src="/brand/logo-icon.png"
                                            alt="Marketeers"
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 px-4 space-y-0.5 mt-2">
                        {topNavItems.map((item) => (
                            <React.Fragment key={item.path}>
                            <NavLink
                                to={item.path}
                                title={!sidebarOpen ? item.label : undefined}
                                className={({ isActive }) => `
                                    relative flex items-center px-3 py-1.5 rounded-2xl transition-all duration-300 group
                                    ${sidebarOpen ? 'w-full gap-3' : 'w-11 h-11 mx-auto justify-center gap-0 px-0'}
                                    ${isActive
                                        ? 'bg-white/10 text-white font-black shadow-sm border border-white/10'
                                        : 'text-white/60 font-bold hover:text-white hover:bg-white/5'}
                                `}
                            >
                                {({ isActive }) => (
                                    <>
                                        <div className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0 ${isActive ? 'bg-accent/90 text-white shadow-lg shadow-accent/30' : 'bg-white/5 group-hover:bg-white/10 text-white/50 group-hover:text-white group-hover:shadow-sm'}`}>
                                            <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                                        </div>
                                        {sidebarOpen && (
                                            <span className="text-sm font-medium tracking-tight whitespace-nowrap">
                                                {item.label}
                                            </span>
                                        )}
                                        {isActive && sidebarOpen && (
                                            <div className="absolute -left-1 w-1 h-5 bg-accent rounded-full" />
                                        )}
                                    </>
                                )}
                            </NavLink>

                            {/* Dashboard scroll-spy sub-items — only when on /dashboard */}
                            {item.path === '/dashboard' && isDashboard && sidebarOpen && (
                                <AnimatePresence>
                                    <motion.div
                                        key="dash-sub"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                                        className="ml-[52px] mt-1 flex flex-col gap-1 overflow-hidden"
                                    >
                                        {DASH_SECTIONS.map((sec) => {
                                            const isSecActive = activeDashSection === sec.id;
                                            return (
                                                <button
                                                    key={sec.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setClickedDashSection(sec.id);
                                                        document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                    }}
                                                    className={`text-left text-[13px] font-semibold px-3 py-2 rounded-xl transition-all duration-200 whitespace-nowrap flex items-center gap-2
                                                        ${isSecActive
                                                            ? 'text-white bg-white/10 border border-white/10'
                                                            : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                                        }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full shrink-0 transition-all duration-200 ${isSecActive ? 'bg-accent scale-125' : 'bg-white/20'}`} />
                                                    {sec.label}
                                                </button>
                                            );
                                        })}
                                    </motion.div>
                                </AnimatePresence>
                            )}
                            </React.Fragment>
                        ))}

                        {/* ── Administration (temporarily hidden from the rail) ──
                            These four routes existed only behind a hover menu in the
                            top-right avatar, which made them effectively undiscoverable.
                            Promoting them here also gives the rail real content instead
                            of dead space below Dashboard.
                        {isAdmin && (
                            <div className="pt-1">
                                {sidebarOpen && (
                                    <div className="px-4 pb-1 pt-1 text-[8px] font-black uppercase tracking-[0.28em] text-white/30">
                                        Administration
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        if (sidebarOpen) setAdminOpen((p) => !p);
                                        else navigate('/admin/analytics');
                                    }}
                                    title={!sidebarOpen ? 'Administration' : undefined}
                                    className={`relative flex items-center px-3 py-1.5 rounded-2xl transition-all duration-300 group
                                        ${sidebarOpen ? 'w-full gap-3' : 'w-11 h-11 mx-auto justify-center gap-0 px-0'}
                                        ${isAdminRoute
                                            ? 'bg-white/10 text-white font-black shadow-sm border border-white/10'
                                            : 'text-white/60 font-bold hover:text-white hover:bg-white/5'}`}
                                >
                                    {isAdminRoute && sidebarOpen && (
                                        <div className="absolute -left-1 w-1 h-5 bg-accent rounded-full" />
                                    )}
                                    <div className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0 ${isAdminRoute ? 'bg-accent/90 text-white shadow-lg shadow-accent/30' : 'bg-white/5 group-hover:bg-white/10 text-white/50 group-hover:text-white'}`}>
                                        <ShieldCheck size={20} strokeWidth={isAdminRoute ? 2.5 : 2} />
                                    </div>
                                    {sidebarOpen && (
                                        <span className="text-sm font-medium tracking-tight whitespace-nowrap flex-1 text-left">
                                            Administration
                                        </span>
                                    )}
                                    {sidebarOpen && (
                                        <motion.div animate={{ rotate: adminOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                            <ChevronDown size={16} className={isAdminRoute ? 'text-white' : 'text-white/40'} />
                                        </motion.div>
                                    )}
                                </button>

                                <AnimatePresence initial={false}>
                                    {sidebarOpen && adminOpen && (
                                        <motion.div
                                            key="admin-sub"
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pl-5 pr-2 pb-1 pt-0.5 space-y-0 border-l border-white/10 ml-[26px] mt-0.5">
                                                {adminItems.map((item) => (
                                                    <NavLink
                                                        key={item.path}
                                                        to={item.path}
                                                        className={({ isActive }) => `flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-sm font-black transition-all group/sub whitespace-nowrap ${isActive
                                                            ? 'bg-white/10 text-white shadow-md border border-white/10 translate-x-1'
                                                            : 'text-white/50 hover:text-white hover:bg-white/10 hover:translate-x-1.5'
                                                            }`}
                                                    >
                                                        <div className={`w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${location.pathname === item.path ? 'bg-accent text-white' : 'bg-white/5 text-white/40 group-hover/sub:text-white'}`}>
                                                            <item.icon size={14} strokeWidth={3} />
                                                        </div>
                                                        <span>{item.label}</span>
                                                    </NavLink>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                        */}
                    </nav>

                    {/* Footer Logout */}
                    <div className="p-4 mt-auto shrink-0 flex flex-col gap-2">
                        <button
                            onClick={handleLogout}
                            title={!sidebarOpen ? 'Sign Out' : undefined}
                            className={`flex items-center py-3 rounded-2xl bg-white/5 text-white/70 hover:text-rose-300 hover:bg-rose-950/40 hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm border border-white/10 group justify-center ${sidebarOpen ? 'w-full gap-3' : 'w-[52px] h-[52px] mx-auto gap-0'}`}
                        >
                            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform flex-shrink-0" />
                            {sidebarOpen && (
                                <span className="font-black uppercase tracking-widest text-[11px] whitespace-nowrap">
                                    Sign Out
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Main Content ── */}
            <main className="relative z-10 flex-1 flex flex-col h-screen overflow-hidden min-w-0 bg-transparent">
                {/* Header */}
                <header className="h-20 flex items-center px-8 justify-between shrink-0 relative z-50">
                    <div className="absolute inset-0 bg-surface/70 backdrop-blur-lg border-b border-line/80 dark:border-line/10 transition-colors duration-500"></div>

                    <div className="relative flex items-center gap-4">
                        <button
                            onClick={() => setSidebarVisible(!sidebarVisible)}
                            className="p-3 bg-surface border border-line/80 dark:border-line/10 rounded-2xl text-ink-subtle hover:text-primary-soft hover:bg-primary/10 hover:border-primary/30 hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm"
                            title={sidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
                        >
                            <Menu size={20} strokeWidth={2.5} />
                        </button>
                        <div className="flex flex-col pl-2 border-l border-line/80 dark:border-line/10">
                            <h1 className="text-xl font-black text-ink tracking-tight leading-none">{pageTitle()}</h1>
                        </div>
                    </div>

                    <div className="relative flex items-center gap-6">

                        {/* Theme Toggle */}
                        <ThemeToggle />

                        {/* User Node */}
                        <div className="flex items-center gap-4 pl-6 border-l border-line/80 dark:border-line/10">
                            <div className="text-right hidden sm:block">
                                <p className="text-[11px] font-black text-ink leading-none mb-1">
                                    {username || 'User'}
                                </p>
                                <p className="text-[11px] font-black text-ink-muted uppercase tracking-widest">
                                    {(isAdmin || isAnalyst) ? 'Intelligence Hub' : 'Research Portal'}
                                </p>
                            </div>

                            <div
                                className="relative w-11 h-11 rounded-xl flex items-center justify-center border-2 bg-primary border-primary text-white shadow-lg shadow-primary/20"
                                aria-hidden
                            >
                                <Users size={18} />
                                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-safe border-2 border-surface rounded-full shadow-sm animate-pulse-slow"></div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div id="main-content" className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-8 py-8 relative z-10 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="max-w-[1500px] mx-auto min-h-full pb-16"
                    >
                        {children}
                    </motion.div>
                </div>
            </main>
        </div>
    );
}

