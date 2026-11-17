import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { Camera, Pause, Play, X } from 'lucide-react-native';
import { LongPressFinishButton } from '../components/LongPressFinishButton';
import { captureAndAssociatePhoto } from '../services/photoCaptureService';
import { RecorderTelemetry, trackRecorder } from '../services/trackRecorder';
import { OutdoorColors } from '../theme/tokens';
import { SimpleTrailGuide } from './DiscoverScreen';
import { MapScreen } from './MapScreen';

interface RecordScreenProps {
  onViewCompletedTrack?: (trackId: string) => void;
  referenceGuide?: SimpleTrailGuide | null;
  onClearReferenceGuide?: () => void;
}

function formatMovingTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export const RecordScreen: React.FC<RecordScreenProps> = ({
  referenceGuide = null,
  onClearReferenceGuide,
}) => {
  const scheme = useColorScheme();
  const darkMode = scheme === 'dark';
  const theme = darkMode ? OutdoorColors.dark : OutdoorColors.light;

  const [telemetry, setTelemetry] = useState<RecorderTelemetry>(() => trackRecorder.getSnapshot());
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsub = trackRecorder.subscribe(setTelemetry);
    trackRecorder.recoverInterruptedTrack();
    trackRecorder.refreshCurrentPosition().then(() => {
      trackRecorder.startHeadingWatch();
    });
    return () => {
      trackRecorder.stopHeadingWatch();
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 2800);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handlePressLocate = useCallback(async () => {
    const pos = await trackRecorder.refreshCurrentPosition();
    await trackRecorder.startHeadingWatch();
    return pos;
  }, []);

  const handleStart = async () => {
    setFeedback(null);
    await trackRecorder.startRecording();
  };

  const handlePause = async () => {
    await trackRecorder.pauseRecording();
  };

  const handleResume = async () => {
    await trackRecorder.resumeRecording();
  };

  const handleConfirmFinish = async () => {
    const savedId = await trackRecorder.stopAndSaveRecording();
    if (savedId) {
      setFeedback('轨迹已保存，可在「我的」中查看');
    } else {
      trackRecorder.resetForNextHike();
    }
  };

  const handleTakePhoto = async () => {
    const res = await captureAndAssociatePhoto(telemetry.trackId);
    if (res.status === 'saved') {
      setFeedback(
        res.photo?.trackPointId
          ? '照片已保存并关联至最近轨迹点'
          : '照片已保存本地（待关联轨迹点）'
      );
    } else if (res.status === 'permission_denied' || res.status === 'error') {
      setFeedback(res.message || '拍照失败');
    }
  };

  const distanceText = `${(telemetry.distanceMeters / 1000).toFixed(2)} km`;
  const durationText = formatMovingTime(telemetry.movingTimeMs);
  const avgSpeedText = `${telemetry.avgSpeedKmh.toFixed(1)} km/h`;
  const altitudeText =
    telemetry.currentAltitudeMeters !== null
      ? `${Math.round(telemetry.currentAltitudeMeters)} m`
      : '--';

  const bannerText =
    telemetry.errorMessage ||
    feedback ||
    (referenceGuide ? `参考路线：${referenceGuide.title}` : null);

  return (
    <View style={styles.root}>
      {/* Primary Visual Subject: Full-Screen MapLibre Native Map */}
      <MapScreen
        points={telemetry.points}
        currentLocation={telemetry.currentLocation}
        headingDegrees={telemetry.headingDegrees}
        referenceCoordinates={referenceGuide?.coordinates ?? null}
        darkMode={darkMode}
        onPressLocate={handlePressLocate}
      />

      {/* Minimal Status / Reference Route / Camera Feedback Notice */}
      {bannerText && (
        <View
          style={[
            styles.noticeBanner,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Text numberOfLines={2} style={[styles.noticeText, { color: theme.textPrimary }]}>
            {bannerText}
          </Text>
          {referenceGuide && !telemetry.errorMessage && !feedback && onClearReferenceGuide && (
            <Pressable onPress={onClearReferenceGuide} hitSlop={8}>
              <X size={15} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      )}

      {/* Bottom Floating 4-Metric Card + Action Row */}
      <View style={styles.bottomDock}>
        <View
          style={[
            styles.statsCard,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <StatItem label="里程" value={distanceText} theme={theme} />
          <StatItem label="用时" value={durationText} theme={theme} />
          <StatItem label="均速" value={avgSpeedText} theme={theme} />
          <StatItem label="海拔" value={altitudeText} theme={theme} />
        </View>

        {(telemetry.status === 'idle' || telemetry.status === 'completed') && (
          <View style={styles.controlsRow}>
            <Pressable
              onPress={handleStart}
              disabled={telemetry.starting}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: theme.primary,
                  opacity: telemetry.starting ? 0.72 : pressed ? 0.9 : 1,
                },
              ]}
            >
              <Play size={16} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>
                {telemetry.starting ? '启动中...' : '开始'}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleTakePhoto}
              style={[
                styles.cameraBtn,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Camera size={16} color={theme.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>拍照</Text>
            </Pressable>
          </View>
        )}

        {telemetry.status === 'recording' && (
          <View style={styles.controlsRow}>
            <Pressable
              onPress={handlePause}
              style={[
                styles.secondaryBtn,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Pause size={16} color={theme.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>暂停</Text>
            </Pressable>

            <LongPressFinishButton
              onConfirmFinish={handleConfirmFinish}
              accentColor={theme.accent}
            />

            <Pressable
              onPress={handleTakePhoto}
              style={[
                styles.cameraBtn,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Camera size={16} color={theme.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>拍照</Text>
            </Pressable>
          </View>
        )}

        {telemetry.status === 'paused' && (
          <View style={styles.controlsRow}>
            <Pressable
              onPress={handleResume}
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            >
              <Play size={16} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>继续</Text>
            </Pressable>

            <LongPressFinishButton
              onConfirmFinish={handleConfirmFinish}
              accentColor={theme.accent}
            />

            <Pressable
              onPress={handleTakePhoto}
              style={[
                styles.cameraBtn,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Camera size={16} color={theme.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>拍照</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
};

const StatItem: React.FC<{
  label: string;
  value: string;
  theme: typeof OutdoorColors.light | typeof OutdoorColors.dark;
}> = ({ label, value, theme }) => (
  <View style={styles.statCell}>
    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    <Text numberOfLines={1} style={[styles.statValue, { color: theme.textPrimary }]}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  noticeBanner: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  bottomDock: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    gap: 8,
  },
  statsCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statLabel: {
    fontSize: 11,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtn: {
    flex: 1.3,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cameraBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
