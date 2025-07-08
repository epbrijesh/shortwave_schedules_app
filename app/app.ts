import { Application } from '@nativescript/core';

// Global error handler for unhandled exceptions
Application.on(Application.uncaughtErrorEvent, (args) => {
  console.error('🚨 Uncaught Error:', args.error);
  
  // Try to handle fragment errors gracefully
  if (args.error && args.error.message && args.error.message.includes('fragment')) {
    console.log('🔧 Attempting to handle fragment error...');
    
    // Import cleanup functions dynamically to avoid circular dependencies
    try {
      import('./main-page').then(mainPage => {
        if (mainPage.forceCleanup) {
          mainPage.forceCleanup();
        }
      });
      
      import('./details-page').then(detailsPage => {
        if (detailsPage.forceCleanup) {
          detailsPage.forceCleanup();
        }
      });
    } catch (cleanupError) {
      console.error('❌ Error during fragment cleanup:', cleanupError);
    }
  }
});

// Global resume handler to ensure clean state
Application.on(Application.resumeEvent, () => {
  console.log('📱 App resumed - checking for fragment issues...');
  
  // Force garbage collection if available
  if (global.gc) {
    try {
      global.gc();
      console.log('🧹 Garbage collection triggered');
    } catch (gcError) {
      console.error('❌ Error triggering garbage collection:', gcError);
    }
  }
});

Application.run({ moduleName: 'app-root' });
