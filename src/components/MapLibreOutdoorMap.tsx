import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Compass, LocateFixed } from 'lucide-react';
import {
  GeoPoint,
  MapLayersState,
  OfflineRegionPack,
  RecordedTrack,
  TrailWaypoint,
  WAYPOINT_TYPE_LABELS,
} from '../types/hiking';
import { TopoMapCanvas } from './TopoMapCanvas';

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
  cursorPoint?: GeoPoint | null;
  offlineRegions?: OfflineRegionPack[];
  onMapClickCoord?: (info: { lat: number; lng: number; eleEstimate: number | null }) => void;
  onSelectWaypoint?: (wp: TrailWaypoint) => void;
}

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
  cursorPoint = null,
  offlineRegions = [],
  onMapClickCoord,
  onSelectWaypoint,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [webglReady] = useState<boolean>(() => isWebGLSupported());
  const [mapReady, setMapReady] = useState(false);
  const [bearing, setBearing] = useState(0);

  const initialCenter = useMemo<[number, number]>(() => {
    if (currentGps) return [currentGps.lng, currentGps.lat];
    const firstTrackPt = tracks.find((t) => t.visible && t.points.length > 0)?.points[0];
    if (firstTrackPt) return [firstTrackPt.lng, firstTrackPt.lat];
    if (referencePoints.length > 0) return [referencePoints[0].lng, referencePoints[0].lat];
    return [116.178, 39.994];
  }, []);

  // Initialize MapLibre GL JS with explicit open raster tile sources
  useEffect(() => {
    if (!webglReady || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: initialCenter,
      zoom: 13.4,
      pitch: 0,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osmBase: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap (ODbL)',
          },
          openTopo: {
            type: 'raster',
            tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenTopoMap (CC-BY-SA)',
          },
          satelliteSource: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: 'Satellite Imagery',
          },
        },
        layers: [
          {
            id: 'background-canvas',
            type: 'background',
            paint: { 'background-color': '#EFECE4' },
          },
          {
            id: 'osm-base-layer',
            type: 'raster',
            source: 'osmBase',
            layout: { visibility: 'visible' },
          },
          {
            id: 'topo-contours-layer',
            type: 'raster',
            source: 'openTopo',
            paint: { 'raster-opacity': 0.72 },
            layout: { visibility: 'visible' },
          },
          {
            id: 'hillshade-tint-layer',
            type: 'raster',
            source: 'openTopo',
            paint: {
              'raster-opacity': 0.25,
              'raster-contrast': 0.35,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satelliteSource',
            layout: { visibility: 'none' },
          },
        ],
      },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

    map.on('rotate', () => {
      setBearing(Math.round(map.getBearing()));
    });

    map.on('load', () => {
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
    setVis('osm-base-layer', layers.baseOutdoor);
    setVis('topo-contours-layer', layers.contours);
    setVis('hillshade-tint-layer', layers.hillshade);
    setVis('satellite-layer', layers.satellite);
    setVis('active-recording-line', layers.activeTrack);
    setVis('trail-waypoints-circle', layers.waypoints);
    setVis('trail-waypoints-label', layers.waypoints);
  }, [layers, mapReady]);

  // Sync tracks & overlay styles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visibleFeatures = tracks
      .filter((t) => {
        if (!t.visible || t.points.length < 2) return false;
        if (t.isTemporaryImport && !layers.importedTracks) return false;
        if (!t.isTemporaryImport && t.isHistorical && !layers.historicalTracks) return false;
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
  }, [tracks, activeRecordingPoints, referencePoints, waypoints, offlineRegions, layers, mapReady]);

  // Sync GPS & Elevation Hover Cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const features: Array<{
      type: 'Feature';
      properties: { kind: string };
      geometry: { type: 'Point'; coordinates: [number, number] };
    }> = [];
    if (currentGps) {
      features.push({
        type: 'Feature',
        properties: { kind: 'gps' },
        geometry: { type: 'Point', coordinates: [currentGps.lng, currentGps.lat] },
      });
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
  }, [currentGps, cursorPoint, mapReady]);

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
        currentPosition={cursorPoint || currentGps}
        styleMode={layers.satellite ? 'night' : 'topo'}
      />
    );
  }

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (currentGps) {
      map.flyTo({ center: [currentGps.lng, currentGps.lat], zoom: 15, duration: 400 });
      return;
    }
    const pts = [...tracks.filter((t) => t.visible).flatMap((t) => t.points), ...referencePoints];
    if (pts.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      pts.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 48, duration: 350, maxZoom: 15 });
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#EFECE4]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Compass Reset & Locate Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
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
          title="回到当前位置 / 轨迹范围"
          aria-label="定位回中"
          className="w-11 h-11 rounded-xl bg-white/95 dark:bg-[#1A211E]/95 border border-[#DFD9CE] dark:border-[#2C3530] shadow-sm flex items-center justify-center cursor-pointer"
        >
          <LocateFixed className="w-4 h-4 text-[#B84F24]" />
        </button>
      </div>
    </div>
  );
};
