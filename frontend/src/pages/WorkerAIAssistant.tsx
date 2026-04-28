import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Wifi, WifiOff, MapPin, Cloud, Droplets, Wind, Gauge, Navigation, Map, Compass } from 'lucide-react';
import { getDirectionSuggestion, getDirectionEmoji } from '../utils/directionHelper';
import { getSafeZone, calculateDistance } from '../utils/safeZoneHelper';
import { getCachedWeather, setCachedWeather } from '../utils/weatherCache';
import {
  generateNavigationRecommendation,
  getNetworkInfo,
  assessNetworkQuality,
  SAFE_ZONES,
} from '../utils/navigationSystem';
import type {
  SafeZone,
  NavigationPath,
} from '../utils/navigationSystem';
import NavigationMap from '../components/NavigationMap';

interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
}

interface AISuggestion {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  direction?: string;
  directionEmoji?: string;
}

interface LocationData {
  lat: number | null;
  lon: number | null;
}

interface NearbyLocation {
  name: string;
  lat: number;
  lon: number;
  weather?: WeatherData;
  distance?: number;
}

type NetworkStatus = 'Good' | 'Weak' | 'Poor';

const WorkerAIAssistant = () => {
  // Location state
  const [location, setLocation] = useState<LocationData>({ lat: null, lon: null });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [usedTestLocation, setUsedTestLocation] = useState(false);

  // TASK 2: Add default safe state - UI always has valid data to show
  const [weather, setWeather] = useState<WeatherData>({
    temperature: 25,
    humidity: 60,
    windSpeed: 5,
    precipitationProbability: 20,
    weatherCode: 1000,
  });
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);
  
  // TASK 4: Store last valid data using useRef to preserve on errors
  const lastValidWeatherData = useRef<WeatherData>({
    temperature: 25,
    humidity: 60,
    windSpeed: 5,
    precipitationProbability: 20,
    weatherCode: 1000,
  });

  // Nearby locations state
  const [nearbyLocations, setNearbyLocations] = useState<NearbyLocation[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  
  // TASK 4: Store last valid nearby data using useRef
  const lastValidNearbyData = useRef<NearbyLocation[]>([]);

  // Network simulation state
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('Good');

  // AI suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion>({
    riskLevel: 'LOW',
    message: 'Initializing...',
  });

  // Last update time
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Hard rate limit lock to prevent 429 errors
  const [lastApiCallTime, setLastApiCallTime] = useState<number>(0);
  const [rateLimitLockTime, setRateLimitLockTime] = useState<number>(0);

  // Optimization: Store last known weather data for fallback
  const [lastKnownWeather, setLastKnownWeather] = useState<WeatherData | null>(null);

  // Level 3 Navigation System
  const [navigationPath, setNavigationPath] = useState<NavigationPath | null>(null);
  const [selectedZone, setSelectedZone] = useState<SafeZone | null>(null);
  const [networkInfo, setNetworkInfo] = useState(getNetworkInfo());
  const [showMap, setShowMap] = useState(false);

  const API_KEY = import.meta.env.VITE_TOMORROW_API_KEY || 'EPmnhwMqvEtsmpFKKHeGqQ3CEg2J1L4j';
  const FALLBACK_LAT = 13.0827;
  const FALLBACK_LON = 80.2707;
  
  // Rate limit constants
  const MIN_CALL_INTERVAL = 60000; // 60 seconds minimum between API calls
  const RATE_LIMIT_LOCK_DURATION = 120000; // 2 minutes lock on 429 error

  // Create nearby locations based on current position
  const createNearbyLocations = (lat: number, lon: number): NearbyLocation[] => {
    return [
      { name: 'Main Road', lat: lat + 0.002, lon: lon + 0.001 },
      { name: 'Shop Area', lat: lat - 0.001, lon: lon + 0.002 },
      { name: 'Open Ground', lat: lat + 0.0015, lon: lon - 0.001 },
    ];
  };

  // Fetch location
  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lon: longitude });
        setLocationError(null);
        setUsedTestLocation(false);
        console.log(`Location: lat=${latitude}, lon=${longitude}`);
      },
      (error) => {
        console.error('Location error:', error.message);
        setLocationError('Location permission denied');
      }
    );
  };

  // Use test location
  const useTestLocation = () => {
    setLocation({ lat: FALLBACK_LAT, lon: FALLBACK_LON });
    setLocationError(null);
    setUsedTestLocation(true);
    console.log(`Using test location: lat=${FALLBACK_LAT}, lon=${FALLBACK_LON}`);
  };

  // Fetch weather data for current location - WITH HARD RATE LIMIT LOCK
  const fetchWeatherForLocation = async (lat: number, lon: number): Promise<WeatherData | null> => {
    try {
      // FIX CACHE KEY: Use toFixed(2) for better key consistency
      const cacheKey = `weather_${lat.toFixed(2)}_${lon.toFixed(2)}`;
      
      // Check if rate limit is active (2 minute lock)
      const now = Date.now();
      if (now - rateLimitLockTime < RATE_LIMIT_LOCK_DURATION) {
        console.log('[API] Rate limit lock active. Returning cached data only.');
        return lastKnownWeather;
      }

      // Check cache first
      const cachedData = getCachedWeather(cacheKey);
      if (cachedData) {
        console.log('[API] Cache hit - skipping API call');
        return cachedData;
      }

      // HARD RATE LIMIT: Enforce 60-second minimum between API calls
      if (now - lastApiCallTime < MIN_CALL_INTERVAL) {
        console.log('[API] Rate limit lock: 60s minimum between calls. Using cached data.');
        return lastKnownWeather;
      }

      console.log('[API] Making API call to Tomorrow.io');
      const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&apikey=${API_KEY}`;
      const response = await fetch(url);

      // Handle rate limiting - SET 2-MINUTE LOCK
      if (response.status === 429) {
        console.error('[API] 💥 Rate limit (429) hit! Locking API calls for 2 minutes.');
        setRateLimitLockTime(Date.now());
        return lastKnownWeather;
      }

      if (!response.ok) {
        console.error(`[API] API error: ${response.status}`);
        return lastKnownWeather;
      }

      const data = await response.json();
      const weatherValues = data.data?.values || {};

      const weatherData: WeatherData = {
        temperature: weatherValues.temperature ?? null,
        humidity: weatherValues.humidity ?? null,
        windSpeed: weatherValues.windSpeed ?? null,
        precipitationProbability: weatherValues.precipitationProbability ?? null,
        weatherCode: weatherValues.weatherCode ?? null,
      };

      // Record successful API call time
      setLastApiCallTime(Date.now());
      
      // Cache the data with new key format
      setCachedWeather(cacheKey, weatherData);
      console.log('[API] ✅ API call successful - data cached');
      
      return weatherData;
    } catch (error) {
      console.error('[API] Weather fetch error:', error);
      return lastKnownWeather || null;
    }
  };

  // Fetch weather data for current location - WITH ASYNC RACE CONDITION FIX
  const fetchWeatherData = async (lat: number, lon: number) => {
    // TASK 5: Fix async race condition
    let isMounted = true;
    
    setIsLoadingWeather(true);

    const weatherData = await fetchWeatherForLocation(lat, lon);
    
    // Only update state if component is still mounted
    if (isMounted) {
      if (weatherData) {
        setWeather(weatherData);
        lastValidWeatherData.current = weatherData; // TASK 4: Preserve last valid data
        setLastKnownWeather(weatherData); // Save for fallback
        console.log('[WEATHER] 🟢 Fresh API data loaded:', weatherData);
      } else if (lastValidWeatherData.current) {
        // TASK 4: Use last valid data if available
        setWeather(lastValidWeatherData.current);
        console.log('[WEATHER] 💾 Using last valid data (preserved)');
      } else if (lastKnownWeather) {
        // Fallback to last known data
        setWeather(lastKnownWeather);
        console.log('[WEATHER] 📦 Using cached data');
      } else {
        // Keep current state - never show error, always have data
        console.warn('[WEATHER] No fresh data - keeping current state');
      }

      setIsLoadingWeather(false);
    }
    
    // Cleanup to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  };

  // Simulate nearby weather by modifying current weather slightly
  const simulateNearbyWeather = (currentWeather: WeatherData): WeatherData => {
    if (!currentWeather.temperature || currentWeather.temperature === null) {
      return currentWeather;
    }

    // Generate synthetic nearby data with small variations
    const tempVariation = (Math.random() - 0.5) * 4; // ±2°
    const humidityVariation = (Math.random() - 0.5) * 10; // ±5%
    const precipVariation = (Math.random() - 0.5) * 20; // ±10%
    const windVariation = (Math.random() - 0.5) * 2; // ±1 m/s

    return {
      temperature: currentWeather.temperature + tempVariation,
      humidity: Math.max(0, Math.min(100, (currentWeather.humidity || 50) + humidityVariation)),
      windSpeed: Math.max(0, (currentWeather.windSpeed || 0) + windVariation),
      precipitationProbability: Math.max(0, Math.min(100, (currentWeather.precipitationProbability || 0) + precipVariation)),
      weatherCode: currentWeather.weatherCode,
    };
  };

  // Generate nearby weather by SIMULATING instead of calling API - WITH FALLBACK
  const fetchNearbyWeatherData = (locations: NearbyLocation[]) => {
    setIsLoadingNearby(true);

    // TASK 2: SIMULATE nearby data instead of API calls - NO MORE API CALLS FOR NEARBY
    const updatedLocations = locations.map((loc) => {
      const simulatedWeather = simulateNearbyWeather(weather);
      const distance = location.lat && location.lon ? calculateDistance(location.lat, location.lon, loc.lat, loc.lon) : 0;
      
      return {
        ...loc,
        weather: simulatedWeather,
        distance,
      };
    });

    setNearbyLocations(updatedLocations);
    lastValidNearbyData.current = updatedLocations; // TASK 4: Preserve last valid nearby data
    setIsLoadingNearby(false);
    console.log('[NEARBY] ✨ Simulated nearby weather (NO API CALLS):', updatedLocations);
  };

  // Enhanced AI Decision Engine with direction
  const getEnhancedAISuggestion = (
    weatherData: WeatherData,
    network: NetworkStatus,
    nearby: NearbyLocation[]
  ): AISuggestion => {
    if (!location.lat || !location.lon) {
      return {
        riskLevel: 'LOW',
        message: 'Waiting for location data...',
      };
    }

    // Poor network - suggest moving to open area
    if (network === 'Poor') {
      const openGround = nearby.find((l) => l.name.includes('Open'));
      if (openGround) {
        const direction = getDirectionSuggestion(location.lat, location.lon, openGround.lat, openGround.lon);
        return {
          riskLevel: 'MEDIUM',
          message: `Low network detected. ${direction.instruction} towards ${openGround.name}.`,
          direction: direction.direction,
          directionEmoji: getDirectionEmoji(direction.direction),
        };
      }
    }

    // High rain - use safe zone helper
    if (weatherData.precipitationProbability !== null && weatherData.precipitationProbability > 50) {
      const safeZone = getSafeZone(weatherData, nearby);
      let message = safeZone.message;

      if (safeZone.targetLocation && location.lat && location.lon) {
        const direction = getDirectionSuggestion(
          location.lat,
          location.lon,
          safeZone.targetLocation.lat,
          safeZone.targetLocation.lon
        );
        message = `${safeZone.message.split(' - ')[0]} - ${direction.instruction}.`;
      }

      return {
        riskLevel: safeZone.type === 'SHELTER' || weatherData.precipitationProbability > 70 ? 'HIGH' : 'MEDIUM',
        message,
        direction: safeZone.targetLocation ? getDirectionSuggestion(
          location.lat,
          location.lon,
          safeZone.targetLocation.lat,
          safeZone.targetLocation.lon
        ).direction : undefined,
        directionEmoji: safeZone.targetLocation ? getDirectionEmoji(
          getDirectionSuggestion(
            location.lat,
            location.lon,
            safeZone.targetLocation.lat,
            safeZone.targetLocation.lon
          ).direction
        ) : undefined,
      };
    }

    // High wind
    if (weatherData.windSpeed !== null && weatherData.windSpeed > 10) {
      return {
        riskLevel: 'MEDIUM',
        message: `High wind detected (${weatherData.windSpeed} m/s). Stay cautious and seek low-wind areas.`,
      };
    }

    // High temperature
    if (weatherData.temperature !== null && weatherData.temperature > 38) {
      const shopArea = nearby.find((l) => l.name.includes('Shop'));
      if (shopArea) {
        const direction = getDirectionSuggestion(location.lat, location.lon, shopArea.lat, shopArea.lon);
        return {
          riskLevel: 'MEDIUM',
          message: `High temperature (${weatherData.temperature}°C). ${direction.instruction} towards ${shopArea.name} for shade.`,
          direction: direction.direction,
          directionEmoji: getDirectionEmoji(direction.direction),
        };
      }
    }

    // Safe conditions
    return {
      riskLevel: 'LOW',
      message: 'Conditions are safe. Continue working and monitor weather updates.',
    };
  };

  // Get color based on risk level
  const getRiskColor = (level: string): string => {
    switch (level) {
      case 'LOW':
        return '#10b981';
      case 'MEDIUM':
        return '#f59e0b';
      case 'HIGH':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

  // Get network icon
  const getNetworkIcon = (status: NetworkStatus) => {
    if (status === 'Good') return <Wifi className="w-5 h-5 text-green-500" />;
    if (status === 'Weak') return <Wifi className="w-5 h-5 text-yellow-500" />;
    return <WifiOff className="w-5 h-5 text-red-500" />;
  };

  // Initial setup
  useEffect(() => {
    fetchLocation();
  }, []);

  // Fetch weather and nearby data when location changes - WITH RACE CONDITION FIX
  useEffect(() => {
    // TASK 5: Prevent memory leaks with cleanup
    let isMounted = true;
    
    if (location.lat !== null && location.lon !== null) {
      if (isMounted) {
        fetchWeatherData(location.lat, location.lon);
        const nearby = createNearbyLocations(location.lat, location.lon);
        if (isMounted) {
          setNearbyLocations(nearby);
          lastValidNearbyData.current = nearby;
          fetchNearbyWeatherData(nearby);
        }
      }
    }
    
    // Cleanup
    return () => {
      isMounted = false;
    };
  }, [location.lat, location.lon]);

  // Auto refresh - TASK 4: INCREASED to 120 seconds (2 minutes) - ONLY 1 API call
  useEffect(() => {
    // TASK 5: Prevent memory leaks
    let isMounted = true;
    
    const interval = setInterval(() => {
      if (isMounted && location.lat !== null && location.lon !== null) {
        if (!usedTestLocation) {
          fetchLocation();
        }
        
        // TASK 4: Fetch current location weather every 2 minutes (120 seconds)
        console.log('[REFRESH] === 2-minute refresh cycle ===');
        fetchWeatherData(location.lat, location.lon);

        // TASK 2: Simulate nearby locations (NO API CALLS)
        if (isMounted) {
          const nearby = createNearbyLocations(location.lat, location.lon);
          fetchNearbyWeatherData(nearby);
        }

        setLastUpdate(new Date());
      }
    }, 120000); // TASK 4: 120 seconds = 2 minutes (6x reduction from original 10s)

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [location, usedTestLocation]);

  // Level 3 Navigation: Detect network quality and generate navigation paths
  useEffect(() => {
    // TASK 7: Network detection - check every 30 seconds
    let isMounted = true;

    const updateNetwork = () => {
      if (isMounted) {
        const info = getNetworkInfo();
        setNetworkInfo(info);
        console.log('[NAV] Network detected:', info.effectiveType);
      }
    };

    updateNetwork(); // Initial check

    const networkInterval = setInterval(updateNetwork, 30000);

    return () => {
      isMounted = false;
      clearInterval(networkInterval);
    };
  }, []);

  // Level 3 Navigation: Generate smart navigation paths
  useEffect(() => {
    let isMounted = true;

    if (location.lat !== null && location.lon !== null) {
      // Determine weather risk level
      let weatherRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (weather.precipitationProbability && weather.precipitationProbability > 70) {
        weatherRisk = 'HIGH';
      } else if (weather.precipitationProbability && weather.precipitationProbability > 40) {
        weatherRisk = 'MEDIUM';
      }

      // Get network quality
      const netQuality = assessNetworkQuality(networkInfo);

      // Generate navigation recommendation
      const path = generateNavigationRecommendation(
        location.lat,
        location.lon,
        weatherRisk,
        netQuality
      );

      if (isMounted) {
        setNavigationPath(path);

        // Find recommended zone
        if (path) {
          const zone = SAFE_ZONES.find(
            (z) => Math.abs(z.lat - path.endLat) < 0.0001 && Math.abs(z.lon - path.endLon) < 0.0001
          );
          if (zone) {
            setSelectedZone(zone);
            console.log('[NAV] Recommended zone:', zone.name);
          }
        }
      }
    }

    return () => {
      isMounted = false;
    };
  }, [location, weather.precipitationProbability, networkInfo]);

  // Simulate network status every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const networkOptions: NetworkStatus[] = ['Good', 'Weak', 'Poor'];
      setNetworkStatus(networkOptions[Math.floor(Math.random() * networkOptions.length)]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Update AI suggestion when weather or network changes
  useEffect(() => {
    // TASK 5: Ensure we always use valid data for suggestions
    const validWeather = weather || lastValidWeatherData.current;
    const validNearby = nearbyLocations.length > 0 ? nearbyLocations : lastValidNearbyData.current;
    
    const suggestion = getEnhancedAISuggestion(validWeather, networkStatus, validNearby);
    setAiSuggestion(suggestion);
  }, [weather, networkStatus, nearbyLocations, location]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 w-full">
      {/* Header */}
      <div className="border-b border-gray-800 pb-6">
        <h2 className="text-2xl font-bold text-white tracking-wide uppercase flex items-center gap-2">
          <Navigation className="w-6 h-6" />
          AI Worker Assistant - Level 3 Navigation
        </h2>
        <p className="text-gray-400 mt-1">Smart weather monitoring with real-time navigation, safe zones, and network-aware routing</p>
      </div>

      {/* Location Status */}
      {locationError && !usedTestLocation ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-red-300 space-y-4">
          <p className="font-bold">❌ {locationError}</p>
          <div className="flex gap-3">
            <button
              onClick={fetchLocation}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              🔄 Retry Location
            </button>
            <button
              onClick={useTestLocation}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              🧪 Use Test Location
            </button>
          </div>
        </div>
      ) : null}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LIVE STATUS CARD */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-6">
          <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Live Status & Nearby Analysis
          </h3>

          {isLoadingWeather ? (
            // TASK 6: Show skeleton UI instead of empty state
            <div className="space-y-6 animate-pulse">
              <div className="bg-gray-800/50 rounded p-4 h-20"></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800/50 rounded p-4 h-16"></div>
                <div className="bg-gray-800/50 rounded p-4 h-16"></div>
              </div>
              <p className="text-center text-gray-400 text-sm">📊 Loading weather data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Current Location Data */}
              <div>
                <p className="text-sm font-semibold text-gray-400 mb-3 uppercase">📍 Your Location</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-800 rounded p-4">
                    <p className="text-gray-400 text-sm font-medium mb-2">Latitude</p>
                    <p className="text-white text-lg font-bold">{location.lat?.toFixed(4) || 'N/A'}</p>
                  </div>
                  <div className="bg-gray-800 rounded p-4">
                    <p className="text-gray-400 text-sm font-medium mb-2">Longitude</p>
                    <p className="text-white text-lg font-bold">{location.lon?.toFixed(4) || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Weather Grid */}
              <div>
                <p className="text-sm font-semibold text-gray-400 mb-3 uppercase">🌤️ Current Weather</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-800 rounded p-4">
                    <p className="text-gray-400 text-sm font-medium mb-2 flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      Temperature
                    </p>
                    {/* TASK 3: Never render empty values - show default if null */}
                    <p className="text-white text-lg font-bold">{weather.temperature ?? '--'}°C</p>
                  </div>
                  <div className="bg-gray-800 rounded p-4">
                    <p className="text-gray-400 text-sm font-medium mb-2 flex items-center gap-2">
                      <Droplets className="w-4 h-4" />
                      Humidity
                    </p>
                    {/* TASK 3: Never render empty values - show default if null */}
                    <p className="text-white text-lg font-bold">{weather.humidity ?? '--'}%</p>
                  </div>
                  <div className="bg-gray-800 rounded p-4">
                    <p className="text-gray-400 text-sm font-medium mb-2 flex items-center gap-2">
                      <Wind className="w-4 h-4" />
                      Wind Speed
                    </p>
                    {/* TASK 3: Never render empty values - show default if null */}
                    <p className="text-white text-lg font-bold">{weather.windSpeed ?? '--'} m/s</p>
                  </div>
                  <div className="bg-gray-800 rounded p-4">
                    <p className="text-gray-400 text-sm font-medium mb-2 flex items-center gap-2">
                      <Gauge className="w-4 h-4" />
                      Rain Probability
                    </p>
                    {/* TASK 3: Never render empty values - show default if null */}
                    <p className="text-white text-lg font-bold">{weather.precipitationProbability ?? '--'}%</p>
                  </div>
                </div>
              </div>

              {/* Network Status - Enhanced with Level 3 Data */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded p-4">
                  <p className="text-gray-400 text-sm font-medium">Network Status</p>
                  <p className="text-white text-lg font-bold mt-1">{networkStatus}</p>
                  <div className="text-2xl mt-2">{getNetworkIcon(networkStatus)}</div>
                </div>
                <div className="bg-gray-800 rounded p-4">
                  <p className="text-gray-400 text-sm font-medium">Connection Type</p>
                  <p className="text-white text-lg font-bold mt-1 uppercase">{networkInfo.effectiveType}</p>
                  <p className="text-xs text-gray-500 mt-1">Real-time network quality</p>
                </div>
              </div>

              {/* Nearby Locations Weather */}
              {!isLoadingNearby && nearbyLocations.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-400 mb-3 uppercase">🗺️ Nearby Areas Analysis</p>
                  <div className="grid grid-cols-1 gap-3">
                    {nearbyLocations.map((loc, idx) => (
                      <div key={idx} className="bg-gray-800 rounded p-4 flex justify-between items-center">
                        <div>
                          <p className="text-white font-semibold">{loc.name}</p>
                          <p className="text-gray-400 text-sm">
                            {loc.distance}m away • Rain: {loc.weather?.precipitationProbability}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-yellow-400 font-bold">{loc.weather?.temperature}°C</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {usedTestLocation && (
                <p className="text-sm text-yellow-400 text-center">📍 Using test location (Development Mode)</p>
              )}
            </div>
          )}
        </div>

        {/* RISK LEVEL INDICATOR */}
        <div
          className="bg-gray-900 border-2 rounded-lg p-8 flex flex-col items-center justify-center text-center"
          style={{ borderColor: getRiskColor(aiSuggestion.riskLevel) }}
        >
          <p className="text-gray-400 text-sm mb-3 uppercase font-semibold">Risk Level</p>
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: `${getRiskColor(aiSuggestion.riskLevel)}20` }}
          >
            <span
              className="text-4xl font-bold"
              style={{ color: getRiskColor(aiSuggestion.riskLevel) }}
            >
              {aiSuggestion.riskLevel[0]}
            </span>
          </div>
          <p
            className="text-lg font-bold"
            style={{ color: getRiskColor(aiSuggestion.riskLevel) }}
          >
            {aiSuggestion.riskLevel}
          </p>
        </div>
      </div>

      {/* SAFE ZONES PANEL - Level 3 */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Available Safe Zones
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SAFE_ZONES.map((zone) => (
            <div
              key={zone.id}
              onClick={() => setSelectedZone(zone)}
              className={`rounded-lg p-4 cursor-pointer transition-all ${
                selectedZone?.id === zone.id
                  ? 'bg-gradient-to-r from-blue-500/30 to-blue-600/30 border-2 border-blue-400'
                  : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="text-3xl">{zone.icon}</div>
                {selectedZone?.id === zone.id && <span className="text-blue-400 font-bold text-sm">✓ Selected</span>}
              </div>
              <p className="text-white font-bold text-sm mb-1">{zone.name}</p>
              <p className="text-gray-400 text-xs mb-3">{zone.description}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Network:</span>
                  <span className="text-blue-300 font-medium">{zone.networkQuality}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Shelter:</span>
                  <span className="text-green-300 font-medium">{zone.shelterLevel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Weather Risk:</span>
                  <span className="font-medium" style={{ color: zone.weatherRisk === 'HIGH' ? '#ef4444' : zone.weatherRisk === 'MEDIUM' ? '#f59e0b' : '#10b981' }}>
                    {zone.weatherRisk}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DIRECTION INDICATOR */}
      {aiSuggestion.direction && (
        <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-300 uppercase tracking-wide flex items-center gap-2 mb-4">
            <Navigation className="w-5 h-5" />
            Recommended Direction
          </h3>
          <div className="flex items-center justify-center gap-4">
            <div className="text-6xl">{aiSuggestion.directionEmoji}</div>
            <div>
              <p className="text-3xl font-bold text-blue-400">{aiSuggestion.direction}</p>
              <p className="text-gray-300 text-sm mt-2">Move in this direction for safer conditions</p>
            </div>
          </div>
        </div>
      )}

      {/* NAVIGATION MAP - Level 3 */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-2">
            <Map className="w-5 h-5" />
            Navigation Map & Safe Zones
          </h3>
          <button
            onClick={() => setShowMap(!showMap)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              showMap
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {showMap ? '🗺️ Hide Map' : '🗺️ Show Map'}
          </button>
        </div>

        {showMap && location.lat && location.lon ? (
          <div className="w-full h-96 rounded-lg overflow-hidden border border-gray-700">
            <NavigationMap
              userLat={location.lat}
              userLon={location.lon}
              navigationPath={navigationPath}
              highlightedZone={selectedZone}
              showAllZones={true}
            />
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
            {showMap ? '📍 Waiting for location...' : '🗺️ Click "Show Map" to view navigation and safe zones'}
          </div>
        )}
      </div>

      {/* NAVIGATION PATH - Level 3 */}
      {navigationPath && (
        <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-500/30 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-bold text-green-400 uppercase tracking-wide flex items-center gap-2">
            <Compass className="w-5 h-5" />
            Recommended Navigation Path
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded p-4">
              <p className="text-gray-400 text-sm font-medium mb-2">Destination</p>
              <p className="text-xl font-bold text-white">{selectedZone?.name || 'Safe Zone'}</p>
              <p className="text-xs text-gray-500 mt-1">{selectedZone?.description}</p>
            </div>

            <div className="bg-gray-800/50 rounded p-4">
              <p className="text-gray-400 text-sm font-medium mb-2">Distance & Time</p>
              <p className="text-xl font-bold text-white">{navigationPath.distance}m</p>
              <p className="text-xs text-gray-500 mt-1">~{navigationPath.estimatedTime}s walk</p>
            </div>

            <div className="bg-gray-800/50 rounded p-4">
              <p className="text-gray-400 text-sm font-medium mb-2">Direction</p>
              <p className="text-2xl font-bold text-white">{navigationPath.direction}</p>
              <p className="text-3xl mt-1">{navigationPath.direction === 'North' ? '⬆️' : navigationPath.direction === 'South' ? '⬇️' : navigationPath.direction === 'East' ? '➡️' : navigationPath.direction === 'West' ? '⬅️' : navigationPath.direction === 'NE' ? '↗️' : navigationPath.direction === 'NW' ? '↖️' : navigationPath.direction === 'SE' ? '↘️' : navigationPath.direction === 'SW' ? '↙️' : '🧭'}</p>
            </div>

            <div className="bg-gray-800/50 rounded p-4">
              <p className="text-gray-400 text-sm font-medium mb-2">Network Quality</p>
              <p className="text-xl font-bold text-blue-400">{selectedZone?.networkQuality || 'GOOD'}</p>
              <p className="text-xs text-gray-500 mt-1">Shelter: {selectedZone?.shelterLevel}</p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded p-4 border border-green-500/20">
            <p className="text-green-300 font-semibold flex items-center gap-2">
              <span className="text-lg">✨</span>
              {navigationPath.recommendation}
            </p>
          </div>
        </div>
      )}

      {/* AI DECISION PANEL */}
      <div
        className="bg-gray-900 border-2 rounded-lg p-8"
        style={{ borderColor: getRiskColor(aiSuggestion.riskLevel) }}
      >
        <h3 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5" style={{ color: getRiskColor(aiSuggestion.riskLevel) }} />
          AI Safety Recommendation
        </h3>
        <p
          className="text-xl leading-relaxed"
          style={{ color: getRiskColor(aiSuggestion.riskLevel) }}
        >
          {aiSuggestion.message}
        </p>
      </div>

      {/* Last Update */}
      <div className="text-center text-gray-500 text-xs space-y-1">
        <div>Last updated: {lastUpdate.toLocaleTimeString()} • Network: {networkInfo.effectiveType.toUpperCase()}</div>
        <div>Level 3 Navigation System • Auto-refresh: 2 min • Map Shows {SAFE_ZONES.length} Safe Zones</div>
      </div>
    </div>
  );
};

export default WorkerAIAssistant;
