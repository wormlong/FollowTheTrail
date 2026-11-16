import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { OutdoorColors } from '../theme/tokens';

export interface SimpleTrailGuide {
  id: string;
  title: string;
  region: string;
  distanceKm: number;
  ascentMeters: number;
  /** [longitude, latitude] polyline for MapLibre reference overlay */
  coordinates: Array<[number, number]>;
}

const SAMPLE_GUIDES: SimpleTrailGuide[] = [
  {
    id: 'xs',
    title: '香山鬼见愁夕照环线',
    region: '北京 · 西山',
    distanceKm: 9.6,
    ascentMeters: 580,
    coordinates: [
      [116.1886, 39.9912],
      [116.1832, 39.9935],
      [116.1779, 39.9958],
      [116.1714, 39.9964],
      [116.1746, 39.9928],
      [116.1825, 39.9904],
      [116.1886, 39.9912],
    ],
  },
  {
    id: 'ls',
    title: '东灵山高山草甸垭口',
    region: '北京 · 门头沟',
    distanceKm: 14.8,
    ascentMeters: 920,
    coordinates: [
      [115.448, 40.0241],
      [115.4422, 40.0298],
      [115.4375, 40.0365],
      [115.432, 40.0432],
      [115.4256, 40.0384],
      [115.4388, 40.029],
    ],
  },
  {
    id: 'jk',
    title: '箭扣西段野脊穿行',
    region: '北京 · 怀柔',
    distanceKm: 11.2,
    ascentMeters: 740,
    coordinates: [
      [116.491, 40.4488],
      [116.486, 40.4535],
      [116.4804, 40.4572],
      [116.4752, 40.4601],
      [116.4701, 40.4562],
    ],
  },
  {
    id: 'bh',
    title: '白河峡谷轻装溯溪道',
    region: '北京 · 密云',
    distanceKm: 8.2,
    ascentMeters: 215,
    coordinates: [
      [116.652, 40.612],
      [116.6582, 40.6168],
      [116.6634, 40.6215],
      [116.669, 40.6272],
      [116.6645, 40.6224],
    ],
  },
];

interface DiscoverScreenProps {
  onOpenOnMap: (guide: SimpleTrailGuide) => void;
}

export const DiscoverScreen: React.FC<DiscoverScreenProps> = ({ onOpenOnMap }) => {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? OutdoorColors.dark : OutdoorColors.light;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.header, { color: theme.textPrimary }]}>发现路线</Text>
      <FlatList
        data={SAMPLE_GUIDES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpenOnMap(item)}
            style={[
              styles.row,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.rowBody}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {item.region} · {item.distanceKm.toFixed(1)} km · +{item.ascentMeters} m
              </Text>
            </View>
            <MapPin size={18} color={theme.primary} />
          </Pressable>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, paddingHorizontal: 16 },
  header: { fontSize: 20, fontWeight: '600', marginBottom: 14 },
  list: { paddingBottom: 24 },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowBody: { gap: 4 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
