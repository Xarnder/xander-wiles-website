import React, { useState } from 'react';

export default function ImageWithSkeleton({ src, alt, className, imgClassName, onClick, style }) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    return (
        <div
            className={`relative overflow-hidden bg-white/5 ${className || ''}`}
            style={style}
            onClick={onClick}
        >
            {/* Skeleton / Shimmer Overlay */}
            {isLoading && (
                <div className="absolute inset-0 z-10 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ backgroundSize: '200% 100%' }} />
            )}

            {/* Actual Image */}
            <img
                src={src}
                alt={alt}
                className={`block transition-opacity duration-500 ease-in-out ${isLoading ? 'opacity-0' : 'opacity-100'} ${imgClassName || 'w-full h-full object-cover'}`}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                }}
            />

            {hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-text-muted text-xs">
                    Failed
                </div>
            )}
        </div>
    );
}
