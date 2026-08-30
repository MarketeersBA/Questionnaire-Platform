import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/api';
import { motion } from 'framer-motion';
import { ArrowRight, User, Lock, Loader2 } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await auth.login(username.trim(), password.trim());
      localStorage.setItem('token', response.access_token);
      localStorage.setItem('role', response.role || 'user');
      localStorage.setItem('username', username.trim());
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Invalid username or password');
      } else if (err.code === 'ERR_NETWORK') {
        setError('Cannot connect to server. Please check if backend is running.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark dark:bg-slate-950 flex flex-col justify-center py-12 px-6 lg:px-8 relative overflow-hidden font-sans text-ink transition-colors duration-500">
      {/* Soft Light Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/5 dark:bg-primary/10 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-brand-glow/5 dark:bg-brand-glow/10 rounded-full blur-[140px]"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md mx-auto bg-surface rounded-[2.5rem] p-10 shadow-2xl border border-line/80 dark:border-line/10 transition-colors"
      >
        <div className="sm:mx-auto sm:w-full sm:max-auto text-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center p-4 bg-surface rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 mb-8 transition-colors"
          >
            <img
              src="/brand/logo-icon.png"
              alt="Marketeers Logo"
              className="w-16 h-16 object-contain brightness-100 dark:brightness-125"
            />
          </motion.div>
          <h2 className="text-4xl font-black font-display tracking-tight text-ink mb-2 transition-colors">
            Welcome <span className="text-primary-soft italic font-light">Back</span>
          </h2>
          <p className="text-ink-muted font-medium transition-colors">Access your verification control board</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">Member Identity</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-soft transition-colors">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                required
                className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-ink focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 font-bold"
                placeholder="name@company.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">Secure Key</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-soft transition-colors">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                required
                className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-ink focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 font-bold"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-sm font-bold text-rose-400 bg-rose-400/10 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-400/20 dark:border-rose-900/50 text-center"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-premium w-full py-4 text-white flex items-center justify-center gap-2 group shadow-lg shadow-brand-accent/20"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Sign in to Dashboard
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-ink-muted text-sm font-medium transition-colors">
            New to the platform?{' '}
            <button
              onClick={() => navigate('/signup')}
              className="text-primary-soft hover:underline font-bold transition-colors"
            >
              Construct Account
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

