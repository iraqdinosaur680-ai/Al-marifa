/**
 * Security Utilities Module
 * Implements password hashing, input sanitization, and session token security.
 */

// SHA-256 Password Hashing using Web Crypto API
export async function hashPassword(password: string, salt = "almarfa_secure_salt_v1"): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a plain password against a stored hash (or legacy plain text during migration).
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;
  // Support legacy plain text compare if account not migrated, otherwise hash match
  const computedHash = await hashPassword(password);
  return computedHash === storedHash || password === storedHash;
}

/**
 * Sanitizes input text to prevent XSS and HTML injection.
 */
export function sanitizeString(str: string, maxLength = 500): string {
  if (typeof str !== "string") return "";
  const cleaned = str
    .trim()
    .replace(/[<>]/g, "") // Strip brackets
    .slice(0, maxLength);
  return cleaned;
}

/**
 * Validates Phone/Identifier Number Format (digits only, min 1, max 20).
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (typeof phone !== "string") return false;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 1 && digits.length <= 20;
}

/**
 * Validates document ID to prevent ID injection attacks.
 */
export function isValidDocumentId(id: string): boolean {
  if (typeof id !== "string") return false;
  return id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-\.]+$/.test(id);
}

// Session security constants
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours max session

export interface SecureSessionData {
  user: any;
  createdAt: number;
  expiresAt: number;
  signature: string;
}

export async function createSecureSession(user: any): Promise<SecureSessionData> {
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const signatureInput = `${user.phone}:${user.role}:${expiresAt}`;
  const signature = await hashPassword(signatureInput, "session_sig_salt");
  return {
    user,
    createdAt: now,
    expiresAt,
    signature,
  };
}

export async function validateSecureSession(session: SecureSessionData | null): Promise<boolean> {
  if (!session || !session.user || !session.expiresAt || !session.signature) return false;
  if (Date.now() > session.expiresAt) return false;

  const signatureInput = `${session.user.phone}:${session.user.role}:${session.expiresAt}`;
  const expectedSig = await hashPassword(signatureInput, "session_sig_salt");
  return session.signature === expectedSig;
}

/**
 * Client-Side Bunny Stream URL Signer
 * Generates signed authentication tokens for Bunny Stream / Cloudflare video embed
 * using Web Crypto API SHA-256 (works offline and inside mobile apps without server roundtrip).
 */
export async function signBunnyStreamUrlLocally(
  videoId: string,
  securityKey = (typeof import.meta !== "undefined" && import.meta.env?.VITE_BUNNY_SECURITY_KEY) || "",
  libraryId = (typeof import.meta !== "undefined" && import.meta.env?.VITE_BUNNY_LIBRARY_ID) || "343163",
  expirySeconds = 7200
): Promise<{ token: string; signedUrl: string; expires: number }> {
  let realVideoId = videoId || "";
  let targetLibId = libraryId;
  
  if (realVideoId.includes("/")) {
    const parts = realVideoId.split("/");
    if (parts.length >= 2) {
      targetLibId = parts[0];
      realVideoId = parts.slice(1).join("/");
    }
  }

  const expiry = Math.floor(Date.now() / 1000) + expirySeconds;
  const tokenInput = securityKey + realVideoId + expiry;

  const encoder = new TextEncoder();
  const data = encoder.encode(tokenInput);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const token = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const signedUrl = `https://iframe.mediadelivery.net/embed/${targetLibId}/${realVideoId}?token=${token}&expires=${expiry}`;
  return { token, signedUrl, expires: expiry };
}

/**
 * Fallback reliable high-definition educational video stream sources for demo/mock IDs (watermark-free and open CORS)
 */
export const SAMPLE_STREAMS = [
  "https://vjs.zencdn.net/v/oceans.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
];

export interface PlayableSourceResult {
  isDirectHtml5: boolean;
  sourceUrl: string;
  isHls: boolean;
  hlsUrl?: string;
  isSampleDemo: boolean;
}

/**
 * Resolves appropriate playback source for any video record (Direct MP4, HLS .m3u8 playlist, Bunny Stream iframe, or Demo)
 */
export function resolveVideoPlayableSource(
  rawId: string,
  downloadUrl?: string,
  index = 0
): PlayableSourceResult {
  // Helper to detect HLS stream (.m3u8)
  const isHlsUrl = (url: string) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes(".m3u8") || lower.includes("b-cdn.net") && lower.includes("playlist");
  };

  // 1. Check downloadUrl first
  if (downloadUrl && typeof downloadUrl === "string") {
    const trimmedDl = downloadUrl.trim();
    if (trimmedDl.startsWith("http://") || trimmedDl.startsWith("https://") || trimmedDl.startsWith("blob:") || trimmedDl.startsWith("file:")) {
      const bunnyMatch = trimmedDl.match(/mediadelivery\.net\/(?:play|embed)\/([0-9a-zA-Z_-]+)\/([0-9a-zA-Z_-]+)/i);
      if (bunnyMatch) {
        const libId = bunnyMatch[1];
        const vidId = bunnyMatch[2];
        const hlsStreamUrl = `https://vz-${libId}.b-cdn.net/${vidId}/playlist.m3u8`;
        return { isDirectHtml5: true, sourceUrl: hlsStreamUrl, isHls: true, hlsUrl: hlsStreamUrl, isSampleDemo: false };
      }
      const hls = isHlsUrl(trimmedDl);
      return { isDirectHtml5: true, sourceUrl: trimmedDl, isHls: hls, hlsUrl: hls ? trimmedDl : undefined, isSampleDemo: false };
    }
  }

  // 2. Check rawId (Direct URL, Bunny Video ID, or Cloudflare ID)
  if (rawId && typeof rawId === "string") {
    const trimmedId = rawId.trim();
    const isMock = trimmedId === "demo" || trimmedId === "test" || trimmedId === "mock" || trimmedId.startsWith("cf_") || trimmedId.startsWith("demo_");
    
    if (trimmedId.length > 0 && !isMock) {
      // Direct HTTP/HTTPS link
      if (trimmedId.startsWith("http://") || trimmedId.startsWith("https://") || trimmedId.startsWith("blob:") || trimmedId.startsWith("file:")) {
        // If it's a Bunny player/embed URL (e.g., https://player.mediadelivery.net/play/729855/567671b5-d95c-485a-b61c-7fecd4ae7610 or iframe.mediadelivery.net/embed/...)
        const bunnyMatch = trimmedId.match(/mediadelivery\.net\/(?:play|embed)\/([0-9a-zA-Z_-]+)\/([0-9a-zA-Z_-]+)/i);
        if (bunnyMatch) {
          const libId = bunnyMatch[1];
          const vidId = bunnyMatch[2];
          const hlsStreamUrl = `https://vz-${libId}.b-cdn.net/${vidId}/playlist.m3u8`;
          return { isDirectHtml5: true, sourceUrl: hlsStreamUrl, isHls: true, hlsUrl: hlsStreamUrl, isSampleDemo: false };
        }

        const hls = isHlsUrl(trimmedId);
        return { isDirectHtml5: true, sourceUrl: trimmedId, isHls: hls, hlsUrl: hls ? trimmedId : undefined, isSampleDemo: false };
      }

      // Bunny Stream Video ID format -> direct HLS stream
      let hlsStreamUrl = "";
      if (trimmedId.includes("/")) {
        const [libId, vidId] = trimmedId.split("/");
        hlsStreamUrl = `https://vz-${libId}.b-cdn.net/${vidId}/playlist.m3u8`;
      } else {
        hlsStreamUrl = `https://vz-343163.b-cdn.net/${trimmedId}/playlist.m3u8`;
      }
      return { isDirectHtml5: true, sourceUrl: hlsStreamUrl, isHls: true, hlsUrl: hlsStreamUrl, isSampleDemo: false };
    }
  }

  // 3. Fallback to clean, watermark-free sample stream for demo/test
  const sampleIdx = Math.abs(index) % SAMPLE_STREAMS.length;
  const sampleUrl = SAMPLE_STREAMS[sampleIdx];
  const hls = isHlsUrl(sampleUrl);
  return { isDirectHtml5: true, sourceUrl: sampleUrl, isHls: hls, hlsUrl: hls ? sampleUrl : undefined, isSampleDemo: true };
}

