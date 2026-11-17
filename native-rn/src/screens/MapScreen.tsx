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

const REFERENCE_LINE_STYLE = {
  lineColor: '#2D6A4F',
  lineWidth: 3,
  lineOpacity: 0.85,
  lineDasharray: [2, 1.5],
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

const LOCATION_HALO_STYLE = {
  circleRadius: 15,
  circleColor: '#B84F24',
  circleOpacity: 0.2,
};

const LOCATION_DOT_STYLE = {
  circleRadius: 7,
  circleColor: '#B84F24',
  circleStrokeColor: '#FFFFFF',
  circleStrokeWidth: 2.5,
};

const LOCATION_HEADING_STYLE = {
  iconImage: 'user-heading-arrow',
  iconRotate: ['get', 'heading'] as ['get', string],
  iconRotationAlignment: 'map' as const,
  iconPitchAlignment: 'map' as const,
  iconSize: 0.68,
  iconAnchor: 'center' as const,
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
};

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

  const [followingUi, setFollowingUi] = useState<boolean>(true);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState<boolean>(false);
  const [overlays, setOverlays] = useState<MapOverlayState>({
    baseOutdoor: true,
    contours: false,
    satellite: false,
    hillshade: false,
  });
  const theme = darkMode ? OutdoorColors.dark : OutdoorColors.light;

  const trackLineStyle = useMemo(
    () => ({
      lineColor: theme.accent,
      lineWidth: 3.5,
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
    }),
    [theme.accent]
  );

  const trackGeoJson = useMemo(() => {
    if (points.length < 2) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: points.map((p) => [p.longitude, p.latitude]),
          },
        },
      ],
    };
  }, [points]);

  const referenceGeoJson = useMemo(() => {
    if (!referenceCoordinates || referenceCoordinates.length < 2) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: referenceCoordinates,
          },
        },
      ],
    };
  }, [referenceCoordinates]);

  const hasValidHeading =
    typeof headingDegrees === 'number' && Number.isFinite(headingDegrees);

  const currentLocationGeoJson = useMemo(() => {
    if (!currentLocation) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {
            heading: hasValidHeading ? headingDegrees : 0,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [currentLocation.longitude, currentLocation.latitude],
          },
        },
      ],
    };
  }, [currentLocation, hasValidHeading, headingDegrees]);

  // Center once on initial GPS fix, and gently pan (preserving user's zoom!) only when following
  useEffect(() => {
    if (!currentLocation) return;
    if (!hasCenteredInitialRef.current) {
      hasCenteredInitialRef.current = true;
      cameraRef.current?.setCamera({
        centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
        zoomLevel: 15.8,
        animationDuration: 350,
        animationMode: 'easeTo',
      });
      return;
    }
    if (followingUserRef.current) {
      cameraRef.current?.setCamera({
        centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
        animationDuration: 250,
        animationMode: 'easeTo',
      });
    }
  }, [currentLocation?.latitude, currentLocation?.longitude]);

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
    followingUserRef.current = false;
    setFollowingUi(false);
    cameraRef.current?.fitBounds([maxLng, maxLat], [minLng, minLat], [72, 36, 180, 36], 450);
  }, [referenceCoordinates]);

  const toggleOverlay = (key: keyof MapOverlayState) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleReleaseFollow = useCallback(() => {
    if (followingUserRef.current) {
      followingUserRef.current = false;
      setFollowingUi(false);
    }
  }, []);

  const handleZoomStep = useCallback(async (delta: number) => {
    handleReleaseFollow();
    try {
      const currentZoom = (await mapViewRef.current?.getZoom()) ?? 15;
      const targetZoom = Math.min(20.5, Math.max(3, currentZoom + delta));
      cameraRef.current?.zoomTo(targetZoom, 220);
    } catch {
      // Ignore if map not yet initialized
    }
  }, [handleReleaseFollow]);

  const handleRecenter = async () => {
    followingUserRef.current = true;
    setFollowingUi(true);
    setOverlayMenuOpen(false);
    const fresh = await onPressLocate?.();
    const target =
      fresh && typeof fresh === 'object' && 'latitude' in fresh ? fresh : currentLocation;
    if (target) {
      cameraRef.current?.setCamera({
        centerCoordinate: [target.longitude, target.latitude],
        zoomLevel: 16,
        animationDuration: 350,
        animationMode: 'easeTo',
      });
    }
  };

  const mapStyleUrl = darkMode ? OFFLINE_DARK_STYLE : OFFLINE_BASE_STYLE;

  const contourOpacity = overlays.satellite ? 0.48 : overlays.baseOutdoor ? 0.52 : 0.96;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background }]}
      onTouchStart={handleReleaseFollow}
    >
      <MapLibreGL.MapView
        ref={mapViewRef}
        style={styles.map}
        mapStyle={mapStyleUrl}
        preferredFramesPerSecond={120}
        localizeLabels
        zoomEnabled
        scrollEnabled
        rotateEnabled
        pitchEnabled
        compassEnabled
        compassViewPosition={0}
        compassViewMargins={COMPASS_MARGINS}
        attributionEnabled={false}
        regionWillChangeDebounceTime={120}
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
            centerCoordinate: currentLocation
              ? [currentLocation.longitude, currentLocation.latitude]
              : [116.178, 39.994],
            zoomLevel: 14,
          }}
        />

        <MapLibreGL.Images images={HEADING_IMAGES} />

        {/* Base Outdoor OSM Map (strict maxZoomLevel=19, clean single-layer default) */}
        {overlays.baseOutdoor && (
          <MapLibreGL.RasterSource
            id="osm-outdoor-base"
            tileUrlTemplates={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']}
            tileSize={256}
            maxZoomLevel={19}
          >
            <MapLibreGL.RasterLayer id="osm-outdoor-layer" sourceID="osm-outdoor-base" />
          </MapLibreGL.RasterSource>
        )}

        {/* Satellite Imagery (strict maxZoomLevel=18) */}
        {overlays.satellite && (
          <MapLibreGL.RasterSource
            id="satellite-imagery"
            tileUrlTemplates={[
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ]}
            tileSize={256}
            maxZoomLevel={18}
          >
            <MapLibreGL.RasterLayer id="satellite-imagery-layer" sourceID="satellite-imagery" />
          </MapLibreGL.RasterSource>
        )}

        {/* Topographic Contours Overlay (strict maxZoomLevel=17 prevents "max zoom layer = 17" watermark) */}
        {overlays.contours && (
          <MapLibreGL.RasterSource
            id="opentopo-contours"
            tileUrlTemplates={['https://tile.opentopomap.org/{z}/{x}/{y}.png']}
            tileSize={256}
            maxZoomLevel={17}
          >
            <MapLibreGL.RasterLayer
              id="opentopo-contours-layer"
              sourceID="opentopo-contours"
              style={{ rasterOpacity: contourOpacity }}
            />
          </MapLibreGL.RasterSource>
        )}

        {/* Hillshade Relief Contrast Overlay (strict maxZoomLevel=17) */}
        {overlays.hillshade && (
          <MapLibreGL.RasterSource
            id="hillshade-relief"
            tileUrlTemplates={['https://tile.opentopomap.org/{z}/{x}/{y}.png']}
            tileSize={256}
            maxZoomLevel={17}
          >
            <MapLibreGL.RasterLayer
              id="hillshade-relief-layer"
              sourceID="hillshade-relief"
              style={{
                rasterOpacity: 0.22,
                rasterContrast: 0.35,
              }}
            />
          </MapLibreGL.RasterSource>
        )}

        {referenceGeoJson && (
          <MapLibreGL.ShapeSource id="reference-guide-source" shape={referenceGeoJson}>
            <MapLibreGL.LineLayer id="reference-guide-line" style={REFERENCE_LINE_STYLE} />
          </MapLibreGL.ShapeSource>
        )}

        {trackGeoJson && (
          <MapLibreGL.ShapeSource id="recorded-track-source" shape={trackGeoJson}>
            <MapLibreGL.LineLayer id="recorded-track-line" style={trackLineStyle} />
          </MapLibreGL.ShapeSource>
        )}

        {/* Current Position Dot + Directional Heading Arrow */}
        {currentLocationGeoJson && (
          <MapLibreGL.ShapeSource id="current-location-source" shape={currentLocationGeoJson}>
            <MapLibreGL.CircleLayer id="current-location-halo" style={LOCATION_HALO_STYLE} />
            <MapLibreGL.CircleLayer id="current-location-dot" style={LOCATION_DOT_STYLE} />
            {hasValidHeading && (
              <MapLibreGL.SymbolLayer
                id="current-location-heading"
                style={LOCATION_HEADING_STYLE}
              />
            )}
          </MapLibreGL.ShapeSource>
        )}
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
          <Layers size={18} color={overlayMenuOpen ? '#FFFFFF' : theme.textPrimary} />
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
          <Plus size={20} color={theme.textPrimary} />
        </Pressable>

        <Pressable
          onPress={() => handleZoomStep(-1)}
          style={[
            styles.circleControlBtn,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          accessibilityLabel="缩小地图"
        >
          <Minus size={20} color={theme.textPrimary} />
        </Pressable>

        <Pressable
          onPress={handleRecenter}
          style={[
            styles.circleControlBtn,
            {
              backgroundColor: theme.surface,
              borderColor: followingUi ? theme.primary : theme.border,
              marginTop: 6,
            },
          ]}
          accessibilityLabel="回到当前位置"
        >
          <LocateFixed size={20} color={followingUi ? theme.primary : theme.textSecondary} />
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
    right: 16,
    top: 56,
  },
  overlayToggleBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    right: 16,
    top: 104,
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
    right: 16,
    bottom: 164,
    gap: 8,
  },
  circleControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
