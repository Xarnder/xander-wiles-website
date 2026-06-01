import React, { useEffect, useRef } from 'react';

export default function SpecialDayAnimation({ onComplete, buttonRect }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    // Respect user prefers-reduced-motion setting
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      onComplete();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Detect mobile device
    const isMobile = window.innerWidth < 768;

    // Handle high DPI screens
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Particle class representing a single falling/bursting star
    class StarParticle {
      constructor(x, y, isBurst = false) {
        this.x = x;
        this.y = y;
        this.isBurst = isBurst;

        // Size configuration (slightly smaller on mobile)
        const baseSize = isMobile ? 6 : 8;
        this.radius = Math.random() * baseSize + (isMobile ? 3 : 4);
        this.innerRadius = this.radius * 0.4;

        if (isBurst) {
          // Burst outwards from the button coordinate
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * (isMobile ? 5 : 8) + (isMobile ? 3 : 4);
          this.vx = Math.cos(angle) * speed;
          this.vy = Math.sin(angle) * speed;
          this.gravity = 0.15;
          this.friction = 0.95; // slows down fast burst particles
        } else {
          // Rain falling from the top of the viewport
          this.vx = Math.random() * 1.5 - 0.75;
          this.vy = Math.random() * 2 + 1; // falling speed
          this.gravity = 0.01 + Math.random() * 0.02;
          this.friction = 0.99;
        }

        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() * 0.04 - 0.02) * (isBurst ? 2.5 : 1);

        // Curated special yellow/amber/gold colors
        const colors = [
          '#facc15', // yellow-400
          '#fbbf24', // amber-400
          '#fef08a', // yellow-200
          '#fb7185', // rose-400 (very subtle warmth highlight)
          '#f59e0b', // amber-500
          '#ffffff', // white highlight
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];

        // Opacity and lifetime
        this.opacity = Math.random() * 0.4 + 0.6; // 0.6 to 1.0
        this.fadeSpeed = isBurst 
          ? (Math.random() * 0.015 + 0.01) 
          : (Math.random() * 0.005 + 0.003);
        
        this.twinklePhase = Math.random() * Math.PI * 2;
        this.twinkleSpeed = Math.random() * 0.15 + 0.05;
      }

      update() {
        if (this.isBurst) {
          this.vx *= this.friction;
          this.vy *= this.friction;
        }
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;

        this.rotation += this.rotationSpeed;
        this.twinklePhase += this.twinkleSpeed;
        this.opacity -= this.fadeSpeed;
      }

      draw(context) {
        // Opacity fluctuations for twinkling
        const currentOpacity = Math.max(0, this.opacity * (0.7 + Math.sin(this.twinklePhase) * 0.3));
        if (currentOpacity <= 0) return;

        context.save();
        // Use Math.floor on coordinates for mobile performance optimization (prevents anti-aliasing lag)
        context.translate(Math.floor(this.x), Math.floor(this.y));
        context.rotate(this.rotation);

        // Apply drop shadow glow ONLY on non-mobile screens for maximum FPS
        if (!isMobile) {
          context.shadowBlur = 8;
          context.shadowColor = this.color;
        }

        context.beginPath();
        const spikes = 5;
        let rot = (Math.PI / 2) * 3;
        const step = Math.PI / spikes;

        context.moveTo(0, -this.radius);
        for (let i = 0; i < spikes; i++) {
          let px = Math.cos(rot) * this.radius;
          let py = Math.sin(rot) * this.radius;
          context.lineTo(px, py);
          rot += step;

          px = Math.cos(rot) * this.innerRadius;
          py = Math.sin(rot) * this.innerRadius;
          context.lineTo(px, py);
          rot += step;
        }
        context.closePath();

        context.fillStyle = this.color;
        context.globalAlpha = currentOpacity;
        context.fill();
        context.restore();
      }
    }

    const particles = [];
    const buttonX = buttonRect?.x ?? window.innerWidth / 2;
    const buttonY = buttonRect?.y ?? window.innerHeight / 2;

    // 1. Trigger initial explosion burst
    const burstCount = isMobile ? 25 : 55;
    for (let i = 0; i < burstCount; i++) {
      particles.push(new StarParticle(buttonX, buttonY, true));
    }

    // 2. Run the animation loop
    let animationFrameId;
    let framesSinceStart = 0;
    const maxDurationFrames = 3.5 * 60; // ~3.5 seconds at 60fps

    const animate = () => {
      framesSinceStart++;

      // Clear screen
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Spawn rain particles dynamically from the top
      // Lower frequency on mobile
      const spawnChance = isMobile ? 0.25 : 0.45;
      const maxRainParticles = isMobile ? 35 : 75;
      
      const activeRainCount = particles.filter(p => !p.isBurst).length;
      if (Math.random() < spawnChance && activeRainCount < maxRainParticles && framesSinceStart < maxDurationFrames - 60) {
        particles.push(new StarParticle(Math.random() * window.innerWidth, -20, false));
      }

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);

        // Remove dead particles or particles out of bounds
        if (p.opacity <= 0 || p.y > window.innerHeight + 20 || p.x < -20 || p.x > window.innerWidth + 20) {
          particles.splice(i, 1);
        }
      }

      // Stop loop when duration is reached and all particles are cleared
      if (framesSinceStart >= maxDurationFrames && particles.length === 0) {
        onComplete();
      } else {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    // Cleanup on component unmount
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [buttonRect, onComplete]);
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
