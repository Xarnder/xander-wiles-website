/**
 * Cosmic particle field with subtle mouse repulsion.
 * @param {HTMLCanvasElement} canvas
 * @param {{ getHue?: () => number, hue?: number }} [options]
 */
function initParticleBackground(canvas, options = {}) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canvas || reducedMotion) {
        return { destroy() {} };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return { destroy() {} };
    }

    const defaultHue = options.hue ?? 195;
    const getHue = options.getHue ?? (() => defaultHue);

    const mouse = { x: -9999, y: -9999, active: false };
    const REPULSE_RADIUS = 260;
    const REPULSE_RADIUS_SQ = REPULSE_RADIUS * REPULSE_RADIUS;
    const REPULSE_STRENGTH = 2.7;

    let particles = [];
    let frameId = null;
    let destroyed = false;

    const trackPointer = (clientX, clientY) => {
        mouse.x = clientX;
        mouse.y = clientY;
        mouse.active = true;
    };

    const onMouseMove = (e) => trackPointer(e.clientX, e.clientY);
    const onTouchMove = (e) => {
        if (e.touches[0]) trackPointer(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onMouseLeave = () => {
        mouse.active = false;
    };

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const createParticles = () => {
        const count = Math.min(320, Math.floor((window.innerWidth * window.innerHeight) / 5500));
        particles = Array.from({ length: count }, () => ({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            z: Math.random(),
            speed: 0.22 + Math.random() * 0.45,
            size: 0.6 + Math.random() * 2,
            twinkle: Math.random() * Math.PI * 2,
        }));
    };

    const draw = () => {
        if (destroyed) return;

        if (document.hidden) {
            frameId = requestAnimationFrame(draw);
            return;
        }

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        const hue = getHue();
        const elapsed = hue === 280;

        particles.forEach((p) => {
            if (mouse.active) {
                const dx = p.x - mouse.x;
                const dy = p.y - mouse.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < REPULSE_RADIUS_SQ && distSq > 0.25) {
                    const dist = Math.sqrt(distSq);
                    const influence = 1 - dist / REPULSE_RADIUS;
                    const push = REPULSE_STRENGTH * influence * influence * (0.65 + p.z * 0.55);
                    p.x += (dx / dist) * push;
                    p.y += (dy / dist) * push;
                }
            }

            p.y -= p.speed * (0.65 + p.z * 0.5);
            p.x += Math.sin(p.twinkle) * 0.22;
            p.twinkle += 0.018;

            if (p.y < -10) {
                p.y = window.innerHeight + 10;
                p.x = Math.random() * window.innerWidth;
            }

            const alpha = (0.25 + p.z * 0.75) * (0.6 + Math.sin(p.twinkle) * 0.4);
            ctx.beginPath();
            ctx.fillStyle = `hsla(${hue}, 90%, ${elapsed ? 72 : 78}%, ${alpha})`;
            ctx.arc(p.x, p.y, p.size * (0.6 + p.z), 0, Math.PI * 2);
            ctx.fill();
        });

        frameId = requestAnimationFrame(draw);
    };

    const onResize = () => {
        resize();
        createParticles();
    };

    resize();
    createParticles();
    draw();
    window.addEventListener('resize', onResize);

    return {
        destroy() {
            destroyed = true;
            if (frameId !== null) cancelAnimationFrame(frameId);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('mouseleave', onMouseLeave);
            window.removeEventListener('resize', onResize);
        },
    };
}
