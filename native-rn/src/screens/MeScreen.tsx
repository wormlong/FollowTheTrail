import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { ChevronRight, Download, Share2, Trash2, X } from 'lucide-react-native';
import { openTrailDatabase } from '../db/schema';
import { exportAndShareTrackGpx } from '../services/gpxService';
import {
  deleteOfflineRegionPack,
  downloadOfflineRegionPack,
  listOfflinePacks,
  OFFLINE_TRAIL_REGIONS,
} from '../services/offlineMapService';
import { OutdoorColors } from '../theme/tokens';

interface TrackRow {
  id: string;
  name: string;
  started_at: number;
  distance_meters: number;
  moving_time_ms: number;
  avg_speed_mps: number;
  ascent_meters: number;
}

interface TrackPhotoRow {
  id: string;
  thumbnail_uri: string | null;
  original_uri: string;
  captured_at: number | null;
  track_point_id: string | null;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export const MeScreen: React.FC<{ highlightedTrackId?: string | null }> = ({
  highlightedTrackId,
}) => {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? OutdoorColors.dark : OutdoorColors.light;
  const isFocused = useIsFocused();
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackRow | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<TrackPhotoRow[]>([]);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [downloadedPackNames, setDownloadedPackNames] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const reloadTracks = useCallback(async (focusId?: string | null) => {
    const db = await openTrailDatabase();
    const rows = await db.getAllAsync<TrackRow>(
      `SELECT id, name, started_at, distance_meters, moving_time_ms, avg_speed_mps, ascent_meters
       FROM tracks
       WHERE (source IS NULL OR source = 'recorded') AND id NOT LIKE 'imp-%'
       ORDER BY started_at DESC`
    );
    setTracks(rows);
    if (focusId) {
      const match = rows.find((r) => r.id === focusId);
      if (match) setSelectedTrack(match);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      reloadTracks(highlightedTrackId);
    }
  }, [isFocused, highlightedTrackId, reloadTracks]);

  useEffect(() => {
    if (!selectedTrack) {
      setSelectedPhotos([]);
      return;
    }
    openTrailDatabase().then((db) =>
      db
        .getAllAsync<TrackPhotoRow>(
          `SELECT id, thumbnail_uri, original_uri, captured_at, track_point_id
           FROM photos WHERE track_id = ? ORDER BY captured_at ASC`,
          [selectedTrack.id]
        )
        .then(setSelectedPhotos)
    );
  }, [selectedTrack]);

  const refreshOfflinePacks = async () => {
    try {
      const packs = await listOfflinePacks();
      setDownloadedPackNames(new Set(packs.map((p) => p.name)));
    } catch {
      setDownloadedPackNames(new Set());
    }
  };

  const handleExportGpx = async (trackId: string) => {
    const res = await exportAndShareTrackGpx(trackId);
    setStatusNotice(res.ok ? 'GPX 文件已写入本地并调起分享' : (res.error || 'GPX 导出失败'));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.header, { color: theme.textPrimary }]}>我的</Text>

      <View style={[styles.menuGroup, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.menuRow}>
          <Text style={[styles.menuText, { color: theme.textPrimary }]}>个人资料与户外档案</Text>
          <ChevronRight size={16} color={theme.textSecondary} />
        </View>
        <Pressable
          onPress={() => {
            refreshOfflinePacks();
            setOfflineModalOpen(true);
          }}
          style={[styles.menuRow, { borderTopWidth: 1, borderTopColor: theme.border }]}
        >
          <Text style={[styles.menuText, { color: theme.textPrimary }]}>离线地图数据包（MapLibre）</Text>
          <ChevronRight size={16} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          我的历史轨迹（{tracks.length}）
        </Text>
      </View>

      {statusNotice && (
        <Text style={[styles.noticeText, { color: theme.primary }]}>{statusNotice}</Text>
      )}

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedTrack(item)}
            style={[
              styles.trackCard,
              {
                backgroundColor: theme.surface,
                borderColor: item.id === highlightedTrackId ? theme.accent : theme.border,
              },
            ]}
          >
            <Text style={[styles.trackTitle, { color: theme.textPrimary }]}>{item.name}</Text>
            <Text style={[styles.trackMeta, { color: theme.textSecondary }]}>
              {(item.distance_meters / 1000).toFixed(2)} km · {formatDuration(item.moving_time_ms)} ·{' '}
              {new Date(item.started_at).toLocaleDateString('zh-CN')}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            暂无保存的徒步轨迹
          </Text>
        }
      />

      {/* Track Detail + GPX Export Sheet */}
      <Modal
        visible={Boolean(selectedTrack)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedTrack(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                {selectedTrack?.name}
              </Text>
              <Pressable onPress={() => setSelectedTrack(null)} hitSlop={8}>
                <X size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {selectedTrack && (
              <>
                <View style={[styles.metricsRow, { borderColor: theme.border }]}>
                  <View style={styles.metricCell}>
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>里程</Text>
                    <Text style={[styles.metricVal, { color: theme.textPrimary }]}>
                      {(selectedTrack.distance_meters / 1000).toFixed(2)} km
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>用时</Text>
                    <Text style={[styles.metricVal, { color: theme.textPrimary }]}>
                      {formatDuration(selectedTrack.moving_time_ms)}
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>均速</Text>
                    <Text style={[styles.metricVal, { color: theme.textPrimary }]}>
                      {(selectedTrack.avg_speed_mps * 3.6).toFixed(1)} km/h
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>爬升</Text>
                    <Text style={[styles.metricVal, { color: theme.textPrimary }]}>
                      +{Math.round(selectedTrack.ascent_meters)} m
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => handleExportGpx(selectedTrack.id)}
                  style={[styles.exportBtn, { backgroundColor: theme.primary }]}
                >
                  <Share2 size={16} color="#FFFFFF" />
                  <Text style={styles.exportBtnText}>导出并分享 GPX 文件</Text>
                </Pressable>
              </>
            )}

            <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 14 }]}>
              沿途照片（{selectedPhotos.length}）
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {selectedPhotos.map((p) => (
                <View key={p.id} style={styles.photoWrap}>
                  <Image
                    source={{ uri: p.thumbnail_uri || p.original_uri }}
                    style={styles.photoThumb}
                  />
                  <Text style={[styles.photoMeta, { color: theme.textSecondary }]}>
                    {p.track_point_id ? '已关联轨迹点' : '待关联'}
                  </Text>
                </View>
              ))}
              {selectedPhotos.length === 0 && (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  本次记录暂无拍摄照片
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MapLibre Offline Region Manager Modal */}
      <Modal
        visible={offlineModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setOfflineModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                离线地图缓存（MapLibre）
              </Text>
              <Pressable onPress={() => setOfflineModalOpen(false)} hitSlop={8}>
                <X size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.trackMeta, { color: theme.textSecondary, marginBottom: 12 }]}>
              数据源：OpenStreetMap (ODbL) · 渲染引擎：MapLibre Native
            </Text>

            {OFFLINE_TRAIL_REGIONS.map((region) => {
              const cached = downloadedPackNames.has(region.id);
              const isBusy = downloadingId === region.id;
              return (
                <View
                  key={region.id}
                  style={[styles.offlineRow, { borderColor: theme.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.trackTitle, { color: theme.textPrimary }]}>{region.name}</Text>
                    <Text style={[styles.trackMeta, { color: theme.textSecondary }]}>
                      Zoom {region.minZoom}–{region.maxZoom} ·{' '}
                      {isBusy ? `下载中 ${downloadProgress}%` : cached ? '已缓存离线包' : '未缓存'}
                    </Text>
                  </View>
                  {cached ? (
                    <Pressable
                      onPress={async () => {
                        await deleteOfflineRegionPack(region.id);
                        await refreshOfflinePacks();
                      }}
                      hitSlop={8}
                    >
                      <Trash2 size={18} color={theme.accent} />
                    </Pressable>
                  ) : (
                    <Pressable
                      disabled={isBusy}
                      onPress={async () => {
                        setDownloadingId(region.id);
                        setDownloadProgress(0);
                        try {
                          await downloadOfflineRegionPack(region, setDownloadProgress);
                          await refreshOfflinePacks();
                        } finally {
                          setDownloadingId(null);
                        }
                      }}
                      hitSlop={8}
                    >
                      <Download size={18} color={theme.primary} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, paddingHorizontal: 16 },
  header: { fontSize: 20, fontWeight: '600', marginBottom: 14 },
  menuGroup: { borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  menuRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuText: { fontSize: 15, fontWeight: '500' },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: '500' },
  importBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  importBtnText: { fontSize: 12, fontWeight: '600' },
  noticeText: { fontSize: 12, marginBottom: 8 },
  trackCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 4 },
  trackTitle: { fontSize: 14, fontWeight: '600' },
  trackMeta: { fontSize: 12, fontVariant: ['tabular-nums'] },
  emptyText: { fontSize: 13, paddingVertical: 20, textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 22, 18, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  metricsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  metricCell: { flex: 1, alignItems: 'center', gap: 4 },
  metricLabel: { fontSize: 11 },
  metricVal: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  exportBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exportBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  photoWrap: { width: 92, gap: 4 },
  photoThumb: { width: 92, height: 92, borderRadius: 8 },
  photoMeta: { fontSize: 10 },
  offlineRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
