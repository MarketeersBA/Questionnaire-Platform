import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { masterLink } from '../services/api';

export default function MasterLinkRedirect() {
    const { surveyId } = useParams<{ surveyId: string }>();
    const navigate = useNavigate();
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!surveyId) {
            setError(true);
            return;
        }

        masterLink
            .generateToken(surveyId)
            .then(({ token }) => {
                navigate(`/s/${token}`, { replace: true });
            })
            .catch(() => {
                setError(true);
            });
    }, [surveyId, navigate]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="text-center space-y-4 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Survey Unavailable</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">
                        This survey link is no longer active or the survey has not been published yet.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
            <div className="text-center space-y-4">
                <div className="w-12 h-12 rounded-full border-2 border-t-brand-blue border-slate-200 dark:border-slate-700 animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Preparing your session…
                </p>
            </div>
        </div>
    );
}
