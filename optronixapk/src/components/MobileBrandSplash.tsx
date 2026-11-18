import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from 'react-native';
import { COLORS } from '../theme/tokens';
import optronixLogo from '../../assets/optronix-logo.png';

const BAR_WIDTH = 128;

interface MobileBrandSplashProps {
  isBootstrapping: boolean;
  onTransitionStart?: () => void;
}

export function MobileBrandSplash({
  isBootstrapping,
  onTransitionStart,
}: MobileBrandSplashProps) {
  const [minDelayDone, setMinDelayDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const exitingRef = useRef(false);
  const notifiedRef = useRef(false);

  const logoProgress = useRef(new Animated.Value(0)).current;
  const barProgress = useRef(new Animated.Value(0)).current;
  const captionProgress = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoProgress, {
        toValue: 1,
        duration: 640,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(barProgress, {
        toValue: 1,
        duration: 1020,
        delay: 100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(captionProgress, {
        toValue: 1,
        duration: 480,
        delay: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      setMinDelayDone(true);
    }, 1150);

    return () => clearTimeout(timer);
  }, [barProgress, captionProgress, logoProgress]);

  const triggerExit = () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      onTransitionStart?.();
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayScale, {
        toValue: 1.03,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setHidden(true);
    });
  };

  useEffect(() => {
    if (minDelayDone && !isBootstrapping) {
      triggerExit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDelayDone, isBootstrapping]);

  if (hidden) {
    return null;
  }

  const logoScale = logoProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.93, 1],
  });
  const logoTranslateY = logoProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const barTranslateX = barProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-BAR_WIDTH / 2, 0],
  });
  const captionTranslateY = captionProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });

  return (
    <Animated.View
      pointerEvents={exitingRef.current ? 'none' : 'auto'}
      style={[
        styles.overlay,
        {
          opacity: overlayOpacity,
          transform: [{ scale: overlayScale }],
        },
      ]}
    >
      <Pressable
        style={styles.pressLayer}
        onPress={() => {
          if (!isBootstrapping) {
            triggerExit();
          }
        }}
      >
        <View style={styles.centerStack}>
          <Animated.View
            style={{
              opacity: logoProgress,
              transform: [{ translateY: logoTranslateY }, { scale: logoScale }],
            }}
          >
            <Image
              source={optronixLogo}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <View style={styles.barTrack}>
            <Animated.View
              style={[
                styles.barFill,
                {
                  transform: [
                    { translateX: barTranslateX },
                    { scaleX: barProgress },
                  ],
                },
              ]}
            />
          </View>

          <Animated.Text
            style={[
              styles.caption,
              {
                opacity: captionProgress,
                transform: [{ translateY: captionTranslateY }],
              },
            ]}
          >
            SALES &amp; FIELD VISIT OPERATIONS
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface MobileTypewriterTextProps {
  text: string;
  active?: boolean;
  startDelayMs?: number;
  speedMs?: number;
  style?: TextStyle;
}

export function MobileTypewriterText({
  text,
  active = true,
  startDelayMs = 0,
  speedMs = 22,
  style,
}: MobileTypewriterTextProps) {
  const [count, setCount] = useState(0);
  const [caretVisible, setCaretVisible] = useState(false);
  const [caretOn, setCaretOn] = useState(true);

  useEffect(() => {
    if (!active) {
      setCount(0);
      setCaretVisible(false);
      return;
    }

    setCount(0);
    setCaretVisible(true);

    let typeTimer: ReturnType<typeof setInterval> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const delayTimer = setTimeout(() => {
      let idx = 0;
      typeTimer = setInterval(() => {
        idx += 1;
        setCount(idx);
        if (idx >= text.length) {
          if (typeTimer) clearInterval(typeTimer);
          settleTimer = setTimeout(() => {
            setCaretVisible(false);
          }, 1100);
        }
      }, speedMs);
    }, startDelayMs);

    return () => {
      clearTimeout(delayTimer);
      if (typeTimer) clearInterval(typeTimer);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [text, active, startDelayMs, speedMs]);

  useEffect(() => {
    if (!caretVisible) return;
    const blink = setInterval(() => {
      setCaretOn((v) => !v);
    }, 420);
    return () => clearInterval(blink);
  }, [caretVisible]);

  return (
    <Text style={style} accessibilityLabel={text}>
      {text.slice(0, count)}
      {caretVisible ? (
        <Text style={{ color: caretOn ? COLORS.accent : 'transparent' }}>|</Text>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: COLORS.surface,
  },
  pressLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centerStack: {
    alignItems: 'center',
    gap: 18,
  },
  logo: {
    width: 214,
    height: 40,
  },
  barTrack: {
    width: BAR_WIDTH,
    height: 2,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: {
    width: BAR_WIDTH,
    height: 2,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  caption: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.2,
    color: COLORS.textMuted,
  },
});
