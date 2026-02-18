import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { Activity, AlertTriangle, RefreshCw, Loader } from 'lucide-react';

export default function FirestoreUsage({ className = '' }) {
    const { currentUser } = useAuth();
    const [readCount, setReadCount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Initial fetch
    useEffect(() => {
        if (currentUser) {
            fetchReadCount();
        }
    }, [currentUser]);

    const fetchReadCount = async () => {
        setLoading(true);
        setError(null);
        try {
            const functions = getFunctions();
            // Call the cloud function "getFirestoreReadCount"
            const getReadCount = httpsCallable(functions, 'getFirestoreReadCount');
            const result = await getReadCount();

            // result.data contains { count, since, projectId }
            setReadCount(result.data.count);
        } catch (err) {
            console.error("Failed to fetch read count:", err);
            // Handle specific error codes if needed
            setError("Could not load usage data. Check permissions.");
        } finally {
            setLoading(false);
        }
    };

    // Determine status color based on usage thresholds
    // Free tier is 50k reads. User is on Blaze but might want warnings relative to that or a custom budget.
    // Let's use 50k as a reference point for "High".
    const getUsageStatus = (count) => {
        if (count > 40000) return 'critical';
        if (count > 25000) return 'warning';
        return 'normal';
    };

    const status = readCount !== null ? getUsageStatus(readCount) : 'normal';

    return (
        <div className={`glass-card p-6 ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-secondary" />
                    Firestore Usage
                </h3>
                <button
                    onClick={fetchReadCount}
                    disabled={loading}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                    title="Refresh Stats"
                >
                    <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {error ? (
                <div className="text-red-400 text-sm flex items-center gap-2 bg-red-400/10 p-3 rounded border border-red-400/20">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            ) : (
                <div>
                    <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                        Reads Today (Midnight PT)
                    </div>

                    {readCount !== null ? (
                        <div>
                            <div className={`text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r 
                                ${status === 'critical' ? 'from-red-500 to-orange-500' :
                                    status === 'warning' ? 'from-yellow-400 to-orange-400' :
                                        'from-primary to-secondary'}`}>
                                {readCount.toLocaleString()}
                            </div>

                            {/* Visual Progress Bar based on 50k soft limit */}
                            <div className="mt-3 h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ${status === 'critical' ? 'bg-red-500' :
                                            status === 'warning' ? 'bg-yellow-400' :
                                                'bg-primary'
                                        }`}
                                    style={{ width: `${Math.min((readCount / 50000) * 100, 100)}%` }}
                                />
                            </div>

                            {status === 'critical' && (
                                <div className="mt-2 text-xs text-red-400 flex items-center gap-1 animate-pulse">
                                    <AlertTriangle className="w-3 h-3" />
                                    Approaching 50k limit!
                                </div>
                            )}

                            <p className="text-xs text-text-muted mt-2">
                                Resets daily. Used for calculating costs/quota.
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-text-muted py-2">
                            <Loader className="w-4 h-4 animate-spin" />
                            Loading...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
