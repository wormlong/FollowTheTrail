import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, LocateFixed, Minus, Plus } from 'lucide-react';
import { GeoPoint, MapStyleMode, TrailWaypoint } from '../types/hiking';

interface TopoMapCanvasProps {
  referencePath?: GeoPoint[];
  recordedPath?: GeoPoint[];
  waypoints?: TrailWaypoint[];
  currentPosition?: GeoPoint | null;
  styleMode?: MapStyleMode;
  compact?: boolean;
  onSelectWaypoint?: (wp: TrailWaypoint) => void;
}

function latLngToWorld(lat: number, lng: number, zoom: number) {
  const scale = 256 * Math.pow(2, zoom);
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  const x = scale * (0.5 + lng / 360);
  const y = scale * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI));
  return { x, y };
}

export const TopoMapCanvas: React.FC<TopoMapCanvasProps> = ({
  referencePath = [],
  recordedPath = [],
  waypoints = [],
  currentPosition = null,
  styleMode = 'topo',
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 420 });
  const [zoom, setZoom] = useState<number>(14.2);
  const [center, setCenter] = useState<{ lat: number; lng: number }>(() => {
    const first = currentPosition || recordedPath[0] || referencePath[0];
    return first ? { lat: first.lat, lng: first.lng } : { lat: 39.9942, lng: 116.178 };
  });
  const [userPanned, setUserPanned] = useState(false);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; startCenter: { lat: number; lng: number } }>({
    active: false,
    startX: 0,
    startY: 0,
    startCenter: center,
  });

  // Track container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize({ width, height });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-fit bounding box when referencePath changes and user hasn't manually panned
  useEffect(() => {
    if (userPanned) return;
    const allPts = [...referencePath, ...recordedPath];
    if (currentPosition) allPts.push(currentPosition);
    if (allPts.length === 0) return;

    const minLat = Math.min(...allPts.map((p) => p.lat));
    const maxLat = Math.max(...allPts.map((p) => p.lat));
    const minLng = Math.min(...allPts.map((p) => p.lng));
    const maxLng = Math.max(...allPts.map((p) => p.lng));

    setCenter({
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    });

    const span = Math.max(maxLat - minLat, maxLng - minLng);
    if (span > 0.0005) {
      const targetZoom = Math.min(16.5, Math.max(11.5, Math.log2(0.28 / span) + 10.6));
      setZoom(targetZoom);
    }
  }, [referencePath, recordedPath.length > 0 ? recordedPath[0].lat : 0, userPanned]);

  // Follow current GPS position gently when active and not panned away
  useEffect(() => {
    if (!userPanned && currentPosition && recordedPath.length > 1) {
      setCenter({ lat: currentPosition.lat, lng: currentPosition.lng });
    }
  }, [currentPosition?.lat, currentPosition?.lng, userPanned, recordedPath.length]);

  const project = useMemo(() => {
    const cWorld = latLngToWorld(center.lat, center.lng, zoom);
    return (lat: number, lng: number) => {
      const pWorld = latLngToWorld(lat, lng, zoom);
      return {
        x: size.width / 2 + (pWorld.x - cWorld.x),
        y: size.height / 2 + (pWorld.y - cWorld.y),
      };
    };
  }, [center, zoom, size]);

  // Compute dynamic scale bar in meters
  const scaleBar = useMemo(() => {
    const metersPerPixel =
      (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const targetMeters = metersPerPixel * 96;
    const niceSteps = [50, 100, 200, 500, 1000, 2000, 5000];
    const step = niceSteps.find((s) => s >= targetMeters * 0.7) || 1000;
    const widthPx = Math.max(40, Math.min(130, step / metersPerPixel));
    const label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
    return { widthPx, label };
  }, [center.lat, zoom]);

  // Generate organic topographic contour loops anchored to highest terrain point
  const contourCenters = useMemo(() => {
    const allPts = referencePath.length > 0 ? referencePath : recordedPath;
    if (allPts.length === 0) {
      return [
        { lat: center.lat + 0.003, lng: center.lng - 0.004, ele: 620 },
        { lat: center.lat - 0.002, lng: center.lng + 0.005, ele: 480 },
      ];
    }
    const sorted = [...allPts].sort((a, b) => b.ele - a.ele);
    const peak = sorted[0];
    const secondary = sorted[Math.floor(sorted.length / 2)] || peak;
    return [peak, secondary];
  }, [referencePath, recordedPath, center.lat, center.lng]);

  // OSM tiles when styleMode === 'osm'
  const osmTiles = useMemo(() => {
    if (styleMode !== 'osm') return [];
    const tileZoom = Math.max(10, Math.min(17, Math.round(zoom)));
    const scale = Math.pow(2, tileZoom);
    const cWorld = latLngToWorld(center.lat, center.lng, tileZoom);
    const centerTileX = Math.floor((cWorld.x / (256 * scale)) * scale);
    const centerTileY = Math.floor((cWorld.y / (256 * scale)) * scale);
    const zoomDiff = Math.pow(2, zoom - tileZoom);
    const tiles: Array<{ url: string; left: number; top: number; size: number; key: string }> = [];

    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        if (tx < 0 || ty < 0 || tx >= scale || ty >= scale) continue;
        const tileWorldX = tx * 256;
        const tileWorldY = ty * 256;
        const left = size.width / 2 + (tileWorldX - cWorld.x) * zoomDiff;
        const top = size.height / 2 + (tileWorldY - cWorld.y) * zoomDiff;
        const tileSize = 256 * zoomDiff;
        tiles.push({
          key: `${tileZoom}-${tx}-${ty}`,
          url: `https://tile.openstreetmap.org/${tileZoom}/${tx}/${ty}.png`,
          left,
          top,
          size: tileSize,
        });
      }
    }
    return tiles;
  }, [styleMode, zoom, center, size]);

  const refPolyline = useMemo(
    () =>
      referencePath
        .map((p) => {
          const pt = project(p.lat, p.lng);
          return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        })
        .join(' '),
    [referencePath, project]
  );

  const recPolyline = useMemo(
    () =>
      recordedPath
        .map((p) => {
          const pt = project(p.lat, p.lng);
          return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        })
        .join(' '),
    [recordedPath, project]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (compact) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: center,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setUserPanned(true);
    }
    const scale = 256 * Math.pow(2, zoom);
    const startWorld = latLngToWorld(dragRef.current.startCenter.lat, dragRef.current.startCenter.lng, zoom);
    const nextWorldX = startWorld.x - dx;
    const nextWorldY = startWorld.y - dy;
    const lng = (nextWorldX / scale - 0.5) * 360;
    const n = Math.PI - (2 * Math.PI * nextWorldY) / scale;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    setCenter({ lat, lng });
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const handleRecenter = () => {
    setUserPanned(false);
    const target = currentPosition || recordedPath[recordedPath.length - 1] || referencePath[0];
    if (target) {
      setCenter({ lat: target.lat, lng: target.lng });
    }
  };

  const isNight = styleMode === 'night';
  const bgClass = isNight ? 'bg-[#141A17]' : 'bg-[#EFECE4]';
  const contourStroke = isNight ? 'rgba(130, 152, 138, 0.20)' : 'rgba(138, 126, 102, 0.26)';
  const contourBoldStroke = isNight ? 'rgba(130, 152, 138, 0.34)' : 'rgba(122, 108, 84, 0.42)';
  const gridStroke = isNight ? 'rgba(255,255,255,0.04)' : 'rgba(26,33,30,0.05)';

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative w-full h-full overflow-hidden select-none touch-none ${bgClass} ${
        compact ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Optional OSM tile underlay (falls back gracefully to contours if offline) */}
      {styleMode === 'osm' && (
        <div className="absolute inset-0 pointer-events-none opacity-80">
          {osmTiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
              style={{
                position: 'absolute',
                left: tile.left,
                top: tile.top,
                width: tile.size,
                height: tile.size,
              }}
            />
          ))}
        </div>
      )}

      {/* Topographic Vector & Trajectory SVG Layer */}
      <svg width={size.width} height={size.height} className="absolute inset-0 pointer-events-none">
        {/* Coordinate Grid */}
        {Array.from({ length: 8 }).map((_, idx) => {
          const x = ((idx + 1) * size.width) / 9;
          return <line key={`gx-${idx}`} x1={x} y1={0} x2={x} y2={size.height} stroke={gridStroke} strokeWidth={1} />;
        })}
        {Array.from({ length: 6 }).map((_, idx) => {
          const y = ((idx + 1) * size.height) / 7;
          return <line key={`gy-${idx}`} x1={0} y1={y} x2={size.width} y2={y} stroke={gridStroke} strokeWidth={1} />;
        })}

        {/* Organic Topographic Contour Rings */}
        {styleMode !== 'osm' &&
          contourCenters.map((c, cIdx) => {
            const p = project(c.lat, c.lng);
            const rings = [1, 2, 3, 4, 5, 6, 7];
            return rings.map((r) => {
              const rx = r * (34 + cIdx * 10) * Math.pow(2, zoom - 14);
              const ry = r * (24 + cIdx * 8) * Math.pow(2, zoom - 14);
              const rot = cIdx === 0 ? -18 + r * 2 : 24 - r * 3;
              return (
                <ellipse
                  key={`c-${cIdx}-${r}`}
                  cx={p.x}
                  cy={p.y}
                  rx={Math.max(12, rx)}
                  ry={Math.max(9, ry)}
                  transform={`rotate(${rot} ${p.x} ${p.y})`}
                  fill="none"
                  stroke={r % 3 === 0 ? contourBoldStroke : contourStroke}
                  strokeWidth={r % 3 === 0 ? 1.25 : 0.85}
                />
              );
            });
          })}

        {/* Planned Reference Route */}
        {refPolyline && (
          <polyline
            points={refPolyline}
            fill="none"
            stroke={isNight ? '#7FA892' : '#1E352B'}
            strokeWidth={compact ? 2.5 : 3}
            strokeDasharray="6 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.78}
          />
        )}

        {/* Recorded GPS Breadcrumb Track */}
        {recPolyline && (
          <polyline
            points={recPolyline}
            fill="none"
            stroke="#C85324"
            strokeWidth={compact ? 3 : 4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Waypoint Markers */}
        {waypoints.map((wp) => {
          const pt = project(wp.lat, wp.lng);
          if (pt.x < -40 || pt.x > size.width + 40 || pt.y < -40 || pt.y > size.height + 40) return null;
          return (
            <g key={wp.id} transform={`translate(${pt.x}, ${pt.y})`}>
              <circle
                r={compact ? 4 : 5}
                fill={isNight ? '#1A211E' : '#FFFFFF'}
                stroke={isNight ? '#D7D2C8' : '#1E352B'}
                strokeWidth={2}
              />
              {!compact && (
                <g transform="translate(8, -6)">
                  <rect
                    x={0}
                    y={-11}
                    width={wp.name.length * 11 + 12}
                    height={20}
                    rx={5}
                    fill={isNight ? 'rgba(20, 26, 23, 0.88)' : 'rgba(255, 255, 255, 0.92)'}
                    stroke={isNight ? 'rgba(255,255,255,0.12)' : 'rgba(26,33,30,0.12)'}
                  />
                  <text
                    x={6}
                    y={2}
                    fontSize={10.5}
                    fontWeight={500}
                    fill={isNight ? '#ECEAE4' : '#1A211E'}
                  >
                    {wp.name}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Current Live GPS Position */}
        {currentPosition && (() => {
          const pt = project(currentPosition.lat, currentPosition.lng);
          return (
            <g transform={`translate(${pt.x}, ${pt.y})`}>
              <circle r={18} fill="#C85324" opacity={0.16} />
              <circle r={7} fill="#C85324" stroke="#FFFFFF" strokeWidth={2.5} />
            </g>
          );
        })()}
      </svg>

      {/* Top-Left Compass & Coordinates Overlay */}
      {!compact && (
        <div
          className={`absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono-tabular backdrop-blur-md border ${
            isNight
              ? 'bg-[#141A17]/85 border-white/10 text-[#E5E2DA]'
              : 'bg-white/85 border-[#DFD9CE] text-[#1A211E]'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-[#B84F24]" />
          <span>
            {(currentPosition?.lat ?? center.lat).toFixed(4)}°N, {(currentPosition?.lng ?? center.lng).toFixed(4)}°E
          </span>
        </div>
      )}

      {/* Bottom-Left Scale Bar */}
      <div className="absolute bottom-3 left-3 pointer-events-none">
        <div
          className={`flex flex-col items-start gap-0.5 text-[10px] font-mono-tabular ${
            isNight ? 'text-[#D3CFC6]' : 'text-[#3F4843]'
          }`}
        >
          <span>{scaleBar.label}</span>
          <div
            style={{ width: scaleBar.widthPx }}
            className={`h-1.5 border-x border-b ${
              isNight ? 'border-[#D3CFC6]' : 'border-[#3F4843]'
            }`}
          />
        </div>
      </div>

      {/* Right Map Zoom & Recenter Controls */}
      {!compact && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(17.5, z + 0.7))}
            aria-label="放大地图"
            className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm transition-colors cursor-pointer ${
              isNight
                ? 'bg-[#1C2420]/90 border-white/10 text-[#ECEAE4] hover:bg-[#27322D]'
                : 'bg-white/95 border-[#DFD9CE] text-[#1A211E] hover:bg-[#F5F3EE]'
            }`}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(10.5, z - 0.7))}
            aria-label="缩小地图"
            className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm transition-colors cursor-pointer ${
              isNight
                ? 'bg-[#1C2420]/90 border-white/10 text-[#ECEAE4] hover:bg-[#27322D]'
                : 'bg-white/95 border-[#DFD9CE] text-[#1A211E] hover:bg-[#F5F3EE]'
            }`}
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRecenter}
            aria-label="定位回中"
            className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm transition-colors cursor-pointer ${
              isNight
                ? 'bg-[#1C2420]/90 border-white/10 text-[#ECEAE4] hover:bg-[#27322D]'
                : 'bg-white/95 border-[#DFD9CE] text-[#1A211E] hover:bg-[#F5F3EE]'
            }`}
          >
            <LocateFixed className="w-4 h-4 text-[#B84F24]" />
          </button>
        </div>
      )}
    </div>
  );
};
