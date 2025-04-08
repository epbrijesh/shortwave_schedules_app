import { Observable, ObservableArray } from '@nativescript/core';
import { ApplicationSettings } from '@nativescript/core';
import { RadioSchedule } from '../models/radio-schedule';
import { radioSchedules } from '../data/schedules';

interface FilterOptions {
  search: string;
  frequencyRange: { min: number; max: number };
  timeRange: { start: string; end: string };
  languages: Set<string>;
  itus: Set<string>;
  showLiveOnly: boolean;
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
}

export class RadioService extends Observable {
  private schedules: RadioSchedule[] = [];
  private filteredSchedules: ObservableArray<RadioSchedule>;
  private _uniqueValues: {
    languages: Set<string>;
    itus: Set<string>;
  };
  private currentSortField: keyof RadioSchedule | null = null;
  private currentSortAscending: boolean = true;

  constructor() {
    super();
    this.initializeStorage();
    const savedSchedules = this.loadSavedSchedules();
    this.schedules = savedSchedules || [...radioSchedules];
    this.filteredSchedules = new ObservableArray<RadioSchedule>(this.schedules);
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
        showLiveOnly: savedState.showLiveOnly
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
        showLiveOnly: options.showLiveOnly
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

  updateSchedules(newSchedules: RadioSchedule[]) {
    this.schedules = [...newSchedules];
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

  getSchedules(): ObservableArray<RadioSchedule> {
    return this.filteredSchedules;
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

  getSavedFilterState(): SavedFilterState | null {
    return this.loadFilterState();
  }
}