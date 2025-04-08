import { Observable, ObservableArray, Utils, alert, PropertyChangeData } from '@nativescript/core';
import { RadioService } from './services/radio-service';
import { SyncService } from './services/sync-service';
import { RadioSchedule } from './models/radio-schedule';
import { Frame } from '@nativescript/core';

interface FilterOption {
  name: string;
  isSelected: boolean;
}

export class MainViewModel extends Observable {
  private radioService: RadioService;
  private syncService: SyncService;
  private _searchQuery: string = '';
  private _frequencyMin: number;
  private _frequencyMax: number;
  private _timeStart: string = '00:00';
  private _timeEnd: string = '23:59';
  private _showLiveOnly: boolean = false;
  private _isSearchVisible: boolean = false;
  private sortAscending = true;
  private currentSortField: keyof RadioSchedule = 'frequency';
  private timeUpdateInterval: ReturnType<typeof setInterval>;
  private _availableLanguages: ObservableArray<FilterOption>;
  private _availableITUs: ObservableArray<FilterOption>;
  private _selectedTabIndex: number = 0;

  constructor() {
    super();
    this.radioService = new RadioService();
    this.syncService = new SyncService();
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

    // Load saved filter state
    const savedState = this.radioService.getSavedFilterState();
    if (savedState) {
      this._searchQuery = savedState.search;
      this._frequencyMin = savedState.frequencyMin;
      this._frequencyMax = savedState.frequencyMax;
      this._timeStart = savedState.timeStart;
      this._timeEnd = savedState.timeEnd;
      this._showLiveOnly = savedState.showLiveOnly;

      // Update language selections
      this._availableLanguages.forEach(lang => {
        lang.isSelected = savedState.selectedLanguages.includes(lang.name);
      });

      // Update ITU selections
      this._availableITUs.forEach(itu => {
        itu.isSelected = savedState.selectedITUs.includes(itu.name);
      });

      // Notify property changes
      this.notifyPropertyChange('searchQuery', this._searchQuery);
      this.notifyPropertyChange('frequencyMin', this._frequencyMin);
      this.notifyPropertyChange('frequencyMax', this._frequencyMax);
      this.notifyPropertyChange('timeStart', this._timeStart);
      this.notifyPropertyChange('timeEnd', this._timeEnd);
      this.notifyPropertyChange('showLiveOnly', this._showLiveOnly);
      this.notifyPropertyChange('availableLanguages', this._availableLanguages);
      this.notifyPropertyChange('availableITUs', this._availableITUs);
    }
    
    this.updateTime();
    this.startTimeUpdate();

    // Bind to sync service properties with correct type
    this.syncService.on(Observable.propertyChangeEvent, (propertyChangeData: PropertyChangeData) => {
      this.notifyPropertyChange(propertyChangeData.propertyName, propertyChangeData.value);
    });
  }

  get selectedTabIndex(): number {
    return this._selectedTabIndex;
  }

  set selectedTabIndex(value: number) {
    if (this._selectedTabIndex !== value) {
      this._selectedTabIndex = value;
      this.notifyPropertyChange('selectedTabIndex', value);
    }
  }

  get isSearchVisible(): boolean {
    return this._isSearchVisible;
  }

  toggleSearch() {
    this._isSearchVisible = !this._isSearchVisible;
    this.notifyPropertyChange('isSearchVisible', this._isSearchVisible);
    if (!this._isSearchVisible) {
      this._searchQuery = '';
      this.notifyPropertyChange('searchQuery', '');
      this.applyFilters();
    }
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
    
    // UTC time and date
    this.set('currentUTCTime', now.toISOString().substring(11, 19));
    const utcDate = now.toISOString().substring(0, 10).split('-').reverse().join('/');
    this.set('currentUTCDate', utcDate);
    
    // Local (IST) time and date
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const hours = istTime.getUTCHours().toString().padStart(2, '0');
    const minutes = istTime.getUTCMinutes().toString().padStart(2, '0');
    const seconds = istTime.getUTCSeconds().toString().padStart(2, '0');
    this.set('currentLocalTime', `${hours}:${minutes}:${seconds}`);
    
    const day = istTime.getUTCDate().toString().padStart(2, '0');
    const month = (istTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = istTime.getUTCFullYear();
    this.set('currentLocalDate', `${day}/${month}/${year}`);
  }

  get currentVersion(): string {
    return this.syncService.currentVersion;
  }

  get onlineVersion(): string {
    return this.syncService.onlineVersion;
  }

  get isChecking(): boolean {
    return this.syncService.isChecking;
  }

  get isSyncing(): boolean {
    return this.syncService.isSyncing;
  }

  async checkVersion() {
    await this.syncService.checkVersion();
  }

  async syncDatabase() {
    try {
      const newSchedules = await this.syncService.syncSchedules();
      this.radioService.updateSchedules(newSchedules);
      this.applyFilters();
      alert({
        title: "Success",
        message: "Database updated successfully!",
        okButtonText: "OK"
      });
    } catch (error) {
      alert({
        title: "Error",
        message: "Failed to sync database. Please try again.",
        okButtonText: "OK"
      });
    }
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
    
    this._searchQuery = '';
    this._showLiveOnly = false;
    this._frequencyMin = range.min;
    this._frequencyMax = range.max;
    this._timeStart = '00:00';
    this._timeEnd = '23:59';

    this.notifyPropertyChange('searchQuery', this._searchQuery);
    this.notifyPropertyChange('showLiveOnly', this._showLiveOnly);
    this.notifyPropertyChange('frequencyMin', this._frequencyMin);
    this.notifyPropertyChange('frequencyMax', this._frequencyMax);
    this.notifyPropertyChange('timeStart', this._timeStart);
    this.notifyPropertyChange('timeEnd', this._timeEnd);

    this._availableLanguages.forEach(lang => {
      lang.isSelected = false;
    });
    this.notifyPropertyChange('availableLanguages', this._availableLanguages);
    this._availableLanguages.length = this._availableLanguages.length;

    this._availableITUs.forEach(itu => {
      itu.isSelected = false;
    });
    this.notifyPropertyChange('availableITUs', this._availableITUs);
    this._availableITUs.length = this._availableITUs.length;

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

  openWebsite() {
    Utils.openUrl("https://dxhobby.blogspot.com/");
  }

  openPlayStore() {
    Utils.openUrl("https://play.google.com/store/apps/details?id=com.thinkdigit.swschedule");
  }
  
  openPlayStorePub() {
    Utils.openUrl("https://play.google.com/store/apps/developer?id=thinkdigit");
  }

  sendEmail() {
    Utils.openUrl("mailto:epbrijesh@gmail.com");
  }

  callPhone() {
    Utils.openUrl("tel:+919961257788");
  }

  onDeveloperImageTap() {
    Utils.openUrl("https://www.facebook.com/brijesh.ep");
  }

  onWikipediaImageTap() {
    Utils.openUrl("https://www1.s2.starcat.ne.jp/ndxc/");
  }

  onBoltImageTap() {
    Utils.openUrl("https://bolt.new");
  }

  onGithubImageTap() {
    Utils.openUrl("https://github.com/epbrijesh/shortwave_schedules_app/");
  }
}