import { useEffect, useState } from 'react';
import { users } from '../services/api';
import { motion } from 'framer-motion';
import {
    Users,
    Shield,
    Trash2,
    CheckCircle2,
    XCircle,
    Search,
    ShieldAlert,
    Clock
} from 'lucide-react';
import { toast } from 'sonner';

interface User {
    _id: string;
    username: string;
    email: string | null;
    role: string;
    is_active: boolean;
    created_at: string;
}

export default function UserManagement() {
    const [userList, setUserList] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const data = await users.list();
            setUserList(data);
        } catch (err) {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateRole = async (userId: string, newRole: string) => {
        try {
            await users.update(userId, { role: newRole });
            toast.success(`User role updated to ${newRole} `);
            loadUsers();
        } catch (err) {
            toast.error('Failed to update role');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await users.delete(userId);
            toast.success('User deleted successfully');
            loadUsers();
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Failed to delete user');
        }
    };

    const filteredUsers = userList.filter(u =>
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-display font-black text-ink tracking-tight transition-colors">
                        User <span className="text-primary-soft">Governance</span>
                    </h1>
                    <p className="text-ink-muted font-medium mt-1 transition-colors">Manage platform access and privileges</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search identities..."
                            className="bg-surface border border-line/80 dark:border-line/10 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/30 transition-all font-bold w-64 shadow-sm dark:text-white dark:placeholder:text-slate-700"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-surface/50 backdrop-blur-xl rounded-[2.5rem] border border-line/80 dark:border-line/10 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-surface-raised/50 border-b border-line/80 dark:border-line/10 transition-colors">
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-ink-subtle">Identity</th>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-ink-subtle">Privilege</th>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-ink-subtle">Status</th>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-ink-subtle">Registered</th>
                                <th className="px-8 py-5 text-right text-xs font-black uppercase tracking-widest text-ink-subtle">Operations</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-8 py-6 h-20 bg-slate-50/50 dark:bg-slate-800/20"></td>
                                    </tr>
                                ))
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                                                <Users className="w-8 h-8 text-slate-200" />
                                            </div>
                                            <p className="text-slate-400 font-bold">No matching identities found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <motion.tr
                                        key={user._id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary-soft font-black text-xs border border-primary/10 dark:border-primary/30 transition-colors">
                                                    {user.username.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-black text-ink leading-none mb-1 transition-colors">{user.username}</p>
                                                    <p className="text-xs font-bold text-ink-subtle transition-colors">{user.email || 'No email provided'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                {user.role === 'admin' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors">
                                                        <ShieldAlert className="w-3 h-3" />
                                                        Admin
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20 text-primary-soft dark:text-primary-soft rounded-full text-[10px] font-black uppercase tracking-wider transition-colors">
                                                        <Shield className="w-3 h-3" />
                                                        {user.role}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            {user.is_active ? (
                                                <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                                                    <XCircle className="w-4 h-4" />
                                                    Disabled
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
                                                <Clock className="w-4 h-4 text-slate-300" />
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <select
                                                    className="bg-surface border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[10px] font-black uppercase focus:ring-2 focus:ring-primary/20 outline-none dark:text-white transition-colors"
                                                    value={user.role}
                                                    onChange={(e) => handleUpdateRole(user._id, e.target.value)}
                                                >
                                                    <option value="client">Client</option>
                                                    <option value="analyst">Analyst</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                                <button
                                                    onClick={() => handleDeleteUser(user._id)}
                                                    className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                                                    title="Remove Identity"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
