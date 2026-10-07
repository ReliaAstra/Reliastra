'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  geoDistance,
  geoGraticule10,
  geoOrthographic,
  geoPath,
} from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldTopology from 'world-atlas/countries-110m.json';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import {
  GLOBE_AMBIENT_LONGITUDE_DEGREES_PER_SECOND,
  GLOBE_LONGITUDE_DEGREES_PER_SECOND,
  advanceLongitude,
  hasPublishedCoordinates,
  normalizeLongitude,
  type InfrastructureGlobeMode,
  type ObservationPoint,
} from '@/lib/infrastructure-visualization';

const topology = worldTopology as unknown as Topology<{ countries: GeometryCollection }>;
const land = feature(topology, topology.objects.countries);
const graticule = geoGraticule10();
const fallbackProjection = geoOrthographic()
  .translate([500, 500])
  .scale(435)
  .rotate([-18, -10, 0])
  .clipAngle(90)
  .precision(0.35);
const fallbackPath = geoPath(fallbackProjection);
const fallbackLandPath = fallbackPath(land) ?? '';
const fallbackGraticulePath = fallbackPath(graticule) ?? '';
const EMPTY_OBSERVATIONS: ObservationPoint[] = [];

export interface InfrastructureGlobeProps {
  mode: InfrastructureGlobeMode;
  observations?: ObservationPoint[];
  className?: string;
  interactive?: boolean;
  animate?: boolean;
  label?: string;
}

/**
 * A restrained orthographic Earth, drawn from Natural Earth 1:110m coastline
 * geometry. It uses canvas rather than WebGL because the public record today
 * has no verified geographic origin points to layer over the map. If a caller
 * supplies coordinates, only those points are drawn. Region codes alone are
 * deliberately insufficient.
 *
 * Motion: the globe rotates continuously without being touched — one
 * revolution every three minutes (half that on the `login` backdrop) — so the
 * map reads as live on every surface it appears on, not only after somebody
 * drags it. Dragging still steers it, the arrows still step it, and the pause
 * control stops it. Rotation runs only while the globe is on screen and the
 * tab is in the foreground, and it starts paused when the reader's system asks
 * for reduced motion.
 */
export function InfrastructureGlobe({
  mode,
  observations = EMPTY_OBSERVATIONS,
  className,
  interactive = true,
  animate = mode !== 'login',
  label = 'Earth, shown as an orthographic geographic reference',
}: InfrastructureGlobeProps) {
  const instanceId = useId().replace(/:/g, '');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const observationsRef = useRef(observations);
  const rotationRef = useRef<[number, number, number]>([-18, -10, 0]);
  const dragRef = useRef<{ x: number; y: number; rotation: [number, number, number] } | null>(null);
  const [canRotate, setCanRotate] = useState(false);
  // Continuous rotation is the default. The release valve below pauses it, and
  // a reader whose system asks for reduced motion starts paused rather than
  // being handed a moving surface they did not ask for.
  const autoRotateRef = useRef(true);
  const [rotating, setRotating] = useState(true);
  const loopRef = useRef<{ start: () => void; stop: () => void }>({
    start: () => {},
    stop: () => {},
  });

  // The sign-in backdrop is atmosphere behind a form; every other surface is
  // the primary geographic reference and turns at the full rate.
  const degreesPerSecond =
    mode === 'login'
      ? GLOBE_AMBIENT_LONGITUDE_DEGREES_PER_SECOND
      : GLOBE_LONGITUDE_DEGREES_PER_SECOND;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const bounds = wrapper.getBoundingClientRect();
    const size = Math.max(1, Math.min(bounds.width, bounds.height));
    const maxRatio = window.innerWidth < 640 ? 1.25 : 1.5;
    const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
    const pixelSize = Math.round(size * ratio);
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);

    const globeRadius = size * 0.435;
    const center: [number, number] = [size / 2, size / 2];
    const projection = geoOrthographic()
      .translate(center)
      .scale(globeRadius)
      .rotate(rotationRef.current)
      .clipAngle(90)
      .precision(0.35);
    const path = geoPath(projection, context);

    // Matte ocean with a small, directional highlight. This is surface
    // definition, not an emitted glow or simulated atmosphere.
    context.save();
    context.beginPath();
    context.arc(center[0], center[1], globeRadius, 0, Math.PI * 2);
    context.clip();
    const surface = context.createLinearGradient(
      center[0] - globeRadius * 0.8,
      center[1] - globeRadius,
      center[0] + globeRadius,
      center[1] + globeRadius * 0.8,
    );
    surface.addColorStop(0, '#1b272c');
    surface.addColorStop(0.5, '#111a1f');
    surface.addColorStop(1, '#0b1115');
    context.fillStyle = surface;
    context.fillRect(center[0] - globeRadius, center[1] - globeRadius, globeRadius * 2, globeRadius * 2);

    context.beginPath();
    path(graticule);
    context.strokeStyle = 'rgba(156, 178, 183, 0.13)';
    context.lineWidth = Math.max(0.55, size / 1000);
    context.stroke();

    context.beginPath();
    path(land);
    context.fillStyle = '#253238';
    context.fill();
    context.strokeStyle = 'rgba(112, 137, 143, 0.23)';
    context.lineWidth = Math.max(0.45, size / 1400);
    context.stroke();

    const pointColors: Record<ObservationPoint['state'], string> = {
      healthy: '#77b5bd',
      degraded: '#d0a05c',
      critical: '#c7655e',
      unknown: '#7e898c',
    };
    for (const observation of observationsRef.current) {
      if (!hasPublishedCoordinates(observation)) continue;
      const coordinates: [number, number] = [observation.longitude!, observation.latitude!];
      const centerCoordinates: [number, number] = [-rotationRef.current[0], -rotationRef.current[1]];
      if (geoDistance(coordinates, centerCoordinates) > Math.PI / 2) continue;
      const point = projection(coordinates);
      if (!point) continue;
      context.beginPath();
      context.arc(point[0], point[1], Math.max(2.1, size * 0.006), 0, Math.PI * 2);
      context.fillStyle = pointColors[observation.state];
      context.fill();
      context.beginPath();
      context.arc(point[0], point[1], Math.max(5, size * 0.013), 0, Math.PI * 2);
      context.strokeStyle = `${pointColors[observation.state]}66`;
      context.lineWidth = 0.8;
      context.stroke();
    }
    context.restore();

    // Fine edge separation gives the sphere physical depth against the panel.
    context.beginPath();
    context.arc(center[0], center[1], globeRadius + 0.5, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(157, 177, 181, 0.25)';
    context.lineWidth = Math.max(0.65, size / 900);
    context.stroke();
  }, []);

  useEffect(() => {
    observationsRef.current = observations;
    draw();
  }, [draw, observations]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) {
      autoRotateRef.current = false;
      setRotating(false);
    }
    let visible = true;
    let pageVisible = !document.hidden;
    let frame = 0;
    let lastFrame = 0;

    const resize = new ResizeObserver(draw);
    resize.observe(wrapper);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        draw();
        startLoop();
      }
    });
    intersection.observe(wrapper);

    const onVisibility = () => {
      pageVisible = !document.hidden;
      if (pageVisible) {
        draw();
        startLoop();
      } else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const tick = (time: number) => {
      if (!visible || !pageVisible || !autoRotateRef.current) {
        frame = 0;
        return;
      }
      const elapsedFrameTime = lastFrame ? time - lastFrame : 0;
      const frameInterval = mode === 'login' ? 80 : window.innerWidth < 640 ? 50 : 32;
      if (lastFrame && elapsedFrameTime >= frameInterval) {
        // Continuous rotation, on by default and independent of any input: the
        // globe turns from the moment it is on screen and keeps turning while
        // the reader scrolls past it. Longitude advances by elapsed time, so
        // the rate is the same whether this redraws at ~12 fps (backdrop), ~20
        // fps (mobile) or ~30 fps (desktop). A drag pauses the auto-advance for
        // its duration and the pointer owns the angle; on release the globe
        // carries on from wherever the reader left it.
        if (!dragRef.current) {
          rotationRef.current[0] = advanceLongitude(
            rotationRef.current[0],
            elapsedFrameTime,
            degreesPerSecond,
          );
        }
        draw();
        lastFrame = time;
      } else if (!lastFrame) {
        lastFrame = time;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const startLoop = () => {
      if (!animate || !autoRotateRef.current || !visible || !pageVisible || frame) return;
      lastFrame = 0;
      frame = window.requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };
    // The pause control lives outside this effect, so it reaches the loop
    // through a ref rather than by re-subscribing the observers on every press.
    loopRef.current = { start: startLoop, stop: stopLoop };

    const onMotionPreference = () => {
      autoRotateRef.current = !reducedMotion.matches;
      setRotating(!reducedMotion.matches);
      stopLoop();
      draw();
      startLoop();
    };
    reducedMotion.addEventListener('change', onMotionPreference);
    draw();
    startLoop();

    return () => {
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionPreference);
      stopLoop();
    };
  }, [animate, degreesPerSecond, draw, mode]);

  /**
   * Pause / resume the auto-rotation.
   *
   * WCAG 2.2.2 asks that motion which starts on its own and runs for more than
   * five seconds can be stopped: this is that mechanism, and it is also the
   * way back in for anyone whose system requests reduced motion.
   */
  const toggleRotation = () => {
    const next = !autoRotateRef.current;
    autoRotateRef.current = next;
    setRotating(next);
    if (next) loopRef.current.start();
    else loopRef.current.stop();
  };

  const rotateBy = (degrees: number) => {
    rotationRef.current[0] = normalizeLongitude(rotationRef.current[0] + degrees);
    draw();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    dragRef.current = { x: event.clientX, y: event.clientY, rotation: [...rotationRef.current] };
    setCanRotate(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!drag || bounds.width < 1) return;
    rotationRef.current[0] = normalizeLongitude(
      drag.rotation[0] + ((event.clientX - drag.x) / bounds.width) * 180,
    );
    rotationRef.current[1] = Math.max(-65, Math.min(65, drag.rotation[1] - ((event.clientY - drag.y) / bounds.height) * 130));
    draw();
  };
  const onPointerUp = () => {
    dragRef.current = null;
    setCanRotate(false);
  };

  return (
    <div className={className} data-globe-mode={mode}>
      <div className="relative mx-auto aspect-square w-full max-w-[690px]" ref={wrapperRef}>
        <svg
          aria-hidden="true"
          viewBox="0 0 1000 1000"
          className="absolute inset-0 m-auto h-full w-full"
        >
          <defs>
            <linearGradient id={`globe-surface-${instanceId}`} x1="12%" y1="7%" x2="85%" y2="94%">
              <stop offset="0%" stopColor="#1b272c" />
              <stop offset="52%" stopColor="#111a1f" />
              <stop offset="100%" stopColor="#0b1115" />
            </linearGradient>
            <clipPath id={`globe-clip-${instanceId}`}>
              <circle cx="500" cy="500" r="435" />
            </clipPath>
          </defs>
          <circle cx="500" cy="500" r="435" fill={`url(#globe-surface-${instanceId})`} />
          <g clipPath={`url(#globe-clip-${instanceId})`}>
            <path d={fallbackGraticulePath} fill="none" stroke="rgba(156,178,183,0.13)" strokeWidth="1.1" />
            <path d={fallbackLandPath} fill="#253238" stroke="rgba(112,137,143,0.23)" strokeWidth="0.8" />
          </g>
          <circle cx="500" cy="500" r="435.5" fill="none" stroke="rgba(157,177,181,0.25)" strokeWidth="1.2" />
        </svg>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className={`absolute inset-0 m-auto touch-none ${interactive ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div aria-hidden className="pointer-events-none absolute inset-[6.2%] rounded-full border border-white/[0.035]" />
        {interactive && (
          <div className="absolute inset-x-0 bottom-2 flex items-center justify-between gap-3 px-3 sm:bottom-4 sm:px-5">
            <p className="text-[11px] text-[var(--ob-text-4)]" aria-live="polite">
              {canRotate
                ? 'Rotate the globe'
                : rotating
                  ? 'Rotating · drag to steer'
                  : 'Rotation paused · drag to rotate'}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleRotation}
                aria-label={rotating ? 'Pause rotation' : 'Resume rotation'}
                aria-pressed={!rotating}
                className="inline-flex size-11 items-center justify-center border border-[var(--ob-line-2)] bg-[var(--ob-void)] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ob-signal)]"
              >
                {rotating ? (
                  <Pause size={15} aria-hidden="true" />
                ) : (
                  <Play size={15} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => rotateBy(-12)}
                className="inline-flex size-11 items-center justify-center border border-[var(--ob-line-2)] bg-[var(--ob-void)] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ob-signal)]"
                aria-label="Rotate globe west"
              >
                <ArrowLeft size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => rotateBy(12)}
                className="inline-flex size-11 items-center justify-center border border-[var(--ob-line-2)] bg-[var(--ob-void)] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ob-signal)]"
                aria-label="Rotate globe east"
              >
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="sr-only">
        The globe rotates continuously and can be paused. The coastline and
        graticule are geographic reference only. No points are plotted unless a
        verified latitude and longitude is supplied by the observation source.
      </p>
    </div>
  );
}
