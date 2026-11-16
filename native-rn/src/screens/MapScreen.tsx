import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { LocateFixed } from 'lucide-react-native';
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

interface MapScreenProps {
  points: TrackPoint[];
  currentLocation: { latitude: number; longitude: number } | null;
  referenceCoordinates?: Array<[number, number]> | null;
  darkMode?: boolean;
  onPressLocate?: () => void;
}

export const MapScreen: React.FC<MapScreenProps> = ({
  points,
  currentLocation,
  referenceCoordinates = null,
  darkMode = false,
  onPressLocate,
}) => {
  const cameraRef = useRef<React.ElementRef<typeof MapLibreGL.Camera>>(null);
  const [followingUser, setFollowingUser] = useState<boolean>(true);
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

  const handleRecenter = () => {
    setFollowingUser(true);
    onPressLocate?.();
    if (currentLocation) {
      cameraRef.current?.setCamera({
        centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
        zoomLevel: 15,
        animationDuration: 350,
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <MapLibreGL.MapView
        style={styles.map}
        mapStyle={darkMode ? OFFLINE_DARK_STYLE : OFFLINE_BASE_STYLE}
        compassEnabled
        compassViewMargins={{ x: 16, y: 56 }}
        rotateEnabled
        attributionEnabled={false}
        onRegionWillChange={(feature) => {
          if (feature?.properties?.isUserInteraction) {
            setFollowingUser(false);
          }
        }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          followUserLocation={followingUser && Boolean(currentLocation)}
          followZoomLevel={15}
          defaultSettings={{
            centerCoordinate: currentLocation
              ? [currentLocation.longitude, currentLocation.latitude]
              : [116.178, 39.994],
            zoomLevel: 14,
          }}
        />

        <MapLibreGL.UserLocation visible showsUserHeadingIndicator />

        <MapLibreGL.RasterSource
          id="osm-outdoor-base"
          tileUrlTemplates={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']}
          tileSize={256}
        >
          <MapLibreGL.RasterLayer id="osm-outdoor-layer" sourceID="osm-outdoor-base" />
        </MapLibreGL.RasterSource>

        {referenceGeoJson && (
          <MapLibreGL.ShapeSource id="reference-guide-source" shape={referenceGeoJson}>
            <MapLibreGL.LineLayer
              id="reference-guide-line"
              style={{
                lineColor: '#2D6A4F',
                lineWidth: 3,
                lineOpacity: 0.78,
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
      </MapLibreGL.MapView>

      {/* Single clean Locate button */}
      <Pressable
        onPress={handleRecenter}
        style={[
          styles.locateBtn,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        accessibilityLabel="回到当前位置"
      >
        <LocateFixed size={20} color={followingUser ? theme.primary : theme.textSecondary} />
        <Text style={[styles.locateText, { color: theme.textPrimary }]}>定位</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  locateBtn: {
    position: 'absolute',
    right: 16,
    top: 56,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locateText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
