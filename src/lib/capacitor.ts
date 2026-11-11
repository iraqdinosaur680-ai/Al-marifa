import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export function initializeCapacitorPlugins() {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    
    // Configure Status Bar
    if (platform === 'ios') {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    } else {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#090d16' }).catch(() => {});
    }
  }
}
