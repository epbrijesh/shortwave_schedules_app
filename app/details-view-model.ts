import { Observable } from '@nativescript/core';
import { ApplicationSettings } from '@nativescript/core';
import { RadioSchedule } from './models/radio-schedule';
import { daysToString, parseCoordinates } from './models/radio-schedule';
import { Utils } from '@nativescript/core';

export class DetailsViewModel extends Observable {
  private schedule: RadioSchedule;
  private _showMap: boolean;
  private _userLatitude: number = 0;
  private _userLongitude: number = 0;
  private _hasUserLocation: boolean = false;
  private _distance: string = '';
  private _isDestroyed: boolean = false;
  private _mapDescription: string = '';
  private _mapReady: boolean = false;
  private mapWebView: any = null;
  private mapLoadTimeout: any = null;
  private preloadedMapUrl: string = '';

  constructor(schedule: RadioSchedule, showMap: boolean = false) {
    super();
    this.schedule = schedule;
    this._showMap = showMap;
    
    // Initialize with priority - load user location and prepare map immediately
    this.initializeWithPriority();
  }

  private async initializeWithPriority() {
    console.log('🚀 Initializing Details page with OpenStreetMap priority...');
    
    try {
      // Step 1: Load user location immediately
      this.loadUserLocation();
      
      // Step 2: Calculate distance immediately
      this.calculateDistance();
      
      // Step 3: Pre-generate map URL for faster loading
      this.preloadMapUrl();
      
      // Step 4: Update map description
      this.updateMapDescription();
      
      // Step 5: Mark as ready for immediate map loading
      this._mapReady = true;
      this.safeNotifyPropertyChange('mapReady', this._mapReady);
      
      console.log('✅ Details page initialization complete - OpenStreetMap ready');
      
    } catch (error) {
      console.error('❌ Error during priority initialization:', error);
    }
  }

  private preloadMapUrl() {
    if (this._isDestroyed) return;
    
    try {
      const coords = parseCoordinates(this.schedule.coordinates);
      
      if (coords) {
        console.log('📍 Pre-generating OpenStreetMap URL for coordinates:', coords);
        
        let mapUrl: string;
        let zoom = 10;
        
        if (this._hasUserLocation) {
          // Calculate center point between user and transmission station
          const centerLat = (coords.lat + this._userLatitude) / 2;
          const centerLon = (coords.lon + this._userLongitude) / 2;
          
          // Calculate zoom level based on distance
          const distance = this.haversineDistance(this._userLatitude, this._userLongitude, coords.lat, coords.lon);
          if (distance > 5000) zoom = 4;
          else if (distance > 2000) zoom = 5;
          else if (distance > 1000) zoom = 6;
          else if (distance > 500) zoom = 7;
          else if (distance > 200) zoom = 8;
          else if (distance > 100) zoom = 9;
          else if (distance > 50) zoom = 10;
          else zoom = 11;
          
          // Create bounding box that includes both points with some padding
          const latDiff = Math.abs(coords.lat - this._userLatitude);
          const lonDiff = Math.abs(coords.lon - this._userLongitude);
          const padding = Math.max(latDiff, lonDiff) * 0.3; // 30% padding
          
          const minLat = Math.min(coords.lat, this._userLatitude) - padding;
          const maxLat = Math.max(coords.lat, this._userLatitude) + padding;
          const minLon = Math.min(coords.lon, this._userLongitude) - padding;
          const maxLon = Math.max(coords.lon, this._userLongitude) + padding;
          
          // Use OpenStreetMap export with both markers
          mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${minLon},${minLat},${maxLon},${maxLat}&layer=mapnik&marker=${coords.lat},${coords.lon}&marker=${this._userLatitude},${this._userLongitude}`;
          
          console.log(`🗺️ Dual-location map prepared (distance: ${this._distance})`);
        } else {
          // Show only transmission station with appropriate zoom
          const offset = 0.1 / zoom; // Smaller offset for higher zoom levels
          const minLat = coords.lat - offset;
          const maxLat = coords.lat + offset;
          const minLon = coords.lon - offset;
          const maxLon = coords.lon + offset;
          
          mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${minLon},${minLat},${maxLon},${maxLat}&layer=mapnik&marker=${coords.lat},${coords.lon}`;
          
          console.log('🗺️ Single-location map prepared');
        }
        
        this.preloadedMapUrl = mapUrl;
        console.log('✅ OpenStreetMap URL pre-generated and cached');
        
      } else {
        console.error('❌ Invalid coordinates for station:', this.schedule.coordinates);
        // Prepare world map as fallback
        this.preloadedMapUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=-180,-85,180,85&layer=mapnik';
      }
    } catch (error) {
      console.error('❌ Error pre-generating map URL:', error);
      this.preloadedMapUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=-180,-85,180,85&layer=mapnik';
    }
  }

  private loadUserLocation() {
    if (this._isDestroyed) return;
    
    try {
      const savedLat = ApplicationSettings.getNumber('currentLatitude');
      const savedLon = ApplicationSettings.getNumber('currentLongitude');
      const savedCoords = ApplicationSettings.getString('currentLocationCoords');
      
      if (savedCoords && savedLat && savedLon) {
        this._userLatitude = savedLat;
        this._userLongitude = savedLon;
        this._hasUserLocation = true;
        console.log('📍 User location loaded:', this._userLatitude, this._userLongitude);
      } else {
        console.log('⚠️ No user location found');
      }
    } catch (error) {
      console.error('❌ Error loading user location:', error);
    }
  }

  private updateMapDescription() {
    const txCoords = parseCoordinates(this.schedule.coordinates);
    if (!txCoords) {
      this._mapDescription = 'Map shows the transmission location (coordinates could not be parsed)';
      this.safeNotifyPropertyChange('mapDescription', this._mapDescription);
      return;
    }

    if (this._hasUserLocation) {
      this._mapDescription = `Interactive map showing your location (blue marker) and transmission station (red marker). Distance: ${this._distance}`;
    } else {
      this._mapDescription = 'Interactive map showing the transmission station location. Set your location in Settings to see both locations.';
    }
    
    this.safeNotifyPropertyChange('mapDescription', this._mapDescription);
  }

  private calculateDistance() {
    if (this._isDestroyed) return;
    
    if (!this._hasUserLocation) {
      this._distance = 'Set location in Settings';
      this.safeNotifyPropertyChange('distance', this._distance);
      return;
    }

    const txCoords = parseCoordinates(this.schedule.coordinates);
    if (!txCoords) {
      this._distance = 'Invalid coordinates';
      this.safeNotifyPropertyChange('distance', this._distance);
      return;
    }

    const distanceKm = this.haversineDistance(
      this._userLatitude,
      this._userLongitude,
      txCoords.lat,
      txCoords.lon
    );

    if (distanceKm < 1) {
      this._distance = `${Math.round(distanceKm * 1000)} meters`;
    } else if (distanceKm < 1000) {
      this._distance = `${distanceKm.toFixed(1)} km`;
    } else {
      this._distance = `${Math.round(distanceKm).toLocaleString()} km`;
    }

    this.safeNotifyPropertyChange('distance', this._distance);
  }

  private safeNotifyPropertyChange(propertyName: string, value: any) {
    if (!this._isDestroyed) {
      try {
        this.notifyPropertyChange(propertyName, value);
      } catch (error) {
        console.error('❌ Error notifying property change:', error);
      }
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

  // Azimuth-related computed properties
  get isNonDirectional(): boolean {
    return this.schedule.azimuth.toUpperCase() === 'ND' || this.schedule.azimuth.trim() === '';
  }

  get azimuthDisplay(): string {
    if (this.isNonDirectional) {
      return 'Non-Directional';
    }
    const azimuth = parseFloat(this.schedule.azimuth);
    return isNaN(azimuth) ? 'Unknown' : `${azimuth}°`;
  }

  get azimuthRotation(): string {
    if (this.isNonDirectional) {
      return '';
    }
    const azimuth = parseFloat(this.schedule.azimuth);
    if (isNaN(azimuth)) {
      return '';
    }
    // This property is no longer used - keeping for backward compatibility
    return '';
  }

  get azimuthValue(): number {
    if (this.isNonDirectional) {
      return 0;
    }
    const azimuth = parseFloat(this.schedule.azimuth);
    return isNaN(azimuth) ? 0 : azimuth;
  }

  get directionDescription(): string {
    if (this.isNonDirectional) {
      return 'This station transmits in all directions (omnidirectional antenna pattern)';
    }
    
    const azimuth = parseFloat(this.schedule.azimuth);
    if (isNaN(azimuth)) {
      return 'Direction information not available';
    }

    // Convert azimuth to compass direction
    const directions = [
      { min: 0, max: 11.25, name: 'North' },
      { min: 11.25, max: 33.75, name: 'North-Northeast' },
      { min: 33.75, max: 56.25, name: 'Northeast' },
      { min: 56.25, max: 78.75, name: 'East-Northeast' },
      { min: 78.75, max: 101.25, name: 'East' },
      { min: 101.25, max: 123.75, name: 'East-Southeast' },
      { min: 123.75, max: 146.25, name: 'Southeast' },
      { min: 146.25, max: 168.75, name: 'South-Southeast' },
      { min: 168.75, max: 191.25, name: 'South' },
      { min: 191.25, max: 213.75, name: 'South-Southwest' },
      { min: 213.75, max: 236.25, name: 'Southwest' },
      { min: 236.25, max: 258.75, name: 'West-Southwest' },
      { min: 258.75, max: 281.25, name: 'West' },
      { min: 281.25, max: 303.75, name: 'West-Northwest' },
      { min: 303.75, max: 326.25, name: 'Northwest' },
      { min: 326.25, max: 348.75, name: 'North-Northwest' },
      { min: 348.75, max: 360, name: 'North' }
    ];

    const direction = directions.find(d => azimuth >= d.min && azimuth < d.max);
    const directionName = direction ? direction.name : 'Unknown';
    
    return `Transmitting towards ${directionName} (${azimuth}° from North)`;
  }

  get frequency() { return this.schedule.frequency; }
  get time() { return this.schedule.time; }
  get stationName() { return this.schedule.stationName; }
  get language() { return this.schedule.language; }
  get txLocation() { return this.schedule.txLocation; }
  get coordinates() { return this.schedule.coordinates; }
  get power() { return this.schedule.power; }
  get azimuth() { return this.schedule.azimuth; }
  get remarks() { return this.schedule.remarks; }
  get broadcastDays() { return daysToString(this.schedule.days); }
  get showMap() { return this._showMap; }
  get distance() { return this._distance; }
  get hasUserLocation() { return this._hasUserLocation; }
  get mapDescription() { return this._mapDescription; }
  get mapReady() { return this._mapReady; }

  onMapLoaded(args: any) {
    if (this._isDestroyed) return;
    
    try {
      this.mapWebView = args.object;
      console.log('🗺️ Map WebView loaded - loading pre-generated OpenStreetMap immediately...');
      
      // Clear any existing timeout
      if (this.mapLoadTimeout) {
        clearTimeout(this.mapLoadTimeout);
      }
      
      // Load immediately since we have pre-generated URL
      if (this.preloadedMapUrl && this._mapReady) {
        console.log('⚡ Loading pre-cached OpenStreetMap URL immediately');
        this.mapWebView.src = this.preloadedMapUrl;
      } else {
        // Fallback: generate URL on demand with minimal delay
        console.log('⏳ Generating OpenStreetMap URL on demand...');
        this.mapLoadTimeout = setTimeout(() => {
          this.loadMap();
        }, 100); // Reduced delay for faster loading
      }
      
    } catch (error) {
      console.error('❌ Error in onMapLoaded:', error);
    }
  }

  private loadMap() {
    if (!this.mapWebView || this._isDestroyed) return;
    
    try {
      console.log('🗺️ Loading OpenStreetMap...');
      
      if (this.preloadedMapUrl) {
        console.log('⚡ Using pre-cached OpenStreetMap URL');
        this.mapWebView.src = this.preloadedMapUrl;
      } else {
        console.log('🔄 Generating OpenStreetMap URL on demand');
        this.preloadMapUrl();
        if (this.preloadedMapUrl) {
          this.mapWebView.src = this.preloadedMapUrl;
        }
      }
      
      console.log('✅ OpenStreetMap loaded successfully');
      
    } catch (error) {
      console.error('❌ Error loading OpenStreetMap:', error);
    }
  }

  refreshMap() {
    if (this._isDestroyed) return;
    
    try {
      console.log('🔄 Refreshing OpenStreetMap with priority...');
      
      // Step 1: Reload user location in case it has changed
      this.loadUserLocation();
      this.calculateDistance();
      
      // Step 2: Re-generate map URL with updated data
      this.preloadMapUrl();
      this.updateMapDescription();
      
      // Step 3: Reload the map immediately with new URL
      if (this.mapWebView && this.preloadedMapUrl) {
        console.log('⚡ Refreshing with pre-generated URL');
        // Force reload by setting src to empty first, then loading new map
        this.mapWebView.src = 'about:blank';
        
        setTimeout(() => {
          this.mapWebView.src = this.preloadedMapUrl;
          console.log('✅ OpenStreetMap refreshed successfully');
        }, 100); // Minimal delay for faster refresh
      } else {
        console.log('⚠️ Map WebView not available for refresh');
      }
      
    } catch (error) {
      console.error('❌ Error refreshing OpenStreetMap:', error);
    }
  }

  copyToClipboard() {
    if (this._isDestroyed) return;
    
    try {
      const distanceText = this._hasUserLocation ? `\nDistance: ${this._distance}` : '';
      const directionText = this.isNonDirectional ? '\nDirection: Non-Directional' : `\nDirection: ${this.azimuthDisplay}`;
      const text = `\n------ *Radio Log* ------\nFreq: ${this.frequency} kHz\nTime: ${this.time} UTC\nStation: ${this.stationName}\nLang: ${this.language}\nTX: ${this.txLocation} [${this.power} KW]${distanceText}${directionText}\n------------------\nGenerated from *SW Radio Schedule App* by Brijesh Pookkottur\nhttps://play.google.com/store/apps/details?id=com.thinkdigit.swschedule\n`;
      Utils.copyToClipboard(text);
    } catch (error) {
      console.error('❌ Error copying to clipboard:', error);
    }
  }

  // Cleanup method to prevent memory leaks
  destroy() {
    try {
      console.log('🧹 Cleaning up DetailsViewModel...');
      
      // Set destroyed flag immediately to prevent further operations
      this._isDestroyed = true;
      
      // Clear timeout first
      if (this.mapLoadTimeout) {
        clearTimeout(this.mapLoadTimeout);
        this.mapLoadTimeout = null;
      }
      
      // Clear WebView reference safely
      if (this.mapWebView) {
        try {
          // Clear WebView source immediately
          this.mapWebView.src = '';
          // Small delay before setting to about:blank to ensure cleanup
          setTimeout(() => {
            if (this.mapWebView) {
              this.mapWebView.src = 'about:blank';
            }
          }, 10);
        } catch (error) {
          console.error('Error clearing WebView:', error);
        }
        // Clear reference after a small delay
        setTimeout(() => {
          this.mapWebView = null;
        }, 50);
      }
      
      // Clear all object references
      try {
        this.schedule = null;
        this.preloadedMapUrl = '';
        this._userLatitude = 0;
        this._userLongitude = 0;
        this._hasUserLocation = false;
        this._distance = '';
        this._mapDescription = '';
        this._mapReady = false;
      } catch (error) {
        console.error('Error clearing object references:', error);
      }
      
      console.log('✅ DetailsViewModel cleanup complete');
    } catch (error) {
      console.error('❌ Error during DetailsViewModel cleanup:', error);
      // Ensure destroyed flag is set even if cleanup fails
      this._isDestroyed = true;
      // Force clear critical references
      this.schedule = null;
      this.mapWebView = null;
      this.preloadedMapUrl = '';
    }
  }
}