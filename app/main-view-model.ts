import { Observable, ObservableArray, Utils, alert, PropertyChangeData, action, confirm } from '@nativescript/core';
import { ApplicationSettings } from '@nativescript/core';
import { RadioService } from './services/radio-service';
import { SyncService } from './services/sync-service';
import { RadioSchedule } from './models/radio-schedule';
import { parseCoordinates } from './models/radio-schedule';
import { Frame } from '@nativescript/core';
import * as geolocation from '@nativescript/geolocation';

interface FilterOption {
  name: string;
  isSelected: boolean;
}

interface Timezone {
  name: string;
  offset: number;
  displayName: string;
}

export class MainViewModel extends Observable {
  private radioService: RadioService;
  private syncService: SyncService;
  private _searchQuery: string = '';
  private _frequencyMin: number;
  private _frequencyMax: number;
  private _timeStart: string = '00:00';
  private _timeEnd: string = '23:59';
  private _maxDistance: number = 5000;
  private _enableDistanceFilter: boolean = false;
  private _enablePowerFilter: boolean = true; // Default enabled
  private _showLiveOnly: boolean = false;
  private _isSearchVisible: boolean = false;
  private _isDRMActive: boolean = false;
  private _showMap: boolean = false;
  private _selectedTimezone: string = 'UTC+0';
  private _selectedTimezoneOffset: number = 0;
  private _selectedTimezoneName: string = 'Local Time';
  private _currentLocationCoords: string = 'Not available';
  private _locationStatus: string = 'Not set';
  private _locationLastUpdated: string = 'Never';
  private _isGettingLocation: boolean = false;
  private _hasCurrentLocation: boolean = false;
  private _currentLatitude: number = 0;
  private _currentLongitude: number = 0;
  private _hasUserLocation: boolean = false;
  private sortAscending = true;
  private currentSortField: keyof RadioSchedule = 'frequency';
  private upcomingSortAscending = true;
  private currentUpcomingSortField: keyof RadioSchedule = 'frequency';
  private timeUpdateInterval: ReturnType<typeof setInterval>;
  private _availableLanguages: ObservableArray<FilterOption>;
  private _availableITUs: ObservableArray<FilterOption>;
  private _selectedTabIndex: number = 0;
  private timezones: Timezone[] = [
    { name: 'UTC-12', offset: -12, displayName: 'UTC-12 (Baker Island)' },
    { name: 'UTC-11', offset: -11, displayName: 'UTC-11 (American Samoa)' },
    { name: 'UTC-10', offset: -10, displayName: 'UTC-10 (Hawaii)' },
    { name: 'UTC-9', offset: -9, displayName: 'UTC-9 (Alaska)' },
    { name: 'UTC-8', offset: -8, displayName: 'UTC-8 (Pacific Time)' },
    { name: 'UTC-7', offset: -7, displayName: 'UTC-7 (Mountain Time)' },
    { name: 'UTC-6', offset: -6, displayName: 'UTC-6 (Central Time)' },
    { name: 'UTC-5', offset: -5, displayName: 'UTC-5 (Eastern Time)' },
    { name: 'UTC-4', offset: -4, displayName: 'UTC-4 (Atlantic Time)' },
    { name: 'UTC-3', offset: -3, displayName: 'UTC-3 (Argentina)' },
    { name: 'UTC-2', offset: -2, displayName: 'UTC-2 (Mid-Atlantic)' },
    { name: 'UTC-1', offset: -1, displayName: 'UTC-1 (Azores)' },
    { name: 'UTC+0', offset: 0, displayName: 'UTC+0 (London, Dublin)' },
    { name: 'UTC+1', offset: 1, displayName: 'UTC+1 (Paris, Berlin)' },
    { name: 'UTC+2', offset: 2, displayName: 'UTC+2 (Cairo, Athens)' },
    { name: 'UTC+3', offset: 3, displayName: 'UTC+3 (Moscow, Riyadh)' },
    { name: 'UTC+4', offset: 4, displayName: 'UTC+4 (Dubai, Baku)' },
    { name: 'UTC+5', offset: 5, displayName: 'UTC+5 (Karachi, Tashkent)' },
    { name: 'UTC+5:30', offset: 5.5, displayName: 'UTC+5:30 (India, Sri Lanka)' },
    { name: 'UTC+6', offset: 6, displayName: 'UTC+6 (Dhaka, Almaty)' },
    { name: 'UTC+7', offset: 7, displayName: 'UTC+7 (Bangkok, Jakarta)' },
    { name: 'UTC+8', offset: 8, displayName: 'UTC+8 (Beijing, Singapore)' },
    { name: 'UTC+9', offset: 9, displayName: 'UTC+9 (Tokyo, Seoul)' },
    { name: 'UTC+10', offset: 10, displayName: 'UTC+10 (Sydney, Melbourne)' },
    { name: 'UTC+11', offset: 11, displayName: 'UTC+11 (Solomon Islands)' },
    { name: 'UTC+12', offset: 12, displayName: 'UTC+12 (New Zealand)' }
  ];

  constructor() {
    super();
    this.radioService = new RadioService();
    this.syncService = new SyncService();
    const range = this.radioService.frequencyRange;
    this._frequencyMin = range.min;
    this._frequencyMax = range.max;
    
    // Load show map setting
    this._showMap = ApplicationSettings.getBoolean('showMap', false);
    
    // Load max distance setting
    this._maxDistance = ApplicationSettings.getNumber('maxDistance', 5000);
    
    // Load distance filter toggle setting
    this._enableDistanceFilter = ApplicationSettings.getBoolean('enableDistanceFilter', false);
    
    // Load power filter toggle setting (default enabled)
    this._enablePowerFilter = ApplicationSettings.getBoolean('enablePowerFilter', true);
    
    // Load DRM state setting
    this._isDRMActive = ApplicationSettings.getBoolean('isDRMActive', false);
    
    // Load Live state setting
    this._showLiveOnly = ApplicationSettings.getBoolean('showLiveOnly', false);
    
    // Load timezone setting
    const savedTimezone = ApplicationSettings.getString('selectedTimezone', 'UTC+5:30');
    const timezone = this.timezones.find(tz => tz.name === savedTimezone);
    if (timezone) {
      this._selectedTimezone = timezone.name;
      this._selectedTimezoneOffset = timezone.offset;
      this._selectedTimezoneName = timezone.name;
    }
    
    // Load saved location
    this.loadSavedLocation();
    
    // Initialize languages and ITUs from radio service
    this.initializeFilterOptions();
    
    this.updateTime();
    this.startTimeUpdate();

    // Bind to sync service properties with correct type
    this.syncService.on(Observable.propertyChangeEvent, (propertyChangeData: PropertyChangeData) => {
      this.notifyPropertyChange(propertyChangeData.propertyName, propertyChangeData.value);
    });
  }

  private loadSavedLocation() {
    try {
      const savedCoords = ApplicationSettings.getString('currentLocationCoords');
      const savedLat = ApplicationSettings.getNumber('currentLatitude');
      const savedLon = ApplicationSettings.getNumber('currentLongitude');
      const savedStatus = ApplicationSettings.getString('locationStatus');
      const savedLastUpdated = ApplicationSettings.getString('locationLastUpdated');
      
      if (savedCoords && savedLat && savedLon) {
        this._currentLocationCoords = savedCoords;
        this._currentLatitude = savedLat;
        this._currentLongitude = savedLon;
        this._locationStatus = savedStatus || 'Saved';
        this._locationLastUpdated = savedLastUpdated || 'Unknown';
        this._hasCurrentLocation = true;
        this._hasUserLocation = true;
        
        this.notifyPropertyChange('currentLocationCoords', this._currentLocationCoords);
        this.notifyPropertyChange('locationStatus', this._locationStatus);
        this.notifyPropertyChange('locationLastUpdated', this._locationLastUpdated);
        this.notifyPropertyChange('hasCurrentLocation', this._hasCurrentLocation);
        this.notifyPropertyChange('hasUserLocation', this._hasUserLocation);
      }
    } catch (error) {
      console.error('Error loading saved location:', error);
    }
  }

  private saveLocation() {
    try {
      ApplicationSettings.setString('currentLocationCoords', this._currentLocationCoords);
      ApplicationSettings.setNumber('currentLatitude', this._currentLatitude);
      ApplicationSettings.setNumber('currentLongitude', this._currentLongitude);
      ApplicationSettings.setString('locationStatus', this._locationStatus);
      ApplicationSettings.setString('locationLastUpdated', this._locationLastUpdated);
    } catch (error) {
      console.error('Error saving location:', error);
    }
  }

  private convertToRadioFormat(latitude: number, longitude: number): string {
    // Convert decimal degrees to degrees, minutes, seconds format
    const latDeg = Math.floor(Math.abs(latitude));
    const latMin = Math.floor((Math.abs(latitude) - latDeg) * 60);
    const latSec = Math.floor(((Math.abs(latitude) - latDeg) * 60 - latMin) * 60);
    const latDir = latitude >= 0 ? 'N' : 'S';
    
    const lonDeg = Math.floor(Math.abs(longitude));
    const lonMin = Math.floor((Math.abs(longitude) - lonDeg) * 60);
    const lonSec = Math.floor(((Math.abs(longitude) - lonDeg) * 60 - lonMin) * 60);
    const lonDir = longitude >= 0 ? 'E' : 'W';
    
    // Format as DDMMSSN DDDMMSSE (same format as radio stations)
    const latStr = latDeg.toString().padStart(2, '0') + 
                   latMin.toString().padStart(2, '0') + 
                   latSec.toString().padStart(2, '0') + latDir;
    
    const lonStr = lonDeg.toString().padStart(3, '0') + 
                   lonMin.toString().padStart(2, '0') + 
                   lonSec.toString().padStart(2, '0') + lonDir;
    
    return latStr + lonStr;
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

  async getCurrentLocation() {
    if (this._isGettingLocation) return;
    
    try {
      this._isGettingLocation = true;
      this.notifyPropertyChange('isGettingLocation', true);
      this._locationStatus = 'Getting location...';
      this.notifyPropertyChange('locationStatus', this._locationStatus);
      
      // Check if location is enabled
      const isEnabled = await geolocation.isEnabled();
      if (!isEnabled) {
        await geolocation.enableLocationRequest();
      }
      
      // Get current location
      const location = await geolocation.getCurrentLocation({
        desiredAccuracy: 3,
        maximumAge: 5000,
        timeout: 20000
      });
      
      if (location) {
        this._currentLatitude = location.latitude;
        this._currentLongitude = location.longitude;
        this._currentLocationCoords = this.convertToRadioFormat(location.latitude, location.longitude);
        this._locationStatus = 'Location acquired';
        this._locationLastUpdated = new Date().toLocaleString();
        this._hasCurrentLocation = true;
        this._hasUserLocation = true;
        
        // Save location
        this.saveLocation();
        
        // Update UI
        this.notifyPropertyChange('currentLocationCoords', this._currentLocationCoords);
        this.notifyPropertyChange('locationStatus', this._locationStatus);
        this.notifyPropertyChange('locationLastUpdated', this._locationLastUpdated);
        this.notifyPropertyChange('hasCurrentLocation', this._hasCurrentLocation);
        this.notifyPropertyChange('hasUserLocation', this._hasUserLocation);
        
        alert({
          title: "Location Found",
          message: `Your location has been saved as: ${this._currentLocationCoords}`,
          okButtonText: "OK"
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
      this._locationStatus = 'Error getting location';
      this.notifyPropertyChange('locationStatus', this._locationStatus);
      
      alert({
        title: "Location Error",
        message: "Unable to get your current location. Please check your location settings and try again.",
        okButtonText: "OK"
      });
    } finally {
      this._isGettingLocation = false;
      this.notifyPropertyChange('isGettingLocation', false);
    }
  }

  clearCurrentLocation() {
    try {
      ApplicationSettings.remove('currentLocationCoords');
      ApplicationSettings.remove('currentLatitude');
      ApplicationSettings.remove('currentLongitude');
      ApplicationSettings.remove('locationStatus');
      ApplicationSettings.remove('locationLastUpdated');
      
      this._currentLocationCoords = 'Not available';
      this._locationStatus = 'Not set';
      this._locationLastUpdated = 'Never';
      this._hasCurrentLocation = false;
      this._hasUserLocation = false;
      this._currentLatitude = 0;
      this._currentLongitude = 0;
      
      this.notifyPropertyChange('currentLocationCoords', this._currentLocationCoords);
      this.notifyPropertyChange('locationStatus', this._locationStatus);
      this.notifyPropertyChange('locationLastUpdated', this._locationLastUpdated);
      this.notifyPropertyChange('hasCurrentLocation', this._hasCurrentLocation);
      this.notifyPropertyChange('hasUserLocation', this._hasUserLocation);
      
      alert({
        title: "Location Cleared",
        message: "Your saved location has been cleared.",
        okButtonText: "OK"
      });
    } catch (error) {
      console.error('Error clearing location:', error);
    }
  }

  onLocationMapLoaded(args: any) {
    if (!this._hasCurrentLocation) return;
    
    const webView = args.object;
    
    if (this._currentLatitude && this._currentLongitude) {
      // Use OpenStreetMap's direct URL with current location
      const zoom = 10;
      const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${this._currentLongitude-0.1},${this._currentLatitude-0.1},${this._currentLongitude+0.1},${this._currentLatitude+0.1}&layer=mapnik&marker=${this._currentLatitude},${this._currentLongitude}`;
      webView.src = mapUrl;
    }
  }

  get currentLocationCoords(): string {
    return this._currentLocationCoords;
  }

  get locationStatus(): string {
    return this._locationStatus;
  }

  get locationLastUpdated(): string {
    return this._locationLastUpdated;
  }

  get isGettingLocation(): boolean {
    return this._isGettingLocation;
  }

  get hasCurrentLocation(): boolean {
    return this._hasCurrentLocation;
  }

  get hasUserLocation(): boolean {
    return this._hasUserLocation;
  }

  get maxDistance(): number {
    return this._maxDistance;
  }

  set maxDistance(value: number) {
    const numValue = Number(value);
    if (!isNaN(numValue) && this._maxDistance !== numValue) {
      this._maxDistance = numValue;
      ApplicationSettings.setNumber('maxDistance', numValue);
      this.notifyPropertyChange('maxDistance', numValue);
    }
  }

  get enableDistanceFilter(): boolean {
    return this._enableDistanceFilter;
  }

  set enableDistanceFilter(value: boolean) {
    if (this._enableDistanceFilter !== value) {
      this._enableDistanceFilter = value;
      ApplicationSettings.setBoolean('enableDistanceFilter', value);
      this.notifyPropertyChange('enableDistanceFilter', value);
      // Apply filters when toggle changes
      this.applyFilters();
    }
  }

  get enablePowerFilter(): boolean {
    return this._enablePowerFilter;
  }

  set enablePowerFilter(value: boolean) {
    if (this._enablePowerFilter !== value) {
      this._enablePowerFilter = value;
      ApplicationSettings.setBoolean('enablePowerFilter', value);
      this.notifyPropertyChange('enablePowerFilter', value);
      // Apply filters when toggle changes
      this.applyFilters();
    }
  }

  private initializeFilterOptions() {
    // Get unique values from radio service
    const uniqueValues = this.radioService.uniqueValues;
    
    // Initialize languages
    const languages = Array.from(uniqueValues.languages).sort();
    this._availableLanguages = new ObservableArray(
      languages.map(lang => ({
        name: lang,
        isSelected: false
      }))
    );

    // Initialize ITUs
    const itus = Array.from(uniqueValues.itus).sort();
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
      this._maxDistance = savedState.maxDistance || 5000;
      this._enableDistanceFilter = savedState.enableDistanceFilter || false;
      this._enablePowerFilter = savedState.enablePowerFilter !== undefined ? savedState.enablePowerFilter : true;

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
      this.notifyPropertyChange('maxDistance', this._maxDistance);
      this.notifyPropertyChange('enableDistanceFilter', this._enableDistanceFilter);
      this.notifyPropertyChange('enablePowerFilter', this._enablePowerFilter);
    }

    // Notify property changes for the new properties
    this.notifyPropertyChange('availableLanguages', this._availableLanguages);
    this.notifyPropertyChange('availableITUs', this._availableITUs);
    this.notifyPropertyChange('selectedLanguagesText', this.selectedLanguagesText);
    this.notifyPropertyChange('selectedITUsText', this.selectedITUsText);
    this.notifyPropertyChange('hasSelectedLanguages', this.hasSelectedLanguages);
    this.notifyPropertyChange('hasSelectedITUs', this.hasSelectedITUs);
  }

  get selectedTimezone(): string {
    return this._selectedTimezone;
  }

  get selectedTimezoneName(): string {
    return this._selectedTimezoneName;
  }

  async showTimezoneSelector() {
    const options = this.timezones.map(tz => tz.displayName);
    
    try {
      const result = await action({
        title: "Select Time Zone",
        message: "Choose your local timezone:",
        cancelButtonText: "Cancel",
        actions: options
      });

      if (result !== "Cancel") {
        const selectedTimezone = this.timezones.find(tz => tz.displayName === result);
        if (selectedTimezone) {
          this._selectedTimezone = selectedTimezone.name;
          this._selectedTimezoneOffset = selectedTimezone.offset;
          this._selectedTimezoneName = selectedTimezone.name;
          
          // Save timezone setting
          ApplicationSettings.setString('selectedTimezone', selectedTimezone.name);
          
          this.notifyPropertyChange('selectedTimezone', this._selectedTimezone);
          this.notifyPropertyChange('selectedTimezoneName', this._selectedTimezoneName);
          
          // Update time immediately
          this.updateTime();
        }
      }
    } catch (error) {
      console.error('Error showing timezone selector:', error);
    }
  }

  async showLanguageSelector() {
    const languages = Array.from(this.radioService.uniqueValues.languages).sort();
    // Explicitly convert ObservableArray to regular array
    const selectedLanguages: string[] = [];
    this._availableLanguages.forEach(lang => {
      if (lang.isSelected) {
        selectedLanguages.push(lang.name);
      }
    });

    try {
      // Create a multi-select dialog using confirm dialogs
      const result = await this.showMultiSelectDialog(
        "Select Languages",
        "Choose languages to filter by:",
        languages,
        selectedLanguages
      );

      if (result !== null) {
        // Update language selections
        this._availableLanguages.forEach(lang => {
          lang.isSelected = result.includes(lang.name);
        });
        
        this.notifyPropertyChange('availableLanguages', this._availableLanguages);
        this.notifyPropertyChange('selectedLanguagesText', this.selectedLanguagesText);
        this.notifyPropertyChange('hasSelectedLanguages', this.hasSelectedLanguages);
        this.applyFilters();
      }
    } catch (error) {
      console.error('Error showing language selector:', error);
    }
  }

  async showITUSelector() {
    const itus = Array.from(this.radioService.uniqueValues.itus).sort();
    // Explicitly convert ObservableArray to regular array
    const selectedITUs: string[] = [];
    this._availableITUs.forEach(itu => {
      if (itu.isSelected) {
        selectedITUs.push(itu.name);
      }
    });

    try {
      // Create a multi-select dialog using confirm dialogs
      const result = await this.showMultiSelectDialog(
        "Select ITU Codes",
        "Choose ITU codes to filter by:",
        itus,
        selectedITUs
      );

      if (result !== null) {
        // Update ITU selections
        this._availableITUs.forEach(itu => {
          itu.isSelected = result.includes(itu.name);
        });
        
        this.notifyPropertyChange('availableITUs', this._availableITUs);
        this.notifyPropertyChange('selectedITUsText', this.selectedITUsText);
        this.notifyPropertyChange('hasSelectedITUs', this.hasSelectedITUs);
        this.applyFilters();
      }
    } catch (error) {
      console.error('Error showing ITU selector:', error);
    }
  }

  private async showMultiSelectDialog(title: string, message: string, options: string[], selected: string[]): Promise<string[] | null> {
    const selectedSet = new Set(selected);
    let currentSelection = new Set(selected);
    
    while (true) {
      // Create options with checkmarks for selected items
      const displayOptions = options.map(option => 
        currentSelection.has(option) ? `✓ ${option}` : `   ${option}`
      );
      
      // Add visual separators and style the control buttons
      const actions = [
        "━━━ ✅ DONE ━━━",
        "━━━ ❌ CANCEL ━━━", 
        "────────────────────",
        ...displayOptions
      ];
      
      try {
        const result = await action({
          title: title,
          message: `${message}\n\nSelected: ${currentSelection.size} items`,
          cancelButtonText: undefined,
          actions: actions
        });

        if (result === "━━━ ❌ CANCEL ━━━") {
          return null;
        } else if (result === "━━━ ✅ DONE ━━━") {
          return Array.from(currentSelection);
        } else if (result === "────────────────────") {
          // Ignore separator clicks
          continue;
        } else {
          // Toggle selection
          const optionIndex = displayOptions.indexOf(result);
          if (optionIndex >= 0) {
            const option = options[optionIndex];
            if (currentSelection.has(option)) {
              currentSelection.delete(option);
            } else {
              currentSelection.add(option);
            }
          }
        }
      } catch (error) {
        console.error('Error in multi-select dialog:', error);
        return null;
      }
    }
  }

  get selectedLanguagesText(): string {
    const selected = this._availableLanguages
      .filter(lang => lang.isSelected)
      .map(lang => lang.name);
    
    if (selected.length === 0) {
      return "All languages";
    } else if (selected.length <= 3) {
      return selected.join(", ");
    } else {
      return `${selected.slice(0, 3).join(", ")} and ${selected.length - 3} more`;
    }
  }

  get selectedITUsText(): string {
    const selected = this._availableITUs
      .filter(itu => itu.isSelected)
      .map(itu => itu.name);
    
    if (selected.length === 0) {
      return "All ITU codes";
    } else if (selected.length <= 3) {
      return selected.join(", ");
    } else {
      return `${selected.slice(0, 3).join(", ")} and ${selected.length - 3} more`;
    }
  }

  get hasSelectedLanguages(): boolean {
    return this._availableLanguages.some(lang => lang.isSelected);
  }

  get hasSelectedITUs(): boolean {
    return this._availableITUs.some(itu => itu.isSelected);
  }

  clearLanguages() {
    this._availableLanguages.forEach(lang => {
      lang.isSelected = false;
    });
    this.notifyPropertyChange('availableLanguages', this._availableLanguages);
    this.notifyPropertyChange('selectedLanguagesText', this.selectedLanguagesText);
    this.notifyPropertyChange('hasSelectedLanguages', this.hasSelectedLanguages);
    this.applyFilters();
  }

  clearITUs() {
    this._availableITUs.forEach(itu => {
      itu.isSelected = false;
    });
    this.notifyPropertyChange('availableITUs', this._availableITUs);
    this.notifyPropertyChange('selectedITUsText', this.selectedITUsText);
    this.notifyPropertyChange('hasSelectedITUs', this.hasSelectedITUs);
    this.applyFilters();
  }

  // Quick language selection methods
  selectEnglish() {
    this.selectLanguage('English');
  }

  selectUrdu() {
    this.selectLanguage('Urdu');
  }

  selectTamil() {
    this.selectLanguage('Tamil');
  }

  selectHindi() {
    this.selectLanguage('Hindi');
  }

  private selectLanguage(languageName: string) {
    // First clear all selections
    this._availableLanguages.forEach(lang => {
      lang.isSelected = false;
    });
    
    // Then select the specific language if it exists
    const targetLanguage = this._availableLanguages.find(lang => lang.name === languageName);
    if (targetLanguage) {
      targetLanguage.isSelected = true;
    }
    
    // Update UI and apply filters
    this.notifyPropertyChange('availableLanguages', this._availableLanguages);
    this.notifyPropertyChange('selectedLanguagesText', this.selectedLanguagesText);
    this.notifyPropertyChange('hasSelectedLanguages', this.hasSelectedLanguages);
    this.applyFilters();
  }

  get showMap(): boolean {
    return this._showMap;
  }

  set showMap(value: boolean) {
    if (this._showMap !== value) {
      this._showMap = value;
      ApplicationSettings.setBoolean('showMap', value);
      this.notifyPropertyChange('showMap', value);
    }
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

  get isDRMActive(): boolean {
    return this._searchQuery.toLowerCase().includes('digital');
  }

  toggleSearch() {
    this._isSearchVisible = !this._isSearchVisible;
    this.notifyPropertyChange('isSearchVisible', this._isSearchVisible);
    if (!this._isSearchVisible) {
      this._searchQuery = '';
      this.notifyPropertyChange('searchQuery', '');
      this.notifyPropertyChange('isDRMActive', this.isDRMActive);
      this.applyFilters();
    }
  }

  toggleLive() {
    try {
      this._showLiveOnly = !this._showLiveOnly;
      // Save Live state
      ApplicationSettings.setBoolean('showLiveOnly', this._showLiveOnly);
      this.notifyPropertyChange('showLiveOnly', this._showLiveOnly);
      this.applyFilters();
    } catch (error) {
      console.error('Error toggling Live filter:', error);
    }
  }

  toggleDRM() {
    try {
      if (this._searchQuery.toLowerCase().includes('digital')) {
        // Clear DRM filter
        this._searchQuery = '';
        this._isDRMActive = false;
      } else {
        // Apply DRM filter
        this._searchQuery = 'digital';
        this._isDRMActive = true;
      }
      
      // Save DRM state
      ApplicationSettings.setBoolean('isDRMActive', this._isDRMActive);
      
      this.notifyPropertyChange('searchQuery', this._searchQuery);
      this.notifyPropertyChange('isDRMActive', this.isDRMActive);
      this.applyFilters();
    } catch (error) {
      console.error('Error toggling DRM filter:', error);
    }
  }

  private startTimeUpdate() {
    this.timeUpdateInterval = setInterval(() => {
      this.updateTime();
      if (this._showLiveOnly) {
        this.applyFilters();
      }
      // Update upcoming schedules every minute
      this.updateUpcomingSchedules();
    }, 1000);
  }

  private updateTime() {
    const now = new Date();
    
    // UTC time and date with day abbreviation
    this.set('currentUTCTime', now.toISOString().substring(11, 19));
    const utcDate = now.toISOString().substring(0, 10).split('-').reverse().join('/');
    const utcDayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const utcDay = utcDayNames[now.getUTCDay()];
    this.set('currentUTCDay', utcDay);
    this.set('currentUTCDate', utcDate);
    
    // Local time based on selected timezone with day abbreviation
    const localTime = new Date(now.getTime() + (this._selectedTimezoneOffset * 60 * 60 * 1000));
    const hours = localTime.getUTCHours().toString().padStart(2, '0');
    const minutes = localTime.getUTCMinutes().toString().padStart(2, '0');
    const seconds = localTime.getUTCSeconds().toString().padStart(2, '0');
    this.set('currentLocalTime', `${hours}:${minutes}:${seconds}`);
    
    const day = localTime.getUTCDate().toString().padStart(2, '0');
    const month = (localTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = localTime.getUTCFullYear();
    const localDayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const localDay = localDayNames[localTime.getUTCDay()];
    this.set('currentLocalDay', localDay);
    this.set('currentLocalDate', `${day}/${month}/${year}`);
  }

  private updateUpcomingSchedules() {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const nextHour = (currentHour + 1) % 24;
    
    // Format next hour for display
    const nextHourFormatted = nextHour.toString().padStart(2, '0') + ':00-' + nextHour.toString().padStart(2, '0') + ':59';
    this.set('nextHourInfo', `Next Hour: ${nextHourFormatted} UTC`);
    
    // Get upcoming schedules
    const upcomingSchedules = this.radioService.getUpcomingSchedules(nextHour);
    this.set('upcomingSchedules', upcomingSchedules);
    this.set('upcomingCount', `${upcomingSchedules.length} stations broadcasting`);
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
      
      // Reinitialize filter options with new data
      this.initializeFilterOptions();
      
      this.applyFilters();
      this.updateUpcomingSchedules();
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
      ApplicationSettings.setBoolean('showLiveOnly', value);
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
      this.notifyPropertyChange('isDRMActive', this.isDRMActive);
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
    this._isDRMActive = false;
    this._frequencyMin = range.min;
    this._frequencyMax = range.max;
    this._timeStart = '00:00';
    this._timeEnd = '23:59';
    this._maxDistance = 5000;
    this._enableDistanceFilter = false;
    this._enablePowerFilter = true; // Reset to default enabled

    // Save cleared states
    ApplicationSettings.setBoolean('showLiveOnly', false);
    ApplicationSettings.setBoolean('isDRMActive', false);
    ApplicationSettings.setBoolean('enablePowerFilter', true);

    this.notifyPropertyChange('searchQuery', this._searchQuery);
    this.notifyPropertyChange('showLiveOnly', this._showLiveOnly);
    this.notifyPropertyChange('isDRMActive', this.isDRMActive);
    this.notifyPropertyChange('frequencyMin', this._frequencyMin);
    this.notifyPropertyChange('frequencyMax', this._frequencyMax);
    this.notifyPropertyChange('timeStart', this._timeStart);
    this.notifyPropertyChange('timeEnd', this._timeEnd);
    this.notifyPropertyChange('maxDistance', this._maxDistance);
    this.notifyPropertyChange('enableDistanceFilter', this._enableDistanceFilter);
    this.notifyPropertyChange('enablePowerFilter', this._enablePowerFilter);

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
    // Convert ObservableArray<FilterOption> to string arrays for the filter method
    const selectedLanguages = new Set<string>();
    this._availableLanguages.forEach(lang => {
      if (lang.isSelected) {
        selectedLanguages.add(lang.name);
      }
    });

    const selectedITUs = new Set<string>();
    this._availableITUs.forEach(itu => {
      if (itu.isSelected) {
        selectedITUs.add(itu.name);
      }
    });

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
      showLiveOnly: this._showLiveOnly,
      enableDistanceFilter: this._enableDistanceFilter,
      maxDistance: this._maxDistance,
      enablePowerFilter: this._enablePowerFilter,
      userLocation: this._hasUserLocation ? {
        latitude: this._currentLatitude,
        longitude: this._currentLongitude
      } : null
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

  // Upcoming tab sorting methods
  onSortUpcomingByFrequency() {
    this.sortUpcoming('frequency');
  }

  onSortUpcomingByTime() {
    this.sortUpcoming('time');
  }

  onSortUpcomingByStation() {
    this.sortUpcoming('stationName');
  }

  onSortUpcomingByLanguage() {
    this.sortUpcoming('language');
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

  private sortUpcoming(field: keyof RadioSchedule) {
    if (this.currentUpcomingSortField === field) {
      this.upcomingSortAscending = !this.upcomingSortAscending;
    } else {
      this.currentUpcomingSortField = field;
      this.upcomingSortAscending = true;
    }
    this.radioService.sortUpcomingBy(field, this.upcomingSortAscending);
  }

  onItemTap(args: any) {
    try {
      console.log('🎯 List item tapped - preparing navigation to Details page...');
      
      // Validate args and index
      if (!args || args.index === undefined || args.index < 0) {
        console.error('❌ Invalid tap arguments');
        return;
      }
      
      const schedule: RadioSchedule = this.schedules.getItem(args.index);
      
      if (!schedule) {
        console.error('❌ No schedule found at index:', args.index);
        return;
      }
      
      console.log(`📻 Selected station: ${schedule.stationName} (${schedule.frequency} kHz)`);
      
      // Navigate immediately with proper error handling
      try {
        const frame = Frame.topmost();
        if (!frame) {
          console.error('❌ No frame available for navigation');
          return;
        }
        
        frame.navigate({
          moduleName: 'details-page',
          context: { 
            schedule: schedule, 
            showMap: this._showMap 
          },
          animated: true,
          clearHistory: false,
          backstackVisible: true
        });
        console.log('✅ Navigation initiated successfully');
      } catch (navError) {
        console.error('❌ Error during navigation:', navError);
      }
      
    } catch (error) {
      console.error('❌ Error navigating to details page:', error);
    }
  }

  onUpcomingItemTap(args: any) {
    try {
      console.log('🎯 Upcoming item tapped - preparing navigation to Details page...');
      
      // Validate args and index
      if (!args || args.index === undefined || args.index < 0) {
        console.error('❌ Invalid upcoming tap arguments');
        return;
      }
      
      const upcomingSchedules = this.get('upcomingSchedules') as ObservableArray<RadioSchedule>;
      
      if (!upcomingSchedules || upcomingSchedules.length === 0) {
        console.error('❌ No upcoming schedules available');
        return;
      }
      
      const schedule: RadioSchedule = upcomingSchedules.getItem(args.index);
      
      if (!schedule) {
        console.error('❌ No upcoming schedule found at index:', args.index);
        return;
      }
      
      console.log(`📻 Selected upcoming station: ${schedule.stationName} (${schedule.frequency} kHz)`);
      
      // Navigate immediately with proper error handling
      try {
        const frame = Frame.topmost();
        if (!frame) {
          console.error('❌ No frame available for upcoming navigation');
          return;
        }
        
        frame.navigate({
          moduleName: 'details-page',
          context: { 
            schedule: schedule, 
            showMap: this._showMap 
          },
          animated: true,
          clearHistory: false,
          backstackVisible: true
        });
        console.log('✅ Navigation initiated successfully');
      } catch (navError) {
        console.error('❌ Error during navigation:', navError);
      }
      
    } catch (error) {
      console.error('❌ Error navigating to upcoming details page:', error);
    }
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

  // Cleanup method to prevent memory leaks
  destroy() {
    try {
      console.log('🧹 Cleaning up MainViewModel...');
      
      // Clear time update interval first
      if (this.timeUpdateInterval) {
        clearInterval(this.timeUpdateInterval);
        this.timeUpdateInterval = null;
      }
      
      // Clean up observable arrays
      try {
        if (this._availableLanguages) {
          this._availableLanguages.splice(0, this._availableLanguages.length);
        }
        if (this._availableITUs) {
          this._availableITUs.splice(0, this._availableITUs.length);
        }
      } catch (error) {
        console.error('Error clearing observable arrays:', error);
      }
      
      // Clean up services safely
      if (this.radioService) {
        try {
          // RadioService doesn't have a destroy method, just clear reference
          console.log('Clearing radioService reference');
        } catch (error) {
          console.error('Error destroying radioService:', error);
        } finally {
          this.radioService = null;
        }
      }
      
      if (this.syncService) {
        try {
          // SyncService doesn't have a destroy method, just clear reference
          console.log('Clearing syncService reference');
        } catch (error) {
          console.error('Error destroying syncService:', error);
        } finally {
          this.syncService = null;
        }
      }
      
      // Clear all primitive properties
      this._searchQuery = '';
      this._showLiveOnly = false;
      this._isSearchVisible = false;
      this._isDRMActive = false;
      this._hasUserLocation = false;
      this._hasCurrentLocation = false;
      this._isGettingLocation = false;
      
      // Clear location data
      this._currentLatitude = 0;
      this._currentLongitude = 0;
      this._currentLocationCoords = '';
      this._locationStatus = '';
      this._locationLastUpdated = '';
      
      // Clear timezone data
      this._selectedTimezone = '';
      this._selectedTimezoneOffset = 0;
      this._selectedTimezoneName = '';
      
      // Clear arrays
      this.timezones = [];
      
      // Clear references
      this._availableLanguages = null;
      this._availableITUs = null;
      
      console.log('✅ MainViewModel cleanup complete');
    } catch (error) {
      console.error('❌ Error during MainViewModel cleanup:', error);
      
      // Force clear critical references even if cleanup fails
      try {
        if (this.timeUpdateInterval) {
          clearInterval(this.timeUpdateInterval);
          this.timeUpdateInterval = null;
        }
        this.radioService = null;
        this.syncService = null;
      } catch (forceError) {
        console.error('❌ Error in force cleanup:', forceError);
      }
    }
  }
}