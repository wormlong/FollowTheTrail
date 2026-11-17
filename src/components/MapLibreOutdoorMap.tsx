import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Check, Compass, Layers, LocateFixed } from 'lucide-react';
import {
  GeoPoint,
  MapLayersState,
  OfflineRegionPack,
  TrailWaypoint,
  WAYPOINT_TYPE_LABELS,
} from '../types/hiking';
import {
  normalizeHeadingDegrees,
  requestCompassPermissionIfNeeded,
  useCompassHeading,
} from '../utils/compassHeading';
import {
  createOrganicOutdoorStyle,
  VECTOR_BASE_LAYER_IDS,
} from '../map/organicOutdoorStyle';
import { TopoMapCanvas } from './TopoMapCanvas';

// Ensure Vite 8 / Rollup worker resolution works reliably for vector tiles and GeoJSON sources
maplibregl.setWorkerUrl(maplibreWorkerUrl);

export interface MapOverlayTrack {
  id: string;
  name: string;
  points: GeoPoint[];
  color: string;
  width: number;
  opacity: number;
  visible: boolean;
  showArrows: boolean;
  isHistorical?: boolean;
  isTemporaryImport?: boolean;
}

interface MapLibreOutdoorMapProps {
  layers: MapLayersState;
  tracks: MapOverlayTrack[];
  activeRecordingPoints?: GeoPoint[];
  referencePoints?: GeoPoint[];
  waypoints?: TrailWaypoint[];
  currentGps?: GeoPoint | null;
  headingDegrees?: number | null;
  cursorPoint?: GeoPoint | null;
  offlineRegions?: OfflineRegionPack[];
  onMapClickCoord?: (info: { lat: number; lng: number; eleEstimate: number | null }) => void;
  onSelectWaypoint?: (wp: TrailWaypoint) => void;
  onRequestLocate?: () => Promise<GeoPoint | null>;
}

const OVERLAY_OPTIONS: Array<{
  key: 'baseOutdoor' | 'contours' | 'satellite' | 'hillshade';
  label: string;
}> = [
  { key: 'baseOutdoor', label: '基础户外地图' },
  { key: 'contours', label: '等高线图层' },
  { key: 'satellite', label: '卫星影像' },
  { key: 'hillshade', label: '地形阴影' },
];

function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2'))
    );
  } catch {
    return false;
  }
}

function estimateElevationNearPoint(
  lat: number,
  lng: number,
  tracks: MapOverlayTrack[],
  referencePoints: GeoPoint[]
): number | null {
  const pool = [...referencePoints, ...tracks.flatMap((t) => t.points)];
  if (pool.length === 0) return null;
  let best: GeoPoint | null = null;
  let bestD = Infinity;
  for (const pt of pool) {
    const d = (pt.lat - lat) ** 2 + (pt.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = pt;
    }
  }
  return best ? Math.round(best.ele) : null;
}

export const MapLibreOutdoorMap: React.FC<MapLibreOutdoorMapProps> = ({
  layers,
  tracks,
  activeRecordingPoints = [],
  referencePoints = [],
  waypoints = [],
  currentGps = null,
  headingDegrees = null,
  cursorPoint = null,
  offlineRegions = [],
  onMapClickCoord,
  onSelectWaypoint,
  onRequestLocate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [webglReady] = useState<boolean>(() => isWebGLSupported());
  const [mapReady, setMapReady] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [layerState, setLayerState] = useState<MapLayersState>(layers);
  const layerStateRef = useRef<MapLayersState>(layers);
  const osmFallbackActiveRef = useRef<boolean>(false);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);
  const [localGps, setLocalGps] = useState<GeoPoint | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const compassHeading = useCompassHeading();

  useEffect(() => {
    setLayerState(layers);
    layerStateRef.current = layers;
  }, [layers]);

  useEffect(() => {
    layerStateRef.current = layerState;
  }, [layerState]);

  const effectiveGps = currentGps ?? localGps;
  const effectiveHeading = useMemo(
    () =>
      normalizeHeadingDegrees(headingDegrees) ??
      compassHeading ??
      normalizeHeadingDegrees(effectiveGps?.heading),
    [headingDegrees, compassHeading, effectiveGps?.heading]
  );

  const initialCenter = useMemo<[number, number]>(() => {
    if (effectiveGps) return [effectiveGps.lng, effectiveGps.lat];
    const firstTrackPt = tracks.find((t) => t.visible && t.points.length > 0)?.points[0];
    if (firstTrackPt) return [firstTrackPt.lng, firstTrackPt.lat];
    if (referencePoints.length > 0) return [referencePoints[0].lng, referencePoints[0].lat];
    return [116.178, 39.994];
  }, []);

  // Initialize MapLibre GL JS with Organic Maps-inspired vector cartography + fallback & overlays
  useEffect(() => {
    if (!webglReady || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: initialCenter,
      zoom: 13.4,
      pitch: 0,
      maxZoom: 20,
      attributionControl: false,
      style: createOrganicOutdoorStyle({
        darkMode: false,
        includeOsmFallbackSource: true,
        showOsmFallback: false,
        showBaseOutdoor: layerStateRef.current.baseOutdoor,
      }),
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

    map.on('rotate', () => {
      setBearing(Math.round(map.getBearing()));
    });

    map.on('error', (evt) => {
      const sourceId = (evt as { sourceId?: string }).sourceId;
      if (sourceId === 'openmaptiles' && !osmFallbackActiveRef.current) {
        osmFallbackActiveRef.current = true;
        if (map.getLayer('osm-fallback-layer')) {
          map.setLayoutProperty(
            'osm-fallback-layer',
            'visibility',
            layerStateRef.current.baseOutdoor ? 'visible' : 'none'
          );
        }
      }
    });

    map.on('load', () => {
      // Topographic & Satellite overlay sources (strictly capped to prevent watermark artifacts)
      map.addSource('satelliteSource', {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Satellite Imagery',
      });
      map.addLayer({
        id: 'satellite-layer',
        type: 'raster',
        source: 'satelliteSource',
        layout: { visibility: layerStateRef.current.satellite ? 'visible' : 'none' },
      });

      map.addSource('openTopo', {
        type: 'raster',
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 17,
        attribution: '© OpenTopoMap (CC-BY-SA)',
      });
      map.addLayer({
        id: 'topo-contours-layer',
        type: 'raster',
        source: 'openTopo',
        paint: { 'raster-opacity': 0.48 },
        layout: { visibility: layerStateRef.current.contours ? 'visible' : 'none' },
      });
      map.addLayer({
        id: 'hillshade-tint-layer',
        type: 'raster',
        source: 'openTopo',
        paint: {
          'raster-opacity': 0.2,
          'raster-contrast': 0.35,
        },
        layout: { visibility: layerStateRef.current.hillshade ? 'visible' : 'none' },
      });

      // Offline region boxes source
      map.addSource('offline-regions', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'offline-regions-fill',
        type: 'fill',
        source: 'offline-regions',
        paint: {
          'fill-color': '#1E352B',
          'fill-opacity': 0.08,
        },
      });
      map.addLayer({
        id: 'offline-regions-outline',
        type: 'line',
        source: 'offline-regions',
        paint: {
          'line-color': '#1E352B',
          'line-width': 1.5,
          'line-dasharray': [4, 3],
        },
      });

      // Reference route source
      map.addSource('reference-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'reference-route-line',
        type: 'line',
        source: 'reference-route',
        paint: {
          'line-color': '#1E352B',
          'line-width': 2.5,
          'line-dasharray': [3, 2],
          'line-opacity': 0.75,
        },
      });

      // Multi-track overlay GeoJSON source (data-driven styling per feature)
      map.addSource('overlay-tracks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'overlay-tracks-line',
        type: 'line',
        source: 'overlay-tracks',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      });
      map.addLayer({
        id: 'overlay-tracks-arrows',
        type: 'symbol',
        source: 'overlay-tracks',
        filter: ['==', ['get', 'showArrows'], true],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 90,
          'text-field': '›',
          'text-size': 18,
          'text-keep-upright': false,
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.2,
        },
      });

      // Active recording live track
      map.addSource('active-recording', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'active-recording-line',
        type: 'line',
        source: 'active-recording',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#B84F24',
          'line-width': 4,
        },
      });

      // Waypoints source
      map.addSource('trail-waypoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'trail-waypoints-circle',
        type: 'circle',
        source: 'trail-waypoints',
        paint: {
          'circle-radius': 6,
          'circle-color': '#FFFFFF',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#1E352B',
        },
      });
      map.addLayer({
        id: 'trail-waypoints-label',
        type: 'symbol',
        source: 'trail-waypoints',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#1A211E',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5,
        },
      });

      // Register directional heading arrow sprite (@2x crisp 96x96)
      if (!map.hasImage('gps-heading-arrow')) {
        const spriteSize = 96;
        const spriteCanvas = document.createElement('canvas');
        spriteCanvas.width = spriteSize;
        spriteCanvas.height = spriteSize;
        const ctx = spriteCanvas.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.moveTo(48, 7);
          ctx.lineTo(68, 33);
          ctx.lineTo(48, 25);
          ctx.lineTo(28, 33);
          ctx.closePath();
          ctx.lineJoin = 'round';
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();
          ctx.fillStyle = '#B84F24';
          ctx.fill();
          const imgData = ctx.getImageData(0, 0, spriteSize, spriteSize);
          map.addImage('gps-heading-arrow', imgData, { pixelRatio: 2 });
        }
      }

      // Current GPS + Hover Elevation Cursor
      map.addSource('gps-and-cursor', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'gps-halo',
        type: 'circle',
        source: 'gps-and-cursor',
        filter: ['==', ['get', 'kind'], 'gps'],
        paint: {
          'circle-radius': 16,
          'circle-color': '#B84F24',
          'circle-opacity': 0.18,
        },
      });
      map.addLayer({
        id: 'gps-dot',
        type: 'circle',
        source: 'gps-and-cursor',
        filter: ['==', ['get', 'kind'], 'gps'],
        paint: {
          'circle-radius': 6.5,
          'circle-color': '#B84F24',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2.5,
        },
      });
      map.addLayer({
        id: 'gps-heading-arrow',
        type: 'symbol',
        source: 'gps-and-cursor',
        filter: ['==', ['get', 'kind'], 'gps-heading'],
        layout: {
          'icon-image': 'gps-heading-arrow',
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-size': 1.25,
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      map.addLayer({
        id: 'elevation-cursor-dot',
        type: 'circle',
        source: 'gps-and-cursor',
        filter: ['==', ['get', 'kind'], 'cursor'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#1E352B',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2.5,
        },
      });

      map.on('click', 'trail-waypoints-circle', (e: maplibregl.MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        const wpId = feat?.properties?.id;
        if (!wpId) return;
        const found = waypoints.find((w) => w.id === wpId);
        if (found && onSelectWaypoint) {
          onSelectWaypoint(found);
        }
      });

      setMapReady(true);
    });

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (onMapClickCoord) {
        onMapClickCoord({
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          eleEstimate: estimateElevationNearPoint(e.lngLat.lat, e.lngLat.lng, tracks, referencePoints),
        });
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [webglReady]);

  // Sync layer visibility independently
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const setVis = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };
    for (const layerId of VECTOR_BASE_LAYER_IDS) {
      setVis(layerId, layerState.baseOutdoor);
    }
    setVis('osm-fallback-layer', layerState.baseOutdoor && osmFallbackActiveRef.current);
    setVis('satellite-layer', layerState.satellite);
    setVis('topo-contours-layer', layerState.contours);
    if (map.getLayer('topo-contours-layer')) {
      const opacity = layerState.satellite ? 0.45 : layerState.baseOutdoor ? 0.48 : 0.96;
      map.setPaintProperty('topo-contours-layer', 'raster-opacity', opacity);
    }
    setVis('hillshade-tint-layer', layerState.hillshade);
    setVis('active-recording-line', layerState.activeTrack);
    setVis('trail-waypoints-circle', layerState.waypoints);
    setVis('trail-waypoints-label', layerState.waypoints);
  }, [layerState, mapReady]);

  // Sync tracks & overlay styles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visibleFeatures = tracks
      .filter((t) => {
        if (!t.visible || t.points.length < 2) return false;
        if (t.isTemporaryImport && !layerState.importedTracks) return false;
        if (!t.isTemporaryImport && t.isHistorical && !layerState.historicalTracks) return false;
        return true;
      })
      .map((t) => ({
        type: 'Feature' as const,
        properties: {
          id: t.id,
          name: t.name,
          color: t.color,
          width: t.width,
          opacity: t.opacity,
          showArrows: t.showArrows,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: t.points.map((p) => [p.lng, p.lat]),
        },
      }));

    (map.getSource('overlay-tracks') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: visibleFeatures,
    });

    (map.getSource('reference-route') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features:
        referencePoints.length >= 2
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: referencePoints.map((p) => [p.lng, p.lat]),
                },
              },
            ]
          : [],
    });

    (map.getSource('active-recording') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features:
        activeRecordingPoints.length >= 2
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: activeRecordingPoints.map((p) => [p.lng, p.lat]),
                },
              },
            ]
          : [],
    });

    (map.getSource('trail-waypoints') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: waypoints.map((w) => ({
        type: 'Feature',
        properties: {
          id: w.id,
          name: `${w.name} (${WAYPOINT_TYPE_LABELS[w.type]})`,
        },
        geometry: {
          type: 'Point',
          coordinates: [w.lng, w.lat],
        },
      })),
    });

    (map.getSource('offline-regions') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: offlineRegions
        .filter((r) => r.status === 'completed' || r.downloadedTiles > 0)
        .map((r) => ({
          type: 'Feature',
          properties: { name: r.name },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [r.bounds.west, r.bounds.south],
                [r.bounds.east, r.bounds.south],
                [r.bounds.east, r.bounds.north],
                [r.bounds.west, r.bounds.north],
                [r.bounds.west, r.bounds.south],
              ],
            ],
          },
        })),
    });
  }, [tracks, activeRecordingPoints, referencePoints, waypoints, offlineRegions, layerState, mapReady]);

  // Sync GPS, Heading Arrow & Elevation Hover Cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const features: Array<{
      type: 'Feature';
      properties: { kind: string; heading?: number };
      geometry: { type: 'Point'; coordinates: [number, number] };
    }> = [];
    if (effectiveGps) {
      features.push({
        type: 'Feature',
        properties: { kind: 'gps' },
        geometry: { type: 'Point', coordinates: [effectiveGps.lng, effectiveGps.lat] },
      });
      if (effectiveHeading !== null) {
        features.push({
          type: 'Feature',
          properties: { kind: 'gps-heading', heading: effectiveHeading },
          geometry: { type: 'Point', coordinates: [effectiveGps.lng, effectiveGps.lat] },
        });
      }
    }
    if (cursorPoint) {
      features.push({
        type: 'Feature',
        properties: { kind: 'cursor' },
        geometry: { type: 'Point', coordinates: [cursorPoint.lng, cursorPoint.lat] },
      });
    }
    (map.getSource('gps-and-cursor') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [effectiveGps, effectiveHeading, cursorPoint, mapReady]);

  // Fit bounds when primary visible track changes
  const firstVisibleTrackId = tracks.find((t) => t.visible && t.points.length > 1)?.id;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const pts = [
      ...tracks.filter((t) => t.visible).flatMap((t) => t.points),
      ...referencePoints,
    ];
    if (pts.length < 2) return;
    const bounds = new maplibregl.LngLatBounds();
    pts.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 48, duration: 350, maxZoom: 15 });
  }, [firstVisibleTrackId, referencePoints.length, mapReady]);

  const toggleOverlay = (key: 'baseOutdoor' | 'contours' | 'satellite' | 'hillshade') => {
    setLayerState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchBrowserGps = (): Promise<GeoPoint | null> => {
    if (onRequestLocate) {
      return onRequestLocate();
    }
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setLocateError('当前环境不支持真实定位');
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const hasAlt = pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude);
          const pt: GeoPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ele: hasAlt ? Math.round(pos.coords.altitude! * 10) / 10 : 0,
            timestamp: pos.timestamp || Date.now(),
            accuracy: pos.coords.accuracy,
            speedMps: pos.coords.speed ?? 0,
            heading: normalizeHeadingDegrees(pos.coords.heading),
          };
          setLocalGps(pt);
          setLocateError(null);
          resolve(pt);
        },
        () => {
          setLocateError('无法获取当前位置，请检查定位权限');
          resolve(null);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
    });
  };

  // Graceful fallback to vector TopoMapCanvas if WebGL is unavailable
  if (!webglReady) {
    const primaryRec =
      activeRecordingPoints.length > 0
        ? activeRecordingPoints
        : tracks.find((t) => t.visible)?.points || [];
    return (
      <TopoMapCanvas
        referencePath={referencePoints}
        recordedPath={primaryRec}
        waypoints={waypoints}
        currentPosition={cursorPoint || effectiveGps}
        headingDegrees={effectiveHeading}
        layers={layerState}
        onToggleLayer={toggleOverlay}
        onRequestLocate={async () => {
          await requestCompassPermissionIfNeeded();
          return fetchBrowserGps();
        }}
        styleMode={layerState.satellite ? 'night' : layerState.baseOutdoor ? 'osm' : 'topo'}
      />
    );
  }

  const handleRecenter = async () => {
    setOverlayMenuOpen(false);
    await requestCompassPermissionIfNeeded();
    const map = mapRef.current;
    const fresh = await fetchBrowserGps();
    const target = fresh || effectiveGps;
    if (target) {
      setLocalGps(target);
      setLocateError(null);
      map?.flyTo({ center: [target.lng, target.lat], zoom: 16.2, duration: 400 });
      return;
    }
    const pts = [...tracks.filter((t) => t.visible).flatMap((t) => t.points), ...referencePoints];
    if (pts.length >= 2 && map) {
      const bounds = new maplibregl.LngLatBounds();
      pts.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 48, duration: 350, maxZoom: 15 });
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#EDE9DA]">
      <div ref={containerRef} className="w-full h-full" />

      {locateError && !onRequestLocate && (
        <div className="absolute top-3 left-3 right-20 z-10 max-w-xs rounded-lg bg-[#F5F3EE]/95 dark:bg-[#141917]/95 border border-[#DFD9CE] dark:border-[#2B3530] px-3 py-2 text-xs text-[#1A211E] dark:text-[#ECEAE4]">
          {locateError}
        </div>
      )}

      {/* Top-Right Controls: Overlay Switcher, Compass Reset, Locate */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setOverlayMenuOpen((v) => !v)}
            title="地图图层叠加"
            aria-label="叠加图层"
            className={`w-11 h-11 rounded-xl border shadow-sm flex items-center justify-center cursor-pointer transition-colors ${
              overlayMenuOpen
                ? 'bg-[#1E352B] border-[#1E352B] text-white'
                : 'bg-white/95 dark:bg-[#1A211E]/95 border-[#DFD9CE] dark:border-[#2C3530] text-[#1E352B] dark:text-[#ECEAE4]'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 250 })}
            title="指北回正"
            aria-label="指南针指北"
            className="w-11 h-11 rounded-xl bg-white/95 dark:bg-[#1A211E]/95 border border-[#DFD9CE] dark:border-[#2C3530] shadow-sm flex items-center justify-center cursor-pointer"
          >
            <Compass
              className="w-4 h-4 text-[#1E352B] dark:text-[#ECEAE4] transition-transform"
              style={{ transform: `rotate(${-bearing}deg)` }}
            />
          </button>

          <button
            type="button"
            onClick={handleRecenter}
            title="定位当前位置"
            aria-label="定位回中"
            className="w-11 h-11 rounded-xl bg-white/95 dark:bg-[#1A211E]/95 border border-[#DFD9CE] dark:border-[#2C3530] shadow-sm flex items-center justify-center cursor-pointer"
          >
            <LocateFixed className="w-4 h-4 text-[#B84F24]" />
          </button>
        </div>

        {overlayMenuOpen && (
          <div className="w-44 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white/95 dark:bg-[#1A211E]/95 backdrop-blur-md shadow-md overflow-hidden">
            <div className="px-3 py-2 text-[11px] font-semibold text-[#5C655F] dark:text-[#9BA39E]">
              地图图层叠加
            </div>
            {OVERLAY_OPTIONS.map((opt) => {
              const active = layerState[opt.key];
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleOverlay(opt.key)}
                  className="w-full px-3 h-10 border-t border-[#EAE5DC] dark:border-[#2A332E] flex items-center justify-between text-xs font-medium text-[#1A211E] dark:text-[#ECEAE4] hover:bg-[#FAF8F4] dark:hover:bg-[#232C28] cursor-pointer"
                >
                  <span>{opt.label}</span>
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      active
                        ? 'bg-[#1E352B] border-[#1E352B] text-white'
                        : 'border-[#B8C0BB] dark:border-[#4B5650]'
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
