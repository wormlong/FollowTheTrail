import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { ChevronRight, Download, Share2, ShieldAlert, Trash2, UserCheck, X } from 'lucide-react-native';
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
  max_altitude_meters: number;
}

interface UserProfileRow {
  id: string;
  nickname: string;
  home_region: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  sos_note: string;
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
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfileRow>({
    id: 'default',
    nickname: '山野行者',
    home_region: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    sos_note: '',
  });
  const [totalPhotosCount, setTotalPhotosCount] = useState<number>(0);
  const [profileSavedHint, setProfileSavedHint] = useState<string | null>(null);
  const [downloadedPackNames, setDownloadedPackNames] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const reloadTracks = useCallback(async (focusId?: string | null) => {
    try {
      const db = await openTrailDatabase();
      const rows = await db.getAllAsync<TrackRow>(
        `SELECT id, name, started_at, distance_meters, moving_time_ms, avg_speed_mps, ascent_meters, max_altitude_meters
         FROM tracks
         WHERE (source IS NULL OR source = 'recorded') AND id NOT LIKE 'imp-%'
         ORDER BY started_at DESC`
      );
      setTracks(rows);
      if (focusId) {
        const match = rows.find((r) => r.id === focusId);
        if (match) setSelectedTrack(match);
      }
    } catch {
      setStatusNotice('读取历史轨迹失败，请稍后重试');
    }
  }, []);

  const loadProfileAndArchive = useCallback(async () => {
    try {
      const db = await openTrailDatabase();
      const row = await db.getFirstAsync<UserProfileRow>(
        `SELECT id, nickname, home_region, emergency_contact_name, emergency_contact_phone, sos_note
         FROM user_profile WHERE id = 'default'`
      );
      if (row) {
        setProfile(row);
      }
      const photoAgg = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM photos`
      );
      setTotalPhotosCount(photoAgg?.cnt ?? 0);
    } catch {
      // Keep defaults if DB busy
    }
  }, []);

  const saveProfile = async () => {
    try {
      const db = await openTrailDatabase();
      await db.runAsync(
        `INSERT INTO user_profile (
           id, nickname, home_region, emergency_contact_name, emergency_contact_phone, sos_note, updated_at
         ) VALUES ('default', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           nickname = excluded.nickname,
           home_region = excluded.home_region,
           emergency_contact_name = excluded.emergency_contact_name,
           emergency_contact_phone = excluded.emergency_contact_phone,
           sos_note = excluded.sos_note,
           updated_at = excluded.updated_at`,
        [
          profile.nickname.trim() || '山野行者',
          profile.home_region.trim(),
          profile.emergency_contact_name.trim(),
          profile.emergency_contact_phone.trim(),
          profile.sos_note.trim(),
          Date.now(),
        ]
      );
      setProfileSavedHint('已保存至本地户外档案');
      setTimeout(() => setProfileSavedHint(null), 2200);
    } catch {
      setProfileSavedHint('保存失败，请重试');
    }
  };

  const archiveSummary = useMemo(() => {
    const totalDistanceKm = tracks.reduce((s, t) => s + (t.distance_meters || 0) / 1000, 0);
    const totalMovingMs = tracks.reduce((s, t) => s + (t.moving_time_ms || 0), 0);
    const totalAscentM = tracks.reduce((s, t) => s + (t.ascent_meters || 0), 0);
    const maxAltitudeM = tracks.reduce(
      (max, t) => (t.max_altitude_meters > max ? t.max_altitude_meters : max),
      0
    );
    return {
      count: tracks.length,
      totalDistanceKm,
      totalMovingMs,
      totalAscentM,
      maxAltitudeM,
    };
  }, [tracks]);

  useEffect(() => {
    if (isFocused) {
      reloadTracks(highlightedTrackId);
      loadProfileAndArchive();
    }
  }, [isFocused, highlightedTrackId, reloadTracks, loadProfileAndArchive]);

  useEffect(() => {
    if (!selectedTrack) {
      setSelectedPhotos([]);
      return;
    }
    openTrailDatabase()
      .then((db) =>
        db.getAllAsync<TrackPhotoRow>(
          `SELECT id, thumbnail_uri, original_uri, captured_at, track_point_id
           FROM photos WHERE track_id = ? ORDER BY captured_at ASC`,
          [selectedTrack.id]
        )
      )
      .then(setSelectedPhotos)
      .catch(() => setSelectedPhotos([]));
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
        <Pressable
          onPress={() => {
            setProfileSavedHint(null);
            loadProfileAndArchive();
            setProfileModalOpen(true);
          }}
          style={styles.menuRow}
        >
          <View>
            <Text style={[styles.menuText, { color: theme.textPrimary }]}>个人资料与户外档案</Text>
            <Text style={[styles.menuSubText, { color: theme.textSecondary }]}>
              {profile.nickname} · {archiveSummary.count} 条记录 · {archiveSummary.totalDistanceKm.toFixed(1)} km
            </Text>
          </View>
          <ChevronRight size={16} color={theme.textSecondary} />
        </Pressable>
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
      {/* Personal Profile & Outdoor Archive Modal */}
      <Modal
        visible={profileModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setProfileModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalSheet, { backgroundColor: theme.surface, maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <UserCheck size={18} color={theme.primary} />
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  个人资料与户外档案
                </Text>
              </View>
              <Pressable onPress={() => setProfileModalOpen(false)} hitSlop={8}>
                <X size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              <View style={[styles.metricsRow, { borderColor: theme.border }]}>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>轨迹</Text>
                  <Text style={[styles.metricVal, { color: theme.textPrimary }]}>
                    {archiveSummary.count} 条
                  </Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>总里程</Text>
                  <Text style={[styles.metricVal, { color: theme.textPrimary }]}>
                    {archiveSummary.totalDistanceKm.toFixed(1)} km
                  </Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>总爬升</Text>
                  <Text style={[styles.metricVal, { color: theme.textPrimary }]}>
                    +{Math.round(archiveSummary.totalAscentM)} m
                  </Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>照片</Text>
                  <Text style={[styles.metricVal, { color: theme.textPrimary }]}>
                    {totalPhotosCount} 张
                  </Text>
                </View>
              </View>

              <View style={[styles.archiveMetaRow, { borderColor: theme.border }]}>
                <Text style={[styles.trackMeta, { color: theme.textSecondary }]}>
                  累计用时 {formatDuration(archiveSummary.totalMovingMs)} · 最高海拔{' '}
                  {archiveSummary.maxAltitudeM > 0
                    ? `${Math.round(archiveSummary.maxAltitudeM)} m`
                    : '--'}
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>户外昵称</Text>
                <TextInput
                  value={profile.nickname}
                  onChangeText={(v) => setProfile((p) => ({ ...p, nickname: v }))}
                  placeholder="输入你的户外昵称"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>常去徒步区域</Text>
                <TextInput
                  value={profile.home_region}
                  onChangeText={(v) => setProfile((p) => ({ ...p, home_region: v }))}
                  placeholder="例如：长沙岳麓山 / 武功山"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                />
              </View>

              <View style={styles.safetyHeaderRow}>
                <ShieldAlert size={15} color={theme.accent} />
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                  应急安全档案（本地离线保存）
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>紧急联系人</Text>
                <TextInput
                  value={profile.emergency_contact_name}
                  onChangeText={(v) => setProfile((p) => ({ ...p, emergency_contact_name: v }))}
                  placeholder="姓名"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>紧急联系电话</Text>
                <TextInput
                  value={profile.emergency_contact_phone}
                  onChangeText={(v) => setProfile((p) => ({ ...p, emergency_contact_phone: v }))}
                  placeholder="手机号"
                  keyboardType="phone-pad"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>健康与安全备注</Text>
                <TextInput
                  value={profile.sos_note}
                  onChangeText={(v) => setProfile((p) => ({ ...p, sos_note: v }))}
                  placeholder="血型、过敏史或装备说明（选填）"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={[
                    styles.input,
                    styles.inputMultiline,
                    { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                />
              </View>

              {profileSavedHint && (
                <Text style={[styles.noticeText, { color: theme.primary, marginBottom: 0 }]}>
                  {profileSavedHint}
                </Text>
              )}

              <Pressable
                onPress={saveProfile}
                style={[styles.exportBtn, { backgroundColor: theme.primary, marginTop: 2 }]}
              >
                <Text style={styles.exportBtnText}>保存个人资料</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  menuSubText: { fontSize: 12, marginTop: 2 },
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
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  archiveMetaRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  safetyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 68,
    textAlignVertical: 'top',
  },
});
