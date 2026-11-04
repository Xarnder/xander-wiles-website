import { useEffect, useState } from 'react';
import { format } from 'date-fns';

// Calendar dates must refresh after midnight and after an iOS PWA resumes.
export function useToday() {
    const [today, setToday] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    useEffect(() => {
        const refresh = () => setToday(format(new Date(), 'yyyy-MM-dd'));
        const timer = window.setInterval(refresh, 1000);
        window.addEventListener('focus', refresh);
        window.addEventListener('pageshow', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('pageshow', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);
    return today;
}
