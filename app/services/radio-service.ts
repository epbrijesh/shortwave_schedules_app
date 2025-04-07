import { Observable, ObservableArray } from '@nativescript/core';
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

export class RadioService extends Observable {
  private schedules: RadioSchedule[];
  private filteredSchedules: ObservableArray<RadioSchedule>;
  private _uniqueValues: {
    languages: Set<string>;
    itus: Set<string>;
  };

  constructor() {
    super();
    this.schedules = radioSchedules;
    this.filteredSchedules = new ObservableArray(this.schedules);
    this._uniqueValues = this.extractUniqueValues();
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
      // Handle schedules that cross midnight
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

    // Frequency range filter
    if (options.frequencyRange) {
      filtered = filtered.filter(schedule => 
        schedule.frequency >= options.frequencyRange.min &&
        schedule.frequency <= options.frequencyRange.max
      );
    }

    // Time range filter
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
  }

  sortBy(field: keyof RadioSchedule, ascending: boolean = true): void {
    const sorted = [...this.filteredSchedules].sort((a, b) => {
      const aValue = a[field];
      const bValue = b[field];
      
      if (field === 'frequency') {
        return ascending ? 
          (Number(aValue) - Number(bValue)) :
          (Number(bValue) - Number(aValue));
      }
      
      return ascending ? 
        (aValue > bValue ? 1 : -1) :
        (aValue < bValue ? 1 : -1);
    });
    
    this.filteredSchedules.splice(0, this.filteredSchedules.length, ...sorted);
  }
}