import { EventData, Page, NavigatedData } from '@nativescript/core';
import { MainViewModel } from './main-view-model';

let viewModel: MainViewModel;
let currentPage: Page;
let isDestroyed: boolean = false;

export function navigatingTo(args: EventData) {
  try {
    console.log('🚀 Navigating to Main page...');
    const page = <Page>args.object;
    currentPage = page;
    
    // Reset destruction flag
    isDestroyed = false;
    
    // Clean up previous view model if it exists
    cleanupViewModel();
    
    // Create new view model
    console.log('⚡ Creating MainViewModel...');
    viewModel = new MainViewModel();
    
    // Set binding context with error handling
    try {
      page.bindingContext = viewModel;
      console.log('✅ Main page navigation complete');
    } catch (bindingError) {
      console.error('❌ Error setting binding context:', bindingError);
      cleanupViewModel();
    }
    
  } catch (error) {
    console.error('❌ Error in main page navigatingTo:', error);
    cleanupViewModel();
  }
}

export function navigatingFrom(args: NavigatedData) {
  try {
    console.log('🧹 Navigating from Main page...');
    
    // Prevent multiple cleanup calls
    if (isDestroyed) {
      console.log('⚠️ Main page already destroyed, skipping cleanup');
      return;
    }
    
    isDestroyed = true;
    
    // Clean up view model when leaving the page
    cleanupViewModel();
    
    // Clear page references with delay to avoid race conditions
    setTimeout(() => {
      try {
        if (currentPage) {
          currentPage.bindingContext = null;
        }
        currentPage = null;
      } catch (error) {
        console.error('Error clearing main page references:', error);
      }
    }, 50);
    
    console.log('✅ Main page cleanup initiated');
    
  } catch (error) {
    console.error('❌ Error in main page navigatingFrom:', error);
  }
}

function cleanupViewModel() {
  if (viewModel) {
    try {
      viewModel.destroy();
    } catch (error) {
      console.error('Error destroying MainViewModel:', error);
    }
    viewModel = null;
  }
}

// Export cleanup function for external use
export function forceCleanup() {
  try {
    isDestroyed = true;
    cleanupViewModel();
    
    if (currentPage) {
      currentPage.bindingContext = null;
      currentPage = null;
    }
  } catch (error) {
    console.error('Error in main page forceCleanup:', error);
  }
}

// Export viewModel for external access if needed
export function getViewModel(): MainViewModel | null {
  return viewModel;
}