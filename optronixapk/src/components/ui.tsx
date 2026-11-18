import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  COLORS,
  RADIUS,
  SPACING,
  resolveStatusTone,
  type BadgeTone,
} from '../theme/tokens';

export function CardSurface({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[styles.card, padded && styles.cardPadded, style]}>
      {children}
    </View>
  );
}

export function PageHeaderBar({
  title,
  subtitle,
  rightAction,
}: {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {rightAction ? <View>{rightAction}</View> : null}
    </View>
  );
}

export function KpiTile({
  label,
  value,
  badgeText,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  badgeText?: string;
  tone?: BadgeTone;
}) {
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.kpiBottom}>
        <Text style={styles.kpiValue}>{value}</Text>
        {badgeText ? (
          <StatusPill status={badgeText} toneOverride={tone} />
        ) : null}
      </View>
    </View>
  );
}

export function StatusPill({
  status,
  labelOverride,
  toneOverride,
}: {
  status: string;
  labelOverride?: string;
  toneOverride?: BadgeTone;
}) {
  const resolved = resolveStatusTone(status);
  const tone = toneOverride ?? resolved.tone;
  const label = labelOverride ?? resolved.label;

  const palette = {
    neutral: {
      bg: COLORS.surfaceMuted,
      text: COLORS.textMuted,
      border: COLORS.border,
    },
    blue: {
      bg: COLORS.accentSoft,
      text: COLORS.accent,
      border: COLORS.accentBorder,
    },
    success: {
      bg: COLORS.successSoft,
      text: COLORS.success,
      border: COLORS.successBorder,
    },
    warning: {
      bg: COLORS.warningSoft,
      text: COLORS.warning,
      border: COLORS.warningBorder,
    },
    danger: {
      bg: COLORS.dangerSoft,
      text: COLORS.danger,
      border: COLORS.dangerBorder,
    },
  }[tone];

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.pillText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;

  const bgMap = {
    primary: COLORS.primary,
    accent: COLORS.accent,
    outline: COLORS.surface,
    danger: COLORS.danger,
    ghost: 'transparent',
  };

  const textMap = {
    primary: COLORS.primaryText,
    accent: COLORS.primaryText,
    outline: COLORS.text,
    danger: COLORS.primaryText,
    ghost: COLORS.textMuted,
  };

  const heightMap = { sm: 34, md: 42, lg: 48 };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonBase,
        {
          backgroundColor: bgMap[variant],
          height: heightMap[size],
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: COLORS.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.86 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textMap[variant]} />
      ) : icon ? (
        <Feather name={icon} size={15} color={textMap[variant]} />
      ) : null}
      <Text
        style={[
          styles.buttonLabel,
          size === 'sm' && { fontSize: 12 },
          { color: textMap[variant] },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FormInput({
  label,
  required,
  hint,
  error,
  multiline,
  style,
  ...inputProps
}: TextInputProps & {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
}) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>
          {label}
          {required ? <Text style={{ color: COLORS.danger }}> *</Text> : null}
        </Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <TextInput
        placeholderTextColor={COLORS.textSubtle}
        multiline={multiline}
        style={[
          styles.input,
          multiline && { minHeight: 82, textAlignVertical: 'top', paddingTop: 10 },
          error ? { borderColor: COLORS.danger } : null,
          style,
        ]}
        {...inputProps}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ label: string; value: T }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value || '__all'}
            onPress={() => onChange(opt.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function BannerAlert({
  tone = 'info',
  message,
  onDismiss,
}: {
  tone?: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onDismiss?: () => void;
}) {
  const palette = {
    success: {
      bg: COLORS.successSoft,
      border: COLORS.successBorder,
      text: COLORS.success,
    },
    error: {
      bg: COLORS.dangerSoft,
      border: COLORS.dangerBorder,
      text: COLORS.danger,
    },
    warning: {
      bg: COLORS.warningSoft,
      border: COLORS.warningBorder,
      text: COLORS.warning,
    },
    info: {
      bg: COLORS.accentSoft,
      border: COLORS.accentBorder,
      text: COLORS.accent,
    },
  }[tone];

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.bannerText, { color: palette.text }]}>{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Feather name="x" size={16} color={palette.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyBlock({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Feather name={icon} size={20} color={COLORS.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function SheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{title}</Text>
              {subtitle ? (
                <Text style={styles.modalSubtitle}>{subtitle}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeIconBtn}>
              <Feather name="x" size={18} color={COLORS.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ gap: SPACING.md, paddingBottom: SPACING.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.modalFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardPadded: {
    padding: SPACING.lg,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  kpiTile: {
    flex: 1,
    minWidth: 145,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 8,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  kpiBottom: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  buttonBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  fieldWrap: {
    gap: 5,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  fieldHint: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  input: {
    minHeight: 40,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.text,
  },
  fieldError: {
    fontSize: 12,
    color: COLORS.danger,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  chipTextActive: {
    color: COLORS.primaryText,
    fontWeight: '600',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 6,
  },
  emptyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  closeIconBtn: {
    padding: 4,
    borderRadius: 6,
  },
  modalBody: {
    padding: SPACING.lg,
  },
  modalFooter: {
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
});
