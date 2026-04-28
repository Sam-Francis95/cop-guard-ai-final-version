/**
 * Navigation System Level 3
 * Combines geospatial data with AI logic for smart navigation
 */

import { calculateDistance } from './safeZoneHelper';

export interface SafeZone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: 'NETWORK' | 'SHELTER' | 'RISKY' | 'SAFE';
  networkQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  shelterLevel: 'NONE' | 'PARTIAL' | 'FULL';
  weatherRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  icon: string;
  description: string;
}

export interface NavigationPath {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  distance: number; // meters
  bearing: number; // degrees (0-360)
  direction: string; // N, NE, E, etc.
  estimatedTime: number; // seconds
  recommendation: string;
}

export interface NetworkInfo {
  type: string;
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
  downlink: number;
  rtt: number;
  saveData: boolean;
}

/**
 * Define safe zones for the area
 */
export const SAFE_ZONES: SafeZone[] = [
  {
    id: 'main-road',
    name: 'Main Road',
    lat: 13.0847,
    lon: 80.2717,
    type: 'NETWORK',
    networkQuality: 'EXCELLENT',
    shelterLevel: 'PARTIAL',
    weatherRisk: 'LOW',
    icon: '📶',
    description: 'Good network connectivity, open area',
  },
  {
    id: 'shop-area',
    name: 'Shop Area',
    lat: 13.0826,
    lon: 80.2747,
    type: 'SHELTER',
    networkQuality: 'GOOD',
    shelterLevel: 'FULL',
    weatherRisk: 'LOW',
    icon: '🏪',
    description: 'Full shelter, good network, safe from weather',
  },
  {
    id: 'open-ground',
    name: 'Open Ground',
    lat: 13.0842,
    lon: 80.2697,
    type: 'RISKY',
    networkQuality: 'FAIR',
    shelterLevel: 'NONE',
    weatherRisk: 'HIGH',
    icon: '⚠️',
    description: 'No shelter, exposed to weather',
  },
];

/**
 * Calculate bearing between two points (in degrees)
 */
export const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2 * (Math.PI / 180));
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos(dLon);
  let bearing = Math.atan2(y, x) * (180 / Math.PI);
  bearing = (bearing + 360) % 360; // Normalize to 0-360
  return bearing;
};

/**
 * Convert bearing to compass direction
 */
export const bearingToDirection = (bearing: number): string => {
  const directions = ['North', 'NE', 'East', 'SE', 'South', 'SW', 'West', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
};

/**
 * Get bearing emoji
 */
export const getBearingEmoji = (bearing: number): string => {
  const emojis = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
  const index = Math.round(bearing / 45) % 8;
  return emojis[index];
};

/**
 * Create navigation path
 */
export const createNavigationPath = (
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  zoneName: string
): NavigationPath => {
  const distance = calculateDistance(startLat, startLon, endLat, endLon);
  const bearing = calculateBearing(startLat, startLon, endLat, endLon);
  const direction = bearingToDirection(bearing);
  const estimatedTime = Math.ceil(distance / 1.4); // Assume 1.4 m/s walking speed

  return {
    startLat,
    startLon,
    endLat,
    endLon,
    distance: Math.round(distance),
    bearing: Math.round(bearing),
    direction,
    estimatedTime,
    recommendation: `Move ${Math.round(distance)}m towards ${zoneName} (${estimatedTime}s walk)`,
  };
};

/**
 * Get network information
 */
export const getNetworkInfo = (): NetworkInfo => {
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  if (!connection) {
    return {
      type: 'unknown',
      effectiveType: 'unknown',
      downlink: 0,
      rtt: 0,
      saveData: false,
    };
  }

  return {
    type: connection.type || 'unknown',
    effectiveType: connection.effectiveType || 'unknown',
    downlink: connection.downlink || 0,
    rtt: connection.rtt || 0,
    saveData: connection.saveData || false,
  };
};

/**
 * Determine network quality from info
 */
export const assessNetworkQuality = (info: NetworkInfo): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' => {
  switch (info.effectiveType) {
    case '4g':
      return 'EXCELLENT';
    case '3g':
      return 'GOOD';
    case '2g':
      return 'FAIR';
    case 'slow-2g':
      return 'POOR';
    default:
      return 'GOOD';
  }
};

/**
 * Find best safe zone based on criteria
 */
export const findBestSafeZone = (
  currentLat: number,
  currentLon: number,
  weatherRisk: 'LOW' | 'MEDIUM' | 'HIGH',
  networkNeeded: boolean = true
): SafeZone | null => {
  // Filter zones by criteria
  const candidateZones = SAFE_ZONES.filter((zone) => {
    // Weather risk matching
    if (weatherRisk === 'HIGH' && zone.shelterLevel === 'NONE') {
      return false; // Skip open areas in high risk
    }

    // Network requirement
    if (networkNeeded && zone.networkQuality === 'POOR') {
      return false; // Skip poor network zones if network needed
    }

    return true;
  });

  if (candidateZones.length === 0) {
    return SAFE_ZONES[0]; // Fallback to first zone
  }

  // Find closest zone
  let closestZone = candidateZones[0];
  let minDistance = calculateDistance(
    currentLat,
    currentLon,
    closestZone.lat,
    closestZone.lon
  );

  for (let i = 1; i < candidateZones.length; i++) {
    const zone = candidateZones[i];
    const distance = calculateDistance(currentLat, currentLon, zone.lat, zone.lon);

    if (distance < minDistance) {
      minDistance = distance;
      closestZone = zone;
    }
  }

  return closestZone;
};

/**
 * Generate smart navigation recommendation
 */
export const generateNavigationRecommendation = (
  currentLat: number,
  currentLon: number,
  weatherRisk: 'LOW' | 'MEDIUM' | 'HIGH',
  networkQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
): NavigationPath | null => {
  const needsNetwork = networkQuality === 'FAIR' || networkQuality === 'POOR';
  const bestZone = findBestSafeZone(currentLat, currentLon, weatherRisk, needsNetwork);

  if (!bestZone) {
    return null;
  }

  return createNavigationPath(currentLat, currentLon, bestZone.lat, bestZone.lon, bestZone.name);
};

/**
 * Get zone icon and color for map markers
 */
export const getZoneStyle = (
  zone: SafeZone
): { icon: string; color: string; priority: number } => {
  switch (zone.type) {
    case 'NETWORK':
      return { icon: '📶', color: '#3b82f6', priority: 2 };
    case 'SHELTER':
      return { icon: '🏪', color: '#10b981', priority: 1 };
    case 'RISKY':
      return { icon: '⚠️', color: '#ef4444', priority: 3 };
    case 'SAFE':
      return { icon: '✅', color: '#8b5cf6', priority: 1 };
    default:
      return { icon: '📍', color: '#6b7280', priority: 2 };
  }
};

/**
 * Calculate route polyline coordinates for path animation
 */
export const generatePolyline = (
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  segments: number = 10
): Array<[number, number]> => {
  const points: Array<[number, number]> = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = startLat + (endLat - startLat) * t;
    const lon = startLon + (endLon - startLon) * t;
    points.push([lat, lon]);
  }

  return points;
};
