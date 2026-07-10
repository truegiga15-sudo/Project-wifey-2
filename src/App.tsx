/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { LoveAudioEngine } from './audioEngine';

// Interfaces for particle elements
interface WordParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  homeX: number;
  homeY: number;
  targetAngle: number;
  angle: number;
  scale: number;
  alpha: number;
  text: string;
  fontSize: number;
  color: string;
  speedFactor: number;
  seed: number;
  mass: number;
  active: boolean;
  
  // Cache rendering fields to achieve solid 60+ FPS
  canvas?: HTMLCanvasElement;
  textWidth?: number;
  textHeight?: number;
  glowCanvas?: HTMLCanvasElement;
  glowWidth?: number;
  glowHeight?: number;
}

interface DecorativePetal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  alpha: number;
  color: string;
  type: 'petal' | 'heart' | 'sparkle';
  life: number;
  maxLife: number;
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  seed: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<LoveAudioEngine | null>(null);

  // Core visual simulation refs (to run at 120fps with no React state overhead)
  const stateRef = useRef({
    particles: [] as WordParticle[],
    petals: [] as DecorativePetal[],
    dust: [] as DustParticle[],
    activeCount: 1, // Stage 1 starts with 1 particle
    maxParticles: 1200,
    stage: 'origin' as 'origin' | 'bloom' | 'heart' | 'surprise',
    stageProgress: 0,
    
    // Noise pattern cache
    noiseCanvas: null as HTMLCanvasElement | null,
    
    // Beat timing
    beatTimer: 0,
    heartbeatScale: 1.0,
    lastHeartbeatTime: 0,
    
    // Mouse interaction
    mouse: { x: -1000, y: -1000, active: false, px: 0, py: 0 },
    
    // Pulses / Ripples
    pulses: [] as { x: number; y: number; radius: number; maxRadius: number; strength: number; active: boolean }[],
    
    // Camera
    camX: 0,
    camY: 0,
    camZoom: 1.0,
    
    // Timing / FPS
    lastFrameTime: 0,
    timeElapsed: 0,
    frameCount: 0,
    fpsCalcTime: 0,

    // Surprise Word Targets cached
    surpriseWordsTargets: {} as Record<string, { x: number; y: number }[]>,
    surpriseTimer: 0,
    surpriseDuration: 4000, // 4s total (1.5s morph, 1s hold, 1.5s morph back)
    surpriseWord: '',
    
    // Colors
    colors: {
      bg: '#060608',
      textMain: '#FFB6D9',
      glowMain: '#FF6AB8',
      glowSecondary: '#FFCBEA',
    }
  });

  // Texts configuration
  const PRIMARY_TEXT = "I love you";
  const SECONDARY_TEXTS = [
    "Forever", "Always", "Endlessly", "My Home", 
    "You're My Peace", "My Favorite Person", "My Universe", 
    "With All My Heart", "Only You", "Love Always"
  ];

  // Setup simulation and audio engine
  useEffect(() => {
    // Instantiate audio engine
    audioRef.current = new LoveAudioEngine();

    // Setup canvas
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      
      // Recalculate targets based on new screen size
      recalculateTargets(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Initialize particles
    initializeSimulation(window.innerWidth, window.innerHeight);

    // Re-cache once fonts are ready to ensure perfect rendering bounds
    document.fonts.ready.then(() => {
      stateRef.current.particles.forEach(p => {
        p.canvas = undefined;
        p.glowCanvas = undefined;
      });
    });

    // Start requestAnimationFrame loop
    let animationId: number;
    const renderLoop = (timestamp: number) => {
      if (stateRef.current.lastFrameTime === 0) {
        stateRef.current.lastFrameTime = timestamp;
        stateRef.current.fpsCalcTime = timestamp;
      }
      
      const dt = timestamp - stateRef.current.lastFrameTime;
      stateRef.current.lastFrameTime = timestamp;
      
      updateAndRender(dt);
      
      animationId = requestAnimationFrame(renderLoop);
    };

    animationId = requestAnimationFrame(renderLoop);

    // Auto-transition to Bloom stage after 3.5 seconds (Stage 1 -> Stage 2)
    const bloomTimeout = setTimeout(() => {
      transitionToStage('bloom');
    }, 3500);

    // Click/touch listener on the window to unlock Audio context seamlessly
    const initAudioOnInteraction = () => {
      if (audioRef.current) {
        audioRef.current.init();
      }
    };
    window.addEventListener('click', initAudioOnInteraction, { once: true });
    window.addEventListener('touchstart', initAudioOnInteraction, { once: true });

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(bloomTimeout);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('click', initAudioOnInteraction);
      window.removeEventListener('touchstart', initAudioOnInteraction);
      if (audioRef.current) {
        audioRef.current.destroy();
      }
    };
  }, []);

  // Initialize all elements (particles, dust, petals)
  const initializeSimulation = (width: number, height: number) => {
    const s = stateRef.current;
    const isMobile = width < 768;
    s.maxParticles = isMobile ? 650 : 1200;
    s.particles = [];
    s.petals = [];
    s.dust = [];

    // 1. Generate text particles
    for (let i = 0; i < s.maxParticles; i++) {
      const isPrimary = Math.random() < 0.65;
      const text = isPrimary 
        ? PRIMARY_TEXT 
        : SECONDARY_TEXTS[Math.floor(Math.random() * SECONDARY_TEXTS.length)];
      
      const fontSize = isPrimary 
        ? 10 + Math.random() * 3 
        : 8 + Math.random() * 4;

      const hue = 330 + Math.random() * 25;
      const sat = 85 + Math.random() * 15;
      const light = 78 + Math.random() * 14;
      const color = `hsl(${hue}, ${sat}%, ${light}%)`;

      const x = width / 2;
      const y = height / 2;

      s.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        targetX: x,
        targetY: y,
        homeX: x,
        homeY: y,
        targetAngle: 0,
        angle: 0,
        scale: 0.01,
        alpha: 0,
        text,
        fontSize,
        color,
        speedFactor: 0.6 + Math.random() * 0.8,
        seed: Math.random() * 100,
        mass: 1.0 + Math.random() * 0.5,
        active: false
      });
    }

    s.particles[0].active = true;
    s.particles[0].alpha = 1;
    s.particles[0].scale = 1.0;

    // 2. Pre-generate dust particles (atmospheric depth)
    const dustCount = isMobile ? 35 : 70;
    for (let i = 0; i < dustCount; i++) {
      s.dust.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.12 - 0.05,
        size: 0.6 + Math.random() * 1.5,
        alpha: 0.1 + Math.random() * 0.4,
        seed: Math.random() * 100
      });
    }

    // 3. Pre-render a tiny 128x128 noise canvas for optimized film grain
    const noise = document.createElement('canvas');
    noise.width = 128;
    noise.height = 128;
    const nctx = noise.getContext('2d');
    if (nctx) {
      const imgData = nctx.createImageData(128, 128);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const val = Math.floor(Math.random() * 255);
        d[i] = val;
        d[i+1] = val;
        d[i+2] = val;
        d[i+3] = 16; // very soft grain alpha
      }
      nctx.putImageData(imgData, 0, 0);
    }
    s.noiseCanvas = noise;

    s.surpriseWordsTargets['LOVE'] = getWordCoordinates('LOVE', width, height);
    s.surpriseWordsTargets['FOREVER'] = getWordCoordinates('FOREVER', width, height);
    s.surpriseWordsTargets['ALWAYS'] = getWordCoordinates('ALWAYS', width, height);

    recalculateTargets(width, height);
  };

  // Recalculates mathematically smooth heart target layout
  const recalculateTargets = (width: number, height: number) => {
    const s = stateRef.current;
    const cx = width / 2;
    const cy = height / 2 - 20;

    const isMobile = width < 768;
    const heartScale = isMobile ? (width / 42) : (Math.min(width, height) / 52);

    for (let i = 0; i < s.maxParticles; i++) {
      const p = s.particles[i];
      if (!p) continue;

      const t = (i / s.maxParticles) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));

      p.homeX = cx + hx * heartScale;
      p.homeY = cy + hy * heartScale;

      const dx = 48 * Math.pow(Math.sin(t), 2) * Math.cos(t);
      const dy = 13 * Math.sin(t) - 10 * Math.sin(2*t) - 6 * Math.sin(3*t) - 4 * Math.sin(4*t);
      
      let angle = Math.atan2(dy, dx);
      if (angle > Math.PI / 2) {
        angle -= Math.PI;
      } else if (angle < -Math.PI / 2) {
        angle += Math.PI;
      }

      p.targetAngle = angle;

      if (s.stage !== 'surprise') {
        p.targetX = p.homeX;
        p.targetY = p.homeY;
      }
    }

    s.surpriseWordsTargets['LOVE'] = getWordCoordinates('LOVE', width, height);
    s.surpriseWordsTargets['FOREVER'] = getWordCoordinates('FOREVER', width, height);
    s.surpriseWordsTargets['ALWAYS'] = getWordCoordinates('ALWAYS', width, height);
  };

  // Convert a standard word string into a sampled array of target coordinates
  const getWordCoordinates = (word: string, screenWidth: number, screenHeight: number): { x: number; y: number }[] => {
    const s = stateRef.current;
    const offscreen = document.createElement('canvas');
    offscreen.width = 650;
    offscreen.height = 180;
    const octx = offscreen.getContext('2d');
    if (!octx) return [];

    octx.fillStyle = '#000000';
    octx.fillRect(0, 0, offscreen.width, offscreen.height);

    octx.fillStyle = '#ffffff';
    const isMobile = screenWidth < 768;
    const fontSize = isMobile ? 65 : 85;
    octx.font = `500 ${fontSize}px "Cinzel", "Cormorant Garamond", serif`;
    octx.letterSpacing = "6px";
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(word, offscreen.width / 2, offscreen.height / 2);

    const imgData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
    const data = imgData.data;
    const points: { x: number; y: number }[] = [];

    for (let y = 0; y < offscreen.height; y += 2) {
      for (let x = 0; x < offscreen.width; x += 2) {
        const idx = (y * offscreen.width + x) * 4;
        if (data[idx] > 120) {
          points.push({
            x: screenWidth / 2 + (x - offscreen.width / 2) * (isMobile ? 0.95 : 1.35),
            y: screenHeight / 2 + (y - offscreen.height / 2) * (isMobile ? 0.95 : 1.35)
          });
        }
      }
    }

    if (points.length === 0) {
      for (let i = 0; i < s.maxParticles; i++) {
        const t = (i / s.maxParticles) * Math.PI * 2;
        points.push({
          x: screenWidth / 2 + Math.cos(t) * 150,
          y: screenHeight / 2 + Math.sin(t) * 150
        });
      }
    }

    const finalPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < s.maxParticles; i++) {
      const pt = points[Math.floor((i / s.maxParticles) * points.length)];
      finalPoints.push({
        x: pt.x + (Math.random() - 0.5) * 5,
        y: pt.y + (Math.random() - 0.5) * 5
      });
    }

    return finalPoints;
  };

  // The central update and rendering cycle
  const updateAndRender = (dt: number) => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cappedDt = Math.min(dt, 100);
    s.timeElapsed += cappedDt * 0.001;

    // Fixed gorgeous glow intensity aura
    const intensity = 1.25;

    // Manage dynamic particle duplication scaling (Stage 1 -> Stage 2 -> Stage 3)
    if (s.stage === 'origin') {
      s.activeCount = 1;
    } else if (s.stage === 'bloom') {
      if (s.activeCount < s.maxParticles) {
        s.activeCount = Math.min(s.maxParticles, s.activeCount + 8);
      } else {
        transitionToStage('heart');
      }
    } else if (s.stage === 'heart') {
      s.activeCount = s.maxParticles;
      
      if (Math.random() < 0.08) {
        spawnRandomPetal();
      }

      s.surpriseTimer += cappedDt;
      if (s.surpriseTimer >= 18000) {
        s.surpriseTimer = 0;
        const words = ['LOVE', 'FOREVER', 'ALWAYS'];
        triggerSurpriseWord(words[Math.floor(Math.random() * words.length)]);
      }
    } else if (s.stage === 'surprise') {
      s.activeCount = s.maxParticles;
      s.surpriseTimer += cappedDt;

      if (Math.random() < 0.15) {
        spawnRandomPetal();
      }

      if (s.surpriseTimer >= s.surpriseDuration) {
        s.surpriseTimer = 0;
        transitionToStage('heart');
      }
    }

    s.beatTimer += cappedDt * 0.001;
    if (s.beatTimer >= 1.2) {
      s.beatTimer = 0;
      triggerHeartbeat();
    }

    s.heartbeatScale += (1.0 - s.heartbeatScale) * 0.08;

    // Background
    ctx.fillStyle = s.colors.bg;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    // Ambient background radial light
    const ambientGlow = ctx.createRadialGradient(
      window.innerWidth / 2 + Math.sin(s.timeElapsed * 0.5) * 30,
      window.innerHeight / 2 + Math.cos(s.timeElapsed * 0.3) * 20,
      10,
      window.innerWidth / 2,
      window.innerHeight / 2,
      Math.max(window.innerWidth, window.innerHeight) * 0.6
    );
    ambientGlow.addColorStop(0, 'rgba(255, 106, 184, 0.045)');
    ambientGlow.addColorStop(0.5, 'rgba(255, 182, 217, 0.015)');
    ambientGlow.addColorStop(1, 'rgba(6, 6, 8, 0)');
    ctx.fillStyle = ambientGlow;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    // Apply slow camera zoom and floating parallax drift
    ctx.save();
    s.camX = Math.sin(s.timeElapsed * 0.25) * 8;
    s.camY = Math.cos(s.timeElapsed * 0.2) * 5;
    s.camZoom = 1.0 + Math.sin(s.timeElapsed * 0.12) * 0.02;

    ctx.translate(window.innerWidth / 2 + s.camX, window.innerHeight / 2 + s.camY);
    ctx.scale(s.camZoom, s.camZoom);
    ctx.translate(-window.innerWidth / 2, -window.innerHeight / 2);

    // Background dust particles
    ctx.fillStyle = 'rgba(255, 203, 234, 0.3)';
    s.dust.forEach(d => {
      d.x += d.vx;
      d.y += d.vy;
      d.x += Math.sin(s.timeElapsed + d.seed) * 0.04;

      if (d.x < 0) d.x = window.innerWidth;
      if (d.x > window.innerWidth) d.x = 0;
      if (d.y < 0) d.y = window.innerHeight;
      if (d.y > window.innerHeight) d.y = 0;

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 210, 235, ${d.alpha * (0.6 + Math.sin(s.timeElapsed * 2 + d.seed) * 0.3)})`;
      ctx.fill();
    });

    // Ripple shockwaves
    s.pulses.forEach(p => {
      p.radius += 6.5;
      if (p.radius > p.maxRadius) {
        p.active = false;
      }

      ctx.strokeStyle = `rgba(255, 106, 184, ${0.1 * (1.0 - p.radius / p.maxRadius)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.stroke();
    });
    s.pulses = s.pulses.filter(p => p.active);

    // Swirling/falling petals & hearts
    ctx.globalCompositeOperation = 'screen';
    s.petals.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life += cappedDt;
      p.vx += Math.sin(s.timeElapsed * 1.5 + p.x * 0.01) * 0.02;
      p.vy += 0.01;

      const lifeRatio = Math.max(0, 1.0 - p.life / p.maxLife);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(p.scale * lifeRatio, p.scale * lifeRatio);

      ctx.fillStyle = p.color;
      if (p.type === 'sparkle') {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }

      if (p.type === 'petal') {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-5, -5, -6, -14, 0, -18);
        ctx.bezierCurveTo(6, -14, 5, -5, 0, 0);
        ctx.fill();
      } else if (p.type === 'heart') {
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.2) {
          const hx = 7 * Math.pow(Math.sin(a), 3);
          const hy = -(6 * Math.cos(a) - 2.5 * Math.cos(2*a) - Math.cos(3*a));
          if (a === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.quadraticCurveTo(0, 0, 7, 0);
        ctx.quadraticCurveTo(0, 0, 0, 7);
        ctx.quadraticCurveTo(0, 0, -7, 0);
        ctx.quadraticCurveTo(0, 0, 0, -7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
    s.petals = s.petals.filter(p => p.life < p.maxLife);
    ctx.globalCompositeOperation = 'source-over';

    // Render Text Particles
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Double glow back-buffer (Ethereal luxury light layer) - HIGHLY OPTIMIZED with cached texture canvases
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < s.activeCount; i += 6) {
      const p = s.particles[i];
      if (!p) continue;
      
      const dxDiffGlow = p.targetX - p.x;
      const dyDiffGlow = p.targetY - p.y;
      const distToTargetSqGlow = dxDiffGlow * dxDiffGlow + dyDiffGlow * dyDiffGlow;
      const distToTargetGlow = Math.sqrt(distToTargetSqGlow);
      const alphaGlow = Math.max(0.1, (1.0 - distToTargetGlow / 400)) * p.alpha * 0.16 * intensity;
      
      // Build glow cache on-demand
      if (!p.glowCanvas) {
        const canvas = document.createElement('canvas');
        const pCtx = canvas.getContext('2d');
        if (pCtx) {
          const fontStr = `300 ${p.fontSize * 1.5}px "Cormorant Garamond", serif`;
          pCtx.font = fontStr;
          const metrics = pCtx.measureText(p.text);
          const textWidth = Math.ceil(metrics.width);
          const paddingX = 4;
          const paddingY = 4;
          const canvasWidth = textWidth + paddingX * 2;
          const canvasHeight = Math.ceil(p.fontSize * 1.5 * 1.5) + paddingY * 2;

          canvas.width = canvasWidth;
          canvas.height = canvasHeight;

          pCtx.font = fontStr;
          pCtx.textAlign = 'center';
          pCtx.textBaseline = 'middle';
          pCtx.fillStyle = s.colors.glowMain;
          pCtx.fillText(p.text, canvasWidth / 2, canvasHeight / 2);

          p.glowCanvas = canvas;
          p.glowWidth = canvasWidth;
          p.glowHeight = canvasHeight;
        }
      }

      if (p.glowCanvas && p.glowWidth && p.glowHeight && p.scale >= 0.1) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(p.scale, p.scale);
        ctx.globalAlpha = alphaGlow * 0.45;
        ctx.drawImage(p.glowCanvas, -p.glowWidth / 2, -p.glowHeight / 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // Front crisp text - HIGHLY OPTIMIZED with cached texture canvases
    for (let i = 0; i < s.activeCount; i++) {
      const p = s.particles[i];
      if (!p) continue;

      let tx = p.targetX;
      let ty = p.targetY;

      if (s.stage === 'heart' || s.stage === 'surprise') {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2 - 20;
        const scaleMult = s.heartbeatScale;
        tx = cx + (p.targetX - cx) * scaleMult;
        ty = cy + (p.targetY - cy) * scaleMult;
      }

      let forceX = 0;
      let forceY = 0;

      if (s.mouse.active) {
        const mdx = p.x - s.mouse.x;
        const mdy = p.y - s.mouse.y;
        const mdistSq = mdx * mdx + mdy * mdy;
        const r = 130;
        if (mdistSq < r * r) {
          const mdist = Math.sqrt(mdistSq);
          const force = (r - mdist) / r;
          const push = force * 4.2;
          const invDist = 1 / (mdist || 1);
          forceX += mdx * invDist * push;
          forceY += mdy * invDist * push;
        }
      }

      s.pulses.forEach(pulse => {
        const pdx = p.x - pulse.x;
        const pdy = p.y - pulse.y;
        const pdistSq = pdx * pdx + pdy * pdy;
        const pulseRadius = pulse.radius;
        const minDist = Math.max(0, pulseRadius - 45);
        const maxDist = pulseRadius + 45;
        if (pdistSq >= minDist * minDist && pdistSq <= maxDist * maxDist) {
          const pdist = Math.sqrt(pdistSq);
          const waveStrength = (1.0 - Math.abs(pdist - pulseRadius) / 45);
          const force = waveStrength * 7.5 * (1.0 - pulseRadius / pulse.maxRadius) * pulse.strength;
          const invDist = 1 / (pdist || 1);
          forceX += pdx * invDist * force;
          forceY += pdy * invDist * force;
        }
      });

      const springK = 0.012 * p.speedFactor;
      const ax = (tx - p.x) * springK;
      const ay = (ty - p.y) * springK;

      p.vx += ax + forceX;
      p.vy += ay + forceY;

      const dxDiff = tx - p.x;
      const dyDiff = ty - p.y;
      const distToTargetSq = dxDiff * dxDiff + dyDiff * dyDiff;
      if (distToTargetSq > 3600) {
        const distToTarget = Math.sqrt(distToTargetSq);
        const swirlStrength = Math.min(0.28, (distToTarget - 60) * 0.0022) * p.speedFactor;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const rx = p.x - cx;
        const ry = p.y - cy;
        const rDistSq = rx * rx + ry * ry;
        const rDist = Math.sqrt(rDistSq) || 1;
        
        const swirlX = (-ry / rDist) * swirlStrength;
        const swirlY = (rx / rDist) * swirlStrength;
        p.vx += swirlX;
        p.vy += swirlY;
      }

      const drag = 0.90;
      p.vx *= drag;
      p.vy *= drag;

      p.x += p.vx;
      p.y += p.vy;

      const microJitter = 0.22;
      p.x += Math.sin(s.timeElapsed * 2.5 + p.seed) * microJitter;
      p.y += Math.cos(s.timeElapsed * 1.8 + p.seed) * microJitter;

      const angleDiff = p.targetAngle - p.angle;
      p.angle += angleDiff * 0.08;

      if (s.stage !== 'origin') {
        p.scale += (1.0 - p.scale) * 0.05;
        p.alpha = Math.min(1.0, p.alpha + 0.02);
      }

      // Build text canvas cache on-demand
      if (!p.canvas) {
        const canvas = document.createElement('canvas');
        const pCtx = canvas.getContext('2d');
        if (pCtx) {
          const isPrimaryText = p.text === PRIMARY_TEXT;
          const fontStr = `200 ${p.fontSize}px "${isPrimaryText ? 'Cormorant Garamond' : 'Inter'}", serif`;
          pCtx.font = fontStr;
          const metrics = pCtx.measureText(p.text);
          const textWidth = Math.ceil(metrics.width);
          const paddingX = 4;
          const paddingY = 4;
          const canvasWidth = textWidth + paddingX * 2;
          const canvasHeight = Math.ceil(p.fontSize * 1.5) + paddingY * 2;

          canvas.width = canvasWidth;
          canvas.height = canvasHeight;

          pCtx.font = fontStr;
          pCtx.textAlign = 'center';
          pCtx.textBaseline = 'middle';
          pCtx.fillStyle = p.color;
          pCtx.fillText(p.text, canvasWidth / 2, canvasHeight / 2);

          p.canvas = canvas;
          p.textWidth = canvasWidth;
          p.textHeight = canvasHeight;
        }
      }

      if (p.canvas && p.textWidth && p.textHeight) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(p.scale, p.scale);
        ctx.globalAlpha = p.alpha;
        ctx.drawImage(p.canvas, -p.textWidth / 2, -p.textHeight / 2);
        ctx.restore();
      }
    }

    ctx.restore();

    // Cinematic Film Grain (Super Optimized pattern tiling)
    if (s.noiseCanvas) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.35;
      
      const ox = Math.floor(Math.random() * 128);
      const oy = Math.floor(Math.random() * 128);
      ctx.translate(ox, oy);
      
      const pattern = ctx.createPattern(s.noiseCanvas, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(-ox, -oy, canvas.width, canvas.height);
      }
      ctx.restore();
    }

    // Vignette
    const vignette = ctx.createRadialGradient(
      window.innerWidth / 2,
      window.innerHeight / 2,
      Math.min(window.innerWidth, window.innerHeight) * 0.45,
      window.innerWidth / 2,
      window.innerHeight / 2,
      Math.max(window.innerWidth, window.innerHeight) * 0.9
    );
    vignette.addColorStop(0, 'rgba(6, 6, 8, 0)');
    vignette.addColorStop(0.5, 'rgba(6, 6, 8, 0.35)');
    vignette.addColorStop(1, 'rgba(6, 6, 8, 0.95)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  };

  const triggerHeartbeat = () => {
    const s = stateRef.current;
    
    if (audioRef.current) {
      audioRef.current.playHeartbeat();
    }

    s.heartbeatScale = 1.09;

    if (s.stage === 'heart' || s.stage === 'surprise') {
      const isMobile = window.innerWidth < 768;
      const count = isMobile ? 12 : 28;
      
      for (let i = 0; i < count; i++) {
        const randParticle = s.particles[Math.floor(Math.random() * s.particles.length)];
        if (!randParticle) continue;

        const pAngle = Math.random() * Math.PI * 2;
        const pSpeed = 0.5 + Math.random() * 2.2;

        const isSparkle = Math.random() < 0.35;
        const isHeart = Math.random() < 0.25;
        
        s.petals.push({
          x: randParticle.x,
          y: randParticle.y,
          vx: Math.cos(pAngle) * pSpeed,
          vy: Math.sin(pAngle) * pSpeed - 0.4,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.08,
          scale: isSparkle ? 0.4 + Math.random() * 0.4 : 0.6 + Math.random() * 0.8,
          alpha: 0.9,
          color: isSparkle 
            ? '#FFFFFF' 
            : isHeart 
              ? '#FF6AB8' 
              : 'hsl(340, 95%, 85%)',
          type: isSparkle ? 'sparkle' : isHeart ? 'heart' : 'petal',
          life: 0,
          maxLife: 1500 + Math.random() * 2000
        });
      }
    }
  };

  const spawnRandomPetal = () => {
    const s = stateRef.current;
    const x = Math.random() * window.innerWidth;
    const y = -20;

    const typeRand = Math.random();
    const type = typeRand < 0.4 ? 'petal' : typeRand < 0.75 ? 'sparkle' : 'heart';
    
    s.petals.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 0.5 + Math.random() * 1.2,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.05,
      scale: 0.5 + Math.random() * 0.8,
      alpha: 0.8,
      color: type === 'sparkle' 
        ? '#FFFFFF' 
        : type === 'heart' 
          ? '#FFCBEA' 
          : 'hsl(340, 95%, 82%)',
      type,
      life: 0,
      maxLife: 4000 + Math.random() * 4000
    });
  };

  const transitionToStage = (newStage: 'origin' | 'bloom' | 'heart' | 'surprise') => {
    const s = stateRef.current;
    s.stage = newStage;

    if (newStage === 'origin') {
      s.activeCount = 1;
      s.particles.forEach((p, idx) => {
        p.x = window.innerWidth / 2;
        p.y = window.innerHeight / 2;
        p.vx = 0;
        p.vy = 0;
        p.angle = 0;
        p.scale = idx === 0 ? 1.0 : 0.01;
        p.alpha = idx === 0 ? 1.0 : 0;
      });
    } else if (newStage === 'bloom') {
      s.activeCount = 2;
      s.surpriseTimer = 0;
      audioRef.current?.playSwell();
      
      for (let i = 1; i < s.maxParticles; i++) {
        const p = s.particles[i];
        p.x = window.innerWidth / 2;
        p.y = window.innerHeight / 2;
        
        const angle = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 6.5;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd;
        
        p.scale = 0.05;
        p.alpha = 0;
      }
    } else if (newStage === 'heart') {
      s.surpriseTimer = 0;
      
      s.particles.forEach(p => {
        p.targetX = p.homeX;
        p.targetY = p.homeY;
        
        const idx = s.particles.indexOf(p);
        const t = (idx / s.maxParticles) * Math.PI * 2;
        const dx = 48 * Math.pow(Math.sin(t), 2) * Math.cos(t);
        const dy = 13 * Math.sin(t) - 10 * Math.sin(2*t) - 6 * Math.sin(3*t) - 4 * Math.sin(4*t);
        let angle = Math.atan2(dy, dx);
        if (angle > Math.PI / 2) angle -= Math.PI;
        else if (angle < -Math.PI / 2) angle += Math.PI;
        p.targetAngle = angle;
      });
    }
  };

  const triggerSurpriseWord = (word: string) => {
    const s = stateRef.current;
    if (s.stage === 'origin' || s.stage === 'bloom') return;

    s.stage = 'surprise';
    s.surpriseTimer = 0;
    s.surpriseWord = word;

    audioRef.current?.playSwell();
    audioRef.current?.playSparkleChime(4);

    const targets = s.surpriseWordsTargets[word];
    if (!targets) return;

    s.particles.forEach((p, idx) => {
      const tgt = targets[idx] || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      p.targetX = tgt.x;
      p.targetY = tgt.y;
      p.targetAngle = 0;
    });

    for (let j = 0; j < 40; j++) {
      const rx = window.innerWidth / 2 + (Math.random() - 0.5) * 400;
      const ry = window.innerHeight / 2 + (Math.random() - 0.5) * 100;
      s.petals.push({
        x: rx,
        y: ry,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4 - 1,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        scale: 0.5 + Math.random() * 0.8,
        alpha: 1.0,
        color: Math.random() < 0.5 ? '#FFFFFF' : '#FFCBEA',
        type: 'sparkle',
        life: 0,
        maxLife: 2000
      });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (audioRef.current) {
      audioRef.current.init();
      audioRef.current.playSparkleChime(Math.floor(Math.random() * 7));
    }

    s.pulses.push({
      x: clickX,
      y: clickY,
      radius: 5,
      maxRadius: Math.max(window.innerWidth, window.innerHeight) * 0.65,
      strength: 1.2,
      active: true
    });

    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 4.5;
      
      s.petals.push({
        x: clickX,
        y: clickY,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        scale: 0.4 + Math.random() * 0.7,
        alpha: 1.0,
        color: Math.random() < 0.4 ? '#FFFFFF' : '#FF6AB8',
        type: Math.random() < 0.5 ? 'sparkle' : 'heart',
        life: 0,
        maxLife: 1000 + Math.random() * 1500
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    s.mouse.px = s.mouse.x;
    s.mouse.py = s.mouse.y;
    s.mouse.x = e.clientX - rect.left;
    s.mouse.y = e.clientY - rect.top;
    s.mouse.active = true;
  };

  const handleMouseLeave = () => {
    stateRef.current.mouse.active = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    s.mouse.x = touch.clientX - rect.left;
    s.mouse.y = touch.clientY - rect.top;
    s.mouse.active = true;
  };

  const handleTouchEnd = () => {
    stateRef.current.mouse.active = false;
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#060608]">
      {/* Cinematic Vignette Overlay CSS fallback */}
      <div className="absolute inset-0 pointer-events-none z-10 radial-vignette" />

      {/* Primary Canvas Drawing Board */}
      <canvas
        id="love-bloom-canvas"
        ref={canvasRef}
        className="block w-full h-full cursor-pointer z-0"
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}
