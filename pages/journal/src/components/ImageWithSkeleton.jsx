import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function ImageWithSkeleton({ src, alt, className, imgClassName, onClick, style }) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);

    const handleKeyDown = (event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onClick(event);
        }
    };

    return (
        <div
            className={`relative overflow-hidden bg-white/5 ${className || ''}`}
            style={style}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {/* Skeleton / Shimmer Overlay */}
            {isLoading && (
                <div className="absolute inset-0 z-10 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ backgroundSize: '200% 100%' }} />
            )}

            {/* Actual Image */}
            <img
                src={retryKey ? `${src}${src.includes('?') ? '&' : '?'}retry=${retryKey}` : src}
                alt={alt}
                className={`block transition-opacity duration-500 ease-in-out ${isLoading ? 'opacity-0' : 'opacity-100'} ${imgClassName || 'w-full h-full object-cover'}`}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                }}
            />

            {hasError && (
                <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center bg-surface/90 text-text-muted text-xs">
                    <span>Image unavailable</span>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setHasError(false);
                            setIsLoading(true);
                            setRetryKey(Date.now());
                        }}
                        className="glass-button px-2 py-1 inline-flex items-center gap-1 text-text"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                    </button>
                </div>
            )}
        </div>
    );
}
