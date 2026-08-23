import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { surveys } from '../services/api';
import { toast } from 'sonner';
import CreateSurvey from './CreateSurvey';
import { Loader2 } from 'lucide-react';

export default function EditSurvey() {
    const { surveyId } = useParams<{ surveyId: string }>();
    const navigate = useNavigate();
    const [surveyData, setSurveyData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!surveyId) return;
        (async () => {
            try {
                const data = await surveys.get(surveyId);
                if (data.status === 'closed') {
                    toast.error('Closed surveys cannot be edited.');
                    navigate('/surveys');
                    return;
                }
                setSurveyData(data);
            } catch {
                toast.error('Failed to load survey for editing.');
                navigate('/surveys');
            } finally {
                setLoading(false);
            }
        })();
    }, [surveyId, navigate]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-primary-soft animate-spin" />
                    <p className="text-sm font-bold text-ink-muted uppercase tracking-widest">
                        Loading survey…
                    </p>
                </div>
            </div>
        );
    }

    if (!surveyData) return null;

    return (
        <CreateSurvey
            editSurveyId={surveyId}
            initialSurveyData={surveyData}
        />
    );
}
