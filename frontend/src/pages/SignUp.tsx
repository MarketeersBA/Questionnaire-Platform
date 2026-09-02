import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/api';
import { motion } from 'framer-motion';
import { ArrowRight, User, Mail, Lock, Loader2 } from 'lucide-react';

export default function SignUp() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await auth.signup({ username, email, password });
      localStorage.setItem('token', response.access_token);
      localStorage.setItem('role', response.role || 'user');
      localStorage.setItem('username', username.trim());
      navigate('/dashboard');
    } catch (err) {
      setError('Unable to sign up. Username may already be taken.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-brand-dark dark:bg-slate-950 flex items-center justify-center p-6 overflow-hidden font-sans text-ink transition-colors duration-500">
      {/* Background Orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[10%] right-[15%] w-[30rem] h-[30rem] bg-primary/5 dark:bg-primary/10 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, -50, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[10%] left-[15%] w-96 h-96 bg-brand-glow/5 dark:bg-brand-glow/10 rounded-full blur-[120px]"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-lg bg-surface rounded-[2.5rem] p-12 border border-line/80 dark:border-line/10 shadow-xl transition-colors"
      >
        <div className="flex flex-col items-center mb-10">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 rounded-[2rem] bg-surface flex items-center justify-center shadow-xl border border-slate-100 dark:border-slate-700 mb-8 overflow-hidden transition-colors"
          >
            <img src="/brand/logo-icon.png" alt="Logo" className="w-16 h-16 object-contain brightness-100 dark:brightness-125" />
          </motion.div>
          <h1 className="text-4xl font-display font-black text-ink text-center transition-colors">
            Create <span className="text-primary-soft">Account</span>
          </h1>
          <p className="mt-3 text-ink-muted text-center font-medium transition-colors">
            Join the lead governance elite.
          </p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-ink-subtle ml-1">Username</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-soft transition-colors">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                required
                className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-ink focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 font-bold"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-ink-subtle ml-1">Email <span className="text-slate-300 dark:text-slate-600">(Optional)</span></label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-soft transition-colors">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-ink focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 font-bold"
                placeholder="admin@enterprise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-ink-subtle ml-1">Password</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-soft transition-colors">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                required
                className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-ink focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 font-bold"
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
            className="w-full py-4 bg-accent hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 group shadow-lg shadow-accent/20 transition-all active:scale-[0.98]"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Create Account
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-ink-muted text-sm font-medium transition-colors">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/')}
              className="text-primary-soft hover:text-primary-soft/80 font-bold transition-colors underline decoration-brand-blue/30"
            >
              Sign in
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
