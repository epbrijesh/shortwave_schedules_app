import { EventData, Page, NavigatedData, Frame } from '@nativescript/core';
import { DetailsViewModel } from './details-view-model';

let viewModel: DetailsViewModel;
let currentPage: Page;
let isNavigating: boolean = false;
let isDestroyed: boolean = false;
let navigationTimeout: any = null;

export function navigatingTo(args: NavigatedData) {
  try {
    console.log('🚀 Navigating to Details page...');
    const page = <Page>args.object;
    currentPage = page;
    const context = args.context;
    
    // Reset all flags
    isNavigating = false;
    isDestroyed = false;
    
    // Clear any pending navigation timeout
    if (navigationTimeout) {
      clearTimeout(navigationTimeout);
      navigationTimeout = null;
    }
    
    // Clean up previous view model if it exists
    cleanupViewModel();
    
    // Create view model with context validation
    if (context && context.schedule) {
      console.log('⚡ Creating DetailsViewModel...');
      viewModel = new DetailsViewModel(context.schedule, context.showMap);
      
      // Set binding context with error handling
      try {
        page.bindingContext = viewModel;
        console.log('✅ Details page navigation complete');
      } catch (bindingError) {
        console.error('❌ Error setting binding context:', bindingError);
        cleanupAndNavigateBack();
      }
    } else {
      console.error('❌ Invalid context provided to Details page');
      cleanupAndNavigateBack();
    }
    
  } catch (error) {
    console.error('❌ Error in navigatingTo:', error);
    cleanupAndNavigateBack();
  }
}

export function navigatingFrom(args: NavigatedData) {
  try {
    console.log('🧹 Navigating from Details page...');
    
    // Prevent multiple cleanup calls
    if (isDestroyed) {
      console.log('⚠️ Already destroyed, skipping cleanup');
      return;
    }
    
    isDestroyed = true;
    
    // Clean up immediately but safely
    cleanupViewModel();
    
    // Clear page references with delay to avoid race conditions
    setTimeout(() => {
      try {
        if (currentPage && !isNavigating) {
          currentPage.bindingContext = null;
        }
        currentPage = null;
      } catch (error) {
        console.error('Error clearing page references:', error);
      }
    }, 50);
    
    console.log('✅ Details page cleanup initiated');
    
  } catch (error) {
    console.error('❌ Error in navigatingFrom:', error);
  }
}

export function onBackButtonTap() {
  try {
    console.log('⬅️ Back button tapped...');
    
    // Prevent multiple navigation attempts
    if (isNavigating || isDestroyed) {
      console.log('⚠️ Navigation already in progress or page destroyed');
      return;
    }
    
    cleanupAndNavigateBack();
    
  } catch (error) {
    console.error('❌ Error in onBackButtonTap:', error);
    // Emergency fallback
    emergencyNavigateBack();
  }
}

function cleanupViewModel() {
  if (viewModel) {
    try {
      viewModel.destroy();
    } catch (error) {
      console.error('Error destroying viewModel:', error);
    }
    viewModel = null;
  }
}

function cleanupAndNavigateBack() {
  if (isNavigating) {
    console.log('⚠️ Navigation already in progress');
    return;
  }
  
  try {
    isNavigating = true;
    isDestroyed = true;
    
    // Clean up immediately
    cleanupViewModel();
    
    // Navigate back with proper frame validation
    const frame = Frame.topmost();
    if (frame) {
      if (frame.canGoBack()) {
        console.log('🔄 Navigating back...');
        frame.goBack();
      } else {
        console.log('🔄 Cannot go back, navigating to main page...');
        frame.navigate({
          moduleName: 'main-page',
          clearHistory: true,
          animated: true
        });
      }
    } else {
      console.error('❌ No frame available for navigation');
      emergencyNavigateBack();
    }
    
  } catch (error) {
    console.error('❌ Error in cleanupAndNavigateBack:', error);
    emergencyNavigateBack();
  }
}

function emergencyNavigateBack() {
  console.log('🚨 Emergency navigation fallback');
  
  // Clear any existing timeout
  if (navigationTimeout) {
    clearTimeout(navigationTimeout);
  }
  
  // Set timeout for emergency navigation
  navigationTimeout = setTimeout(() => {
    try {
      isNavigating = true;
      isDestroyed = true;
      
      // Force cleanup
      cleanupViewModel();
      
      // Force navigation to main page
      const frame = Frame.topmost();
      if (frame) {
        frame.navigate({
          moduleName: 'main-page',
          clearHistory: true,
          animated: false
        });
      }
    } catch (fallbackError) {
      console.error('❌ Error in emergency navigation:', fallbackError);
    }
  }, 100);
}

// Export cleanup function for external use
export function forceCleanup() {
  try {
    isDestroyed = true;
    isNavigating = false;
    
    if (navigationTimeout) {
      clearTimeout(navigationTimeout);
      navigationTimeout = null;
    }
    
    cleanupViewModel();
    
    if (currentPage) {
      currentPage.bindingContext = null;
      currentPage = null;
    }
  } catch (error) {
    console.error('Error in forceCleanup:', error);
  }
}