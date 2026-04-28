/**
 * Weather Cache Utility
 * Reduces API calls by caching weather data with TTL
 */

interface CacheEntry {
  data: any;
  timestamp: number;
}

interface WeatherCache {
  [key: string]: CacheEntry;
}

const cache: WeatherCache = {};
const CACHE_TTL = 60000; // 60 seconds

/**
 * Get cached weather data if still valid
 */
export const getCachedWeather = (key: string): any | null => {
  if (!cache[key]) {
    console.log(`[CACHE] Cache miss for key: ${key}`);
    return null;
  }

  const age = Date.now() - cache[key].timestamp;
  const isValid = age < CACHE_TTL;

  if (isValid) {
    console.log(`[CACHE] Cache hit for key: ${key} (age: ${Math.round(age / 1000)}s)`);
    return cache[key].data;
  }

  console.log(`[CACHE] Cache expired for key: ${key} (age: ${Math.round(age / 1000)}s)`);
  return null;
};

/**
 * Store weather data in cache
 */
export const setCachedWeather = (key: string, data: any): void => {
  cache[key] = {
    data,
    timestamp: Date.now(),
  };
  console.log(`[CACHE] Cached data for key: ${key}`);
};

/**
 * Get cache age in seconds
 */
export const getCacheAge = (key: string): number | null => {
  if (!cache[key]) return null;
  return Math.round((Date.now() - cache[key].timestamp) / 1000);
};

/**
 * Clear specific cache entry
 */
export const clearCache = (key: string): void => {
  delete cache[key];
  console.log(`[CACHE] Cleared cache for key: ${key}`);
};

/**
 * Clear all cache
 */
export const clearAllCache = (): void => {
  Object.keys(cache).forEach((key) => delete cache[key]);
  console.log(`[CACHE] Cleared all cache`);
};

/**
 * Get cache statistics
 */
export const getCacheStats = (): object => {
  const stats = {
    entriesCount: Object.keys(cache).length,
    entries: Object.entries(cache).map(([key, entry]) => ({
      key,
      age: Math.round((Date.now() - entry.timestamp) / 1000),
    })),
  };
  return stats;
};
