export interface RadioSchedule {
  frequency: number;
  time: string;
  days: string;
  stationName: string;
  language: string;
  itu: string;
  txLocation: string;
  coordinates: string;
  power: number;
  azimuth: string;
  remarks: string;
}

export const daysToString = (days: string): string => {
  const dayMap = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.split('').map((day, index) => day !== '.' ? dayMap[index] : '').filter(d => d).join(', ');
};

export const parseCoordinates = (coordinates: string): { lat: number; lon: number } | null => {
  try {
    // Extract degrees, minutes, seconds and direction
    const match = coordinates.match(/(\d{2})(\d{2})(\d{2})([NS])\s*(\d{3})(\d{2})(\d{2})([EW])/);
    if (!match) return null;

    const [_, latDeg, latMin, latSec, latDir, lonDeg, lonMin, lonSec, lonDir] = match;

    // Convert to decimal degrees
    let lat = parseInt(latDeg) + parseInt(latMin)/60 + parseInt(latSec)/3600;
    let lon = parseInt(lonDeg) + parseInt(lonMin)/60 + parseInt(lonSec)/3600;

    // Apply direction
    if (latDir === 'S') lat = -lat;
    if (lonDir === 'W') lon = -lon;

    return { lat, lon };
  } catch (e) {
    return null;
  }
};