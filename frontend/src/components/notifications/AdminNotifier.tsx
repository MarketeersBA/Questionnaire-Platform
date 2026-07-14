import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { analytics } from '../../services/api';
import { ShieldAlert } from 'lucide-react';

export default function AdminNotifier() {
    const lastCountRef = useRef<number | null>(null);
    const pollerRef = useRef<any>(null);

    const checkEvents = async () => {
        // Only poll if tab is active and we have a token
        if (document.visibilityState !== 'visible') return;

        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const data = await analytics.getOrphans();
            const currentCount = data.total_attempts || 0;

            if (lastCountRef.current !== null && currentCount > lastCountRef.current) {
                const diff = currentCount - lastCountRef.current;
                toast.warning(`Security Alert: ${diff} New orphan submission attempt(s)`, {
                    description: 'Possible unauthorized webhook activity detected.',
                    icon: <ShieldAlert className="w-5 h-5 text-amber-500" />,
                    duration: 5000,
                });
            }
            lastCountRef.current = currentCount;
        } catch (err) {
            // Silently fail to not disturb user
            console.error('Notifier failed to poll:', err);
        }
    };

    useEffect(() => {
        // Initial check
        checkEvents();

        // Start polling every 30 seconds
        pollerRef.current = setInterval(checkEvents, 30000);

        return () => {
            if (pollerRef.current) clearInterval(pollerRef.current);
        };
    }, []);

    return null; // This component doesn't render anything itself
}
