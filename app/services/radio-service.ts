import { Observable, ObservableArray } from '@nativescript/core';
import { ApplicationSettings } from '@nativescript/core';
import { RadioSchedule } from '../models/radio-schedule';
import { parseCoordinates, daysToShortString } from '../models/radio-schedule';
import { radioSchedules } from '../data/schedules';

interface FilterOptions {
  search: string;
  frequencyRange: { min: number; max: number };
  timeRange: { start: string; end: string };
  languages: Set<string>;
  itus: Set<string>;
  showLiveOnly: boolean;
  enableDistanceFilter: boolean;
  maxDistance?: number;
  enablePowerFilter: boolean;
  userLocation?: { latitude: number; longitude: number } | null;
}

interface SavedFilterState {
  search: string;
  frequencyMin: number;
  frequencyMax: number;
  timeStart: string;
  timeEnd: string;
  selectedLanguages: string[];
  selectedITUs: string[];
  showLiveOnly: boolean;
  enableDistanceFilter: boolean;
  maxDistance?: number;
  enablePowerFilter?: boolean;
}

export class RadioService extends Observable {
  private schedules: RadioSchedule[] = [];
  private filteredSchedules: ObservableArray<RadioSchedule>;
  private upcomingSchedules: ObservableArray<RadioSchedule>;
  private _uniqueValues: {
    languages: Set<string>;
    itus: Set<string>;
  };
  private currentSortField: keyof RadioSchedule | null = null;
  private currentSortAscending: boolean = true;
  private currentUpcomingSortField: keyof RadioSchedule | null = null;
  private currentUpcomingSortAscending: boolean = true;

  constructor() {
    super();
    this.initializeStorage();
    const savedSchedules = this.loadSavedSchedules();
    let rawSchedules = savedSchedules || [...radioSchedules];
    
    // Filter out schedules with decimal frequencies (keep only whole numbers)
    rawSchedules = rawSchedules.filter(schedule => Number.isInteger(schedule.frequency));
    
    // Add broadcastDaysShort to each schedule
    this.schedules = rawSchedules.map(schedule => ({
      ...schedule,
      broadcastDaysShort: daysToShortString(schedule.days)
    }));
    
    this.filteredSchedules = new ObservableArray<RadioSchedule>(this.schedules);
    this.upcomingSchedules = new ObservableArray<RadioSchedule>([]);
    this._uniqueValues = this.extractUniqueValues();
    
    // Apply saved filters on startup
    const savedState = this.loadFilterState();
    if (savedState) {
      this.filter({
        search: savedState.search,
        frequencyRange: {
          min: savedState.frequencyMin,
          max: savedState.frequencyMax
        },
        timeRange: {
          start: savedState.timeStart,
          end: savedState.timeEnd
        },
        languages: new Set(savedState.selectedLanguages),
        itus: new Set(savedState.selectedITUs),
        showLiveOnly: savedState.showLiveOnly,
        enableDistanceFilter: savedState.enableDistanceFilter || false,
        maxDistance: savedState.maxDistance || 5000,
        enablePowerFilter: savedState.enablePowerFilter !== undefined ? savedState.enablePowerFilter : true,
        userLocation: null
      });
    }
  }

  private initializeStorage() {
    if (!ApplicationSettings.hasKey('radioSchedules')) {
      ApplicationSettings.setString('radioSchedules', JSON.stringify(radioSchedules));
    }
  }

  private loadSavedSchedules(): RadioSchedule[] | null {
    try {
      const saved = ApplicationSettings.getString('radioSchedules');
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error('Error loading saved schedules:', error);
      return null;
    }
  }

  private saveSchedules() {
    try {
      ApplicationSettings.setString('radioSchedules', JSON.stringify(this.schedules));
    } catch (error) {
      console.error('Error saving schedules:', error);
    }
  }

  private saveFilterState(options: FilterOptions) {
    try {
      const state: SavedFilterState = {
        search: options.search,
        frequencyMin: options.frequencyRange.min,
        frequencyMax: options.frequencyRange.max,
        timeStart: options.timeRange.start,
        timeEnd: options.timeRange.end,
        selectedLanguages: Array.from(options.languages),
        selectedITUs: Array.from(options.itus),
        showLiveOnly: options.showLiveOnly,
        enableDistanceFilter: options.enableDistanceFilter,
        maxDistance: options.maxDistance || 5000,
        enablePowerFilter: options.enablePowerFilter
      };
      ApplicationSettings.setString('filterState', JSON.stringify(state));
    } catch (error) {
      console.error('Error saving filter state:', error);
    }
  }

  private loadFilterState(): SavedFilterState | null {
    try {
      const saved = ApplicationSettings.getString('filterState');
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error('Error loading filter state:', error);
      return null;
    }
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  updateSchedules(newSchedules: RadioSchedule[]) {
    // Filter out schedules with decimal frequencies (keep only whole numbers)
    const filteredSchedules = newSchedules.filter(schedule => Number.isInteger(schedule.frequency));
    
    this.schedules = filteredSchedules.map(schedule => ({
      ...schedule,
      broadcastDaysShort: daysToShortString(schedule.days)
    }));
    this._uniqueValues = this.extractUniqueValues();
    this.filteredSchedules.splice(0, this.filteredSchedules.length, ...this.schedules);
    this.saveSchedules();
  }

  private extractUniqueValues() {
    return {
      languages: new Set(this.schedules.map(s => s.language)),
      itus: new Set(this.schedules.map(s => s.itu))
    };
  }

  get uniqueValues() {
    return this._uniqueValues;
  }

  get frequencyRange() {
    const frequencies = this.schedules.map(s => s.frequency);
    return {
      min: Math.min(...frequencies),
      max: Math.max(...frequencies)
    };
  }

  private convertTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private isTimeInRange(scheduleTime: string, startTime: string, endTime: string): boolean {
    const [scheduleStart, scheduleEnd] = scheduleTime.split('-');
    const scheduleStartMinutes = this.convertTimeToMinutes(scheduleStart.substring(0, 2) + ':' + scheduleStart.substring(2));
    const scheduleEndMinutes = this.convertTimeToMinutes(scheduleEnd.substring(0, 2) + ':' + scheduleEnd.substring(2));
    const rangeStartMinutes = this.convertTimeToMinutes(startTime);
    const rangeEndMinutes = this.convertTimeToMinutes(endTime);

    if (scheduleStartMinutes <= scheduleEndMinutes) {
      return scheduleStartMinutes >= rangeStartMinutes && scheduleEndMinutes <= rangeEndMinutes;
    } else {
      return (scheduleStartMinutes >= rangeStartMinutes && scheduleStartMinutes <= 1440) ||
             (scheduleEndMinutes >= 0 && scheduleEndMinutes <= rangeEndMinutes);
    }
  }

  private isScheduleInHour(schedule: RadioSchedule, targetHour: number): boolean {
    const [startTime, endTime] = schedule.time.split('-').map(t => {
      const hours = parseInt(t.substring(0, 2));
      const minutes = parseInt(t.substring(2));
      return { hours, minutes };
    });

    // Check if the schedule starts or is active during the target hour
    if (startTime.hours === targetHour) {
      return true;
    }

    // Handle schedules that cross midnight
    if (startTime.hours > endTime.hours) {
      // Schedule crosses midnight
      if (targetHour >= startTime.hours || targetHour <= endTime.hours) {
        return true;
      }
    } else {
      // Normal schedule within same day
      if (targetHour >= startTime.hours && targetHour <= endTime.hours) {
        return true;
      }
    }

    return false;
  }

  getSchedules(): ObservableArray<RadioSchedule> {
    return this.filteredSchedules;
  }

  getUpcomingSchedules(nextHour: number): ObservableArray<RadioSchedule> {
    // Get all schedules that will be active in the next hour
    let upcoming = this.schedules.filter(schedule => 
      this.isScheduleInHour(schedule, nextHour)
    );

    // Apply current filters (except time range and live only)
    const savedState = this.loadFilterState();
    if (savedState) {
      // Apply search filter
      if (savedState.search) {
        const lowercaseQuery = savedState.search.toLowerCase().trim();
        upcoming = upcoming.filter(schedule => 
          schedule.stationName.toLowerCase().includes(lowercaseQuery) ||
          schedule.language.toLowerCase().includes(lowercaseQuery) ||
          schedule.frequency.toString().includes(lowercaseQuery) ||
          schedule.time.toLowerCase().includes(lowercaseQuery)
        );
      }

      // Apply frequency filter
      upcoming = upcoming.filter(schedule => 
        schedule.frequency >= savedState.frequencyMin &&
        schedule.frequency <= savedState.frequencyMax
      );

      // Apply language filter
      if (savedState.selectedLanguages.length > 0) {
        const selectedLanguages = new Set(savedState.selectedLanguages);
        upcoming = upcoming.filter(schedule => 
          selectedLanguages.has(schedule.language)
        );
      }

      // Apply ITU filter
      if (savedState.selectedITUs.length > 0) {
        const selectedITUs = new Set(savedState.selectedITUs);
        upcoming = upcoming.filter(schedule => 
          selectedITUs.has(schedule.itu)
        );
      }

      // Apply power filter if enabled
      if (savedState.enablePowerFilter !== undefined ? savedState.enablePowerFilter : true) {
        upcoming = upcoming.filter(schedule => {
          const power = parseFloat(schedule.power);
          return !isNaN(power) && power > 25;
        });
      }

      // Apply distance filter if enabled and user location is available
      if (savedState.enableDistanceFilter) {
        const userLat = ApplicationSettings.getNumber('currentLatitude');
        const userLon = ApplicationSettings.getNumber('currentLongitude');
        const hasUserLocation = ApplicationSettings.getString('currentLocationCoords');
        
        if (hasUserLocation && userLat && userLon && savedState.maxDistance) {
          upcoming = upcoming.filter(schedule => {
            const coords = parseCoordinates(schedule.coordinates);
            if (!coords) return false; // Exclude stations with invalid coordinates
            
            const distance = this.haversineDistance(userLat, userLon, coords.lat, coords.lon);
            return distance <= savedState.maxDistance!;
          });
        }
      }
    }

    // Add broadcastDaysShort to upcoming schedules
    upcoming = upcoming.map(schedule => ({
      ...schedule,
      broadcastDaysShort: daysToShortString(schedule.days)
    }));

    this.upcomingSchedules.splice(0, this.upcomingSchedules.length, ...upcoming);
    
    // Maintain sort order for upcoming schedules
    if (this.currentUpcomingSortField) {
      this.sortUpcomingBy(this.currentUpcomingSortField, this.currentUpcomingSortAscending, false);
    }
    
    return this.upcomingSchedules;
  }

  private isStationLive(schedule: RadioSchedule): boolean {
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const currentTime = utcHours * 100 + utcMinutes;

    const [startTime, endTime] = schedule.time.split('-').map(t => {
      const hours = parseInt(t.substring(0, 2));
      const minutes = parseInt(t.substring(2));
      return hours * 100 + minutes;
    });

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  filter(options: FilterOptions): void {
    let filtered = [...this.schedules];

    if (options.search) {
      const lowercaseQuery = options.search.toLowerCase().trim();
      filtered = filtered.filter(schedule => 
        schedule.stationName.toLowerCase().includes(lowercaseQuery) ||
        schedule.language.toLowerCase().includes(lowercaseQuery) ||
        schedule.frequency.toString().includes(lowercaseQuery) ||
        schedule.time.toLowerCase().includes(lowercaseQuery)
      );
    }

    if (options.frequencyRange) {
      filtered = filtered.filter(schedule => 
        schedule.frequency >= options.frequencyRange.min &&
        schedule.frequency <= options.frequencyRange.max
      );
    }

    if (options.timeRange && options.timeRange.start && options.timeRange.end) {
      filtered = filtered.filter(schedule => 
        this.isTimeInRange(schedule.time, options.timeRange.start, options.timeRange.end)
      );
    }

    if (options.languages.size > 0) {
      filtered = filtered.filter(schedule => 
        options.languages.has(schedule.language)
      );
    }

    if (options.itus.size > 0) {
      filtered = filtered.filter(schedule => 
        options.itus.has(schedule.itu)
      );
    }

    if (options.showLiveOnly) {
      filtered = filtered.filter(schedule => this.isStationLive(schedule));
    }

    // Apply power filter if enabled
    if (options.enablePowerFilter) {
      filtered = filtered.filter(schedule => {
        const power = parseFloat(schedule.power);
        return !isNaN(power) && power > 25;
      });
    }

    // Apply distance filter only if enabled
    if (options.enableDistanceFilter && options.userLocation && options.maxDistance) {
      filtered = filtered.filter(schedule => {
        const coords = parseCoordinates(schedule.coordinates);
        if (!coords) return false; // Exclude stations with invalid coordinates
        
        const distance = this.haversineDistance(
          options.userLocation!.latitude,
          options.userLocation!.longitude,
          coords.lat,
          coords.lon
        );
        return distance <= options.maxDistance!;
      });
    }

    // Ensure broadcastDaysShort is added to filtered results
    filtered = filtered.map(schedule => ({
      ...schedule,
      broadcastDaysShort: daysToShortString(schedule.days)
    }));

    this.filteredSchedules.splice(0, this.filteredSchedules.length, ...filtered);
    
    // Maintain sort order after filtering
    if (this.currentSortField) {
      this.sortBy(this.currentSortField, this.currentSortAscending, false);
    }
    
    // Save filter state
    this.saveFilterState(options);
  }

  sortBy(field: keyof RadioSchedule, ascending: boolean = true, updateSort: boolean = true): void {
    if (updateSort) {
      this.currentSortField = field;
      this.currentSortAscending = ascending;
    }

    const sorted = [...this.filteredSchedules].sort((a, b) => {
      const aValue = a[field];
      const bValue = b[field];
      
      if (field === 'frequency') {
        return ascending ? 
          (Number(aValue) - Number(bValue)) :
          (Number(bValue) - Number(aValue));
      }
      
      return ascending ? 
        String(aValue).localeCompare(String(bValue)) :
        String(bValue).localeCompare(String(aValue));
    });
    
    this.filteredSchedules.splice(0, this.filteredSchedules.length, ...sorted);
  }

  sortUpcomingBy(field: keyof RadioSchedule, ascending: boolean = true, updateSort: boolean = true): void {
    if (updateSort) {
      this.currentUpcomingSortField = field;
      this.currentUpcomingSortAscending = ascending;
    }

    const sorted = [...this.upcomingSchedules].sort((a, b) => {
      const aValue = a[field];
      const bValue = b[field];
      
      if (field === 'frequency') {
        return ascending ? 
          (Number(aValue) - Number(bValue)) :
          (Number(bValue) - Number(aValue));
      }
      
      return ascending ? 
        String(aValue).localeCompare(String(bValue)) :
        String(bValue).localeCompare(String(aValue));
    });
    
    this.upcomingSchedules.splice(0, this.upcomingSchedules.length, ...sorted);
  }

  getSavedFilterState(): SavedFilterState | null {
    return this.loadFilterState();
  }
}