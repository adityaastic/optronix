import React from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../theme/tokens';

export interface MobileMapProps {
  latitude: number;
  longitude: number;
  geofenceRadiusMeters?: number;
  userLocation?: { latitude: number; longitude: number } | null;
  withinGeofence?: boolean;
  distanceMeters?: number | null;
  locating?: boolean;
  height?: number;
}

function latLngToTileFloat(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function MobileGeofenceMap({
  latitude,
  longitude,
  geofenceRadiusMeters = 100,
  userLocation = null,
  withinGeofence = true,
  distanceMeters = null,
  locating = false,
  height = 176,
}: MobileMapProps) {
  const zoom = geofenceRadiusMeters > 600 ? 14 : 16;
  const tileSize = 256;
  const center = latLngToTileFloat(latitude, longitude, zoom);
  const baseTileX = Math.floor(center.x);
  const baseTileY = Math.floor(center.y);
  const fracX = (center.x - baseTileX) * tileSize;
  const fracY = (center.y - baseTileY) * tileSize;

  // Approximate meters-per-pixel at given latitude & zoom
  const metersPerPixel =
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
  const circleDiameterPx = Math.min(
    148,
    Math.max(38, Math.round((geofenceRadiusMeters * 2) / metersPerPixel)),
  );

  // Relative pixel offset for live user GPS dot
  let userOffsetPx: { dx: number; dy: number } | null = null;
  if (userLocation) {
    const uTile = latLngToTileFloat(
      userLocation.latitude,
      userLocation.longitude,
      zoom,
    );
    const rawDx = (uTile.x - center.x) * tileSize;
    const rawDy = (uTile.y - center.y) * tileSize;
    userOffsetPx = {
      dx: Math.max(-120, Math.min(120, rawDx)),
      dy: Math.max(-68, Math.min(68, rawDy)),
    };
  }

  const fenceColor = withinGeofence ? '#10B981' : '#F59E0B';
  const fenceBg = withinGeofence
    ? 'rgba(16, 185, 129, 0.16)'
    : 'rgba(245, 158, 11, 0.16)';

  const openDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    void Linking.openURL(url).catch(() => undefined);
  };

  return (
    <View style={[styles.wrap, { height }]}>
      {/* 3x3 Seamless OpenStreetMap Street Tile Mosaic Centered on Target */}
      <View
        pointerEvents="none"
        style={[
          styles.tileCanvas,
          {
            transform: [
              { translateX: -(tileSize + fracX) },
              { translateY: -(tileSize + fracY) },
            ],
          },
        ]}
      >
        {[-1, 0, 1].map((dy) => (
          <View key={dy} style={{ flexDirection: 'row' }}>
            {[-1, 0, 1].map((dx) => {
              const tx = baseTileX + dx;
              const ty = baseTileY + dy;
              const uri = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
              return (
                <Image
                  key={`${tx}-${ty}`}
                  source={{ uri }}
                  style={{ width: tileSize, height: tileSize }}
                />
              );
            })}
          </View>
        ))}
      </View>

      {/* Center Geofence Zone & Site Pin */}
      <View pointerEvents="none" style={styles.centerOverlay}>
        <View
          style={[
            styles.geofenceRing,
            {
              width: circleDiameterPx,
              height: circleDiameterPx,
              borderRadius: circleDiameterPx / 2,
              borderColor: fenceColor,
              backgroundColor: fenceBg,
            },
          ]}
        />
        <View style={styles.sitePin}>
          <View style={styles.sitePinDot} />
        </View>

        {userOffsetPx ? (
          <View
            style={[
              styles.userGpsDot,
              {
                transform: [
                  { translateX: userOffsetPx.dx },
                  { translateY: userOffsetPx.dy },
                ],
              },
            ]}
          />
        ) : null}
      </View>

      {/* Top Status & Directions Strip */}
      <View style={styles.topRow}>
        <View style={styles.badgePill}>
          {locating ? (
            <>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={styles.badgeText}>Locating GPS...</Text>
            </>
          ) : distanceMeters !== null ? (
            <>
              <View
                style={[styles.statusDot, { backgroundColor: fenceColor }]}
              />
              <Text style={styles.badgeText}>
                {Math.round(distanceMeters)}m ·{' '}
                {withinGeofence
                  ? `In ${geofenceRadiusMeters}m zone`
                  : `Outside ${geofenceRadiusMeters}m`}
              </Text>
            </>
          ) : (
            <>
              <Feather name="map-pin" size={12} color={COLORS.accent} />
              <Text style={styles.badgeText}>
                {latitude.toFixed(4)}°, {longitude.toFixed(4)}° ·{' '}
                {geofenceRadiusMeters}m
              </Text>
            </>
          )}
        </View>

        <Pressable onPress={openDirections} style={styles.dirButton}>
          <Feather name="navigation" size={11} color={COLORS.accent} />
          <Text style={styles.dirText}>Directions</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#EEF2F6',
    overflow: 'hidden',
    position: 'relative',
  },
  tileCanvas: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 768,
    height: 768,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  geofenceRing: {
    position: 'absolute',
    borderWidth: 1.75,
  },
  sitePin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sitePinDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F97316',
  },
  userGpsDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563EB',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  topRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
  },
  dirButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dirText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
  },
});
