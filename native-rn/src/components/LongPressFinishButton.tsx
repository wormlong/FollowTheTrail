import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface LongPressFinishButtonProps {
  onConfirmFinish: () => void;
  disabled?: boolean;
  accentColor?: string;
}

const HOLD_DURATION_MS = 1500;
const TICK_MS = 30;
const RING_SIZE = 34;
const STROKE_WIDTH = 2.5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const LongPressFinishButton: React.FC<LongPressFinishButtonProps> = ({
  onConfirmFinish,
  disabled = false,
  accentColor = '#B84F24',
}) => {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const triggeredRef = useRef<boolean>(false);

  const cancelHold = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
    setProgress(0);
    triggeredRef.current = false;
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        cancelHold();
      }
    });
    return () => {
      sub.remove();
      cancelHold();
    };
  }, []);

  const handlePressIn = () => {
    if (disabled || holding) return;
    cancelHold();
    setHolding(true);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const ratio = Math.min(1, elapsed / HOLD_DURATION_MS);
      setProgress(ratio);

      if (ratio >= 1 && !triggeredRef.current) {
        triggeredRef.current = true;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setHolding(false);
        setProgress(0);
        onConfirmFinish();
      }
    }, TICK_MS);
  };

  const handlePressOut = () => {
    if (!triggeredRef.current) {
      cancelHold();
    }
  };

  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const remainingSec = Math.max(0, (HOLD_DURATION_MS * (1 - progress)) / 1000).toFixed(1);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { borderColor: accentColor, opacity: disabled ? 0.5 : pressed ? 0.92 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="长按 1.5 秒结束记录"
    >
      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="rgba(184, 79, 36, 0.22)"
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={accentColor}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        <View style={[styles.stopSquare, { backgroundColor: accentColor }]} />
      </View>

      <Text style={[styles.label, { color: accentColor }]}>
        {holding ? `按住 ${remainingSec}s` : '长按结束'}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.25,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
