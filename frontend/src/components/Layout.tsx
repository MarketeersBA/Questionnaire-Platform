import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    FileText,
    LogOut,
    ClipboardList,
    Users,
    Database,
    Activity,
    Plus,
    ChevronDown,
    PanelLeftClose,
    PanelLeftOpen,
    Menu,
    Sun,
    Moon,
    Zap,
    Layers,
    GitCompare,
    ShieldCheck
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

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarVisible, setSidebarVisible] = useState(true);
    const [surveysOpen, setSurveysOpen] = useState(true);
    const [adminOpen, setAdminOpen] = useState(false);

    // Auto-expand Surveys section when on survey-related routes
    useEffect(() => {
        if (sidebarOpen && (location.pathname.startsWith('/surveys') || location.pathname === '/create-survey')) {
            setSurveysOpen(true);
        }
    }, [location.pathname, sidebarOpen]);

    // Force close survey dropdown if sidebar closes to prevent layout bugs
    useEffect(() => {
        if (!sidebarOpen) {
            setSurveysOpen(false);
            setAdminOpen(false);
        }
    }, [sidebarOpen]);

    // Keep the Administration group open while inside an admin route.
    useEffect(() => {
        const inAdmin = location.pathname.startsWith('/admin') || location.pathname === '/user-management';
        if (sidebarOpen && inAdmin) setAdminOpen(true);
    }, [location.pathname, sidebarOpen]);



    const handleLogout = async () => {
        try {
            await auth.logout();
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            navigate('/');
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    const topNavItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', description: 'Performance overview' },
        { icon: Layers, label: 'Templates', path: '/templates', description: 'Design library' },
        // Comparative Hub is a real route (/analytics/compare) that previously had
        // no entry point in the rail — it was only reachable by URL.
        ...(!isClient
            ? [{ icon: GitCompare, label: 'Comparative Hub', path: '/analytics/compare', description: 'Cross-survey benchmarking' }]
            : []),
    ];

    const isSurveyActive = location.pathname.startsWith('/surveys') || location.pathname === '/create-survey';
    const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname === '/user-management';

    const pageTitle = () => {
        if (location.pathname === '/dashboard') return 'Dashboard';
        if (location.pathname === '/surveys') return 'Surveys';
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
                className={`brand-rail relative z-10 flex flex-col h-screen shrink-0 border-r border-white/5 shadow-xl shadow-black/20 transition-[width,transform,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${!sidebarVisible ? 'w-0 opacity-0 -translate-x-full overflow-hidden border-none shadow-none' : sidebarOpen ? 'w-72' : 'w-[88px]'
                    }`}
            >
                <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden custom-scrollbar">

                    {/* Logo — centred and sized to fill the rail head rather than
                        sitting small in a large empty block. */}
                    <div className={`shrink-0 flex items-center justify-center border-b border-white/[0.06] ${sidebarOpen ? 'px-5 py-6' : 'px-3 py-5'}`}>
                        <div className="flex items-center justify-center cursor-pointer group/logo w-full" onClick={() => navigate('/dashboard')} title="Dashboard">
                            <div className="relative flex-shrink-0 grid place-items-center">
                                <div className="absolute inset-0 bg-primary/25 blur-xl rounded-full scale-75 group-hover/logo:scale-125 transition-transform duration-700 opacity-0 group-hover/logo:opacity-100"></div>
                                {/* The logo artwork is navy (#08306B), the same
                                    colour as the rail, so it needs a white plate
                                    to read at all. Full lockup when expanded,
                                    icon alone when collapsed. */}
                                {sidebarOpen ? (
                                    <div className="relative bg-white rounded-2xl px-5 py-4 shadow-lg shadow-black/25 transition-transform duration-500 group-hover/logo:scale-[1.03]">
                                        <img
                                            src="/brand/logo-full.png"
                                            alt="Marketeers"
                                            className="h-16 w-auto max-w-[14rem] object-contain"
                                        />
                                    </div>
                                ) : (
                                    <div className="relative w-12 h-12 rounded-2xl bg-white shadow-lg shadow-black/25 grid place-items-center p-1.5 transition-transform duration-500 group-hover/logo:scale-105">
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
                    <nav className="flex-1 px-4 space-y-1 mt-4">
                        <div className={`px-4 mb-3 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                        </div>

                        {/* 1. Surveys Section */}
                        <div className="mt-1">
                            <button
                                onClick={() => {
                                    if (sidebarOpen) {
                                        setSurveysOpen(prev => !prev);
                                    } else {
                                        navigate('/surveys');
                                    }
                                }}
                                title={!sidebarOpen ? 'Surveys' : undefined}
                                className={`relative flex items-center px-4 py-4 rounded-2xl transition-all duration-300 group
                                    ${sidebarOpen ? 'w-full gap-3.5' : 'w-[52px] h-[52px] mx-auto justify-center gap-0 px-0'}
                                    ${isSurveyActive
                                        ? 'bg-white/10 text-white font-black shadow-[0_4px_12px_-2px_rgba(0,0,0,0.2)] border border-white/10'
                                        : 'text-white/60 font-bold hover:text-white hover:bg-white/5 hover:translate-x-1'
                                    }`}
                            >
                                {isSurveyActive && sidebarOpen && (
                                    <div className="absolute -left-1 w-1.5 h-7 bg-accent rounded-full shadow-[0_0_12px_rgba(var(--brand-accent-rgb),0.5)]" />
                                )}
                                <div className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0 ${isSurveyActive
                                    ? 'bg-accent text-white shadow-lg shadow-accent/30'
                                    : 'bg-white/5 group-hover:bg-white/10 text-white/50 group-hover:text-white group-hover:shadow-sm'
                                    }`}>
                                    <ClipboardList size={20} strokeWidth={isSurveyActive ? 2.5 : 2} />
                                </div>
                                {sidebarOpen && (
                                    <div className="flex flex-col flex-1 text-left min-w-0">
                                        <span className="text-base font-bold tracking-tight whitespace-nowrap">
                                            Surveys
                                        </span>
                                        <span className={`text-[12px] font-medium line-clamp-1 ${isSurveyActive ? 'text-white/60' : 'text-white/40'}`}>
                                            Research Command
                                        </span>
                                    </div>
                                )}

                                {sidebarOpen && (
                                    <motion.div animate={{ rotate: surveysOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                        <ChevronDown size={16} className={`transition-colors ${isSurveyActive ? 'text-white' : 'text-white/40'}`} />
                                    </motion.div>
                                )}
                            </button>

                            <AnimatePresence initial={false}>
                                {sidebarOpen && surveysOpen && (
                                    <motion.div
                                        key="surveys-sub"
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                        className="overflow-hidden"
                                    >
                                        <div className="pl-6 pr-2 pb-2 pt-1 space-y-0.5 border-l border-white/10 ml-[26px] mt-1">
                                            <NavLink
                                                to="/create-survey"
                                                className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group/sub whitespace-nowrap ${isActive
                                                    ? 'bg-white/10 text-white shadow-md border border-white/10 translate-x-1'
                                                    : 'text-white/50 hover:text-white hover:bg-white/10 hover:translate-x-1.5'
                                                    }`}
                                            >
                                                <div className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${location.pathname === '/create-survey' ? 'bg-accent text-white' : 'bg-white/5 text-white/40 group-hover/sub:text-white'}`}>
                                                    <Plus size={14} strokeWidth={3} />
                                                </div>
                                                <span>Create Survey</span>
                                            </NavLink>
                                            <NavLink
                                                to="/surveys"
                                                className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group/sub whitespace-nowrap ${isActive && location.pathname === '/surveys'
                                                    ? 'bg-white/10 text-white shadow-md border border-white/10 translate-x-1'
                                                    : 'text-white/50 hover:text-white hover:bg-white/10 hover:translate-x-1.5'
                                                    }`}
                                            >
                                                <div className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${location.pathname === '/surveys' ? 'bg-accent text-white' : 'bg-white/5 text-white/40 group-hover/sub:text-white'}`}>
                                                    <ClipboardList size={14} strokeWidth={3} />
                                                </div>
                                                <span>All Surveys</span>
                                            </NavLink>
                                            <NavLink
                                                to="/surveys/reports"
                                                className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group/sub whitespace-nowrap ${isActive
                                                    ? 'bg-white/10 text-white shadow-md border border-white/10 translate-x-1'
                                                    : 'text-white/50 hover:text-white hover:bg-white/10 hover:translate-x-1.5'
                                                    }`}
                                            >
                                                <div className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${location.pathname === '/surveys/reports' ? 'bg-accent text-white' : 'bg-white/5 text-white/40 group-hover/sub:text-white'}`}>
                                                    <FileText size={14} strokeWidth={3} />
                                                </div>
                                                <span>Reports</span>
                                            </NavLink>


                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 2, 3, 4 Sections */}
                        {topNavItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                title={!sidebarOpen ? item.label : undefined}
                                className={({ isActive }) => `
                                    relative flex items-center px-3 py-3 rounded-2xl transition-all duration-300 group
                                    ${sidebarOpen ? 'w-full gap-3.5' : 'w-[52px] h-[52px] mx-auto justify-center gap-0 px-0'}
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
                        ))}

                        {/* ── Administration ──
                            These four routes existed only behind a hover menu in the
                            top-right avatar, which made them effectively undiscoverable.
                            Promoting them here also gives the rail real content instead
                            of dead space below Templates. */}
                        {isAdmin && (
                            <div className="pt-2">
                                {sidebarOpen && (
                                    <div className="px-4 pb-1.5 pt-2 text-[8px] font-black uppercase tracking-[0.28em] text-white/30">
                                        Administration
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        if (sidebarOpen) setAdminOpen((p) => !p);
                                        else navigate('/admin/analytics');
                                    }}
                                    title={!sidebarOpen ? 'Administration' : undefined}
                                    className={`relative flex items-center px-3 py-3 rounded-2xl transition-all duration-300 group
                                        ${sidebarOpen ? 'w-full gap-3.5' : 'w-[52px] h-[52px] mx-auto justify-center gap-0 px-0'}
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
                                            <div className="pl-6 pr-2 pb-2 pt-1 space-y-0.5 border-l border-white/10 ml-[26px] mt-1">
                                                {adminItems.map((item) => (
                                                    <NavLink
                                                        key={item.path}
                                                        to={item.path}
                                                        className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group/sub whitespace-nowrap ${isActive
                                                            ? 'bg-white/10 text-white shadow-md border border-white/10 translate-x-1'
                                                            : 'text-white/50 hover:text-white hover:bg-white/10 hover:translate-x-1.5'
                                                            }`}
                                                    >
                                                        <div className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${location.pathname === item.path ? 'bg-accent text-white' : 'bg-white/5 text-white/40 group-hover/sub:text-white'}`}>
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
                    </nav>

                    {/* Footer Toggle and Logout */}
                    <div className="p-4 mt-auto shrink-0 flex flex-col gap-2">
                        {/* Sidebar toggle button moved to footer for elegant collapse */}
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className={`flex items-center py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white hover:bg-white/10 hover:-translate-y-0.5 active:scale-95 transition-all ${sidebarOpen ? 'w-full justify-start px-4 gap-3' : 'w-[52px] h-[52px] justify-center mx-auto gap-0'}`}
                            title={sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
                        >
                            <div className="flex-shrink-0">
                                {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                            </div>
                            {sidebarOpen && (
                                <span className="text-[11px] font-bold whitespace-nowrap">
                                    Collapse
                                </span>
                            )}
                        </button>

                        <button
                            onClick={handleLogout}
                            title={!sidebarOpen ? 'Sign Out' : undefined}
                            className={`flex items-center py-3 rounded-2xl bg-white/5 text-white/70 hover:text-rose-300 hover:bg-rose-950/40 hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm border border-white/10 group justify-center ${sidebarOpen ? 'w-full gap-3' : 'w-[52px] h-[52px] mx-auto gap-0'}`}
                        >
                            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform flex-shrink-0" />
                            {sidebarOpen && (
                                <span className="font-black uppercase tracking-widest text-[9px] whitespace-nowrap">
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
                                    Admin Portal
                                </p>
                                <p className="text-[9px] font-black text-ink-muted uppercase tracking-widest">
                                    {(isAdmin || isAnalyst) ? 'Intelligence Hub' : 'Research Portal'}
                                </p>
                            </div>

                            {/* Admin Quick Menu */}
                            <div className="relative group/admin">
                                <button
                                    onClick={() => isAdmin && navigate('/admin/analytics')}
                                    className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border-2 hover:-translate-y-0.5 active:scale-95 bg-primary border-primary text-white shadow-lg shadow-primary/20 ${isAdmin ? 'hover:scale-105' : ''}`}
                                >
                                    <Users size={18} />
                                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-safe border-2 border-surface rounded-full shadow-sm animate-pulse-slow"></div>
                                </button>

                                {isAdmin && (
                                    <div className="absolute top-full right-0 mt-3 w-64 opacity-0 invisible group-hover/admin:opacity-100 group-hover/admin:visible transition-all duration-300 translate-y-2 group-hover/admin:translate-y-0 z-[60]">
                                        <div className="panel !rounded-[1.75rem] overflow-hidden">
                                            <div className="bg-surface-raised px-6 py-4 border-b border-line/80 dark:border-line/10">
                                                <p className="text-[9px] font-black text-ink-subtle uppercase tracking-widest">Partner Command Center</p>
                                            </div>
                                            <div className="p-3 space-y-1">
                                                {adminItems.map((item) => (
                                                    <button
                                                        key={item.path}
                                                        onClick={() => navigate(item.path)}
                                                        className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-primary/[0.07] hover:-translate-y-0.5 active:scale-95 transition-all group/item text-left"
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-surface border border-line/80 dark:border-line/10 flex items-center justify-center text-ink-subtle group-hover/item:text-primary-soft group-hover/item:border-primary/30 transition-all shadow-sm">
                                                            <item.icon size={16} />
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-black text-ink">{item.label}</p>
                                                            <p className="text-[10px] font-bold text-ink-subtle">{item.description}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
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
