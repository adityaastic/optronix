'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Compass, ExternalLink, Loader2, MapPin, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface SessionMapPin {
  sessionNumber: number;
  latitude: number;
  longitude: number;
  label?: string;
}

export interface GeofenceMapProps {
  targetLocation: MapCoordinate;
  targetLabel?: string;
  geofenceRadiusMeters?: number;
  userLocation?: (MapCoordinate & { accuracyMeters?: number }) | null;
  withinGeofence?: boolean;
  distanceMeters?: number | null;
  locating?: boolean;
  locatingText?: string;
  interactive?: boolean;
  onSelectLocation?: (coords: MapCoordinate) => void;
  sessionPins?: SessionMapPin[];
  height?: number;
  showDirectionsLink?: boolean;
  className?: string;
}

export function GeofenceMap({
  targetLocation,
  targetLabel = 'Customer site',
  geofenceRadiusMeters = 100,
  userLocation = null,
  withinGeofence = true,
  distanceMeters = null,
  locating = false,
  locatingText = 'Acquiring GPS signal...',
  interactive = false,
  onSelectLocation,
  sessionPins = [],
  height = 210,
  showDirectionsLink = true,
  className,
}: GeofenceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerGroupRef = useRef<import('leaflet').LayerGroup | null>(null);
  const leafletModRef = useRef<typeof import('leaflet') | null>(null);
  const onSelectRef = useRef(onSelectLocation);
  const prevCenterRef = useRef<string>('');
  const [mapReady, setMapReady] = useState(false);

  onSelectRef.current = onSelectLocation;

  // Initialize Leaflet instance client-side only
  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current || typeof window === 'undefined') return;

    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletModRef.current = L;

      const map = L.map(containerRef.current, {
        center: [targetLocation.latitude, targetLocation.longitude],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // 100% Free Keyless OpenStreetMap Street Tiles (crisp roads, landmarks & buildings)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const group = L.layerGroup().addTo(map);
      layerGroupRef.current = group;
      mapRef.current = map;

      map.on('click', (ev: import('leaflet').LeafletMouseEvent) => {
        if (onSelectRef.current) {
          onSelectRef.current({
            latitude: Number(ev.latlng.lat.toFixed(6)),
            longitude: Number(ev.latlng.lng.toFixed(6)),
          });
        }
      });

      prevCenterRef.current = `${targetLocation.latitude.toFixed(4)},${targetLocation.longitude.toFixed(4)}`;
      setMapReady(true);

      // Ensure tiles fill container cleanly inside animated SlideDrawers
      window.setTimeout(() => {
        map.invalidateSize();
      }, 220);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerGroupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render pins, geofence circle, and smooth flyTo on coordinate updates
  useEffect(() => {
    const L = leafletModRef.current;
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!mapReady || !L || !map || !group) return;

    group.clearLayers();

    const fenceColor = withinGeofence ? '#10b981' : '#f59e0b';

    // 1. Geofence Radius Zone
    if (geofenceRadiusMeters > 0) {
      L.circle([targetLocation.latitude, targetLocation.longitude], {
        radius: geofenceRadiusMeters,
        color: fenceColor,
        weight: 1.75,
        dashArray: withinGeofence ? undefined : '5, 5',
        fillColor: fenceColor,
        fillOpacity: 0.12,
      }).addTo(group);
    }

    // 2. Customer / Site Target Pin
    const siteIcon = L.divIcon({
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `<div style="width:28px;height:28px;border-radius:9999px;background:#111827;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(17,24,39,0.28);display:flex;align-items:center;justify-content:center;">
        <div style="width:8px;height:8px;border-radius:9999px;background:#f97316;"></div>
      </div>`,
    });

    L.marker([targetLocation.latitude, targetLocation.longitude], {
      icon: siteIcon,
    })
      .bindTooltip(targetLabel, {
        direction: 'top',
        offset: [0, -14],
      })
      .addTo(group);

    // 3. Recorded Session Pins (for Meeting Details)
    for (const sp of sessionPins) {
      const sessionIcon = L.divIcon({
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: `<div style="width:22px;height:22px;border-radius:9999px;background:#059669;color:#ffffff;font-size:10px;font-weight:700;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;">#${sp.sessionNumber}</div>`,
      });
      L.marker([sp.latitude, sp.longitude], { icon: sessionIcon })
        .bindTooltip(sp.label ?? `Check-in Session #${sp.sessionNumber}`, {
          direction: 'top',
          offset: [0, -10],
        })
        .addTo(group);
    }

    // 4. Live Employee GPS Pulsing Dot + Connector Line
    if (userLocation) {
      const gpsIcon = L.divIcon({
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        html: `<div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
          <div class="optronix-gps-halo" style="position:absolute;width:18px;height:18px;border-radius:9999px;background:rgba(37,99,235,0.38);"></div>
          <div style="position:relative;width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 2px 8px rgba(37,99,235,0.45);"></div>
        </div>`,
      });

      L.marker([userLocation.latitude, userLocation.longitude], {
        icon: gpsIcon,
      })
        .bindTooltip('Your live GPS position', {
          direction: 'bottom',
          offset: [0, 10],
        })
        .addTo(group);

      const latDiff = Math.abs(userLocation.latitude - targetLocation.latitude);
      const lngDiff = Math.abs(
        userLocation.longitude - targetLocation.longitude,
      );
      if (latDiff > 0.00008 || lngDiff > 0.00008) {
        L.polyline(
          [
            [targetLocation.latitude, targetLocation.longitude],
            [userLocation.latitude, userLocation.longitude],
          ],
          {
            color: '#2563eb',
            weight: 2,
            dashArray: '4, 6',
            opacity: 0.75,
          },
        ).addTo(group);
      }
    }

    // Smooth camera framing when target shifts meaningfully
    const nextCenterKey = `${targetLocation.latitude.toFixed(4)},${targetLocation.longitude.toFixed(4)}`;
    if (prevCenterRef.current !== nextCenterKey) {
      prevCenterRef.current = nextCenterKey;
      if (
        userLocation &&
        distanceMeters !== null &&
        distanceMeters > geofenceRadiusMeters * 1.3 &&
        distanceMeters < 25_000
      ) {
        const bounds = L.latLngBounds([
          [targetLocation.latitude, targetLocation.longitude],
          [userLocation.latitude, userLocation.longitude],
        ]);
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
      } else {
        const zoomForRadius =
          geofenceRadiusMeters > 1000
            ? 13
            : geofenceRadiusMeters > 400
              ? 15
              : 16;
        map.flyTo(
          [targetLocation.latitude, targetLocation.longitude],
          zoomForRadius,
          { duration: 0.65 },
        );
      }
    }
  }, [
    mapReady,
    targetLocation.latitude,
    targetLocation.longitude,
    targetLabel,
    geofenceRadiusMeters,
    userLocation,
    withinGeofence,
    distanceMeters,
    sessionPins,
  ]);

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetLocation.latitude},${targetLocation.longitude}`;

  return (
    <div
      className={cn(
        'relative rounded-xl border border-hairline overflow-hidden bg-surface-container-low select-none',
        className,
      )}
    >
      <div
        ref={containerRef}
        style={{ height: `${height}px` }}
        className="w-full"
      />

      {/* Top Overlay: Live Status Badge & 1-Tap Google Maps Directions */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 z-[400] flex items-start justify-between gap-2">
        <div className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur border border-hairline shadow-sm text-caption font-medium text-on-surface tabular-nums">
          {locating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-secondary animate-spin shrink-0" />
              <span>{locatingText}</span>
            </>
          ) : distanceMeters !== null ? (
            <>
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  withinGeofence ? 'bg-emerald-500' : 'bg-amber-500',
                )}
              />
              <span>
                {Math.round(distanceMeters)}m away ·{' '}
                {withinGeofence
                  ? `Inside ${geofenceRadiusMeters}m zone`
                  : `Outside ${geofenceRadiusMeters}m zone`}
              </span>
            </>
          ) : (
            <>
              <MapPin className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span>
                {targetLocation.latitude.toFixed(4)}° N,{' '}
                {targetLocation.longitude.toFixed(4)}° E · {geofenceRadiusMeters}m
              </span>
            </>
          )}
        </div>

        {showDirectionsLink ? (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur border border-hairline shadow-sm text-caption font-medium text-on-surface hover:text-secondary transition-colors"
          >
            <Navigation className="w-3 h-3 text-secondary" />
            <span>Directions</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
          </a>
        ) : null}
      </div>

      {/* Bottom Interactive Hint */}
      {interactive ? (
        <div className="pointer-events-none absolute bottom-2 left-2.5 z-[400]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-900/80 text-white text-[11px] font-medium">
            <Compass className="w-3 h-3 text-orange-400" />
            Click anywhere on map to fine-tune pin
          </span>
        </div>
      ) : null}
    </div>
  );
}
