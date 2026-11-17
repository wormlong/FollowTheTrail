import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { MapPin, Trash2, Upload } from 'lucide-react-native';
import {
  deleteImportedTrack,
  ImportedTrackGuide,
  listImportedTracks,
  pickAndImportGpxFile,
} from '../services/gpxService';
import { OutdoorColors } from '../theme/tokens';

export type SimpleTrailGuide = ImportedTrackGuide;

interface DiscoverScreenProps {
  onOpenOnMap: (guide: ImportedTrackGuide) => void;
}

export const DiscoverScreen: React.FC<DiscoverScreenProps> = ({ onOpenOnMap }) => {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? OutdoorColors.dark : OutdoorColors.light;
  const isFocused = useIsFocused();

  const [importedTracks, setImportedTracks] = useState<ImportedTrackGuide[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const reloadImported = useCallback(async () => {
    try {
      const list = await listImportedTracks();
      setImportedTracks(list);
    } catch {
      setNotice('读取导入轨迹失败');
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      reloadImported();
    }
  }, [isFocused, reloadImported]);

  const handleImportGpx = async () => {
    const res = await pickAndImportGpxFile();
    if (res.status === 'imported') {
      await reloadImported();
      setNotice(`已导入轨迹（${res.pointCount ?? 0} 个轨迹点），点击可在地图查看`);
    } else if (res.status === 'error') {
      setNotice(res.message || 'GPX 导入失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteImportedTrack(id);
      await reloadImported();
    } catch {
      setNotice('删除轨迹失败');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.header, { color: theme.textPrimary }]}>我导入的轨迹</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            导入 GPX 参考轨迹，点击在地图叠加查看
          </Text>
        </View>

        <Pressable
          onPress={handleImportGpx}
          style={[
            styles.importBtn,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          accessibilityLabel="导入 GPX 轨迹"
        >
          <Upload size={15} color={theme.primary} />
          <Text style={[styles.importBtnText, { color: theme.primary }]}>导入 GPX</Text>
        </Pressable>
      </View>

      {notice && (
        <Text style={[styles.noticeText, { color: theme.primary }]}>{notice}</Text>
      )}

      <FlatList
        data={importedTracks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Pressable
              onPress={() => onOpenOnMap(item)}
              style={styles.rowMain}
            >
              <View style={styles.rowBody}>
                <Text numberOfLines={1} style={[styles.title, { color: theme.textPrimary }]}>
                  {item.title}
                </Text>
                <Text style={[styles.meta, { color: theme.textSecondary }]}>
                  {item.distanceKm.toFixed(2)} km · +{item.ascentMeters} m · {item.pointCount} 点 ·{' '}
                  {new Date(item.startedAt).toLocaleDateString('zh-CN')}
                </Text>
              </View>
              <MapPin size={18} color={theme.primary} />
            </Pressable>

            <Pressable
              onPress={() => handleDelete(item.id)}
              hitSlop={10}
              style={[styles.deleteBtn, { borderLeftColor: theme.border }]}
              accessibilityLabel={`删除 ${item.title}`}
            >
              <Trash2 size={16} color={theme.textSecondary} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
              暂无导入的轨迹
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
              点击右上角「导入 GPX」导入外部路线，即可在记录地图中作为参考路线显示。
            </Text>
            <Pressable
              onPress={handleImportGpx}
              style={[styles.emptyAction, { backgroundColor: theme.primary }]}
            >
              <Upload size={15} color="#FFFFFF" />
              <Text style={styles.emptyActionText}>选择 GPX 文件导入</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, paddingHorizontal: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  headerTextWrap: { flex: 1, gap: 2 },
  header: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 12 },
  importBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  importBtnText: { fontSize: 12, fontWeight: '600' },
  noticeText: { fontSize: 12, marginBottom: 10 },
  list: { paddingBottom: 24 },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  rowMain: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowBody: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, fontVariant: ['tabular-nums'] },
  deleteBtn: {
    width: 44,
    alignSelf: 'stretch',
    borderLeftWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptyDesc: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  emptyAction: {
    marginTop: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
