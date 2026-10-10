'use client'

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface GeoCoords {
  lat: number
  lng: number
}

const DEFAULT_CENTER: [number, number] = [-6.312, 107.285]

function getLocationIcon() {
  return Leaflet.divIcon({
    className: '',
    html: '<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#16a34a;color:#fff;border:2px solid #fff;border-radius:9999px;box-shadow:0 1px 4px rgba(0,0,0,.4)">&#9673;</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function LocationPicker({
  coords,
  onPick,
}: {
  coords: GeoCoords | null
  onPick: (c: GeoCoords) => void
}) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })

  const markerPosition = coords ? ([coords.lat, coords.lng] as [number, number]) : null

  return <>{markerPosition && <Marker position={markerPosition} icon={getLocationIcon()} />}</>
}

export default function ScanMap({
  coords,
  onPick,
}: {
  coords: GeoCoords | null
  onPick: (c: GeoCoords) => void
}) {
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={16} className="h-56 w-full" scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocationPicker coords={coords} onPick={onPick} />
    </MapContainer>
  )
}