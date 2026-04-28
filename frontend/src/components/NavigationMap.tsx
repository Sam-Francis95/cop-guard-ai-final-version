/**
 * Navigation Map Component - Level 3 System
 * Displays user location, safe zones, and suggested paths
 */

import React, { useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import type {
  SafeZone,
  NavigationPath,
} from '../utils/navigationSystem';
import { getZoneStyle, generatePolyline, SAFE_ZONES } from '../utils/navigationSystem';

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface NavigationMapProps {
  userLat: number;
  userLon: number;
  navigationPath?: NavigationPath | null;
  highlightedZone?: SafeZone | null;
  showAllZones?: boolean;
}

const NavigationMap: React.FC<NavigationMapProps> = ({
  userLat,
  userLon,
  navigationPath,
  highlightedZone,
  showAllZones = true,
}) => {
  const mapRef = useRef(null);

  // Create custom user location icon
  const userIcon = new L.DivIcon({
    html: `<div style="background-color: #4f46e5; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);"></div>`,
    iconSize: [26, 26],
    className: 'user-location-icon',
  });

  // Create zone icons
  const createZoneIcon = (zone: SafeZone) => {
    const style = getZoneStyle(zone);
    const isHighlighted = highlightedZone?.id === zone.id;

    return new L.DivIcon({
      html: `<div style="
        background-color: ${style.color};
        border: ${isHighlighted ? '4px' : '2px'} solid white;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: ${isHighlighted ? '0 0 0 8px rgba(' + style.color.slice(1).match(/.{1,2}/g)?.map(x => parseInt(x, 16)).join(',') + ', 0.3)' : '0 2px 4px rgba(0,0,0,0.2)'};
        transform: ${isHighlighted ? 'scale(1.2)' : 'scale(1)'};
      ">
        ${zone.icon}
      </div>`,
      iconSize: [32, 32],
      className: `zone-icon ${isHighlighted ? 'highlighted' : ''}`,
    });
  };

  // Generate polyline for path
  const pathPolyline = navigationPath
    ? generatePolyline(
        navigationPath.startLat,
        navigationPath.startLon,
        navigationPath.endLat,
        navigationPath.endLon,
        20
      )
    : null;

  return (
    <MapContainer
      center={[userLat, userLon]}
      zoom={16}
      style={{
        height: '100%',
        width: '100%',
        borderRadius: '8px',
        border: '1px solid rgba(107, 114, 128, 0.3)',
      }}
      ref={mapRef}
    >
      {/* Map Tiles */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* User Location */}
      <Marker position={[userLat, userLon]} icon={userIcon}>
        <Popup>
          <div className="text-sm">
            <p className="font-bold">📍 Your Location</p>
            <p className="text-xs text-gray-600">
              Lat: {userLat.toFixed(4)}, Lon: {userLon.toFixed(4)}
            </p>
          </div>
        </Popup>
      </Marker>

      {/* User Location Radius Indicator */}
      <Circle
        center={[userLat, userLon]}
        radius={30}
        pathOptions={{
          color: '#4f46e5',
          fillColor: '#4f46e5',
          fillOpacity: 0.15,
          weight: 1,
          dashArray: '4',
        }}
      />

      {/* Safe Zone Markers */}
      {showAllZones && SAFE_ZONES.map((zone) => (
        <Marker
          key={zone.id}
          position={[zone.lat, zone.lon]}
          icon={createZoneIcon(zone)}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold">{zone.icon} {zone.name}</p>
              <p className="text-xs text-gray-600 mb-1">{zone.description}</p>
              <div className="text-xs space-y-1">
                <div>🌐 Network: {zone.networkQuality}</div>
                <div>🛡️ Shelter: {zone.shelterLevel}</div>
                <div>⚠️ Weather Risk: {zone.weatherRisk}</div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Navigation Path */}
      {pathPolyline && (
        <>
          <Polyline
            positions={pathPolyline}
            pathOptions={{
              color: '#3b82f6',
              weight: 3,
              opacity: 0.8,
              lineCap: 'round',
              lineJoin: 'round',
              dashArray: '5, 10',
            }}
          />

          {/* Destination Marker */}
          <Marker
            position={[navigationPath!.endLat, navigationPath!.endLon]}
            icon={new L.DivIcon({
              html: `<div style="
                background-color: #10b981;
                border: 3px solid white;
                border-radius: 50%;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.2);
              ">
                🎯
              </div>`,
              iconSize: [28, 28],
            })}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">🎯 Recommended Route</p>
                <p className="text-xs text-gray-600">{navigationPath!.recommendation}</p>
              </div>
            </Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  );
};

export default NavigationMap;
