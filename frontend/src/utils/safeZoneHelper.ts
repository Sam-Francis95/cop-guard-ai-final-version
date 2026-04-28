/**
 * Safe Zone Helper Utility
 * Analyzes nearby weather and recommends safe zones
 */

interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  precipitationProbability: number | null;
}

interface NearbyLocation {
  name: string;
  lat: number;
  lon: number;
  weather?: WeatherData;
  distance?: number;
}

interface SafeZoneResult {
  type: 'MOVE' | 'STAY' | 'SHELTER';
  message: string;
  targetLocation?: NearbyLocation;
  riskAnalysis: {
    currentRain: number | null;
    nearbyRain: number | null;
    riskDifference: number;
  };
}

export const getSafeZone = (
  currentWeather: WeatherData,
  nearbyLocations: NearbyLocation[]
): SafeZoneResult => {
  const currentRain = currentWeather.precipitationProbability || 0;
  const currentTemp = currentWeather.temperature || 0;

  // Analyze nearby locations
  const saferLocations = nearbyLocations.filter((loc) => {
    const locRain = loc.weather?.precipitationProbability || 0;
    return locRain < currentRain - 5; // At least 5% safer
  });

  const riskAnalysis = {
    currentRain,
    nearbyRain: nearbyLocations.length > 0 
      ? Math.min(...nearbyLocations.map((l) => l.weather?.precipitationProbability || 0))
      : currentRain,
    riskDifference: currentRain - (nearbyLocations.length > 0 
      ? Math.min(...nearbyLocations.map((l) => l.weather?.precipitationProbability || 0))
      : currentRain),
  };

  // Decision logic
  if (currentRain > 70) {
    // High rain - need shelter
    if (saferLocations.length > 0) {
      const bestLocation = saferLocations.reduce((prev, current) =>
        ((prev.weather?.precipitationProbability || 0) > (current.weather?.precipitationProbability || 0))
          ? current
          : prev
      );
      return {
        type: 'MOVE',
        message: `Heavy rain detected. Move to ${bestLocation.name} (${bestLocation.distance}m away) - Rain probability: ${bestLocation.weather?.precipitationProbability}%`,
        targetLocation: bestLocation,
        riskAnalysis,
      };
    }
    return {
      type: 'SHELTER',
      message: 'Heavy rain detected. All nearby areas affected. Find nearby shelter immediately.',
      riskAnalysis,
    };
  }

  if (currentRain > 50) {
    // Moderate rain - suggest moving if safer zone exists
    if (saferLocations.length > 0) {
      const bestLocation = saferLocations[0];
      return {
        type: 'MOVE',
        message: `Rain detected. Move to ${bestLocation.name} for safer conditions - Risk reduction: ${riskAnalysis.riskDifference}%`,
        targetLocation: bestLocation,
        riskAnalysis,
      };
    }
    return {
      type: 'STAY',
      message: 'Moderate rain across area. Stay alert and monitor conditions.',
      riskAnalysis,
    };
  }

  // Extreme heat
  if (currentTemp > 38) {
    const shadedLoc = nearbyLocations.find((l) => l.name.includes('Shop') || l.name.includes('Building'));
    if (shadedLoc) {
      return {
        type: 'MOVE',
        message: `High temperature (${currentTemp}°C). Move to ${shadedLoc.name} for shade and cooling.`,
        targetLocation: shadedLoc,
        riskAnalysis,
      };
    }
  }

  // Safe conditions
  return {
    type: 'STAY',
    message: 'Area is relatively safe. Continue monitoring weather.',
    riskAnalysis,
  };
};

// Calculate distance between two coordinates (in meters)
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1000); // Convert to meters
};
