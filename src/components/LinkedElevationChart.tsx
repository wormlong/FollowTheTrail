import React, { useMemo, useRef, useState } from 'react';
import { GeoPoint } from '../types/hiking';
import { haversineMeters } from '../utils/elevationMath';

interface LinkedElevationChartProps {
  points: GeoPoint[];
  height?: number;
  showSpeedCurve?: boolean;
  onHoverPoint?: (point: GeoPoint | null, index: number | null) => void;
}

export const LinkedElevationChart: React.FC<LinkedElevationChartProps> = ({
  points,
  height = 148,
  showSpeedCurve = true,
  onHoverPoint,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (points.length < 2) return null;
    let totalDist = 0;
    const samples = points.map((pt, idx) => {
      let speedKmh = 0;
      if (idx > 0) {
        const d = haversineMeters(points[idx - 1].lat, points[idx - 1].lng, pt.lat, pt.lng);
        totalDist += d <= 200 ? d : 0;
        const dtSec = Math.max(1, (pt.timestamp - points[idx - 1].timestamp) / 1000);
        speedKmh = Math.min(18, ((d <= 200 ? d : 0) / dtSec) * 3.6);
      }
      return { distKm: totalDist / 1000, ele: pt.ele, speedKmh, pt };
    });

    const minEle = Math.min(...samples.map((s) => s.ele));
    const maxEle = Math.max(...samples.map((s) => s.ele));
    const eleSpan = Math.max(20, maxEle - minEle);
    const maxDist = Math.max(0.05, totalDist / 1000);
    const maxSpeed = Math.max(4, ...samples.map((s) => s.speedKmh));

    const w = 520;
    const h = height;
    const padTop = 18;
    const padBottom = 22;
    const padX = 10;
    const plotW = w - padX * 2;
    const plotH = h - padTop - padBottom;

    const coords = samples.map((s, idx) => ({
      idx,
      x: padX + (s.distKm / maxDist) * plotW,
      y: padTop + (1 - (s.ele - minEle) / eleSpan) * plotH,
      speedY: padTop + (1 - s.speedKmh / maxSpeed) * plotH,
      ele: s.ele,
      distKm: s.distKm,
      speedKmh: s.speedKmh,
      pt: s.pt,
    }));

    const eleLine = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');
    const eleArea = `${eleLine} L${coords[coords.length - 1].x.toFixed(1)},${padTop + plotH} L${coords[0].x.toFixed(1)},${padTop + plotH} Z`;

    const speedLine = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.speedY.toFixed(1)}`)
      .join(' ');

    return {
      w,
      h,
      padTop,
      padX,
      plotW,
      plotH,
      minEle,
      maxEle,
      maxDist,
      coords,
      eleLine,
      eleArea,
      speedLine,
    };
  }, [points, height]);

  if (!chart) {
    return (
      <div
        style={{ height }}
        className="w-full rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] bg-[#EFECE4]/60 dark:bg-[#19201D] flex items-center justify-center text-xs text-[#6B736E] dark:text-[#9BA39E]"
      >
        轨迹采样点不足 2 个，暂无法绘制海拔与速度曲线
      </div>
    );
  }

  const updateHoverFromPointer = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * chart.w;
    let bestIdx = 0;
    let bestDist = Infinity;
    chart.coords.forEach((c) => {
      const d = Math.abs(c.x - relX);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = c.idx;
      }
    });
    setHoverIdx(bestIdx);
    onHoverPoint?.(chart.coords[bestIdx].pt, bestIdx);
  };

  const active = hoverIdx !== null ? chart.coords[hoverIdx] : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[#6B736E] dark:text-[#9BA39E] font-mono-tabular">
        <span>
          {active
            ? `里程 ${active.distKm.toFixed(2)} km · 海拔 ${Math.round(active.ele)} m${showSpeedCurve ? ` · 速度 ${active.speedKmh.toFixed(1)} km/h` : ''}`
            : '拖动或悬停海拔曲线，地图同步定位'}
        </span>
        <span>
          {Math.round(chart.minEle)}–{Math.round(chart.maxEle)} m
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${chart.w} ${chart.h}`}
        style={{ height }}
        className="w-full touch-none select-none cursor-crosshair"
        onPointerDown={(e) => {
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          updateHoverFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === 'mouse') {
            updateHoverFromPointer(e.clientX);
          }
        }}
        onPointerLeave={() => {
          setHoverIdx(null);
          onHoverPoint?.(null, null);
        }}
      >
        <defs>
          <linearGradient id="linkedEleFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B84F24" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#B84F24" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <line
          x1={chart.padX}
          y1={chart.padTop}
          x2={chart.w - chart.padX}
          y2={chart.padTop}
          stroke="currentColor"
          className="text-[#DFD9CE] dark:text-[#2C3530]"
          strokeDasharray="3 3"
        />
        <line
          x1={chart.padX}
          y1={chart.padTop + chart.plotH}
          x2={chart.w - chart.padX}
          y2={chart.padTop + chart.plotH}
          stroke="currentColor"
          className="text-[#DFD9CE] dark:text-[#2C3530]"
        />

        <path d={chart.eleArea} fill="url(#linkedEleFill)" />
        <path
          d={chart.eleLine}
          fill="none"
          stroke="#B84F24"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {showSpeedCurve && (
          <path
            d={chart.speedLine}
            fill="none"
            stroke="#1E352B"
            strokeWidth={1.3}
            strokeDasharray="4 3"
            opacity={0.7}
          />
        )}

        {active && (
          <g>
            <line
              x1={active.x}
              y1={chart.padTop}
              x2={active.x}
              y2={chart.padTop + chart.plotH}
              stroke="#1E352B"
              strokeWidth={1.2}
              strokeDasharray="2 2"
            />
            <circle cx={active.x} cy={active.y} r={4.5} fill="#1E352B" stroke="#FFFFFF" strokeWidth={1.8} />
          </g>
        )}

        <text x={chart.padX} y={chart.h - 4} fontSize={10} className="fill-[#6B736E] dark:fill-[#8F9893] font-mono-tabular">
          0.0 km
        </text>
        <text
          x={chart.w - chart.padX}
          y={chart.h - 4}
          textAnchor="end"
          fontSize={10}
          className="fill-[#6B736E] dark:fill-[#8F9893] font-mono-tabular"
        >
          {chart.maxDist.toFixed(2)} km
        </text>
      </svg>
    </div>
  );
};
