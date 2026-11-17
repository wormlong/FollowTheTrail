import { describe, expect, test } from 'bun:test';
import {
  buildGpxXmlDocument,
  computeElevationSummary,
  findNearestTrackPointByTimestamp,
  haversineMeters,
  normalizeExifCoordinate,
  parseExifTimestamp,
  parseGpxXml,
  shouldAcceptGpsDelta,
} from '../utils/trailMath';
import { createOrganicOutdoorStyle } from '../map/organicOutdoorStyle';

describe('trailMath core outdoor algorithms', () => {
  test('haversineMeters computes accurate distance between Xiangshan points', () => {
    const dist = haversineMeters(39.9912, 116.1886, 39.9964, 116.1714);
    expect(dist).toBeGreaterThan(1500);
    expect(dist).toBeLessThan(1650);
  });

  test('shouldAcceptGpsDelta filters poor accuracy, spikes, and stationary jitter', () => {
    // Reject >35m accuracy
    expect(
      shouldAcceptGpsDelta({
        accuracyMeters: 42,
        prevLat: 39.9912,
        prevLng: 116.1886,
        prevTimestamp: 1000,
        lat: 39.9914,
        lng: 116.1886,
        timestamp: 4000,
        speedMps: 1.2,
      }).accept
    ).toBe(false);

    // Reject >12 m/s GPS jump spike (~200m in 2s)
    expect(
      shouldAcceptGpsDelta({
        accuracyMeters: 8,
        prevLat: 39.9912,
        prevLng: 116.1886,
        prevTimestamp: 1000,
        lat: 39.9932,
        lng: 116.1886,
        timestamp: 3000,
        speedMps: 1.2,
      }).accept
    ).toBe(false);

    // Reject stationary jitter (<1.8m and speed < 0.45 m/s)
    expect(
      shouldAcceptGpsDelta({
        accuracyMeters: 6,
        prevLat: 39.9912,
        prevLng: 116.1886,
        prevTimestamp: 1000,
        lat: 39.991205,
        lng: 116.188605,
        timestamp: 5000,
        speedMps: 0.1,
      }).accept
    ).toBe(false);

    // Accept genuine hiking step (~15m in 10s)
    const valid = shouldAcceptGpsDelta({
      accuracyMeters: 7,
      prevLat: 39.9912,
      prevLng: 116.1886,
      prevTimestamp: 1000,
      lat: 39.99135,
      lng: 116.1886,
      timestamp: 11000,
      speedMps: 1.5,
    });
    expect(valid.accept).toBe(true);
    expect(valid.addedDistanceMeters).toBeGreaterThan(15);
  });

  test('computeElevationSummary suppresses <3m jitter and accumulates real climb/descent', () => {
    const pts = [
      { altitudeMeters: 100, speedMps: 1.1 },
      { altitudeMeters: 102.2, speedMps: 1.2 }, // <3m jitter ignored
      { altitudeMeters: 98.5, speedMps: 1.0 },  // <3m jitter ignored
      { altitudeMeters: 115.0, speedMps: 1.3 }, // +15m climb
      { altitudeMeters: 113.0, speedMps: 1.1 }, // <3m drop ignored
      { altitudeMeters: 105.0, speedMps: 1.4 }, // -10m descent
    ];
    const summary = computeElevationSummary(pts);
    expect(summary.ascent).toBe(15);
    expect(summary.descent).toBe(10);
    expect(summary.maxAlt).toBe(115);
    expect(summary.minAlt).toBe(98.5);
  });

  test('GPX 1.1 export and import round-trips points, XML escaping, and elevation stats', () => {
    const xml = buildGpxXmlDocument({
      name: '香山 <西脊> & 日落',
      description: '实测轨迹',
      startedAt: 1700000000000,
      points: [
        { latitude: 39.9912, longitude: 116.1886, altitudeMeters: 128.0, timestamp: 1700000000000 },
        { latitude: 39.9935, longitude: 116.1832, altitudeMeters: 246.0, timestamp: 1700000300000 },
        { latitude: 39.9958, longitude: 116.1779, altitudeMeters: 392.0, timestamp: 1700000600000 },
      ],
      waypoints: [
        {
          name: '北门',
          description: '起点',
          type: 'trailhead',
          latitude: 39.9912,
          longitude: 116.1886,
          altitudeMeters: 128.0,
          timestamp: 1700000000000,
        },
      ],
    });

    expect(xml).toContain('&lt;西脊&gt; &amp; 日落');
    const parsed = parseGpxXml('xiangshan.gpx', xml);
    expect(parsed).not.toBeNull();
    expect(parsed!.points.length).toBe(3);
    expect(parsed!.ascentMeters).toBeCloseTo(264.0, 1);
    expect(parsed!.distanceMeters).toBeGreaterThan(1000);
  });

  test('EXIF timestamp, hemisphere normalization, and nearest TrackPoint match', () => {
    const ts = parseExifTimestamp({ DateTimeOriginal: '2026:11:15 17:32:10' });
    expect(ts).toBe(Date.parse('2026-11-15T17:32:10'));

    expect(normalizeExifCoordinate(33.8688, 'S')).toBe(-33.8688);
    expect(normalizeExifCoordinate(151.2093, 'E')).toBe(151.2093);
    expect(normalizeExifCoordinate(122.4194, 'W')).toBe(-122.4194);

    const nearest = findNearestTrackPointByTimestamp(
      [
        { id: 'p1', timestamp: 1000 },
        { id: 'p2', timestamp: 5000 },
        { id: 'p3', timestamp: 12000 },
      ],
      6200
    );
    expect(nearest?.id).toBe('p2');
  });
});

describe('Organic Maps outdoor vector style', () => {
  test('generates valid Style v8 with OpenFreeMap vector source, lighting, and Chinese-first typography', () => {
    const style = createOrganicOutdoorStyle({ darkMode: false, includeOsmFallbackSource: true }) as {
      version: number;
      sprite: string;
      glyphs: string;
      light: { intensity: number };
      sources: Record<string, { type: string }>;
      layers: Array<{
        id: string;
        type: string;
        minzoom?: number;
        layout?: Record<string, unknown>;
        paint?: Record<string, unknown>;
      }>;
    };

    expect(style.version).toBe(8);
    expect(style.sources.openmaptiles.type).toBe('vector');
    expect(style.sources.osmFallback.type).toBe('raster');
    expect(style.light.intensity).toBeGreaterThan(0);

    const byId = new Map(style.layers.map((l) => [l.id, l]));
    expect(byId.get('landcover_wood')?.paint?.['fill-color']).toBe('#B4C776');
    expect(byId.get('water')?.paint?.['fill-color']).toBe('#7ED0EC');
    expect(byId.get('building-outline')?.type).toBe('line');
    expect(byId.get('building-3d')?.type).toBe('fill-extrusion');
    expect(byId.get('building-housenumber')?.minzoom).toBe(16);
    expect(byId.get('road_one_way_arrow')?.layout?.['icon-image']).toBe('arrow');

    // Verify no italic fontstacks on symbol layers and single-line ZH name expression
    const symbolLayers = style.layers.filter((l) => l.type === 'symbol');
    for (const layer of symbolLayers) {
      const fonts = layer.layout?.['text-font'];
      if (Array.isArray(fonts)) {
        expect(fonts.join(',')).not.toContain('Italic');
      }
    }
  });
});
