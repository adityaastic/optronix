'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface LiveTeamRepPin {
  repId: string;
  employeeCode: string;
  fullName: string;
  initials: string;
  territory: string;
  presenceStatus: 'ON_SITE' | 'LIVE_DUTY' | 'LAST_SEEN';
  coordinates: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    updatedAt: string;
    source: string;
  };
  activeVisit: {
    meetingId: string | null;
    meetingCode: string;
    customerName: string;
    sessionStatus: string;
    sessionNumber: number;
    checkInAt: string;
    withinGeofence: boolean;
  } | null;
  nextMeeting: {
    id: string;
    meetingCode: string;
    title: string;
    customerName: string;
    scheduledStart: string;
    distanceMeters: number | null;
  } | null;
}

export interface RepBreadcrumbPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  source: string;
  label: string;
  recordedAt: string;
}

export function TeamRadarMap({
  reps = [],
  trail = [],
  onSelectRep,
  height = 360,
  className,
}: {
  reps?: LiveTeamRepPin[];
  trail?: RepBreadcrumbPoint[];
  onSelectRep?: (repId: string) => void;
  height?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const groupRef = useRef<import('leaflet').LayerGroup | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const onSelectRef = useRef(onSelectRep);
  const [ready, setReady] = useState(false);

  onSelectRef.current = onSelectRep;

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current || typeof window === 'undefined') return;

    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: [28.495, 77.089],
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      groupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);

      window.setTimeout(() => map.invalidateSize(), 200);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        groupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!ready || !L || !map || !group) return;

    group.clearLayers();
    const boundsPoints: Array<[number, number]> = [];

    // Mode A: Single Rep Breadcrumb Route Trail
    if (trail.length > 0) {
      const polyCoords: Array<[number, number]> = trail.map((pt) => [
        pt.latitude,
        pt.longitude,
      ]);
      L.polyline(polyCoords, {
        color: '#2563eb',
        weight: 3,
        opacity: 0.85,
      }).addTo(group);

      trail.forEach((pt, idx) => {
        const isLatest = idx === trail.length - 1;
        const bg =
          pt.source === 'CHECK_IN'
            ? '#059669'
            : pt.source === 'CHECK_OUT'
              ? '#111827'
              : '#2563eb';
        const size = isLatest ? 28 : 22;
        const icon = L.divIcon({
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};color:#fff;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">${idx + 1}</div>`,
        });
        L.marker([pt.latitude, pt.longitude], { icon })
          .bindTooltip(`${pt.label}`, { direction: 'top', offset: [0, -10] })
          .addTo(group);
        boundsPoints.push([pt.latitude, pt.longitude]);
      });
    }

    // Mode B: Multi-Rep Team Field Radar
    for (const rep of reps) {
      const { latitude, longitude } = rep.coordinates;
      const badgeColor =
        rep.presenceStatus === 'ON_SITE'
          ? '#059669'
          : rep.presenceStatus === 'LIVE_DUTY'
            ? '#2563eb'
            : '#4b5563';

      const pulseHtml =
        rep.presenceStatus === 'ON_SITE'
          ? `<div class="optronix-gps-halo" style="position:absolute;width:36px;height:36px;border-radius:9999px;background:rgba(16,185,129,0.35);"></div>`
          : '';

      const icon = L.divIcon({
        className: '',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        html: `<div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
          ${pulseHtml}
          <div style="position:relative;width:32px;height:32px;border-radius:9999px;background:${badgeColor};color:#ffffff;font-size:11px;font-weight:700;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(17,24,39,0.28);display:flex;align-items:center;justify-content:center;">
            ${rep.initials}
          </div>
        </div>`,
      });

      const statusText = rep.activeVisit
        ? `Checked in @ ${rep.activeVisit.customerName}`
        : rep.presenceStatus === 'LIVE_DUTY'
          ? 'On-Duty Live GPS'
          : `Last seen · ${rep.territory}`;

      const marker = L.marker([latitude, longitude], { icon })
        .bindTooltip(`<strong>${rep.fullName}</strong><br/>${statusText}`, {
          direction: 'top',
          offset: [0, -14],
        })
        .addTo(group);

      marker.on('click', () => {
        onSelectRef.current?.(rep.repId);
      });

      boundsPoints.push([latitude, longitude]);
    }

    if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0]!, 15);
    } else if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, { padding: [42, 42], maxZoom: 15 });
    }
  }, [ready, reps, trail]);

  return (
    <div
      className={cn(
        'relative rounded-xl border border-hairline overflow-hidden bg-surface-container-low',
        className,
      )}
    >
      <div
        ref={containerRef}
        style={{ height: `${height}px` }}
        className="w-full"
      />

      {reps.length > 0 ? (
        <div className="pointer-events-none absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur border border-hairline shadow-sm text-caption font-medium text-on-surface">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Checked-in at site
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur border border-hairline shadow-sm text-caption font-medium text-on-surface">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            On-duty live GPS
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur border border-hairline shadow-sm text-caption font-medium text-on-surface">
            <span className="w-2 h-2 rounded-full bg-gray-600" />
            Last known pin
          </span>
        </div>
      ) : null}
    </div>
  );
}
