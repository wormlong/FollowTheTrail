import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapLibreGL, { type MapViewRef } from '@maplibre/maplibre-react-native';
import { Check, Layers, LocateFixed, Minus, Plus } from 'lucide-react-native';
import { TrackPoint } from '../types/domain';
import { OutdoorColors } from '../theme/tokens';
import { createOrganicOutdoorStyle } from '../map/organicOutdoorStyle';

// MapLibre is strictly the rendering engine; OpenFreeMap vector tiles + open raster overlays are configured explicitly.
MapLibreGL.setAccessToken(null);

const HEADING_IMAGES = {
  'user-heading-arrow': require('../../assets/location-arrow.png'),
};

const COMPASS_MARGINS = { x: 16, y: 56 };

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const REFERENCE_LINE_BASE = {
  lineColor: '#2D6A4F',
  lineWidth: 3.2,
  lineOpacity: 0.88,
  lineDasharray: [2, 1.5],
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

const LOCATION_HALO_BASE = {
  circleRadius: 11,
  circleColor: '#B84F24',
  circleOpacity: 0.16,
};

const LOCATION_DOT_BASE = {
  circleRadius: 5.5,
  circleColor: '#B84F24',
  circleStrokeColor: '#FFFFFF',
  circleStrokeWidth: 2,
};

const LOCATION_HEADING_BASE = {
  iconImage: 'user-heading-arrow',
  iconRotate: ['get', 'heading'] as ['get', string],
  iconRotationAlignment: 'map' as const,
  iconPitchAlignment: 'map' as const,
  iconSize: 0.44,
  iconAnchor: 'center' as const,
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
};

const HEADING_FILTER: ['==', ['get', string], boolean] = ['==', ['get', 'showHeading'], true];

const SATELLITE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
];
const OPENTOPO_TILES = ['https://tile.opentopomap.org/{z}/{x}/{y}.png'];

interface MapOverlayState {
  baseOutdoor: boolean;
  contours: boolean;
  satellite: boolean;
  hillshade: boolean;
}

interface LocateResult {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

interface MapScreenProps {
  points: TrackPoint[];
  currentLocation: { latitude: number; longitude: number } | null;
  headingDegrees?: number | null;
  referenceCoordinates?: Array<[number, number]> | null;
  darkMode?: boolean;
  onPressLocate?: () => Promise<LocateResult | null | void> | LocateResult | null | void;
}

const OVERLAY_OPTIONS: Array<{ key: keyof MapOverlayState; label: string }> = [
  { key: 'baseOutdoor', label: '基础户外地图' },
  { key: 'contours', label: '等高线地形图' },
  { key: 'satellite', label: '卫星影像' },
  { key: 'hillshade', label: '地形阴影' },
];

const MapScreenInner: React.FC<MapScreenProps> = ({
  points,
  currentLocation,
  headingDegrees = null,
  referenceCoordinates = null,
  darkMode = false,
  onPressLocate,
}) => {
  const mapViewRef = useRef<MapViewRef>(null);
  const cameraRef = useRef<React.ElementRef<typeof MapLibreGL.Camera>>(null);
  const followingUserRef = useRef<boolean>(true);
  const hasCenteredInitialRef = useRef<boolean>(false);
  const mapReadyRef = useRef<boolean>(false);
  const pendingCameraActionRef = useRef<(() => void) | null>(null);
  const osmFallbackActivatedRef = useRef<boolean>(false);

  const [followingUi, setFollowingUi] = useState<boolean>(true);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState<boolean>(false);
  const [showOsmFallback, setShowOsmFallback] = useState<boolean>(false);
  const [overlays, setOverlays] = useState<MapOverlayState>({
    baseOutdoor: true,
    contours: false,
    satellite: false,
    hillshade: false,
  });
  const theme = darkMode ? OutdoorColors.dark : OutdoorColors.light;

  // Keep mapStyle string stable across overlay toggles; only regenerate when theme or fallback changes
  const mapStyleJson = useMemo(
    () =>
      JSON.stringify(
        createOrganicOutdoorStyle({
          darkMode,
          includeOsmFallbackSource: true,
          showOsmFallback,
          showBaseOutdoor: true,
        })
      ),
    [darkMode, showOsmFallback]
  );

  // When base style changes, wait for onDidFinishLoadingStyle before invoking camera/source methods
  useEffect(() => {
    mapReadyRef.current = false;
  }, [mapStyleJson]);

  const runCameraWhenReady = useCallback((action: () => void) => {
    if (!mapReadyRef.current) {
      pendingCameraActionRef.current = action;
      return;
    }
    try {
      action();
    } catch {
      // Ignore transient camera errors if view is tearing down
    }
  }, []);

  const syncBaseOutdoorVisibility = useCallback(
    (visible: boolean, fallbackActive: boolean) => {
      if (!mapReadyRef.current) return;
      try {
        mapViewRef.current?.setSourceVisibility(visible, 'openmaptiles');
        mapViewRef.current?.setSourceVisibility(visible && fallbackActive, 'osmFallback');
      } catch {
        // Ignore if native map style is still reloading
      }
    },
    []
  );

  useEffect(() => {
    syncBaseOutdoorVisibility(overlays.baseOutdoor, showOsmFallback);
  }, [overlays.baseOutdoor, showOsmFallback, syncBaseOutdoorVisibility]);

  const handleDidFinishLoadingStyle = useCallback(() => {
    mapReadyRef.current = true;
    syncBaseOutdoorVisibility(overlays.baseOutdoor, showOsmFallback);
    const pending = pendingCameraActionRef.current;
    if (pending) {
      pendingCameraActionRef.current = null;
      try {
        pending();
      } catch {
        // Ignore if view unmounted mid-callback
      }
    }
  }, [overlays.baseOutdoor, showOsmFallback, syncBaseOutdoorVisibility]);

  const handleDidFailLoadingMap = useCallback(() => {
    if (!osmFallbackActivatedRef.current) {
      osmFallbackActivatedRef.current = true;
      setShowOsmFallback(true);
    }
  }, []);

  const hasTrack = points.length >= 2;
  const trackGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!hasTrack) return EMPTY_FEATURE_COLLECTION;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: points.map((p) => [p.longitude, p.latitude]),
          },
        },
      ],
    };
  }, [hasTrack, points]);

  const hasReference = Boolean(referenceCoordinates && referenceCoordinates.length >= 2);
  const referenceGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!referenceCoordinates || referenceCoordinates.length < 2) {
      return EMPTY_FEATURE_COLLECTION;
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: referenceCoordinates,
          },
        },
      ],
    };
  }, [referenceCoordinates]);

  const hasLocation =
    Boolean(currentLocation) &&
    Number.isFinite(currentLocation?.latitude) &&
    Number.isFinite(currentLocation?.longitude);

  const hasValidHeading =
    hasLocation && typeof headingDegrees === 'number' && Number.isFinite(headingDegrees);

  const currentLocationGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!currentLocation || !hasLocation) return EMPTY_FEATURE_COLLECTION;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            heading: hasValidHeading ? headingDegrees : 0,
            showHeading: hasValidHeading,
          },
          geometry: {
            type: 'Point',
            coordinates: [currentLocation.longitude, currentLocation.latitude],
          },
        },
      ],
    };
  }, [currentLocation, hasLocation, hasValidHeading, headingDegrees]);

  // Center once on initial GPS fix, and gently pan (preserving user's zoom!) only when following
  useEffect(() => {
    if (!currentLocation || !hasLocation) return;
    if (!hasCenteredInitialRef.current) {
      hasCenteredInitialRef.current = true;
      runCameraWhenReady(() => {
        cameraRef.current?.setCamera({
          centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
          zoomLevel: 15.8,
          animationDuration: 350,
          animationMode: 'easeTo',
        });
      });
      return;
    }
    if (followingUserRef.current) {
      runCameraWhenReady(() => {
        cameraRef.current?.setCamera({
          centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
          animationDuration: 250,
          animationMode: 'easeTo',
        });
      });
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, hasLocation, runCameraWhenReady]);

  useEffect(() => {
    if (!referenceCoordinates || referenceCoordinates.length < 2) return;
    let minLng = referenceCoordinates[0][0];
    let maxLng = referenceCoordinates[0][0];
    let minLat = referenceCoordinates[0][1];
    let maxLat = referenceCoordinates[0][1];
    for (const [lng, lat] of referenceCoordinates) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    // Guard against zero-span bounds which crash MapLibre Android LatLngBounds
    if (maxLng - minLng < 0.002) {
      const midLng = (minLng + maxLng) / 2;
      minLng = midLng - 0.001;
      maxLng = midLng + 0.001;
    }
    if (maxLat - minLat < 0.002) {
      const midLat = (minLat + maxLat) / 2;
      minLat = midLat - 0.001;
      maxLat = midLat + 0.001;
    }
    followingUserRef.current = false;
    setFollowingUi(false);
    runCameraWhenReady(() => {
      cameraRef.current?.fitBounds([maxLng, maxLat], [minLng, minLat], [72, 36, 180, 36], 450);
    });
  }, [referenceCoordinates, runCameraWhenReady]);

  const toggleOverlay = (key: keyof MapOverlayState) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleReleaseFollow = useCallback(() => {
    if (followingUserRef.current) {
      followingUserRef.current = false;
      setFollowingUi(false);
    }
  }, []);

  const handleZoomStep = useCallback(
    async (delta: number) => {
      handleReleaseFollow();
      if (!mapReadyRef.current) return;
      try {
        const currentZoom = (await mapViewRef.current?.getZoom()) ?? 15;
        const targetZoom = Math.min(20.5, Math.max(3, currentZoom + delta));
        cameraRef.current?.zoomTo(targetZoom, 220);
      } catch {
        // Ignore if map not yet initialized
      }
    },
    [handleReleaseFollow]
  );

  const handleRecenter = async () => {
    followingUserRef.current = true;
    setFollowingUi(true);
    setOverlayMenuOpen(false);
    try {
      const fresh = await onPressLocate?.();
      const target =
        fresh && typeof fresh === 'object' && 'latitude' in fresh ? fresh : currentLocation;
      if (target && Number.isFinite(target.latitude) && Number.isFinite(target.longitude)) {
        runCameraWhenReady(() => {
          cameraRef.current?.setCamera({
            centerCoordinate: [target.longitude, target.latitude],
            zoomLevel: 16.2,
            animationDuration: 350,
            animationMode: 'easeTo',
          });
        });
      }
    } catch {
      // Errors surfaced via TrackRecorder telemetry banner
    }
  };

  const contourOpacity = overlays.satellite ? 0.48 : overlays.baseOutdoor ? 0.52 : 0.96;

  // All layer styles memoized cleanly with visibility toggling (never unmounting native layers!)
  const satelliteLayerStyle = useMemo(
    () => ({
      visibility: (overlays.satellite ? 'visible' : 'none') as 'visible' | 'none',
      rasterOpacity: 1,
    }),
    [overlays.satellite]
  );

  const contoursLayerStyle = useMemo(
    () => ({
      visibility: (overlays.contours ? 'visible' : 'none') as 'visible' | 'none',
      rasterOpacity: contourOpacity,
    }),
    [overlays.contours, contourOpacity]
  );

  const hillshadeLayerStyle = useMemo(
    () => ({
      visibility: (overlays.hillshade ? 'visible' : 'none') as 'visible' | 'none',
      rasterOpacity: 0.22,
      rasterContrast: 0.35,
    }),
    [overlays.hillshade]
  );

  const referenceLineStyle = useMemo(
    () => ({
      ...REFERENCE_LINE_BASE,
      visibility: (hasReference ? 'visible' : 'none') as 'visible' | 'none',
    }),
    [hasReference]
  );

  const trackLineStyle = useMemo(
    () => ({
      lineColor: theme.accent,
      lineWidth: 3.5,
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
      visibility: (hasTrack ? 'visible' : 'none') as 'visible' | 'none',
    }),
    [theme.accent, hasTrack]
  );

  const locationHaloStyle = useMemo(
    () => ({
      ...LOCATION_HALO_BASE,
      visibility: (hasLocation ? 'visible' : 'none') as 'visible' | 'none',
    }),
    [hasLocation]
  );

  const locationDotStyle = useMemo(
    () => ({
      ...LOCATION_DOT_BASE,
      visibility: (hasLocation ? 'visible' : 'none') as 'visible' | 'none',
    }),
    [hasLocation]
  );

  const locationHeadingStyle = useMemo(
    () => ({
      ...LOCATION_HEADING_BASE,
      visibility: (hasValidHeading ? 'visible' : 'none') as 'visible' | 'none',
    }),
    [hasValidHeading]
  );

  const [initialCenter] = useState<[number, number]>(() =>
    currentLocation && Number.isFinite(currentLocation.latitude)
      ? [currentLocation.longitude, currentLocation.latitude]
      : [116.178, 39.994]
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background }]}
      onTouchStart={handleReleaseFollow}
    >
      <MapLibreGL.MapView
        ref={mapViewRef}
        style={styles.map}
        mapStyle={mapStyleJson}
        zoomEnabled
        scrollEnabled
        rotateEnabled
        pitchEnabled
        compassEnabled
        compassViewPosition={0}
        compassViewMargins={COMPASS_MARGINS}
        attributionEnabled={false}
        regionWillChangeDebounceTime={120}
        onDidFinishLoadingStyle={handleDidFinishLoadingStyle}
        onDidFailLoadingMap={handleDidFailLoadingMap}
        onPress={() => {
          if (overlayMenuOpen) setOverlayMenuOpen(false);
        }}
        onRegionWillChange={(feature) => {
          if (feature?.properties?.isUserInteraction) {
            handleReleaseFollow();
          }
        }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          minZoomLevel={2}
          maxZoomLevel={21}
          defaultSettings={{
            centerCoordinate: initialCenter,
            zoomLevel: 14,
          }}
        />

        <MapLibreGL.Images images={HEADING_IMAGES} />

        {/* Static Raster Overlay Sources (visibility toggled via Paint/Layout to avoid MLRNMapView index crashes) */}
        <MapLibreGL.RasterSource
          id="satellite-imagery"
          tileUrlTemplates={SATELLITE_TILES}
          tileSize={256}
          maxZoomLevel={18}
        >
          <MapLibreGL.RasterLayer
            id="satellite-imagery-layer"
            sourceID="satellite-imagery"
            style={satelliteLayerStyle}
          />
        </MapLibreGL.RasterSource>

        <MapLibreGL.RasterSource
          id="opentopo-contours"
          tileUrlTemplates={OPENTOPO_TILES}
          tileSize={256}
          maxZoomLevel={17}
        >
          <MapLibreGL.RasterLayer
            id="opentopo-contours-layer"
            sourceID="opentopo-contours"
            style={contoursLayerStyle}
          />
        </MapLibreGL.RasterSource>

        <MapLibreGL.RasterSource
          id="hillshade-relief"
          tileUrlTemplates={OPENTOPO_TILES}
          tileSize={256}
          maxZoomLevel={17}
        >
          <MapLibreGL.RasterLayer
            id="hillshade-relief-layer"
            sourceID="hillshade-relief"
            style={hillshadeLayerStyle}
          />
        </MapLibreGL.RasterSource>

        {/* Static GeoJSON Sources (fixed child tree prevents MLRNSource.addLayer IndexOutOfBoundsException) */}
        <MapLibreGL.ShapeSource id="reference-guide-source" shape={referenceGeoJson}>
          <MapLibreGL.LineLayer id="reference-guide-line" style={referenceLineStyle} />
        </MapLibreGL.ShapeSource>

        <MapLibreGL.ShapeSource id="recorded-track-source" shape={trackGeoJson}>
          <MapLibreGL.LineLayer id="recorded-track-line" style={trackLineStyle} />
        </MapLibreGL.ShapeSource>

        <MapLibreGL.ShapeSource id="current-location-source" shape={currentLocationGeoJson}>
          <MapLibreGL.CircleLayer id="current-location-halo" style={locationHaloStyle} />
          <MapLibreGL.CircleLayer id="current-location-dot" style={locationDotStyle} />
          <MapLibreGL.SymbolLayer
            id="current-location-heading"
            filter={HEADING_FILTER}
            style={locationHeadingStyle}
          />
        </MapLibreGL.ShapeSource>
      </MapLibreGL.MapView>

      {/* Top-Right Layer Switcher */}
      <View style={styles.topRightControls}>
        <Pressable
          onPress={() => setOverlayMenuOpen((v) => !v)}
          style={[
            styles.overlayToggleBtn,
            {
              backgroundColor: overlayMenuOpen ? theme.primary : theme.surface,
              borderColor: overlayMenuOpen ? theme.primary : theme.border,
            },
          ]}
          accessibilityLabel="地图叠加图层"
        >
          <Layers size={15} color={overlayMenuOpen ? '#FFFFFF' : theme.textPrimary} />
          <Text
            style={[
              styles.controlText,
              { color: overlayMenuOpen ? '#FFFFFF' : theme.textPrimary },
            ]}
          >
            叠加
          </Text>
        </Pressable>
      </View>

      {/* Collapsible Top-Right Overlay Panel */}
      {overlayMenuOpen && (
        <View
          style={[
            styles.overlayPanel,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.overlayHeader, { color: theme.textSecondary }]}>
            地图图层叠加
          </Text>
          {OVERLAY_OPTIONS.map((opt) => {
            const active = overlays[opt.key];
            return (
              <Pressable
                key={opt.key}
                onPress={() => toggleOverlay(opt.key)}
                style={[styles.overlayRow, { borderTopColor: theme.border }]}
              >
                <Text style={[styles.overlayLabel, { color: theme.textPrimary }]}>
                  {opt.label}
                </Text>
                <View
                  style={[
                    styles.checkBox,
                    {
                      backgroundColor: active ? theme.primary : 'transparent',
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  {active && <Check size={12} color="#FFFFFF" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Organic Maps–Style Right-Side Zoom (+ / -) & Locate Controls */}
      <View style={styles.rightDockControls}>
        <Pressable
          onPress={() => handleZoomStep(1)}
          style={[
            styles.circleControlBtn,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          accessibilityLabel="放大地图"
        >
          <Plus size={18} color={theme.textPrimary} />
        </Pressable>

        <Pressable
          onPress={() => handleZoomStep(-1)}
          style={[
            styles.circleControlBtn,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          accessibilityLabel="缩小地图"
        >
          <Minus size={18} color={theme.textPrimary} />
        </Pressable>

        <Pressable
          onPress={handleRecenter}
          style={[
            styles.circleControlBtn,
            {
              backgroundColor: theme.surface,
              borderColor: followingUi ? theme.primary : theme.border,
              marginTop: 4,
            },
          ]}
          accessibilityLabel="回到当前位置"
        >
          <LocateFixed size={18} color={followingUi ? theme.primary : theme.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
};

export const MapScreen = memo(MapScreenInner);

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topRightControls: {
    position: 'absolute',
    right: 12,
    top: 52,
  },
  overlayToggleBtn: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  controlText: {
    fontSize: 12,
    fontWeight: '600',
  },
  overlayPanel: {
    position: 'absolute',
    right: 12,
    top: 96,
    width: 178,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 4,
  },
  overlayHeader: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overlayRow: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlayLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightDockControls: {
    position: 'absolute',
    right: 12,
    bottom: 148,
    gap: 7,
  },
  circleControlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
