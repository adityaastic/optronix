import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AuthProvider, useMobileAuth } from './src/context/AuthContext';
import { MobileBrandSplash } from './src/components/MobileBrandSplash';
import { PERMISSIONS } from './src/lib/domain';
import { AuthScreens } from './src/screens/AuthScreens';
import { DashboardScreen } from './src/screens/DashboardScreen';
import {
  MeetingDetailsScreen,
  MeetingsDirectoryScreen,
  ScheduleMeetingScreen,
} from './src/screens/MeetingsScreens';
import { VisitScreen } from './src/screens/VisitScreen';
import { OutcomeScreen } from './src/screens/OutcomeScreen';
import { FollowUpsScreen } from './src/screens/FollowUpsScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import {
  AdminSettingsScreen,
  ProfileAndAlertsScreen,
  ReportsScreen,
  TeamActivityScreen,
} from './src/screens/ManagementScreens';
import { COLORS, RADIUS, SPACING } from './src/theme/tokens';
import optronixLogo from './assets/optronix-logo.png';

type MainTab =
  | 'dashboard'
  | 'meetings'
  | 'followups'
  | 'customers'
  | 'team'
  | 'reports'
  | 'admin'
  | 'account';

type SubRoute =
  | { type: 'none' }
  | { type: 'schedule'; customerId?: string | null }
  | { type: 'meetingDetails'; meetingId: string }
  | { type: 'visit'; meetingId: string }
  | { type: 'outcome'; meetingId: string };

interface NavItem {
  id: MainTab;
  label: string;
  shortLabel: string;
  icon: keyof typeof Feather.glyphMap;
  badge?: number;
}

function WorkspaceApp({ introReady }: { introReady: boolean }) {
  const { user, isBootstrapping, hasPermission } = useMobileAuth();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 900;

  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const [subRoute, setSubRoute] = useState<SubRoute>({ type: 'none' });
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const navItems = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: 'home' },
      {
        id: 'meetings',
        label: 'Meetings',
        shortLabel: 'Meetings',
        icon: 'calendar',
        badge: user?.sidebarCounts?.meetings,
      },
      {
        id: 'followups',
        label: 'Follow-ups',
        shortLabel: 'Tasks',
        icon: 'check-square',
        badge: user?.sidebarCounts?.followUps,
      },
      {
        id: 'customers',
        label: 'Customers',
        shortLabel: 'Customers',
        icon: 'briefcase',
      },
    ];

    if (hasPermission(PERMISSIONS.TEAM_READ)) {
      base.push({
        id: 'team',
        label: 'Team activity',
        shortLabel: 'Team',
        icon: 'users',
      });
    }

    base.push({
      id: 'reports',
      label: 'Reports',
      shortLabel: 'Reports',
      icon: 'bar-chart-2',
    });

    if (hasPermission(PERMISSIONS.USERS_MANAGE)) {
      base.push({
        id: 'admin',
        label: 'Admin settings',
        shortLabel: 'Admin',
        icon: 'sliders',
      });
    }

    base.push({
      id: 'account',
      label: 'Profile & alerts',
      shortLabel: 'Account',
      icon: 'user',
      badge: user?.unreadNotificationsCount,
    });

    return base;
  }, [user, hasPermission]);

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        {!isBootstrapping ? (
          <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <AuthScreens introReady={introReady} />
          </SafeAreaView>
        ) : null}
      </View>
    );
  }

  const switchTab = (tab: MainTab) => {
    setActiveTab(tab);
    setSubRoute({ type: 'none' });
    setMoreMenuOpen(false);
  };

  const renderMainContent = () => {
    if (subRoute.type === 'schedule') {
      return (
        <ScheduleMeetingScreen
          initialCustomerId={subRoute.customerId}
          onCancel={() => setSubRoute({ type: 'none' })}
          onCreated={(meetingId) =>
            setSubRoute({ type: 'meetingDetails', meetingId })
          }
        />
      );
    }

    if (subRoute.type === 'meetingDetails') {
      return (
        <MeetingDetailsScreen
          meetingId={subRoute.meetingId}
          onBack={() => setSubRoute({ type: 'none' })}
          onOpenVisit={(id) => setSubRoute({ type: 'visit', meetingId: id })}
          onOpenOutcome={(id) =>
            setSubRoute({ type: 'outcome', meetingId: id })
          }
        />
      );
    }

    if (subRoute.type === 'visit') {
      return (
        <VisitScreen
          meetingId={subRoute.meetingId}
          onBack={() =>
            setSubRoute({
              type: 'meetingDetails',
              meetingId: subRoute.meetingId,
            })
          }
          onProceedToOutcome={(id) =>
            setSubRoute({ type: 'outcome', meetingId: id })
          }
        />
      );
    }

    if (subRoute.type === 'outcome') {
      return (
        <OutcomeScreen
          meetingId={subRoute.meetingId}
          onBack={() =>
            setSubRoute({
              type: 'meetingDetails',
              meetingId: subRoute.meetingId,
            })
          }
          onSaved={(id) =>
            setSubRoute({ type: 'meetingDetails', meetingId: id })
          }
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardScreen
            onOpenSchedule={() => setSubRoute({ type: 'schedule' })}
            onOpenMeeting={(id) =>
              setSubRoute({ type: 'meetingDetails', meetingId: id })
            }
            onOpenVisit={(id) => setSubRoute({ type: 'visit', meetingId: id })}
            onNavigateTab={(t) => switchTab(t)}
          />
        );
      case 'meetings':
        return (
          <MeetingsDirectoryScreen
            onOpenSchedule={() => setSubRoute({ type: 'schedule' })}
            onOpenMeeting={(id) =>
              setSubRoute({ type: 'meetingDetails', meetingId: id })
            }
            onOpenVisit={(id) => setSubRoute({ type: 'visit', meetingId: id })}
          />
        );
      case 'followups':
        return <FollowUpsScreen />;
      case 'customers':
        return (
          <CustomersScreen
            onScheduleForCustomer={(customerId) =>
              setSubRoute({ type: 'schedule', customerId })
            }
            onOpenMeeting={(meetingId) =>
              setSubRoute({ type: 'meetingDetails', meetingId })
            }
          />
        );
      case 'team':
        return (
          <TeamActivityScreen
            onOpenMeeting={(meetingId) =>
              setSubRoute({ type: 'meetingDetails', meetingId })
            }
          />
        );
      case 'reports':
        return <ReportsScreen />;
      case 'admin':
        return <AdminSettingsScreen />;
      case 'account':
        return <ProfileAndAlertsScreen />;
    }
  };

  // Primary 4 mobile bottom tabs + "More" sheet for secondary/role screens
  const primaryBottomTabs = navItems.slice(0, 4);
  const overflowTabs = navItems.slice(4);
  const isOverflowActive = overflowTabs.some((t) => t.id === activeTab);

  return (
    <SafeAreaView style={styles.appRoot}>
      <View style={styles.bodyRow}>
        {/* Desktop / Tablet / Expo Web Sidebar Rail */}
        {isWideLayout ? (
          <View style={styles.sidebar}>
            <View style={styles.sidebarBrand}>
              <Image
                source={optronixLogo}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4 }}>
              {navItems.map((item) => {
                const active =
                  activeTab === item.id && subRoute.type === 'none';
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => switchTab(item.id)}
                    style={[
                      styles.sidebarItem,
                      active && styles.sidebarItemActive,
                    ]}
                  >
                    <View style={styles.sidebarItemLeft}>
                      <Feather
                        name={item.icon}
                        size={16}
                        color={active ? COLORS.accent : COLORS.textMuted}
                      />
                      <Text
                        style={[
                          styles.sidebarLabel,
                          active && styles.sidebarLabelActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                    {item.badge && item.badge > 0 ? (
                      <Text style={styles.sidebarCount}>{item.badge}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sidebarFooter}>
              <Text style={styles.footerUser} numberOfLines={1}>
                {user.fullName}
              </Text>
              <Text style={styles.footerRole} numberOfLines={1}>
                {user.role.name}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Main Workspace Column */}
        <View style={styles.mainColumn}>
          {/* Mobile Compact Top Bar */}
          {!isWideLayout ? (
            <View style={styles.mobileTopBar}>
              <Image
                source={optronixLogo}
                style={styles.brandLogoMobile}
                resizeMode="contain"
              />

              <Pressable
                onPress={() => switchTab('account')}
                style={styles.mobileRoleChip}
              >
                <Text style={styles.mobileRoleText}>{user.role.name}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.canvasWrap}>
            <View style={isWideLayout ? styles.wideCanvasInner : { flex: 1 }}>
              {renderMainContent()}
            </View>
          </View>

          {/* Mobile Overflow Drawer Strip */}
          {!isWideLayout && moreMenuOpen ? (
            <View style={styles.morePopup}>
              {overflowTabs.map((item) => {
                const active = activeTab === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => switchTab(item.id)}
                    style={[
                      styles.morePopupItem,
                      active && styles.sidebarItemActive,
                    ]}
                  >
                    <Feather
                      name={item.icon}
                      size={16}
                      color={active ? COLORS.accent : COLORS.textMuted}
                    />
                    <Text
                      style={[
                        styles.sidebarLabel,
                        active && styles.sidebarLabelActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Mobile Bottom Navigation Bar */}
          {!isWideLayout ? (
            <View style={styles.bottomBar}>
              {primaryBottomTabs.map((item) => {
                const active =
                  activeTab === item.id && subRoute.type === 'none';
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => switchTab(item.id)}
                    style={styles.bottomTab}
                  >
                    <Feather
                      name={item.icon}
                      size={18}
                      color={active ? COLORS.accent : COLORS.textMuted}
                    />
                    <Text
                      style={[
                        styles.bottomTabLabel,
                        active && { color: COLORS.accent, fontWeight: '600' },
                      ]}
                    >
                      {item.shortLabel}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setMoreMenuOpen((v) => !v)}
                style={styles.bottomTab}
              >
                <Feather
                  name="menu"
                  size={18}
                  color={
                    isOverflowActive || moreMenuOpen
                      ? COLORS.accent
                      : COLORS.textMuted
                  }
                />
                <Text
                  style={[
                    styles.bottomTabLabel,
                    (isOverflowActive || moreMenuOpen) && {
                      color: COLORS.accent,
                      fontWeight: '600',
                    },
                  ]}
                >
                  More
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function RootShell() {
  const { isBootstrapping } = useMobileAuth();
  const [introReady, setIntroReady] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <WorkspaceApp introReady={introReady} />
      <MobileBrandSplash
        isBootstrapping={isBootstrapping}
        onTransitionStart={() => setIntroReady(true)}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootShell />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  appRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  bodyRow: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 228,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.lg,
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  brandLogo: {
    width: 152,
    height: 28,
  },
  brandLogoMobile: {
    width: 132,
    height: 24,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  sidebarItemActive: {
    backgroundColor: COLORS.surfaceMuted,
  },
  sidebarItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sidebarLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  sidebarLabelActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  sidebarCount: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    paddingHorizontal: 6,
  },
  footerUser: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  footerRole: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  mainColumn: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  mobileTopBar: {
    height: 52,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBadgeSmall: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBadgeTextSmall: {
    color: COLORS.primaryText,
    fontSize: 12,
    fontWeight: '700',
  },
  mobileTopTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  mobileRoleChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceMuted,
  },
  mobileRoleText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  canvasWrap: {
    flex: 1,
  },
  wideCanvasInner: {
    flex: 1,
    width: '100%',
    maxWidth: 1060,
    alignSelf: 'center',
  },
  bottomBar: {
    height: 60,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
  },
  bottomTabLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  morePopup: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: SPACING.md,
    gap: 4,
  },
  morePopupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
  },
});
