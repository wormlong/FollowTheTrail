import MapLibreGL from '@maplibre/maplibre-react-native';

export interface OfflineTrailRegion {
  id: string;
  name: string;
  bounds: [[number, number], [number, number]]; // [[neLng, neLat], [swLng, swLat]]
  minZoom: number;
  maxZoom: number;
}

export const OFFLINE_TRAIL_REGIONS: OfflineTrailRegion[] = [
  {
    id: 'xiangshan-west-hills',
    name: '香山 · 西山徒步区',
    bounds: [
      [116.21, 40.02],
      [116.15, 39.97],
    ],
    minZoom: 11,
    maxZoom: 15,
  },
  {
    id: 'donglingshan-ridge',
    name: '东灵山高山草甸区',
    bounds: [
      [115.48, 40.06],
      [115.40, 40.00],
    ],
    minZoom: 11,
    maxZoom: 15,
  },
];

const OFFLINE_RASTER_STYLE_URL = JSON.stringify({
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
    },
  },
  layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }],
});

export async function listOfflinePacks(): Promise<Array<{ name: string; percentage?: number }>> {
  const packs = await MapLibreGL.offlineManager.getPacks();
  return packs
    .filter((p): p is typeof p & { name: string } => typeof p.name === 'string' && p.name.length > 0)
    .map((p) => ({ name: p.name }));
}

export async function downloadOfflineRegionPack(
  region: OfflineTrailRegion,
  onProgress: (percentage: number) => void
): Promise<void> {
  await MapLibreGL.offlineManager.createPack(
    {
      name: region.id,
      styleURL: OFFLINE_RASTER_STYLE_URL,
      minZoom: region.minZoom,
      maxZoom: region.maxZoom,
      bounds: region.bounds,
    },
    (_pack, status) => {
      onProgress(Math.round(status.percentage));
    },
    (_pack, err) => {
      throw new Error(err?.message || '离线区域下载失败');
    }
  );
}

export async function deleteOfflineRegionPack(packName: string): Promise<void> {
  await MapLibreGL.offlineManager.deletePack(packName);
}
