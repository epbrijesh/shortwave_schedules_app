import { Observable } from '@nativescript/core';
import { ApplicationSettings } from '@nativescript/core';

interface Version {
  version: string;
  lastUpdated: string;
}

export class SyncService extends Observable {
  private _currentVersion: string;
  private _onlineVersion: string = '';
  private _isChecking: boolean = false;
  private _isSyncing: boolean = false;

  constructor() {
    super();
    this.initializeStorage();
    this._currentVersion = this.loadSavedVersion() || '1.0.0';
    this.checkVersion();
  }

  private initializeStorage() {
    if (!ApplicationSettings.hasKey('currentVersion')) {
      ApplicationSettings.setString('currentVersion', '1.0.0');
    }
  }

  private loadSavedVersion(): string | null {
    try {
      return ApplicationSettings.getString('currentVersion');
    } catch (error) {
      console.error('Error loading saved version:', error);
      return null;
    }
  }

  private saveVersion(version: string) {
    try {
      ApplicationSettings.setString('currentVersion', version);
    } catch (error) {
      console.error('Error saving version:', error);
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
      this.notifyPropertyChange('onlineVersion', version.version);
      
    } catch (error) {
      console.error('Error checking version:', error);
      this._onlineVersion = 'Error';
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

      const response = await fetch('https://raw.githubusercontent.com/epbrijesh/shortwave_schedules_app/main/app/data/schedules.json');
      if (!response.ok) {
        throw new Error('Failed to fetch schedules');
      }
      const schedules = await response.json();
      
      // Update and save current version after successful sync
      this._currentVersion = this._onlineVersion;
      this.saveVersion(this._currentVersion);
      this.notifyPropertyChange('currentVersion', this._currentVersion);
      
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
    return this._currentVersion;
  }

  get onlineVersion(): string {
    return this._onlineVersion;
  }

  get isChecking(): boolean {
    return this._isChecking;
  }

  get isSyncing(): boolean {
    return this._isSyncing;
  }
}