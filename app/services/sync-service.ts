import { Observable } from '@nativescript/core';
import { ApplicationSettings } from '@nativescript/core';

interface Version {
  version: string;
  lastUpdated: string;
}

export class SyncService extends Observable {
  private _currentVersion: string;
  private _currentVersionDisplay: string;
  private _onlineVersion: string = '';
  private _onlineVersionDisplay: string = '';
  private _isChecking: boolean = false;
  private _isSyncing: boolean = false;

  constructor() {
    super();
    this.initializeStorage();
    const savedVersionData = this.loadSavedVersionData();
    this._currentVersion = savedVersionData.version || '1.0.0';
    this._currentVersionDisplay = savedVersionData.display || '1.0.0';
    this.checkVersion();
  }

  private initializeStorage() {
    if (!ApplicationSettings.hasKey('currentVersion')) {
      ApplicationSettings.setString('currentVersion', '1.0.0');
    }
    if (!ApplicationSettings.hasKey('currentVersionDisplay')) {
      ApplicationSettings.setString('currentVersionDisplay', '1.0.0');
    }
  }

  private loadSavedVersionData(): { version: string; display: string } {
    try {
      const version = ApplicationSettings.getString('currentVersion') || '1.0.0';
      const display = ApplicationSettings.getString('currentVersionDisplay') || '1.0.0';
      return { version, display };
    } catch (error) {
      console.error('Error loading saved version:', error);
      return { version: '1.0.0', display: '1.0.0' };
    }
  }

  private saveVersion(version: string, display: string) {
    try {
      ApplicationSettings.setString('currentVersion', version);
      ApplicationSettings.setString('currentVersionDisplay', display);
    } catch (error) {
      console.error('Error saving version:', error);
    }
  }

  private formatVersionDisplay(version: string, lastUpdated: string): string {
    try {
      // Parse the ISO date string and format it
      const date = new Date(lastUpdated);
      const year = date.getUTCFullYear();
      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
      const day = date.getUTCDate().toString().padStart(2, '0');
      const hours = date.getUTCHours().toString().padStart(2, '0');
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      
      return `${version} (${year}-${month}-${day} ${hours}:${minutes} UTC)`;
    } catch (error) {
      console.error('Error formatting version display:', error);
      return version; // Fallback to just version number
    }
  }
  async checkVersion(): Promise<void> {
    if (this._isChecking) return;
    
    try {
      this._isChecking = true;
      this.notifyPropertyChange('isChecking', true);
      
      const response = await fetch('https://raw.githubusercontent.com/epbrijesh/shortwave_schedules_app/main/app/data/version.json');
      if (!response.ok) {
        throw new Error('Failed to fetch version');
      }
      const version: Version = await response.json();
      this._onlineVersion = version.version;
      this._onlineVersionDisplay = this.formatVersionDisplay(version.version, version.lastUpdated);
      this.notifyPropertyChange('onlineVersion', this._onlineVersionDisplay);
      
    } catch (error) {
      console.error('Error checking version:', error);
      this._onlineVersion = 'Error';
      this._onlineVersionDisplay = 'Error';
      this.notifyPropertyChange('onlineVersion', 'Error');
    } finally {
      this._isChecking = false;
      this.notifyPropertyChange('isChecking', false);
    }
  }

  async syncSchedules(): Promise<any[]> {
    if (this._isSyncing) return [];
    
    try {
      this._isSyncing = true;
      this.notifyPropertyChange('isSyncing', true);

      // First get the version info to update display format
      const versionResponse = await fetch('https://raw.githubusercontent.com/epbrijesh/shortwave_schedules_app/main/app/data/version.json');
      if (!versionResponse.ok) {
        throw new Error('Failed to fetch version info');
      }
      const versionData: Version = await versionResponse.json();

      const response = await fetch('https://raw.githubusercontent.com/epbrijesh/shortwave_schedules_app/main/app/data/schedules.json');
      if (!response.ok) {
        throw new Error('Failed to fetch schedules');
      }
      const schedules = await response.json();
      
      // Update and save current version after successful sync
      this._currentVersion = versionData.version;
      this._currentVersionDisplay = this.formatVersionDisplay(versionData.version, versionData.lastUpdated);
      this.saveVersion(this._currentVersion, this._currentVersionDisplay);
      this.notifyPropertyChange('currentVersion', this._currentVersionDisplay);
      
      return schedules;
    } catch (error) {
      console.error('Error syncing schedules:', error);
      throw error;
    } finally {
      this._isSyncing = false;
      this.notifyPropertyChange('isSyncing', false);
    }
  }

  get currentVersion(): string {
    return this._currentVersionDisplay;
  }

  get onlineVersion(): string {
    return this._onlineVersionDisplay;
  }

  get isChecking(): boolean {
    return this._isChecking;
  }

  get isSyncing(): boolean {
    return this._isSyncing;
  }
}