import { Observable, ObservableArray } from '@nativescript/core';
import { RadioService } from './services/radio-service';
import { RadioSchedule } from './models/radio-schedule';
import { Frame } from '@nativescript/core';

interface FilterOption {
  name: string;
  isSelected: boolean;
}

export class MainViewModel extends Observable {
  private radioService: RadioService;
  private _searchQuery: string = '';
  private _frequencyMin: number;
  private _frequencyMax: number;
  private _timeStart: string = '00:00';
  private _timeEnd: string = '23:59';
  private _showLiveOnly: boolean = false;
  private sortAscending = true;
  private currentSortField: keyof RadioSchedule = 'frequency';
  private timeUpdateInterval: number;
  private _availableLanguages: ObservableArray<FilterOption>;
  private _availableITUs: ObservableArray<FilterOption>;

  constructor() {
    super();
    this.radioService = new RadioService();
    const range = this.radioService.frequencyRange;
    this._frequencyMin = range.min;
    this._frequencyMax = range.max;
    
    // Initialize languages
    const languages = Array.from(this.radioService.uniqueValues.languages).sort();
    this._availableLanguages = new ObservableArray(
      languages.map(lang => ({
        name: lang,
        isSelected: false
      }))
    );

    // Initialize ITUs
    const itus = Array.from(this.radioService.uniqueValues.itus).sort();
    this._availableITUs = new ObservableArray(
      itus.map(itu => ({
        name: itu,
        isSelected: false
      }))
    );
    
    this.updateTime();
    this.startTimeUpdate();
  }

  get availableLanguages(): ObservableArray<FilterOption> {
    return this._availableLanguages;
  }

  get availableITUs(): ObservableArray<FilterOption> {
    return this._availableITUs;
  }

  onLanguageCheckedChange(args: any) {
    const checkbox = args.object;
    const language = checkbox.text;
    const isChecked = checkbox.checked;
    
    const languageOption = this._availableLanguages.find(l => l.name === language);
    if (languageOption) {
      languageOption.isSelected = isChecked;
    }
    
    this.applyFilters();
  }

  onITUCheckedChange(args: any) {
    const checkbox = args.object;
    const itu = checkbox.text;
    const isChecked = checkbox.checked;
    
    const ituOption = this._availableITUs.find(i => i.name === itu);
    if (ituOption) {
      ituOption.isSelected = isChecked;
    }
    
    this.applyFilters();
  }

  private startTimeUpdate() {
    this.timeUpdateInterval = setInterval(() => {
      this.updateTime();
      if (this._showLiveOnly) {
        this.applyFilters();
      }
    }, 1000);
  }

  private updateTime() {
    const now = new Date();
    this.set('currentUTCTime', now.toISOString().substring(11, 19));
    
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const hours = istTime.getUTCHours().toString().padStart(2, '0');
    const minutes = istTime.getUTCMinutes().toString().padStart(2, '0');
    const seconds = istTime.getUTCSeconds().toString().padStart(2, '0');
    this.set('currentLocalTime', `${hours}:${minutes}:${seconds}`);
  }

  get schedules() {
    return this.radioService.getSchedules();
  }

  get frequencyMin(): number {
    return this._frequencyMin;
  }

  set frequencyMin(value: number) {
    const numValue = Number(value);
    if (!isNaN(numValue) && this._frequencyMin !== numValue) {
      this._frequencyMin = numValue;
      this.notifyPropertyChange('frequencyMin', numValue);
    }
  }

  get frequencyMax(): number {
    return this._frequencyMax;
  }

  set frequencyMax(value: number) {
    const numValue = Number(value);
    if (!isNaN(numValue) && this._frequencyMax !== numValue) {
      this._frequencyMax = numValue;
      this.notifyPropertyChange('frequencyMax', numValue);
    }
  }

  get timeStart(): string {
    return this._timeStart;
  }

  set timeStart(value: string) {
    if (this._timeStart !== value) {
      this._timeStart = value;
      this.notifyPropertyChange('timeStart', value);
    }
  }

  get timeEnd(): string {
    return this._timeEnd;
  }

  set timeEnd(value: string) {
    if (this._timeEnd !== value) {
      this._timeEnd = value;
      this.notifyPropertyChange('timeEnd', value);
    }
  }

  get showLiveOnly(): boolean {
    return this._showLiveOnly;
  }

  set showLiveOnly(value: boolean) {
    if (this._showLiveOnly !== value) {
      this._showLiveOnly = value;
      this.notifyPropertyChange('showLiveOnly', value);
      this.applyFilters();
    }
  }

  get searchQuery(): string {
    return this._searchQuery;
  }

  set searchQuery(value: string) {
    if (this._searchQuery !== value) {
      this._searchQuery = value;
      this.notifyPropertyChange('searchQuery', value);
      this.applyFilters();
    }
  }

  onSearch(args: any) {
    if (args.object) {
      this.searchQuery = args.object.text || '';
    }
  }

  clearFilters() {
    const range = this.radioService.frequencyRange;
    
    // Update internal state first
    this._searchQuery = '';
    this._showLiveOnly = false;
    this._frequencyMin = range.min;
    this._frequencyMax = range.max;
    this._timeStart = '00:00';
    this._timeEnd = '23:59';

    // Update UI bindings using notifyPropertyChange for each property
    this.notifyPropertyChange('searchQuery', this._searchQuery);
    this.notifyPropertyChange('showLiveOnly', this._showLiveOnly);
    this.notifyPropertyChange('frequencyMin', this._frequencyMin);
    this.notifyPropertyChange('frequencyMax', this._frequencyMax);
    this.notifyPropertyChange('timeStart', this._timeStart);
    this.notifyPropertyChange('timeEnd', this._timeEnd);

    // Clear and refresh language selections
    this._availableLanguages.forEach(lang => {
      lang.isSelected = false;
    });
    this.notifyPropertyChange('availableLanguages', this._availableLanguages);
    this._availableLanguages.refresh();

    // Clear and refresh ITU selections
    this._availableITUs.forEach(itu => {
      itu.isSelected = false;
    });
    this.notifyPropertyChange('availableITUs', this._availableITUs);
    this._availableITUs.refresh();

    // Apply the filters to update the list and trigger UI refresh
    this.applyFilters();
  }

  applyFilters() {
    const selectedLanguages = new Set(
      this._availableLanguages
        .filter(lang => lang.isSelected)
        .map(lang => lang.name)
    );

    const selectedITUs = new Set(
      this._availableITUs
        .filter(itu => itu.isSelected)
        .map(itu => itu.name)
    );

    this.radioService.filter({
      search: this._searchQuery,
      frequencyRange: {
        min: this._frequencyMin,
        max: this._frequencyMax
      },
      timeRange: {
        start: this._timeStart,
        end: this._timeEnd
      },
      languages: selectedLanguages,
      itus: selectedITUs,
      showLiveOnly: this._showLiveOnly
    });
  }

  onSortByFrequency() {
    this.sort('frequency');
  }

  onSortByTime() {
    this.sort('time');
  }

  onSortByStation() {
    this.sort('stationName');
  }

  onSortByLanguage() {
    this.sort('language');
  }

  private sort(field: keyof RadioSchedule) {
    if (this.currentSortField === field) {
      this.sortAscending = !this.sortAscending;
    } else {
      this.currentSortField = field;
      this.sortAscending = true;
    }
    this.radioService.sortBy(field, this.sortAscending);
  }

  onItemTap(args: any) {
    const schedule: RadioSchedule = this.schedules.getItem(args.index);
    Frame.topmost().navigate({
      moduleName: 'details-page',
      context: schedule,
      animated: true
    });
  }
}