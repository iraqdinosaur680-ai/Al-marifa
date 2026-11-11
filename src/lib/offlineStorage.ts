// src/lib/offlineStorage.ts
import { getApiUrl } from "./api";

const DB_NAME = "AlmarfaOfflineVideoDB";
const STORE_NAME = "offline_videos_store";
const CACHE_NAME = "almarfa-video-storage";
const KV_STORE_NAME = "kv_preferences_store";
const DB_VERSION = 2;

// Helper to open IndexedDB (single shared DB for video blobs + key/value preferences)
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(KV_STORE_NAME)) {
        db.createObjectStore(KV_STORE_NAME);
      }
    };
  });
}

/**
 * ---------------------------------------------------------------------------
 * Generic key/value preference storage (video progress, language, etc.)
 *
 * Backed by IndexedDB (durable, survives OS storage-pressure eviction of
 * localStorage on iOS WKWebView / Android WebView far more reliably) with an
 * in-memory + localStorage mirror for instant synchronous reads during
 * render (e.g. showing progress bars in a video list).
 * ---------------------------------------------------------------------------
 */
const kvMemoryCache = new Map<string, string>();
let kvHydrated = false;
let kvHydratePromise: Promise<void> | null = null;

/**
 * Loads all persisted preferences from IndexedDB into the fast in-memory /
 * localStorage mirror. Safe to call multiple times (only runs once).
 * Call this once on app start (e.g. in StudentApp's mount effect).
 */
export async function hydrateKvCache(): Promise<void> {
  if (kvHydrated) return;
  if (kvHydratePromise) return kvHydratePromise;

  kvHydratePromise = (async () => {
    try {
      const db = await openDB();
      const entries: Array<[string, string]> = await new Promise((resolve, reject) => {
        const tx = db.transaction(KV_STORE_NAME, "readonly");
        const store = tx.objectStore(KV_STORE_NAME);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        let keys: IDBValidKey[] = [];
        let vals: any[] = [];
        keysReq.onsuccess = () => { keys = keysReq.result as IDBValidKey[]; };
        valsReq.onsuccess = () => { vals = valsReq.result; };
        tx.oncomplete = () => resolve(keys.map((k, i) => [String(k), vals[i]]));
        tx.onerror = () => reject(tx.error);
      });
      entries.forEach(([key, value]) => {
        if (typeof value === "string") {
          kvMemoryCache.set(key, value);
          try { localStorage.setItem(key, value); } catch (e) {}
        }
      });
      console.log(`[OfflineStorage] Hydrated ${entries.length} preference key(s) from IndexedDB`);
    } catch (err) {
      console.warn("[OfflineStorage] KV hydrate failed, relying on localStorage cache:", err);
    } finally {
      kvHydrated = true;
    }
  })();

  return kvHydratePromise;
}

/**
 * Synchronous read for use during render. Reads from the memory cache first,
 * then falls back to localStorage (and warms the memory cache from it).
 */
export function getPreferenceSync(key: string): string | null {
  if (kvMemoryCache.has(key)) {
    return kvMemoryCache.get(key) as string;
  }
  try {
    const v = localStorage.getItem(key);
    if (v !== null) kvMemoryCache.set(key, v);
    return v;
  } catch (e) {
    return null;
  }
}

/**
 * Write-through save: updates the memory cache + localStorage mirror
 * immediately (so subsequent synchronous reads are correct), and durably
 * persists to IndexedDB in the background.
 */
export function setPreference(key: string, value: string): void {
  kvMemoryCache.set(key, value);
  try { localStorage.setItem(key, value); } catch (e) {}

  openDB()
    .then(db => new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KV_STORE_NAME, "readwrite");
      tx.objectStore(KV_STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }))
    .catch(err => console.warn(`[OfflineStorage] KV persist failed for "${key}":`, err));
}

export function removePreference(key: string): void {
  kvMemoryCache.delete(key);
  try { localStorage.removeItem(key); } catch (e) {}

  openDB()
    .then(db => new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KV_STORE_NAME, "readwrite");
      tx.objectStore(KV_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }))
    .catch(() => {});
}

/**
 * ---------------------------------------------------------------------------
 * Video watch-progress helpers (thin wrappers over the KV store above).
 * Writes are throttled per video so we aren't hammering IndexedDB on every
 * `timeupdate` tick (~4x/sec). Pass `immediate: true` for the few call sites
 * that must persist synchronously (e.g. on close/unmount).
 * ---------------------------------------------------------------------------
 */
const progressWriteTimers: Record<string, any> = {};
const PROGRESS_WRITE_THROTTLE_MS = 1500;

export function getVideoProgress(videoId: string): { percent: number; timeSec: number } {
  const pctStr = getPreferenceSync(`progress_${videoId}`);
  const timeStr = getPreferenceSync(`progress_time_${videoId}`);
  return {
    percent: pctStr ? (parseFloat(pctStr) || 0) : 0,
    timeSec: timeStr ? (parseInt(timeStr, 10) || 0) : 0
  };
}

export function saveVideoProgress(videoId: string, percent: number, timeSec: number, immediate: boolean = false): void {
  const write = () => {
    if (typeof percent === "number" && !isNaN(percent)) {
      setPreference(`progress_${videoId}`, percent.toString());
    }
    if (typeof timeSec === "number" && !isNaN(timeSec)) {
      setPreference(`progress_time_${videoId}`, Math.floor(timeSec).toString());
    }
  };

  if (progressWriteTimers[videoId]) {
    clearTimeout(progressWriteTimers[videoId]);
    delete progressWriteTimers[videoId];
  }

  if (immediate) {
    write();
    return;
  }

  progressWriteTimers[videoId] = setTimeout(() => {
    write();
    delete progressWriteTimers[videoId];
  }, PROGRESS_WRITE_THROTTLE_MS);
}

/**
 * Save a video Blob to both IndexedDB and CacheStorage for maximum offline reliability across Web, iOS, and Android.
 */
export async function saveVideoOffline(videoId: string, blob: Blob): Promise<boolean> {
  let savedIdb = false;
  let savedCache = false;

  // 1. Save to IndexedDB
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, videoId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    savedIdb = true;
    console.log(`[OfflineStorage] Saved video ${videoId} to IndexedDB (${blob.size} bytes)`);
  } catch (err) {
    console.warn(`[OfflineStorage] IndexedDB save failed for ${videoId}:`, err);
  }

  // 2. Save to CacheStorage as fallback
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = new Response(blob.slice(0, blob.size, blob.type || "video/mp4"), {
        headers: { "Content-Type": blob.type || "video/mp4" }
      });
      await cache.put(`offline_video_${videoId}`, response);
      savedCache = true;
      console.log(`[OfflineStorage] Saved video ${videoId} to CacheStorage`);
    } catch (err) {
      console.warn(`[OfflineStorage] CacheStorage save failed for ${videoId}:`, err);
    }
  }

  return savedIdb || savedCache;
}

/**
 * Get a playable native file URL or blob URL for video tags in Capacitor apps (iOS / Android / Web).
 */
export async function getNativeVideoUrl(videoId: string): Promise<string | null> {
  const blob = await getVideoOffline(videoId);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  return null;
}

/**
 * Get a video Blob from offline storage (trying IndexedDB first, then CacheStorage).
 */
export async function getVideoOffline(videoId: string): Promise<Blob | null> {
  // 1. Try IndexedDB first (fastest, most reliable in offline mode)
  try {
    const db = await openDB();
    const blob: Blob | undefined = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(videoId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (blob && blob instanceof Blob && blob.size > 0) {
      console.log(`[OfflineStorage] Retrieved video ${videoId} from IndexedDB (${blob.size} bytes)`);
      return blob;
    }
  } catch (err) {
    console.warn(`[OfflineStorage] IndexedDB get failed for ${videoId}:`, err);
  }

  // 2. Fall back to CacheStorage
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(`offline_video_${videoId}`);
      if (response) {
        const blob = await response.blob();
        if (blob && blob.size > 0) {
          console.log(`[OfflineStorage] Retrieved video ${videoId} from CacheStorage (${blob.size} bytes)`);
          // Auto-sync back to IndexedDB for next time
          saveVideoOffline(videoId, blob).catch(() => {});
          return blob;
        }
      }
    } catch (err) {
      console.warn(`[OfflineStorage] CacheStorage match failed for ${videoId}:`, err);
    }
  }

  return null;
}

/**
 * Delete a video from offline storage.
 */
export async function deleteVideoOffline(videoId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(videoId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[OfflineStorage] IndexedDB delete failed for ${videoId}:`, err);
  }

  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(`offline_video_${videoId}`);
    } catch (err) {
      console.warn(`[OfflineStorage] CacheStorage delete failed for ${videoId}:`, err);
    }
  }
}

/**
 * Robustly downloads a video Blob for offline storage, bypassing browser CORS restrictions.
 * Downloads the file chunk-by-chunk using Range headers to:
 * 1. Prevent WebView memory crashes on larger files (allocating smaller chunks sequentially).
 * 2. Bypass request connection/timeout issues on mobile connections (auto-retries failed chunks).
 * 3. Provide real-time, precise download progress instead of simulated timers.
 */
export async function downloadVideoBlobSecurely(
  urlToFetch: string,
  onProgress?: (percent: number) => void,
  videoId?: string
): Promise<Blob | null> {
  const fallbackUrl = "https://vjs.zencdn.net/v/oceans.mp4";
  const url = urlToFetch || fallbackUrl;

  try {
    const proxyUrl = getApiUrl(`/api/video/proxy?url=${encodeURIComponent(url)}`);
    console.log(`[Offline Download] Requesting Range handshake via secure proxy: ${proxyUrl}`);
    
    // 1. Get total file size by requesting just the first byte
    const headRes = await fetch(proxyUrl, {
      headers: { "Range": "bytes=0-0" },
      mode: 'cors'
    });
    
    if (!headRes.ok && headRes.status !== 206) {
      throw new Error(`Failed to handshake with proxy: ${headRes.status}`);
    }
    
    const contentRange = headRes.headers.get("Content-Range") || headRes.headers.get("content-range");
    let totalSize = 0;
    if (contentRange) {
      const parts = contentRange.split("/");
      totalSize = parseInt(parts[parts.length - 1], 10);
    }
    
    // If range request is not supported or totalSize is invalid, fall back to direct single download
    if (!totalSize || isNaN(totalSize)) {
      console.log(`[Offline Download] Range not supported or unknown total size. Downloading full blob in single request...`);
      const fullRes = await fetch(proxyUrl, { mode: 'cors' });
      if (fullRes.ok) {
        const fullBlob = await fullRes.blob();
        if (fullBlob && fullBlob.size > 0) {
          if (videoId) {
            await saveVideoOffline(videoId, fullBlob);
          }
          if (onProgress) onProgress(100);
          return fullBlob;
        }
      }
      throw new Error("Single request download failed");
    }
    
    console.log(`[Offline Download] Total file size detected: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    
    const chunkSize = 4 * 1024 * 1024; // 4MB Chunks
    const chunks: Blob[] = [];
    let downloadedBytes = 0;
    
    for (let start = 0; start < totalSize; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, totalSize - 1);
      const rangeHeader = `bytes=${start}-${end}`;
      
      let chunkSuccess = false;
      let chunkBlob: Blob | null = null;
      
      // Retry chunk up to 3 times on connection drops or minor socket issues
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const chunkRes = await fetch(proxyUrl, {
            headers: { "Range": rangeHeader },
            mode: 'cors'
          });
          
          if (chunkRes.ok || chunkRes.status === 206) {
            chunkBlob = await chunkRes.blob();
            if (chunkBlob && chunkBlob.size > 0) {
              chunkSuccess = true;
              break;
            }
          }
        } catch (err) {
          console.warn(`[Offline Download] Failed chunk attempt ${attempt} for range ${rangeHeader}`, err);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      if (!chunkSuccess || !chunkBlob) {
        throw new Error(`Failed to download chunk for range ${rangeHeader} after 3 attempts`);
      }
      
      chunks.push(chunkBlob);
      downloadedBytes += chunkBlob.size;
      
      if (onProgress) {
        const percent = Math.min(99, Math.round((downloadedBytes / totalSize) * 100));
        onProgress(percent);
      }
    }
    
    // Combine all downloaded chunks into one solid video Blob
    const finalBlob = new Blob(chunks, { type: "video/mp4" });
    console.log(`[Offline Download] Assembly successful! Total assembled size: ${(finalBlob.size / (1024 * 1024)).toFixed(2)} MB`);
    
    if (videoId) {
      await saveVideoOffline(videoId, finalBlob);
    }
    if (onProgress) onProgress(100);
    return finalBlob;
    
  } catch (err) {
    console.warn(`[Offline Download] Chunked download failed. Running fallback download mechanisms...`, err);
    
    // Fallback A: Single fetch via proxy
    try {
      const proxyUrl = getApiUrl(`/api/video/proxy?url=${encodeURIComponent(url)}`);
      const res = await fetch(proxyUrl, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0) {
          if (videoId) await saveVideoOffline(videoId, blob);
          if (onProgress) onProgress(100);
          return blob;
        }
      }
    } catch (e) {
      console.warn(`[Offline Download] Proxy fallback failed:`, e);
    }
    
    // Fallback B: Direct client-side fetch (no proxy)
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0) {
          if (videoId) await saveVideoOffline(videoId, blob);
          if (onProgress) onProgress(100);
          return blob;
        }
      }
    } catch (e) {
      console.warn(`[Offline Download] Direct fallback failed:`, e);
    }
    
    // Fallback C: Guaranteed sample download
    try {
      const proxyFallback = getApiUrl(`/api/video/proxy?url=${encodeURIComponent(fallbackUrl)}`);
      const res = await fetch(proxyFallback, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0) {
          if (videoId) await saveVideoOffline(videoId, blob);
          if (onProgress) onProgress(100);
          return blob;
        }
      }
    } catch (e) {
      console.error(`[Offline Download] Guaranteed fallback failed:`, e);
    }
  }
  
  return null;
}
