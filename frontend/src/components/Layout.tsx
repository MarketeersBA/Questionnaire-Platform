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
    Layers
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
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:text-brand-blue dark:hover:text-brand-blue hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 hover:border-brand-blue/20 dark:hover:border-brand-blue/50 transition-all shadow-sm group"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
            {theme === 'light' ? (
                <Moon size={18} className="group-hover:scale-110 group-hover:rotate-12 transition-transform" />
            ) : (
                <Sun size={18} className="group-hover:scale-110 group-hover:rotate-12 transition-transform text-brand-blue" />
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

    // Auto-expand Surveys section when on survey-related routes
    useEffect(() => {
        if (sidebarOpen && (location.pathname.startsWith('/surveys') || location.pathname === '/create-survey')) {
            setSurveysOpen(true);
        }
    }, [location.pathname, sidebarOpen]);

    // Force close survey dropdown if sidebar closes to prevent layout bugs
    useEffect(() => {
        if (!sidebarOpen) setSurveysOpen(false);
    }, [sidebarOpen]);



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
        ...(!isClient ? [] : []),
    ];

    const isSurveyActive = location.pathname.startsWith('/surveys') || location.pathname === '/create-survey';

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
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-500">
            <CommandPalette />
            {/* Background Mesh */}
            <div className="bg-mesh pointer-events-none fixed inset-0 z-0">
                <div className="mesh-orb w-[60%] h-[60%] -top-[10%] -left-[10%] bg-brand-blue/10 dark:bg-brand-blue/5 blur-[120px]"></div>
                <div className="mesh-orb w-[70%] h-[70%] top-[40%] -right-[15%] bg-brand-cyan/10 dark:bg-brand-cyan/5 blur-[150px]" style={{ animationDelay: '-5s' }}></div>
                <div className="mesh-orb w-[50%] h-[50%] -bottom-[10%] left-[20%] bg-emerald-500/5 dark:bg-emerald-500/2 blur-[100px]" style={{ animationDelay: '-10s' }}></div>
            </div>

            {/* ── Mini / Expanded Sidebar ── */}
            <aside
                className={`relative z-10 flex flex-col h-screen shrink-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800/50 shadow-xl shadow-slate-200/10 transition-[width,transform,opacity,background-color] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${!sidebarVisible ? 'w-0 opacity-0 -translate-x-full overflow-hidden border-none shadow-none' : sidebarOpen ? 'w-72' : 'w-[88px]'
                    }`}
            >
                <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden custom-scrollbar">

                    {/* Logo */}
                    <div className={`p-8 pb-4 shrink-0 flex items-center ${sidebarOpen ? 'justify-start' : 'justify-center'} min-h-[5rem]`}>
                        <div className="flex items-center gap-4 cursor-pointer group/logo" onClick={() => navigate('/dashboard')} title="Dashboard">
                            <div className="relative flex-shrink-0">
                                <div className="absolute inset-0 bg-brand-blue/20 blur-md rounded-full scale-0 group-hover/logo:scale-125 transition-transform duration-700 opacity-0 group-hover/logo:opacity-100"></div>
                                {/* Use icon only when collapsed, full logo when expanded */}
                                {sidebarOpen ? (
                                    <img src="/brand/logo-full.png" alt="Marketeers" className="h-10 max-w-[200px] object-contain relative transition-transform duration-500 group-hover/logo:scale-105" />
                                ) : (
                                    <div className="w-10 h-10 bg-brand-blue rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-md shadow-brand-blue/20">M</div>
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
                                className={`relative flex items-center gap-3.5 px-4 py-4 rounded-2xl transition-all duration-300 group 
                                    ${sidebarOpen ? 'w-full' : 'w-[52px] mx-auto justify-center'}
                                    ${isSurveyActive
                                        ? 'bg-gradient-to-r from-brand-blue/10 via-brand-blue/5 to-transparent dark:from-brand-blue/20 dark:via-brand-blue/10 text-brand-blue font-black shadow-[0_4px_12px_-2px_rgba(var(--brand-blue-rgb),0.1)] border border-brand-blue/20 dark:border-brand-blue/40'
                                        : 'text-slate-500 dark:text-slate-400 font-bold hover:text-brand-blue dark:hover:text-white hover:bg-brand-blue/5 dark:hover:bg-slate-800/80 hover:translate-x-1'
                                    }`}
                            >
                                {isSurveyActive && sidebarOpen && (
                                    <div className="absolute -left-1 w-1.5 h-7 bg-brand-blue rounded-full shadow-[0_0_12px_rgba(var(--brand-blue-rgb),0.5)]" />
                                )}
                                <div className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0 ${isSurveyActive
                                    ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/30 scale-105'
                                    : 'bg-slate-50 dark:bg-slate-800/50 group-hover:bg-brand-blue/10 text-slate-400 group-hover:text-brand-blue group-hover:shadow-sm'
                                    }`}>
                                    <ClipboardList size={22} strokeWidth={isSurveyActive ? 2.5 : 2} />
                                </div>
                                <div className="flex flex-col flex-1 text-left min-w-0">
                                    <span className={`text-[14px] tracking-tight whitespace-nowrap transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible w-0'}`}>
                                        Surveys
                                    </span>
                                    {sidebarOpen && (
                                        <span className={`text-[10px] font-medium text-slate-400 dark:text-slate-500 line-clamp-1 transition-opacity duration-300 ${isSurveyActive ? 'text-brand-blue/70' : ''}`}>
                                            Research Command
                                        </span>
                                    )}
                                </div>

                                {sidebarOpen && (
                                    <motion.div animate={{ rotate: surveysOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                        <ChevronDown size={16} className={`transition-colors ${isSurveyActive ? 'text-brand-blue' : 'text-slate-400'}`} />
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
                                        <div className="pl-6 pr-2 pb-2 pt-1 space-y-0.5 border-l border-slate-200 dark:border-slate-800 ml-[26px] mt-1">
                                            <NavLink
                                                to="/create-survey"
                                                className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-[12.5px] font-black transition-all group/sub whitespace-nowrap ${isActive
                                                    ? 'bg-white dark:bg-slate-800 text-brand-blue shadow-md border border-slate-100 dark:border-slate-700 translate-x-1'
                                                    : 'text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 dark:hover:bg-slate-800 dark:hover:text-white hover:translate-x-1.5'
                                                    }`}
                                            >
                                                <div className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${location.pathname === '/create-survey' ? 'bg-brand-blue text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover/sub:text-brand-blue'}`}>
                                                    <Plus size={14} strokeWidth={3} />
                                                </div>
                                                <span>Create Survey</span>
                                            </NavLink>
                                            <NavLink
                                                to="/surveys"
                                                className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-[12.5px] font-black transition-all group/sub whitespace-nowrap ${isActive && location.pathname === '/surveys'
                                                    ? 'bg-white dark:bg-slate-800 text-brand-blue shadow-md border border-slate-100 dark:border-slate-700 translate-x-1'
                                                    : 'text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 dark:hover:bg-slate-800 dark:hover:text-white hover:translate-x-1.5'
                                                    }`}
                                            >
                                                <div className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${location.pathname === '/surveys' ? 'bg-brand-blue text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover/sub:text-brand-blue'}`}>
                                                    <ClipboardList size={14} strokeWidth={3} />
                                                </div>
                                                <span>All Surveys</span>
                                            </NavLink>
                                            <NavLink
                                                to="/surveys/reports"
                                                className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-[12.5px] font-black transition-all group/sub whitespace-nowrap ${isActive
                                                    ? 'bg-white dark:bg-slate-800 text-brand-blue shadow-md border border-slate-100 dark:border-slate-700 translate-x-1'
                                                    : 'text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 dark:hover:bg-slate-800 dark:hover:text-white hover:translate-x-1.5'
                                                    }`}
                                            >
                                                <div className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${location.pathname === '/surveys/reports' ? 'bg-brand-blue text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover/sub:text-brand-blue'}`}>
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
                                    relative flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all duration-300 group
                                    ${sidebarOpen ? 'w-full' : 'w-[52px] mx-auto justify-center'}
                                    ${isActive
                                        ? 'bg-white dark:bg-slate-800 text-brand-blue font-black shadow-sm border border-slate-100/80 dark:border-slate-700/50'
                                        : 'text-slate-500 dark:text-slate-400 font-bold hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/50'}
                                `}
                            >
                                {({ isActive }) => (
                                    <>
                                        <div className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0 ${isActive ? 'bg-brand-blue/8 dark:bg-brand-blue/20 text-brand-blue' : 'bg-slate-50 dark:bg-slate-800/50 group-hover:bg-white dark:group-hover:bg-slate-700 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white group-hover:shadow-sm'}`}>
                                            <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                                        </div>
                                        <span className={`text-[12.5px] tracking-tight whitespace-nowrap transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible w-0'}`}>
                                            {item.label}
                                        </span>
                                        {isActive && sidebarOpen && (
                                            <div className="absolute -left-1 w-1 h-5 bg-brand-blue rounded-full" />
                                        )}
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </nav>

                    {/* Footer Toggle and Logout */}
                    <div className="p-4 mt-auto shrink-0 flex flex-col gap-2">
                        {/* Sidebar toggle button moved to footer for elegant collapse */}
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className={`flex items-center gap-3 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-brand-blue dark:hover:text-brand-blue hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 hover:-translate-y-0.5 active:scale-95 transition-all w-full ${sidebarOpen ? 'justify-start px-4' : 'justify-center mx-auto w-[52px]'}`}
                            title={sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
                        >
                            <div className="flex-shrink-0">
                                {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                            </div>
                            <span className={`text-[11px] font-bold whitespace-nowrap transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible w-0'}`}>
                                Collapse
                            </span>
                        </button>

                        <button
                            onClick={handleLogout}
                            title={!sidebarOpen ? 'Sign Out' : undefined}
                            className={`flex items-center gap-3 py-3 rounded-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm border border-slate-300 dark:border-slate-800 group w-full ${sidebarOpen ? 'justify-center' : 'justify-center mx-auto w-[52px]'}`}
                        >
                            <LogOut size={16} className="group-hover:-translate-x-1 transition-transform flex-shrink-0" />
                            <span className={`font-black uppercase tracking-widest text-[9px] whitespace-nowrap transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible w-0'}`}>
                                Sign Out
                            </span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Main Content ── */}
            <main className="relative z-10 flex-1 flex flex-col h-screen overflow-hidden min-w-0 bg-transparent">
                {/* Header */}
                <header className="h-20 flex items-center px-8 justify-between shrink-0 relative z-50">
                    <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-lg border-b border-slate-200/50 dark:border-slate-800/50 transition-colors duration-500"></div>

                    <div className="relative flex items-center gap-4">
                        <button
                            onClick={() => setSidebarVisible(!sidebarVisible)}
                            className="p-3 bg-white dark:bg-slate-800 border border-slate-100/80 dark:border-slate-700/50 rounded-2xl text-slate-400 dark:text-slate-500 hover:text-brand-blue dark:hover:text-brand-blue hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 hover:border-brand-blue/20 dark:hover:border-brand-blue/30 hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm"
                            title={sidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
                        >
                            <Menu size={20} strokeWidth={2.5} />
                        </button>
                        <div className="flex flex-col pl-2 border-l border-slate-200/60 dark:border-slate-800">
                            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-none">{pageTitle()}</h1>
                        </div>
                    </div>

                    <div className="relative flex items-center gap-6">

                        {/* Theme Toggle */}
                        <ThemeToggle />

                        {/* User Node */}
                        <div className="flex items-center gap-4 pl-6 border-l border-slate-200/60 dark:border-slate-800">
                            <div className="text-right hidden sm:block">
                                <p className="text-[11px] font-black text-slate-900 dark:text-white leading-none mb-1">
                                    Admin Portal
                                </p>
                                <p className="text-[9px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                                    {(isAdmin || isAnalyst) ? 'Intelligence Hub' : 'Research Portal'}
                                </p>
                            </div>

                            {/* Admin Quick Menu */}
                            <div className="relative group/admin">
                                <button
                                    onClick={() => isAdmin && navigate('/admin/analytics')}
                                    className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border-2 hover:-translate-y-0.5 active:scale-95 ${isAdmin
                                        ? 'bg-brand-blue border-brand-blue text-white shadow-lg shadow-brand-blue/20 hover:scale-105'
                                        : 'bg-gradient-to-br from-brand-blue to-blue-700 border-white text-white shadow-md'
                                        }`}
                                >
                                    <Users size={18} />
                                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full shadow-sm animate-pulse-slow"></div>
                                </button>

                                {isAdmin && (
                                    <div className="absolute top-full right-0 mt-3 w-64 opacity-0 invisible group-hover/admin:opacity-100 group-hover/admin:visible transition-all duration-300 translate-y-2 group-hover/admin:translate-y-0 z-[60]">
                                        <div className="bg-white dark:bg-slate-900 rounded-[1.75rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                                            <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Partner Command Center</p>
                                            </div>
                                            <div className="p-3 space-y-1">
                                                {adminItems.map((item) => (
                                                    <button
                                                        key={item.path}
                                                        onClick={() => navigate(item.path)}
                                                        className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 transition-all group/item text-left"
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-750 flex items-center justify-center text-slate-400 group-hover/item:text-brand-blue group-hover/item:border-brand-blue/30 transition-all shadow-sm">
                                                            <item.icon size={16} />
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-black text-slate-900 dark:text-white">{item.label}</p>
                                                            <p className="text-[10px] font-bold text-slate-400">{item.description}</p>
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
