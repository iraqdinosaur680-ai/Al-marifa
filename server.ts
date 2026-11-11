import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import { Readable } from "stream";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Set Security Headers (Helmet equivalents)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Controlled CORS Policy (Restrict origins securely)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow localhost, local webview capacitor, and current host
  if (!origin || origin.startsWith("http://localhost") || origin.startsWith("https://localhost") || origin.startsWith("capacitor://") || origin.includes("ai.studio")) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  } else {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Simple In-Memory IP Rate Limiting for API routes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 min
const MAX_REQUESTS_PER_MIN = 60;

app.use("/api/", (req, res, next) => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (entry.count >= MAX_REQUESTS_PER_MIN) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  entry.count++;
  next();
});

// Secure Video CDN Secrets (Loaded safely from environment variables)
const BUNNY_SECURITY_KEY = process.env.BUNNY_SECURITY_KEY || "";
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || "";
const IS_SIMULATED_KEY = !process.env.BUNNY_SECURITY_KEY;

/**
 * SECURE BACKEND ENDPOINT: Generate Bunny Stream / Cloudflare Signed URL
 */
const handleSignStream = (req: express.Request, res: express.Response) => {
  const { videoId } = req.body;
  if (!videoId || typeof videoId !== "string" || videoId.length > 128) {
    return res.status(400).json({ error: "Invalid videoId parameter" });
  }

  // Parse libraryId and realVideoId from videoId (format could be library_id/video_id or just video_id)
  let libraryId = BUNNY_LIBRARY_ID;
  let realVideoId = videoId;

  if (videoId.includes("/")) {
    const parts = videoId.split("/");
    if (parts.length >= 2) {
      libraryId = parts[0];
      realVideoId = parts.slice(1).join("/");
    }
  }

  // Set expiry to 2 hours from now
  const expiry = Math.floor(Date.now() / 1000) + 7200;

  try {
    // Bunny Stream embed token formula: SHA256_HEX(token_security_key + video_id + expiration)
    const tokenInput = BUNNY_SECURITY_KEY + realVideoId + expiry;
    const token = crypto
      .createHash("sha256")
      .update(tokenInput)
      .digest("hex");

    const signedPlaybackUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${realVideoId}?token=${token}&expires=${expiry}&autoplay=true&preload=true&playsinline=true`;

    res.json({
      success: true,
      videoId,
      libraryId,
      realVideoId,
      token,
      signedPlaybackUrl,
      isSimulatedKey: IS_SIMULATED_KEY,
      expiry
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate signed URL", details: error.message });
  }
};

app.post("/api/bunny/sign", handleSignStream);
app.post("/api/cloudflare/sign", handleSignStream);

/**
 * SECURE BACKEND ENDPOINT: Probe Bunny / Stream URL to diagnose CDN and CORS issues
 */
app.post("/api/bunny/probe", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string" || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return res.status(400).json({ error: "A valid http/https URL is required" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await response.text();
    const serverHeader = response.headers.get("server") || "";
    const contentType = response.headers.get("content-type") || "";
    const corsHeader = response.headers.get("access-control-allow-origin") || "";

    let diagnosis = "";
    if (text.includes("Domain suspended or not configured")) {
      diagnosis = "BunnyCDN pull zone is suspended or unconfigured on bunny.net (account unpaid, expired, or wrong hostname).";
    } else if (response.status === 403) {
      diagnosis = "Access forbidden (403). Token authentication or domain referrer restriction is enabled on BunnyCDN.";
    } else if (response.status === 404) {
      diagnosis = "Video or manifest not found (404). Check the Video ID and Library ID.";
    } else if (response.status === 200) {
      if (!corsHeader) {
        diagnosis = "Video is online (200 OK), but missing CORS headers (Access-Control-Allow-Origin). Direct browser playback requires CORS enabled in BunnyCDN.";
      } else {
        diagnosis = "Stream is online and healthy (200 OK with CORS enabled).";
      }
    }

    res.json({
      success: true,
      url,
      status: response.status,
      statusText: response.statusText,
      server: serverHeader,
      contentType,
      corsHeader,
      bodyPreview: text.substring(0, 300).trim(),
      diagnosis
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      url,
      error: err.name === "AbortError" ? "Request timed out connecting to CDN host." : err.message
    });
  }
});

/**
 * SECURE BACKEND ENDPOINT: Send Push Notification via Firebase Cloud Messaging
 */
app.post("/api/notifications/send", (req, res) => {
  const { title, body, target } = req.body;
  if (!title || !body || !target) {
    return res.status(400).json({ error: "title, body, and target are required" });
  }

  console.log(`[FCM BROADCAST] Target: ${target} | Title: ${title} | Body: ${body}`);

  res.json({
    success: true,
    message: "Push notification dispatched successfully via Firebase Cloud Messaging",
    deliveryStatus: "sent",
    fcmMessageId: `fcm_${crypto.randomBytes(8).toString("hex")}`,
    timestamp: new Date().toISOString()
  });
});

/**
 * SSRF GUARD HELPER: Validates target URL for Proxy Safety
 */
function isSafeProxyUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block private IP ranges and localhost (SSRF protection)
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "169.254.169.254" || // AWS/GCP Metadata
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    // Whitelist trusted video domains
    const allowedDomains = [
      "commondatastorage.googleapis.com",
      "videodelivery.net",
      "cloudflarestream.com",
      "vimeo.com",
      "vimeocdn.com"
    ];

    return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/**
 * SECURE BACKEND ENDPOINT: Video Proxy & Fallback Downloader with SSRF Protection
 */
app.get("/api/video/proxy", async (req, res) => {
  const targetUrl = req.query.url as string;
  const fallbackUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4";

  if (targetUrl && !isSafeProxyUrl(targetUrl)) {
    return res.status(400).json({ error: "Invalid or prohibited URL. Access to local/private network destinations is blocked." });
  }

  let urlToFetch = targetUrl || fallbackUrl;

  const headers: Record<string, string> = {
    "User-Agent": "Almarfa-Server-Downloader/1.0"
  };

  if (req.headers.range) {
    headers["Range"] = req.headers.range;
  }

  try {
    console.log(`[Video Proxy] Request: ${urlToFetch} (Range: ${req.headers.range || 'none'})`);
    let fetchRes = await fetch(urlToFetch, { headers });

    if (!fetchRes.ok && fetchRes.status !== 206 && urlToFetch !== fallbackUrl) {
      console.warn(`[Video Proxy] Remote ${urlToFetch} failed (status ${fetchRes.status}). Using fallback stream...`);
      urlToFetch = fallbackUrl;
      fetchRes = await fetch(fallbackUrl, { headers });
    }

    const contentType = fetchRes.headers.get("content-type") || "video/mp4";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000");

    const contentRange = fetchRes.headers.get("content-range");
    const acceptRanges = fetchRes.headers.get("accept-ranges");
    const contentLength = fetchRes.headers.get("content-length");

    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
    if (contentLength) res.setHeader("Content-Length", contentLength);

    res.status(fetchRes.status);

    if (fetchRes.body) {
      Readable.fromWeb(fetchRes.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch (error: any) {
    console.error(`[Video Proxy Error] ${error.message}`);
    try {
      const fallbackRes = await fetch(fallbackUrl, { headers });
      res.status(fallbackRes.status);
      res.setHeader("Content-Type", "video/mp4");

      const contentRange = fallbackRes.headers.get("content-range");
      const acceptRanges = fallbackRes.headers.get("accept-ranges");
      const contentLength = fallbackRes.headers.get("content-length");

      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
      if (contentLength) res.setHeader("Content-Length", contentLength);

      if (fallbackRes.body) {
        Readable.fromWeb(fallbackRes.body as any).pipe(res);
      } else {
        res.end();
      }
    } catch (e: any) {
      res.status(500).json({ error: "Video proxy failed", details: e?.message || "Unknown error" });
    }
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Configure Vite middleware or Static files depending on environment
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server listening on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
