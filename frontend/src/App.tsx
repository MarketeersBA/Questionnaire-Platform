import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import CreateSurvey from './pages/CreateSurvey';
import Templates from './pages/Templates';
import TokenManagement from './pages/TokenManagement';
import Analytics from './pages/Analytics';
import PublicSurvey from './pages/PublicSurvey';
import UserManagement from './pages/UserManagement';
import PlatformAnalytics from './pages/PlatformAnalytics';
import ComparisonAnalytics from './pages/Admin/ComparisonAnalytics';
import AttributeBankManager from './pages/Admin/AttributeBankManager';
import SurveysPage from './pages/Surveys';
import SurveyReports from './pages/SurveyReports';
import SurveyResponses from './pages/SurveyResponses';
import SurveyReport from './pages/SurveyReport';
import ReportExportFrame from './pages/ReportExportFrame';
import AdminAITelemetry from './pages/AdminAITelemetry';
import AdminNotifier from './components/notifications/AdminNotifier';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider, useTheme } from './context/ThemeContext';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? <Layout>{children}</Layout> : <Navigate to="/" />;
}

function NoLayoutRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token) return <Navigate to="/" />;
  if (role !== 'admin') return <Navigate to="/dashboard" />;
  return <Layout>{children}</Layout>;
}

function AnalystRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token) return <Navigate to="/" />;
  if (role !== 'admin' && role !== 'analyst') return <Navigate to="/dashboard" />;
  return <Layout>{children}</Layout>;
}

function AppContent() {
  const { theme } = useTheme();

  return (
    <Router>
      <ScrollToTop />
      <div className="min-h-screen bg-brand-dark dark:bg-slate-950 overflow-hidden selection:bg-brand-accent/30 selection:text-white transition-colors duration-500">
        <Toaster theme={theme} position="top-right" richColors />
        <AdminNotifier />
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/templates"
              element={
                <PrivateRoute>
                  <Templates />
                </PrivateRoute>
              }
            />
            <Route
              path="/surveys"
              element={
                <PrivateRoute>
                  <SurveysPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/surveys/reports"
              element={
                <PrivateRoute>
                  <SurveyReports />
                </PrivateRoute>
              }
            />
            <Route
              path="/analytics/compare"
              element={
                <AnalystRoute>
                  <ComparisonAnalytics />
                </AnalystRoute>
              }
            />
            <Route
              path="/user-management"
              element={
                <AdminRoute>
                  <UserManagement />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <AdminRoute>
                  <PlatformAnalytics />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/ai-telemetry"
              element={
                <AdminRoute>
                  <AdminAITelemetry />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/attributes"
              element={
                <AdminRoute>
                  <AttributeBankManager />
                </AdminRoute>
              }
            />
            <Route
              path="/create-survey"
              element={
                <PrivateRoute>
                  <CreateSurvey />
                </PrivateRoute>
              }
            />
            <Route
              path="/surveys/:surveyId"
              element={
                <PrivateRoute>
                  <TokenManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/surveys/:surveyId/responses"
              element={
                <PrivateRoute>
                  <SurveyResponses />
                </PrivateRoute>
              }
            />
            <Route
              path="/surveys/:surveyId/report"
              element={
                <NoLayoutRoute>
                  <SurveyReport />
                </NoLayoutRoute>
              }
            />
            <Route
              path="/surveys/:surveyId/export-frame"
              element={
                <NoLayoutRoute>
                  <ReportExportFrame />
                </NoLayoutRoute>
              }
            />
            <Route
              path="/analytics/:surveyId"
              element={
                <PrivateRoute>
                  <Analytics />
                </PrivateRoute>
              }
            />
            <Route path="/s/:token" element={<PublicSurvey />} />
          </Routes>
        </AnimatePresence>
      </div>
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
