import { EventData, Page, NavigatedData, Frame } from '@nativescript/core';
import { DetailsViewModel } from './details-view-model';

export function navigatingTo(args: NavigatedData) {
  const page = <Page>args.object;
  page.bindingContext = new DetailsViewModel(args.context);
}

export function onBackButtonTap() {
  Frame.topmost().goBack();
}