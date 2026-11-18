import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMobileAuth } from '../context/AuthContext';
import { mobileApiFetch, MobileApiError } from '../lib/api';
import {
  PERMISSIONS,
  createCustomerFormSchema,
  formatDateShort,
  phoneNumberSchema,
} from '../lib/domain';
import type { CustomerDossier, CustomerListItem } from '../lib/types';
import {
  BannerAlert,
  CardSurface,
  ChipGroup,
  EmptyBlock,
  FormInput,
  PageHeaderBar,
  PrimaryButton,
  SheetModal,
  StatusPill,
} from '../components/ui';
import { MobileGeofenceMap } from '../components/MobileGeofenceMap';
import { COLORS, RADIUS, SPACING } from '../theme/tokens';

export function CustomersScreen({
  onScheduleForCustomer,
  onOpenMeeting,
}: {
  onScheduleForCustomer: (customerId: string) => void;
  onOpenMeeting: (meetingId: string) => void;
}) {
  const { hasPermission } = useMobileAuth();
  const canUpdate = hasPermission(PERMISSIONS.CUSTOMERS_UPDATE);

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Selected Customer Profile Modal
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<CustomerDossier | null>(null);
  const [profileTab, setProfileTab] = useState<
    'overview' | 'meetings' | 'contacts' | 'followups'
  >('overview');

  // Add Contact inline inside Contacts tab
  const [addingContact, setAddingContact] = useState(false);
  const [ctName, setCtName] = useState('');
  const [ctEmail, setCtEmail] = useState('');
  const [ctPhone, setCtPhone] = useState('');
  const [ctError, setCtError] = useState<string | null>(null);

  // Add Customer Modal
  const [addOpen, setAddOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [formErr, setFormErr] = useState<Record<string, string>>({});
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('Cloud Infrastructure');
  const [tier, setTier] = useState<'ENTERPRISE_T1' | 'MID_MARKET' | 'SMB' | 'GOV'>(
    'ENTERPRISE_T1',
  );
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('Gurugram');
  const [radius, setRadius] = useState('100');
  const [siteLat, setSiteLat] = useState('');
  const [siteLng, setSiteLng] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  const loadCustomers = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await mobileApiFetch<{ customers: CustomerListItem[] }>(
          '/customers',
          {
            query: {
              limit: 40,
              search: search.trim() || undefined,
              tier: tierFilter || undefined,
            },
          },
        );
        setCustomers(res.data.customers);
      } catch (err) {
        setError(
          err instanceof MobileApiError
            ? err.message
            : 'Unable to load customers.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search, tierFilter],
  );

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const loadDossier = useCallback(async (id: string) => {
    try {
      const res = await mobileApiFetch<{ customer: CustomerDossier }>(
        `/customers/${id}`,
      );
      setDossier(res.data.customer);
    } catch {
      setDossier(null);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      void loadDossier(selectedId);
    } else {
      setDossier(null);
      setAddingContact(false);
    }
  }, [selectedId, loadDossier]);

  const handleGeocodeCustomerAddress = async () => {
    const query = [street.trim(), city.trim(), 'India'].filter(Boolean).join(', ');
    if (query.length < 4) {
      setGeoMessage('Enter street and city first.');
      return;
    }
    setGeocoding(true);
    setGeoMessage(null);
    try {
      const res = await mobileApiFetch<{
        results: Array<{
          displayName: string;
          latitude: number;
          longitude: number;
        }>;
      }>('/customers/geocode', {
        query: { q: query },
      });
      const top = res.data.results[0];
      if (!top) {
        setGeoMessage('No map match found — enter coordinates manually.');
        return;
      }
      setSiteLat(top.latitude.toFixed(6));
      setSiteLng(top.longitude.toFixed(6));
      setGeoMessage(`Pinned: ${top.latitude.toFixed(4)}, ${top.longitude.toFixed(4)}`);
    } catch {
      setGeoMessage('Geocoding unavailable — enter coordinates manually if needed.');
    } finally {
      setGeocoding(false);
    }
  };

  const handleCreateCustomer = async () => {
    setFormErr({});
    const parsed = createCustomerFormSchema.safeParse({
      companyName,
      industry,
      tier,
      street,
      city,
      geofenceRadiusMeters: radius,
      contactName,
      contactEmail,
      contactPhone,
      strategicNotes: notes,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? 'companyName');
        if (!next[k]) next[k] = issue.message;
      }
      setFormErr(next);
      return;
    }

    setSavingCustomer(true);
    try {
      const parsedLat = siteLat.trim() ? Number(siteLat.trim()) : NaN;
      const parsedLng = siteLng.trim() ? Number(siteLng.trim()) : NaN;
      const hasCoords = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);

      const res = await mobileApiFetch<{ customer: CustomerDossier }>(
        '/customers',
        {
          method: 'POST',
          body: {
            companyName: parsed.data.companyName,
            industry: parsed.data.industry,
            tier: parsed.data.tier,
            status: 'ACTIVE',
            address: {
              street: parsed.data.street,
              city: parsed.data.city,
              country: 'India',
              geofenceRadiusMeters: parsed.data.geofenceRadiusMeters,
              ...(hasCoords
                ? { coordinates: { latitude: parsedLat, longitude: parsedLng } }
                : {}),
            },
            primaryContact: {
              fullName: parsed.data.contactName,
              email: parsed.data.contactEmail,
              phone: parsed.data.contactPhone,
              isPrimary: true,
            },
            strategicNotes: parsed.data.strategicNotes || undefined,
          },
        },
      );
      setAddOpen(false);
      setCompanyName('');
      setStreet('');
      setSiteLat('');
      setSiteLng('');
      setGeoMessage(null);
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setNotes('');
      setBanner(`${res.data.customer.companyName} added.`);
      await loadCustomers(true);
    } catch (err) {
      setFormErr({
        companyName:
          err instanceof MobileApiError
            ? err.message
            : 'Unable to create customer.',
      });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleSaveNewContact = async () => {
    if (!selectedId) return;
    setCtError(null);
    if (ctName.trim().length < 2 || !ctEmail.includes('@')) {
      setCtError('Enter a valid name and email.');
      return;
    }
    const phoneCheck = phoneNumberSchema.safeParse(ctPhone);
    if (!phoneCheck.success) {
      setCtError(phoneCheck.error.issues[0]?.message ?? 'Invalid phone');
      return;
    }
    try {
      await mobileApiFetch(`/customers/${selectedId}/contacts`, {
        method: 'POST',
        body: {
          fullName: ctName.trim(),
          email: ctEmail.trim().toLowerCase(),
          phone: phoneCheck.data,
          isPrimary: false,
        },
      });
      setCtName('');
      setCtEmail('');
      setCtPhone('');
      setAddingContact(false);
      await loadDossier(selectedId);
    } catch (err) {
      setCtError(
        err instanceof MobileApiError ? err.message : 'Failed to add contact.',
      );
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadCustomers(true);
          }}
        />
      }
    >
      <PageHeaderBar
        title="Customers"
        subtitle="Customer accounts, contacts, and visit history."
        rightAction={
          <PrimaryButton
            label="Add"
            icon="plus"
            size="sm"
            onPress={() => setAddOpen(true)}
          />
        }
      />

      {banner ? (
        <BannerAlert
          tone="success"
          message={banner}
          onDismiss={() => setBanner(null)}
        />
      ) : null}

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      <FormInput
        label="Search accounts"
        placeholder="Search by company, code, or city..."
        value={search}
        onChangeText={setSearch}
      />

      <ChipGroup
        options={[
          { label: 'All tiers', value: '' },
          { label: 'Enterprise T1', value: 'ENTERPRISE_T1' },
          { label: 'Mid-Market', value: 'MID_MARKET' },
          { label: 'SMB', value: 'SMB' },
          { label: 'Gov', value: 'GOV' },
        ]}
        value={tierFilter}
        onChange={setTierFilter}
      />

      {loading && customers.length === 0 ? (
        <ActivityIndicator
          size="large"
          color={COLORS.accent}
          style={{ marginTop: 32 }}
        />
      ) : customers.length === 0 ? (
        <CardSurface padded={false}>
          <EmptyBlock
            icon="briefcase"
            title="No customers found"
            description="Add a customer account to schedule meetings."
          />
        </CardSurface>
      ) : (
        <CardSurface padded={false}>
          {customers.map((c, idx) => (
            <Pressable
              key={c.id}
              onPress={() => {
                setProfileTab('overview');
                setSelectedId(c.id);
              }}
              style={[styles.row, idx > 0 && styles.rowDivider]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowCompany}>{c.companyName}</Text>
                  <StatusPill status={c.status} />
                </View>
                <Text style={styles.rowMeta}>
                  {c.address.city} · {c.industry} ·{' '}
                  {c.tier.replace(/_/g, ' ')}
                </Text>
                {c.primaryContact ? (
                  <Text style={styles.rowMeta}>
                    Contact: {c.primaryContact.fullName} ({c.primaryContact.phone})
                  </Text>
                ) : null}
              </View>
              <PrimaryButton
                label="Meet"
                size="sm"
                variant="outline"
                icon="calendar"
                onPress={() => onScheduleForCustomer(c.id)}
              />
            </Pressable>
          ))}
        </CardSurface>
      )}

      {/* Customer Profile Modal (Meetings, Contacts & Follow-ups Tabs) */}
      <SheetModal
        visible={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={dossier?.companyName ?? 'Customer profile'}
        subtitle={
          dossier
            ? `${dossier.customerCode} · ${dossier.industry}`
            : 'Loading...'
        }
        footer={
          dossier ? (
            <PrimaryButton
              label="Schedule meeting"
              icon="calendar"
              onPress={() => {
                const id = dossier.id;
                setSelectedId(null);
                onScheduleForCustomer(id);
              }}
            />
          ) : undefined
        }
      >
        {dossier ? (
          <>
            <ChipGroup
              options={[
                { label: 'Overview', value: 'overview' },
                {
                  label: `Meetings (${dossier.meetings.length})`,
                  value: 'meetings',
                },
                {
                  label: `Contacts (${dossier.contacts.length})`,
                  value: 'contacts',
                },
                {
                  label: `Follow-ups (${dossier.followUps.length})`,
                  value: 'followups',
                },
              ]}
              value={profileTab}
              onChange={setProfileTab}
            />

            {profileTab === 'overview' ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.rowMeta}>
                  Location: {dossier.address.street}, {dossier.address.city} (
                  {dossier.address.geofenceRadiusMeters}m geofence)
                </Text>
                <Text style={styles.rowMeta}>
                  Account owner: {dossier.assignedRep?.fullName ?? 'Unassigned'}
                </Text>
                {dossier.strategicNotes ? (
                  <Text style={styles.notesText}>{dossier.strategicNotes}</Text>
                ) : null}
              </View>
            ) : null}

            {profileTab === 'meetings' ? (
              <View style={{ gap: 8 }}>
                {dossier.meetings.length === 0 ? (
                  <Text style={styles.rowMeta}>No meetings yet.</Text>
                ) : (
                  dossier.meetings.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        setSelectedId(null);
                        onOpenMeeting(m.id);
                      }}
                      style={styles.subCard}
                    >
                      <View style={styles.rowTop}>
                        <Text style={styles.subCardTitle}>{m.title}</Text>
                        <StatusPill status={m.status} />
                      </View>
                      <Text style={styles.rowMeta}>
                        {formatDateShort(m.scheduledStart)} · {m.assignedRepName}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}

            {profileTab === 'contacts' ? (
              <View style={{ gap: 10 }}>
                {canUpdate ? (
                  <PrimaryButton
                    label={addingContact ? 'Cancel' : 'Add contact'}
                    size="sm"
                    variant="outline"
                    icon="user-plus"
                    onPress={() => setAddingContact((v) => !v)}
                  />
                ) : null}

                {addingContact ? (
                  <View style={styles.subCard}>
                    {ctError ? (
                      <BannerAlert tone="error" message={ctError} />
                    ) : null}
                    <FormInput
                      label="Full name"
                      required
                      value={ctName}
                      onChangeText={setCtName}
                    />
                    <FormInput
                      label="Email"
                      required
                      autoCapitalize="none"
                      value={ctEmail}
                      onChangeText={setCtEmail}
                    />
                    <FormInput
                      label="Phone"
                      required
                      keyboardType="phone-pad"
                      placeholder="+91 98100 12345"
                      value={ctPhone}
                      onChangeText={setCtPhone}
                    />
                    <PrimaryButton
                      label="Save contact"
                      size="sm"
                      onPress={() => void handleSaveNewContact()}
                    />
                  </View>
                ) : null}

                {dossier.contacts.map((ct) => (
                  <View key={ct.id} style={styles.subCard}>
                    <Text style={styles.subCardTitle}>{ct.fullName}</Text>
                    <Text style={styles.rowMeta}>
                      {ct.email} · {ct.phone}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {profileTab === 'followups' ? (
              <View style={{ gap: 8 }}>
                {dossier.followUps.length === 0 ? (
                  <Text style={styles.rowMeta}>No open follow-ups.</Text>
                ) : (
                  dossier.followUps.map((f) => (
                    <View key={f.id} style={styles.subCard}>
                      <View style={styles.rowTop}>
                        <Text style={styles.subCardTitle}>{f.title}</Text>
                        <StatusPill status={f.status} />
                      </View>
                      <Text style={styles.rowMeta}>
                        Due {formatDateShort(f.dueDate)} · {f.ownerName}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </>
        ) : (
          <ActivityIndicator size="small" color={COLORS.accent} />
        )}
      </SheetModal>

      {/* Add Customer Modal */}
      <SheetModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add customer"
        subtitle="Create a customer account, address, and primary contact."
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setAddOpen(false)}
            />
            <PrimaryButton
              label="Create customer"
              style={{ flex: 1 }}
              loading={savingCustomer}
              onPress={() => void handleCreateCustomer()}
            />
          </View>
        }
      >
        <FormInput
          label="Company name"
          required
          value={companyName}
          onChangeText={setCompanyName}
          error={formErr.companyName}
        />
        <FormInput
          label="Industry"
          required
          value={industry}
          onChangeText={setIndustry}
          error={formErr.industry}
        />
        <ChipGroup
          options={[
            { label: 'Enterprise T1', value: 'ENTERPRISE_T1' },
            { label: 'Mid-Market', value: 'MID_MARKET' },
            { label: 'SMB', value: 'SMB' },
            { label: 'Gov', value: 'GOV' },
          ]}
          value={tier}
          onChange={setTier}
        />
        <FormInput
          label="Street address"
          required
          value={street}
          onChangeText={setStreet}
          error={formErr.street}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <FormInput
            label="City"
            required
            style={{ flex: 1 }}
            value={city}
            onChangeText={setCity}
            error={formErr.city}
          />
          <FormInput
            label="Radius (m)"
            keyboardType="numeric"
            style={{ flex: 1 }}
            value={radius}
            onChangeText={setRadius}
          />
        </View>
        <View style={{ gap: 6 }}>
          <PrimaryButton
            label={geocoding ? 'Locating address...' : 'Find GPS from address'}
            size="sm"
            variant="outline"
            icon="map-pin"
            loading={geocoding}
            onPress={() => void handleGeocodeCustomerAddress()}
          />
          {geoMessage ? <Text style={styles.rowMeta}>{geoMessage}</Text> : null}
          <MobileGeofenceMap
            latitude={
              Number.isFinite(Number(siteLat)) && siteLat.trim()
                ? Number(siteLat)
                : 28.495
            }
            longitude={
              Number.isFinite(Number(siteLng)) && siteLng.trim()
                ? Number(siteLng)
                : 77.089
            }
            geofenceRadiusMeters={Number(radius) || 100}
            locating={geocoding}
            height={160}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <FormInput
              label="Latitude"
              hint="Optional"
              keyboardType="numeric"
              style={{ flex: 1 }}
              placeholder="28.4949"
              value={siteLat}
              onChangeText={setSiteLat}
            />
            <FormInput
              label="Longitude"
              hint="Optional"
              keyboardType="numeric"
              style={{ flex: 1 }}
              placeholder="77.0888"
              value={siteLng}
              onChangeText={setSiteLng}
            />
          </View>
        </View>
        <FormInput
          label="Primary contact name"
          required
          value={contactName}
          onChangeText={setContactName}
          error={formErr.contactName}
        />
        <FormInput
          label="Contact email"
          required
          autoCapitalize="none"
          keyboardType="email-address"
          value={contactEmail}
          onChangeText={setContactEmail}
          error={formErr.contactEmail}
        />
        <FormInput
          label="Contact phone"
          required
          keyboardType="phone-pad"
          placeholder="+91 98765 43210"
          value={contactPhone}
          onChangeText={setContactPhone}
          error={formErr.contactPhone}
        />
        <FormInput
          label="Notes"
          hint="Optional"
          multiline
          value={notes}
          onChangeText={setNotes}
        />
      </SheetModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: SPACING.lg,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowCompany: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    flexShrink: 1,
  },
  rowMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  notesText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
  },
  subCard: {
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  subCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
});
