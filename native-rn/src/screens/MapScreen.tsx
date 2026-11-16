import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { Check, Layers, LocateFixed } from 'lucide-react-native';
import { TrackPoint } from '../types/domain';
import { OutdoorColors } from '../theme/tokens';

// MapLibre is strictly the rendering engine; open/offline raster & vector sources are attached explicitly.
MapLibreGL.setAccessToken(null);

const OFFLINE_BASE_STYLE = JSON.stringify({
  version: 8,
  name: 'FollowTheTrailBase',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#EFECE4' },
    },
  ],
});

const OFFLINE_DARK_STYLE = JSON.stringify({
  version: 8,
  name: 'FollowTheTrailDarkBase',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#141917' },
    },
  ],
});

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
  { key: 'contours', label: '等高线图层' },
  { key: 'satellite', label: '卫星影像' },
  { key: 'hillshade', label: '地形阴影' },
];

export const MapScreen: React.FC<MapScreenProps> = ({
  points,
  currentLocation,
  headingDegrees = null,
  referenceCoordinates = null,
  darkMode = false,
  onPressLocate,
}) => {
  const cameraRef = useRef<React.ElementRef<typeof MapLibreGL.Camera>>(null);
  const [followingUser, setFollowingUser] = useState<boolean>(true);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState<boolean>(false);
  const [overlays, setOverlays] = useState<MapOverlayState>({
    baseOutdoor: true,
    contours: true,
    satellite: false,
    hillshade: false,
  });
  const theme = darkMode ? OutdoorColors.dark : OutdoorColors.light;

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
    setFollowingUser(false);
    cameraRef.current?.fitBounds([maxLng, maxLat], [minLng, minLat], [72, 36, 180, 36], 450);
  }, [referenceCoordinates]);

  const toggleOverlay = (key: keyof MapOverlayState) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRecenter = async () => {
    setFollowingUser(true);
    setOverlayMenuOpen(false);
    const fresh = await onPressLocate?.();
    const target =
      fresh && typeof fresh === 'object' && 'latitude' in fresh ? fresh : currentLocation;
    if (target) {
      cameraRef.current?.setCamera({
        centerCoordinate: [target.longitude, target.latitude],
        zoomLevel: 15.5,
        animationDuration: 350,
      });
    }
  };

  const contourOpacity = overlays.satellite ? 0.48 : overlays.baseOutdoor ? 0.62 : 0.95;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <MapLibreGL.MapView
        style={styles.map}
        mapStyle={darkMode ? OFFLINE_DARK_STYLE : OFFLINE_BASE_STYLE}
        compassEnabled
        compassViewMargins={{ x: 16, y: 56 }}
        rotateEnabled
        attributionEnabled={false}
        onPress={() => {
          if (overlayMenuOpen) setOverlayMenuOpen(false);
        }}
        onRegionWillChange={(feature) => {
          if (feature?.properties?.isUserInteraction) {
            setFollowingUser(false);
          }
        }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          followUserLocation={followingUser && Boolean(currentLocation)}
          followZoomLevel={15.5}
          defaultSettings={{
            centerCoordinate: currentLocation
              ? [currentLocation.longitude, currentLocation.latitude]
              : [116.178, 39.994],
            zoomLevel: 14,
          }}
        />

        <MapLibreGL.UserLocation visible={false} />

        <MapLibreGL.Images
          images={{
            'user-heading-arrow': require('../../assets/location-arrow.png'),
          }}
        />

        {/* Base OSM Map */}
        <MapLibreGL.RasterSource
          id="osm-outdoor-base"
          tileUrlTemplates={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']}
          tileSize={256}
        >
          <MapLibreGL.RasterLayer
            id="osm-outdoor-layer"
            sourceID="osm-outdoor-base"
            style={{
              visibility: overlays.baseOutdoor ? 'visible' : 'none',
            }}
          />
        </MapLibreGL.RasterSource>

        {/* Satellite Imagery (under contours so contours can overlay satellite) */}
        <MapLibreGL.RasterSource
          id="satellite-imagery"
          tileUrlTemplates={[
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ]}
          tileSize={256}
        >
          <MapLibreGL.RasterLayer
            id="satellite-imagery-layer"
            sourceID="satellite-imagery"
            style={{
              visibility: overlays.satellite ? 'visible' : 'none',
            }}
          />
        </MapLibreGL.RasterSource>

        {/* Topographic Contours Overlay (OpenTopoMap) */}
        <MapLibreGL.RasterSource
          id="opentopo-contours"
          tileUrlTemplates={['https://tile.opentopomap.org/{z}/{x}/{y}.png']}
          tileSize={256}
        >
          <MapLibreGL.RasterLayer
            id="opentopo-contours-layer"
            sourceID="opentopo-contours"
            style={{
              visibility: overlays.contours ? 'visible' : 'none',
              rasterOpacity: contourOpacity,
            }}
          />
        </MapLibreGL.RasterSource>

        {/* Hillshade Relief Contrast Overlay */}
        <MapLibreGL.RasterSource
          id="hillshade-relief"
          tileUrlTemplates={['https://tile.opentopomap.org/{z}/{x}/{y}.png']}
          tileSize={256}
        >
          <MapLibreGL.RasterLayer
            id="hillshade-relief-layer"
            sourceID="hillshade-relief"
            style={{
              visibility: overlays.hillshade ? 'visible' : 'none',
              rasterOpacity: 0.22,
              rasterContrast: 0.35,
            }}
          />
        </MapLibreGL.RasterSource>

        {referenceGeoJson && (
          <MapLibreGL.ShapeSource id="reference-guide-source" shape={referenceGeoJson}>
            <MapLibreGL.LineLayer
              id="reference-guide-line"
              style={{
                lineColor: '#2D6A4F',
                lineWidth: 3,
                lineOpacity: 0.85,
                lineDasharray: [2, 1.5],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {trackGeoJson && (
          <MapLibreGL.ShapeSource id="recorded-track-source" shape={trackGeoJson}>
            <MapLibreGL.LineLayer
              id="recorded-track-line"
              style={{
                lineColor: theme.accent,
                lineWidth: 3.5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {/* Explicit Current Position Dot + Directional Heading Arrow */}
        {currentLocationGeoJson && (
          <MapLibreGL.ShapeSource
            id="current-location-source"
            shape={currentLocationGeoJson}
          >
            <MapLibreGL.CircleLayer
              id="current-location-halo"
              style={{
                circleRadius: 15,
                circleColor: '#B84F24',
                circleOpacity: 0.2,
              }}
            />
            <MapLibreGL.CircleLayer
              id="current-location-dot"
              style={{
                circleRadius: 7,
                circleColor: '#B84F24',
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: 2.5,
              }}
            />
            {hasValidHeading && (
              <MapLibreGL.SymbolLayer
                id="current-location-heading"
                style={{
                  iconImage: 'user-heading-arrow',
                  iconRotate: ['get', 'heading'],
                  iconRotationAlignment: 'map',
                  iconPitchAlignment: 'map',
                  iconSize: 0.68,
                  iconAnchor: 'center',
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                }}
              />
            )}
          </MapLibreGL.ShapeSource>
        )}
      </MapLibreGL.MapView>

      {/* Top-Right Controls: Overlay Switcher + Locate */}
      <View style={styles.topRightControls}>
        <Pressable
          onPress={() => setOverlayMenuOpen((v) => !v)}
          style={[
            styles.controlBtn,
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

        <Pressable
          onPress={handleRecenter}
          style={[
            styles.controlBtn,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          accessibilityLabel="回到当前位置"
        >
          <LocateFixed size={18} color={followingUser ? theme.primary : theme.textSecondary} />
          <Text style={[styles.controlText, { color: theme.textPrimary }]}>定位</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topRightControls: {
    position: 'absolute',
    right: 16,
    top: 56,
    gap: 8,
  },
  controlBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  controlText: {
    fontSize: 12,
    fontWeight: '500',
  },
  overlayPanel: {
    position: 'absolute',
    right: 16,
    top: 152,
    width: 176,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
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
});
