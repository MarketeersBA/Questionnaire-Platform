import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { masterLink } from '../services/api';

export default function MasterLinkRedirect() {
    const { surveyId } = useParams<{ surveyId: string }>();
    const navigate = useNavigate();
    const [error, setError] = useState(false);
    const isArabicUi = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ar');

    useEffect(() => {
        if (!surveyId) {
            setError(true);
            return;
        }

        let deviceId = localStorage.getItem('master_link_device_id');
        if (!deviceId) {
            deviceId = `dev_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
            localStorage.setItem('master_link_device_id', deviceId);
        }

        masterLink
            .generateToken(surveyId, deviceId)
            .then(({ token }) => {
                navigate(`/s/${token}`, { replace: true });
            })
            .catch(() => {
                setError(true);
            });
    }, [surveyId, navigate]);

    if (error) {
        return (
            <div dir={isArabicUi ? 'rtl' : 'ltr'} className="min-h-screen flex items-center justify-center bg-surface-raised p-6">
                <div className="text-center space-y-4 px-6 py-10 w-full max-w-sm bg-surface rounded-[2rem] border border-line/80 dark:border-line/10 shadow-xl">
                    <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-black text-ink">
                        {isArabicUi ? 'الاستبيان غير متاح' : 'Survey Unavailable'}
                    </h2>
                    <p className="text-ink-muted font-medium max-w-xs mx-auto">
                        {isArabicUi
                            ? 'هذا الرابط لم يعد نشطاً أو أن الاستبيان لم يُنشر بعد.'
                            : 'This survey link is no longer active or the survey has not been published yet.'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div dir={isArabicUi ? 'rtl' : 'ltr'} className="min-h-screen flex items-center justify-center bg-surface-raised p-6">
            <div className="text-center space-y-5 px-6 py-10 w-full max-w-sm bg-surface rounded-[2rem] border border-line/80 dark:border-line/10 shadow-xl">
                <img src="/brand/logo-icon.png" alt="Marketeers" className="w-14 h-14 mx-auto object-contain" />
                <div className="w-10 h-10 rounded-full border-2 border-t-brand-blue border-slate-200 dark:border-slate-700 animate-spin mx-auto" />
                <p className="text-sm font-bold text-ink-subtle uppercase tracking-widest">
                    {isArabicUi ? 'بنجهزلك الاستبيان...' : 'Preparing your session…'}
                </p>
            </div>
        </div>
    );
}
