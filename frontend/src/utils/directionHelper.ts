/**
 * Direction Helper Utility
 * Calculates direction between two geographic coordinates
 */

interface DirectionResult {
  direction: string;
  instruction: string;
  bearing?: number;
}

export const getDirectionSuggestion = (
  currentLat: number,
  currentLon: number,
  targetLat: number,
  targetLon: number
): DirectionResult => {
  const latDiff = targetLat - currentLat;
  const lonDiff = targetLon - currentLon;

  // Determine cardinal direction
  let verticalDir = '';
  let horizontalDir = '';

  if (latDiff > 0.001) verticalDir = 'North';
  else if (latDiff < -0.001) verticalDir = 'South';

  if (lonDiff > 0.001) horizontalDir = 'East';
  else if (lonDiff < -0.001) horizontalDir = 'West';

  // Combine directions
  const direction = (verticalDir + '-' + horizontalDir)
    .split('-')
    .filter((d) => d)
    .join('-') || 'Here';

  // Calculate approximate distance (simplified)
  const distance = Math.round(
    Math.sqrt(Math.pow(latDiff * 111, 2) + Math.pow(lonDiff * 111 * Math.cos(currentLat * (Math.PI / 180)), 2))
  );

  return {
    direction,
    instruction:
      distance > 10
        ? `Move ${distance}m ${direction}`
        : `You are at the location`,
    bearing: Math.atan2(lonDiff, latDiff) * (180 / Math.PI),
  };
};

// Get emoji for direction
export const getDirectionEmoji = (direction: string): string => {
  const emojiMap: Record<string, string> = {
    'North': '⬆️',
    'South': '⬇️',
    'East': '➡️',
    'West': '⬅️',
    'North-East': '↗️',
    'North-West': '↖️',
    'South-East': '↘️',
    'South-West': '↙️',
    'Here': '📍',
  };

  return emojiMap[direction] || '📍';
};
