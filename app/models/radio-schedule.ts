export interface RadioSchedule {
  frequency: number;
  time: string;
  days: string;
  stationName: string;
  language: string;
  itu: string;
  txLocation: string;
  coordinates: string;
  power: string;
  azimuth: string;
  remarks: string;
  broadcastDaysShort?: string; // Add computed property for short days display
}

export const daysToString = (days: string): string => {
  const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Handle short format like "2", "3", "23", etc.
  if (days.length < 7 && /^[1-7]+$/.test(days)) {
    return days.split('').map(dayNum => {
      const index = parseInt(dayNum) - 1; // Convert 1-7 to 0-6 index
      return dayMap[index];
    }).join(', ');
  }
  
  // Handle full format like ".2....." or "1234567"
  return days.split('').map((day, index) => {
    if (day !== '.' && /[1-7]/.test(day)) {
      return dayMap[index];
    }
    return '';
  }).filter(d => d).join(', ');
};

export const daysToShortString = (days: string): string => {
  if (days === '1234567') {
    return 'All Days';
  }
  
  const dayMap = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  
  // Handle short format like "2", "3", "23", etc.
  if (days.length < 7 && /^[1-7]+$/.test(days)) {
    const activeDays = days.split('').map(dayNum => {
      const index = parseInt(dayNum) - 1; // Convert 1-7 to 0-6 index
      return dayMap[index];
    });
    
    if (activeDays.length === 0) {
      return 'No Days';
    }
    
    return activeDays.join('');
  }
  
  // Handle full format like ".2....." or "1234567"
  const activeDays = days.split('').map((day, index) => {
    if (day !== '.' && /[1-7]/.test(day)) {
      return dayMap[index];
    }
    return '';
  }).filter(d => d);
  
  if (activeDays.length === 0) {
    return 'No Days';
  }
  
  return activeDays.join('');
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