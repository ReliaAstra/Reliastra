'use client';

import { useRef, useEffect } from 'react';

interface VendorSparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

function getControlPoints(points: { x: number; y: number }[]) {
  if (points.length < 2) return [];
  const cps: { cp1x: number; cp1y: number; cp2x: number; cp2y: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    cps.push({ cp1x, cp1y, cp2x, cp2y });
  }
  return cps;
}

export function VendorSparkline({
  data,
  color,
  width = 120,
  height = 40,
}: VendorSparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const padding = 2;

    ctx.clearRect(0, 0, width, height);

    const points = data.map((v, i) => ({
      x: i * stepX,
      y: padding + (height - padding * 2) - ((v - min) / range) * (height - padding * 2),
    }));

    const cps = getControlPoints(points);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color + '14');
    gradient.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(points[0].x, height);
    ctx.lineTo(points[0].x, points[0].y);
    for (let j = 0; j < cps.length; j++) {
      ctx.bezierCurveTo(
        cps[j].cp1x,
        cps[j].cp1y,
        cps[j].cp2x,
        cps[j].cp2y,
        points[j + 1].x,
        points[j + 1].y
      );
    }
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let j = 0; j < cps.length; j++) {
      ctx.bezierCurveTo(
        cps[j].cp1x,
        cps[j].cp1y,
        cps[j].cp2x,
        cps[j].cp2y,
        points[j + 1].x,
        points[j + 1].y
      );
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data, color, width, height]);

  return (
    <canvas ref={canvasRef} style={{ width, height }} aria-label="Latency sparkline chart" />
  );
}
