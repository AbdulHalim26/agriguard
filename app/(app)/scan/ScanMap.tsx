'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polygon, useMap, useMapEvents } from 'react-leaflet'
import * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface GeoCoords {
  lat: number
  lng: number
}

export type LngLatPolygon = [number, number][]

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

function FitLahan({ polygon }: { polygon: LngLatPolygon | null }) {
  const map = useMap()

  useEffect(() => {
    if (!polygon || polygon.length < 3) return
    const bounds = Leaflet.latLngBounds(polygon.map(([lng, lat]) => [lat, lng] as [number, number]))
    map.fitBounds(bounds, { padding: [24, 24] })
  }, [map, polygon])

  return null
}

export default function ScanMap({
  coords,
  onPick,
  polygon,
}: {
  coords: GeoCoords | null
  onPick: (c: GeoCoords) => void
  polygon: LngLatPolygon | null
}) {
  const polygonPositions = polygon
    ? polygon.map(([lng, lat]) => [lat, lng] as [number, number])
    : null

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={16} className="h-56 w-full" scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitLahan polygon={polygon} />
      {polygonPositions && (
        <Polygon
          positions={polygonPositions}
          pathOptions={{ color: '#16a34a', weight: 2, fillColor: '#16a34a', fillOpacity: 0.1 }}
        />
      )}
      <LocationPicker coords={coords} onPick={onPick} />
    </MapContainer>
  )
}