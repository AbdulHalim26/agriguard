'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Marker, Tooltip, LayersControl, useMap } from 'react-leaflet'
import * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PetaLahan, PetaReport } from './actions'
import { AI_STATUS_INFO, type AiStatus } from '@/lib/recommendations'
import LocateControl from '@/components/map/LocateControl'

const PIN_COLORS: Record<string, string> = {
  aman: '#16a34a',
  rusak_ringan: '#d97706',
  rusak_berat: '#dc2626',
  manual: '#6b7280',
}

function pinColorFor(status: AiStatus | null): string {
  return status ? PIN_COLORS[status] : PIN_COLORS.manual
}

function renderPinColor(status: AiStatus | null) {
  const color = pinColorFor(status)
  return `<div style="width:26px;height:34px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"><svg viewBox="0 0 24 24" width="26" height="34"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="9" r="3" fill="#fff"/></svg></div>`
}

function getPinIcon(latlng: { lat: number; lng: number }, status: AiStatus | null) {
  return Leaflet.divIcon({
    className: '',
    html: renderPinColor(status),
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    tooltipAnchor: [0, -34],
    popupAnchor: [0, -34],
  })
}

function FitBounds({ lahan }: { lahan: PetaLahan[] }) {
  const map = useMap()

  useEffect(() => {
    const points: [number, number][] = []
    for (const l of lahan) {
      for (const [lng, lat] of l.polygon) {
        points.push([lat, lng])
      }
    }
    if (points.length === 0) return
    map.fitBounds(Leaflet.latLngBounds(points).pad(0.05))
  }, [map, lahan])

  return null
}

function MapInstanceCapture({ onReady }: { onReady: (map: Leaflet.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

const userLocationIcon = () =>
  Leaflet.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;background:#0288D1;border:3px solid #fff;border-radius:9999px;box-shadow:0 0 0 4px rgba(2,136,209,.35)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })

export default function PetaMap({
  lahan,
  reports,
  onSelectReport,
}: {
  lahan: PetaLahan[]
  reports: PetaReport[]
  onSelectReport: (report: PetaReport) => void
}) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [map, setMap] = useState<Leaflet.Map | null>(null)

  const handleLocated = (lat: number, lng: number) => {
    setUserLocation([lat, lng])
    map?.flyTo([lat, lng], 17)
  }

  return (
    <div className="relative">
      <MapContainer
        center={[-6.312, 107.285]}
        zoom={14}
        className="h-[70vh] w-full"
        scrollWheelZoom
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Peta">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satelit">
            <TileLayer
              attribution="Tiles &copy; Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <MapInstanceCapture onReady={setMap} />
        <FitBounds lahan={lahan} />

        {lahan.map((l) => (
          <Polygon
            key={l.id}
            positions={l.polygon.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{ color: '#16a34a', weight: 2, fillColor: '#16a34a', fillOpacity: 0.08 }}
          >
            <Tooltip>{l.name}</Tooltip>
          </Polygon>
        ))}

        {reports.map((r) => (
          <Marker
            key={r.id}
            position={[r.latitude, r.longitude]}
            icon={getPinIcon({ lat: r.latitude, lng: r.longitude }, r.ai_status)}
            eventHandlers={{ click: () => onSelectReport(r) }}
          >
            <Tooltip>
              {r.lahan_name || 'Lahan'} · {r.ai_status ? AI_STATUS_INFO[r.ai_status].label : 'Manual'}
            </Tooltip>
          </Marker>
        ))}

        {userLocation && <Marker position={userLocation} icon={userLocationIcon()} />}
      </MapContainer>
      <LocateControl className="left-3 bottom-3" onLocated={handleLocated} />
    </div>
  )
}