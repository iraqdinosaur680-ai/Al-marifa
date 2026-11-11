/// <reference types="vite/client" />

/**
 * API Host Resolution Utility
 * 
 * In standard web environments, relative fetch requests work perfectly.
 * However, on mobile devices (e.g., Capacitor WebView on iOS/Android),
 * the app is served from a local origin (like capacitor://localhost or http://localhost).
 * In those cases, relative fetches like fetch("/api/...") will fail because they resolve
 * against localhost instead of the remote server.
 * 
 * This utility detects mobile/webview environments and prepends the correct absolute
 * backend host (provided by process.env.APP_URL at build time).
 */

export function getApiUrl(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  
  // Detect standard Capacitor/Cordova/local mobile origins and emulators
  const isLocalMobile = 
    origin.startsWith("http://localhost") || 
    origin.startsWith("https://localhost") || 
    origin.startsWith("capacitor://") || 
    origin.startsWith("ionic://") || 
    origin.startsWith("app://") || 
    origin.startsWith("file://") ||
    origin === "null" ||
    origin.includes("10.0.2.2") ||
    origin.includes("127.0.0.1") ||
    origin.includes("almarfa.app") ||
    (typeof window !== "undefined" && (
      (window as any).Capacitor !== undefined ||
      (window as any).AndroidStorage !== undefined ||
      (window as any).AndroidBridge !== undefined
    )) ||
    !origin.startsWith("http");

  // Resolve backend URL from environment variables or current window origin
  const bakedUrl = import.meta.env.VITE_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const baseUrl = isLocalMobile ? bakedUrl : "";

  // Standardize path slashes
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  const resolvedUrl = `${cleanBase}${cleanPath}`;
  
  console.log(`[API RESOLUTION] path='${path}' origin='${origin}' isLocalMobile=${isLocalMobile} resolved='${resolvedUrl}'`);
  return resolvedUrl;
}
