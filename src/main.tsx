import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeCapacitorPlugins } from './lib/capacitor';

// Initialize Capacitor native plugins (StatusBar, etc.)
initializeCapacitorPlugins();

// Anti-screenshot & Media Protection Event Listeners
if (typeof window !== 'undefined') {
  // Prevent right-click and long-press contextual menus on videos/images
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Prevent drag-and-drop of media elements
  document.addEventListener('dragstart', (e) => e.preventDefault());

  // Intercept key shortcuts (PrintScreen, Ctrl+P, Cmd+Shift+4, etc.)
  window.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText('');
        }
      } catch (_) {}
    }
  });

  window.addEventListener('keydown', (e) => {
    if (
      e.key === 'PrintScreen' ||
      (e.ctrlKey && (e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S' || e.key === 'u' || e.key === 'U')) ||
      (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'))
    ) {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
