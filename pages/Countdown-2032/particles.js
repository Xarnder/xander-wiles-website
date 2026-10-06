/**
 * Points and soft orbs that enter from the screen edge and drift into the centre.
 * Same entry point as the shared particle field, so the countdown can swap scripts.
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

    const defaultHue = options.hue ?? 20;
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

    const pointOnPerimeter = (w, h) => {
        const margin = 16;
        const perimeter = 2 * (w + h);
        let distance = Math.random() * perimeter;

        if (distance < w) {
            return { x: distance, y: -margin };
        }
        distance -= w;
        if (distance < h) {
            return { x: w + margin, y: distance };
        }
        distance -= h;
        if (distance < w) {
            return { x: w - distance, y: h + margin };
        }
        distance -= w;
        return { x: -margin, y: h - distance };
    };

    const assignPath = (particle, progress) => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const origin = pointOnPerimeter(w, h);
        const spread = particle.kind === 'orb' ? 0.16 : 0.3;
        const targetX = w / 2 + (Math.random() - 0.5) * w * spread;
        const targetY = h / 2 + (Math.random() - 0.5) * h * spread;
        const dx = targetX - origin.x;
        const dy = targetY - origin.y;
        const distance = Math.hypot(dx, dy) || 1;
        const pxSpeed = particle.kind === 'orb'
            ? 0.22 + Math.random() * 0.38
            : 0.4 + Math.random() * 0.85;

        particle.ox = origin.x;
        particle.oy = origin.y;
        particle.tx = targetX;
        particle.ty = targetY;
        particle.progress = progress;
        particle.progressSpeed = pxSpeed / distance;
        particle.pushX = 0;
        particle.pushY = 0;
    };

    const createParticle = (kind, progress) => {
        const particle = {
            kind,
            size: kind === 'orb' ? 18 + Math.random() * 36 : 0.6 + Math.random() * 2.1,
            z: Math.random(),
            twinkle: Math.random() * Math.PI * 2,
            hueShift: (Math.random() - 0.5) * (kind === 'orb' ? 28 : 16),
        };
        assignPath(particle, progress);
        return particle;
    };

    const createParticles = () => {
        const area = window.innerWidth * window.innerHeight;
        const pointCount = Math.min(280, Math.floor(area / 6500));
        const orbCount = Math.min(26, Math.max(8, Math.floor(area / 52000)));
        particles = [
            ...Array.from({ length: pointCount }, () => createParticle('point', Math.random() * 0.92)),
            ...Array.from({ length: orbCount }, () => createParticle('orb', Math.random() * 0.85)),
        ];
    };

    const place = (particle) => {
        const dx = particle.tx - particle.ox;
        const dy = particle.ty - particle.oy;
        const len = Math.hypot(dx, dy) || 1;
        const wobble = Math.sin(particle.twinkle) * (particle.kind === 'orb' ? 16 : 7);
        return {
            x: particle.ox + dx * particle.progress + (-dy / len) * wobble + particle.pushX,
            y: particle.oy + dy * particle.progress + (dx / len) * wobble + particle.pushY,
        };
    };

    const edgeFade = (progress) => {
        const fadeIn = Math.min(1, progress / 0.1);
        const fadeOut = Math.min(1, (1 - progress) / 0.22);
        return fadeIn * fadeOut;
    };

    const drawPoint = (particle, hue, pos) => {
        const alpha = (0.28 + particle.z * 0.72) * (0.55 + Math.sin(particle.twinkle) * 0.4) * edgeFade(particle.progress);
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue + particle.hueShift}, 78%, 68%, ${alpha})`;
        ctx.arc(pos.x, pos.y, particle.size * (0.65 + particle.z), 0, Math.PI * 2);
        ctx.fill();
    };

    const drawOrb = (particle, hue, pos) => {
        const alpha = (0.16 + particle.z * 0.22) * edgeFade(particle.progress);
        const radius = particle.size * (0.75 + particle.z * 0.45);
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
        const orbHue = hue + particle.hueShift;
        gradient.addColorStop(0, `hsla(${orbHue}, 70%, 72%, ${alpha})`);
        gradient.addColorStop(0.35, `hsla(${orbHue}, 62%, 42%, ${alpha * 0.45})`);
        gradient.addColorStop(1, `hsla(${orbHue}, 50%, 18%, 0)`);
        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
    };

    const draw = () => {
        if (destroyed) return;

        if (document.hidden) {
            frameId = requestAnimationFrame(draw);
            return;
        }

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        const hue = getHue();

        particles.forEach((particle) => {
            const pos = place(particle);

            if (mouse.active) {
                const dx = pos.x - mouse.x;
                const dy = pos.y - mouse.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < REPULSE_RADIUS_SQ && distSq > 0.25) {
                    const dist = Math.sqrt(distSq);
                    const influence = 1 - dist / REPULSE_RADIUS;
                    const push = REPULSE_STRENGTH * influence * influence * (0.65 + particle.z * 0.55);
                    particle.pushX += (dx / dist) * push;
                    particle.pushY += (dy / dist) * push;
                }
            }

            particle.pushX *= 0.94;
            particle.pushY *= 0.94;
            particle.progress += particle.progressSpeed;
            particle.twinkle += particle.kind === 'orb' ? 0.008 : 0.016;

            if (particle.progress >= 1) {
                assignPath(particle, 0);
            }
        });

        particles.forEach((particle) => {
            if (particle.kind !== 'orb') return;
            drawOrb(particle, hue, place(particle));
        });
        particles.forEach((particle) => {
            if (particle.kind !== 'point') return;
            drawPoint(particle, hue, place(particle));
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
