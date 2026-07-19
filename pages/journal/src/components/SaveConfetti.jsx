import React, { useEffect, useRef } from 'react';

const CONFETTI_COLORS = [
    '#8b5cf6',
    '#a78bfa',
    '#22d3ee',
    '#34d399',
    '#facc15',
    '#fb7185',
    '#f97316',
    '#ffffff',
];

function createConfettiPiece(x, y, isBurst, isMobile) {
    const width = Math.random() * (isMobile ? 7 : 9) + (isMobile ? 4 : 5);
    const height = Math.random() * (isMobile ? 4 : 5) + 2;
    let vx;
    let vy;
    let gravity;
    let friction;

    if (isBurst) {
        const angle = (Math.random() * Math.PI) - Math.PI / 2;
        const speed = Math.random() * (isMobile ? 8 : 11) + (isMobile ? 4 : 5);
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed - (isMobile ? 2 : 3);
        gravity = 0.18;
        friction = 0.985;
    } else {
        vx = (Math.random() - 0.5) * 2.2;
        vy = Math.random() * 2.5 + 1.5;
        gravity = 0.05 + Math.random() * 0.04;
        friction = 0.995;
    }

    return {
        x,
        y,
        isBurst,
        width,
        height,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * (isBurst ? 0.35 : 0.18),
        opacity: 1,
        fadeSpeed: isBurst
            ? Math.random() * 0.012 + 0.008
            : Math.random() * 0.006 + 0.003,
        vx,
        vy,
        gravity,
        friction,
    };
}

function updateConfettiPiece(piece) {
    piece.vx *= piece.friction;
    piece.vy += piece.gravity;
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.rotation += piece.rotationSpeed;
    piece.opacity -= piece.fadeSpeed;
}

function drawConfettiPiece(context, piece) {
    if (piece.opacity <= 0) return;

    context.save();
    context.translate(piece.x, piece.y);
    context.rotate(piece.rotation);
    context.globalAlpha = Math.max(0, piece.opacity);
    context.fillStyle = piece.color;
    context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
    context.restore();
}

export default function SaveConfetti({ onComplete }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            onComplete();
            return undefined;
        }

        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;

        const resizeCanvas = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const particles = [];
        const originX = window.innerWidth / 2;
        const originY = Math.min(window.innerHeight * 0.28, 220);
        const burstCount = isMobile ? 42 : 70;

        for (let i = 0; i < burstCount; i += 1) {
            particles.push(createConfettiPiece(
                originX + (Math.random() - 0.5) * 80,
                originY,
                true,
                isMobile
            ));
        }

        let animationFrameId = 0;
        let framesSinceStart = 0;
        const maxDurationFrames = Math.round(2.8 * 60);

        const animate = () => {
            framesSinceStart += 1;
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            const maxRain = isMobile ? 40 : 70;
            const rainCount = particles.filter((piece) => !piece.isBurst).length;
            if (
                framesSinceStart < maxDurationFrames - 40
                && rainCount < maxRain
                && Math.random() < (isMobile ? 0.35 : 0.55)
            ) {
                particles.push(createConfettiPiece(Math.random() * window.innerWidth, -16, false, isMobile));
            }

            for (let i = particles.length - 1; i >= 0; i -= 1) {
                const piece = particles[i];
                updateConfettiPiece(piece);
                drawConfettiPiece(ctx, piece);

                if (
                    piece.opacity <= 0
                    || piece.y > window.innerHeight + 24
                    || piece.x < -40
                    || piece.x > window.innerWidth + 40
                ) {
                    particles.splice(i, 1);
                }
            }

            if (framesSinceStart >= maxDurationFrames && particles.length === 0) {
                onComplete();
                return;
            }

            animationFrameId = window.requestAnimationFrame(animate);
        };

        animationFrameId = window.requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [onComplete]);

    return (
        <div className="fixed inset-0 pointer-events-none z-[9998] overflow-hidden" aria-hidden="true">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        </div>
    );
}
