import { Observable } from '@nativescript/core';
import { RadioSchedule } from './models/radio-schedule';
import { daysToString, parseCoordinates } from './models/radio-schedule';
import { Utils } from '@nativescript/core';

export class DetailsViewModel extends Observable {
  private schedule: RadioSchedule;

  constructor(schedule: RadioSchedule) {
    super();
    this.schedule = schedule;
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

  onMapLoaded(args: any) {
    const webView = args.object;
    const coords = parseCoordinates(this.schedule.coordinates);
    
    if (coords) {
      // Use OpenStreetMap's direct URL
      const zoom = 8;
      const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lon-1},${coords.lat-1},${coords.lon+1},${coords.lat+1}&layer=mapnik&marker=${coords.lat},${coords.lon}`;
      webView.src = mapUrl;
    }
  }

  copyToClipboard() {
    const text = `\n------ *Radio Log* ------\nFreq: ${this.frequency} kHz\nTime: ${this.time} UTC\nStation: ${this.stationName}\nLang: ${this.language}\nTX: ${this.txLocation} [${this.power} KW]\n------------------\nGenerated from *SW Radio Schedule App* by Brijesh Pookkottur\nhttps://play.google.com/store/apps/details?id=com.thinkdigit.swschedule\n`;
    Utils.copyToClipboard(text);
  }
}