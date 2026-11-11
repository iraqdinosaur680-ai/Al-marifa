import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw, 
  Key, Copy, Check, Film, AlertCircle, 
  RefreshCw, Radio, Globe, Wrench, Save, Sparkles, ExternalLink
} from "lucide-react";
import Hls from "hls.js";
import { Video, AcademicYear } from "../types";
import { resolveVideoPlayableSource, SAMPLE_STREAMS } from "../lib/security";
import { getApiUrl } from "../lib/api";
import { db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";

interface AdminVideoPlayerModalProps {
  video: Video | null;
  onClose: () => void;
  academicYears: AcademicYear[];
  lang: 'ar' | 'en';
  isRtl: boolean;
  triggerAlert: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

interface ProbeResult {
  success: boolean;
  status?: number;
  statusText?: string;
  server?: string;
  contentType?: string;
  corsHeader?: string;
  bodyPreview?: string;
  diagnosis?: string;
  error?: string;
}

export default function AdminVideoPlayerModal({
  video,
  onClose,
  academicYears,
  lang,
  isRtl,
  triggerAlert
}: AdminVideoPlayerModalProps) {
  if (!video) return null;

  // Active playing video state (local copy for in-modal editing)
  const [currentVideo, setCurrentVideo] = useState<Video>(video);
  const [playerMode, setPlayerMode] = useState<'stream' | 'embed'>('stream');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Fallback sample stream toggle
  const [isSampleStreamActive, setIsSampleStreamActive] = useState(false);

  // CDN Probe Tool state
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [showProbePanel, setShowProbePanel] = useState(false);

  // Inline URL Editor state
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [editedUrl, setEditedUrl] = useState(currentVideo.cloudflareId || "");
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRetryCountRef = useRef(0);

  const yearName = academicYears.find(y => y.id === currentVideo.academicYear)?.name || `Year ${currentVideo.academicYear}`;

  // Resolve playable source (direct HLS, MP4, or sample stream)
  const resolvedSource = resolveVideoPlayableSource(currentVideo.cloudflareId, currentVideo.downloadUrl);
  
  // Active video source for playback
  const videoSrc = isSampleStreamActive 
    ? SAMPLE_STREAMS[2] // High-compatibility HLS Mux stream
    : (signedUrl || resolvedSource.sourceUrl);

  // Resolve Bunny Embed Iframe URL safely
  const getEmbedUrl = (): string | null => {
    const raw = (currentVideo.downloadUrl || currentVideo.cloudflareId || "").trim();
    if (!raw) return null;

    // Check if standard mediadelivery play/embed URL
    const bunnyMatch = raw.match(/mediadelivery\.net\/(?:play|embed)\/([0-9a-zA-Z_-]+)\/([0-9a-zA-Z_-]+)/i);
    if (bunnyMatch) {
      return `https://iframe.mediadelivery.net/embed/${bunnyMatch[1]}/${bunnyMatch[2]}?autoplay=true&preload=true`;
    }

    // Check if Bunny CDN URL (e.g. vz-03494cf8-c51.b-cdn.net/<videoId>/playlist.m3u8)
    const bCdnMatch = raw.match(/vz-([0-9a-zA-Z_-]+)\.b-cdn\.net\/([0-9a-fA-F-]{36})/i);
    if (bCdnMatch) {
      const vidId = bCdnMatch[2];
      return `https://iframe.mediadelivery.net/embed/343163/${vidId}?autoplay=true&preload=true`;
    }

    // Check libraryId/videoId format (without http)
    if (!raw.startsWith("http://") && !raw.startsWith("https://") && raw.includes("/")) {
      const [libId, vidId] = raw.split("/");
      if (libId && vidId) {
        return `https://iframe.mediadelivery.net/embed/${libId}/${vidId}?autoplay=true&preload=true`;
      }
    }

    // Pure UUID format
    if (!raw.startsWith("http") && !raw.startsWith("cf_") && !raw.startsWith("demo_") && raw.length > 8) {
      return `https://iframe.mediadelivery.net/embed/343163/${raw}?autoplay=true&preload=true`;
    }

    if (raw.startsWith("http") && (raw.includes("youtube.com") || raw.includes("youtu.be") || raw.includes("vimeo.com"))) {
      return raw;
    }

    return null;
  };

  const embedUrl = getEmbedUrl();

  // Initialize HLS / HTML5 Video Player
  useEffect(() => {
    if (playerMode !== 'stream') return;

    const videoEl = videoRef.current;
    if (!videoEl || !videoSrc) return;

    setHasError(false);
    setErrorMessage("");
    setIsBuffering(true);
    networkRetryCountRef.current = 0;

    // Destroy previous HLS instance
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (e) {}
      hlsRef.current = null;
    }

    const isHlsUrl = (videoSrc.includes('.m3u8') || (videoSrc.includes('b-cdn.net') && videoSrc.includes('playlist'))) && !videoSrc.includes('.mp4');

    if (isHlsUrl && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 30
      });
      hlsRef.current = hls;

      hls.loadSource(videoSrc);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        setHasError(false);
        videoEl.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.details === 'manifestLoadError' || data.details === 'manifestParsingError') {
                console.warn("[AdminPlayer] Manifest load error:", data.url);
                setHasError(true);
                setIsBuffering(false);

                const isBunnyCdn = (data.url && data.url.includes('.b-cdn.net')) || videoSrc.includes('.b-cdn.net');
                setErrorMessage(
                  isBunnyCdn
                    ? (isRtl 
                        ? "تعذر تحميل مسار Bunny CDN (خطأ في ملف البث). الخادم أرجع تعليقاً للنطاق 'Domain suspended or not configured' أو قيود صلاحيات/CORS. يمكنك استخدام أداة الفحص أدناه لمعاينة تفاصيل استجابة الخادم أو التبديل للبث التجريبي."
                        : "Bunny CDN manifest failed to load. The CDN returned an error (likely 'Domain suspended or not configured' or CORS/token restriction). Use the probe tool below to diagnose or switch to the sample stream.")
                    : (isRtl
                        ? "تعذر تحميل ملف البث المباشر (Manifest Load Error). يرجى التحقق من توفر مسار الفيديو أو تشغيل البث التجريبي."
                        : "Video manifest failed to load (Manifest Load Error). Please verify the stream URL or test with the sample stream.")
                );
                // Cleanly destroy rather than looping
                try {
                  hls.destroy();
                } catch (e) {}
                hlsRef.current = null;
                return;
              }

              networkRetryCountRef.current++;
              if (networkRetryCountRef.current <= 1) {
                console.warn("[AdminPlayer] Network glitch, attempting single retry...");
                hls.startLoad();
              } else {
                setHasError(true);
                setIsBuffering(false);
                setErrorMessage(isRtl ? "انقطع اتصال الشبكة أثناء قراءة مسار الفيديو." : "Network connection error while streaming video.");
                try {
                  hls.destroy();
                } catch (e) {}
                hlsRef.current = null;
              }
              break;

            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("[AdminPlayer] Fatal media error, attempting recoverMediaError");
              hls.recoverMediaError();
              break;

            default:
              console.error("[AdminPlayer] Unrecoverable HLS error:", data);
              setHasError(true);
              setIsBuffering(false);
              setErrorMessage(isRtl ? "تعذر تشغيل مسار البث المباشر (HLS). جرب مشغل التضمين أو تحقق من صحة المعرف." : "Unable to play HLS stream. Try Embed mode or verify Video ID.");
              try {
                hls.destroy();
              } catch (e) {}
              hlsRef.current = null;
              break;
          }
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl') || !isHlsUrl) {
      // Native Apple HLS (Safari) or standard MP4/WebM
      videoEl.src = videoSrc;
      videoEl.load();
      videoEl.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      setHasError(true);
      setIsBuffering(false);
      setErrorMessage(isRtl ? "متصفحك لا يدعم تشغيل HLS مباشرة. يرجى استخدام مشغل التضمين." : "HLS is not supported natively in this browser. Please use Embed Player.");
    }

    return () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch (e) {}
        hlsRef.current = null;
      }
    };
  }, [videoSrc, playerMode, isRtl]);

  // Video playback events
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      setIsBuffering(false);
    }
  };

  const togglePlay = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      videoEl.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      const nextTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
      videoRef.current.currentTime = nextTime;
      setCurrentTime(nextTime);
    }
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Generate DRM Play Token
  const handleGenerateSignedToken = async () => {
    setIsSigning(true);
    try {
      const res = await fetch(getApiUrl("/api/bunny/sign"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: currentVideo.cloudflareId })
      });
      const data = await res.json();
      if (data.success && data.signedPlaybackUrl) {
        setSignedUrl(data.signedPlaybackUrl);
        triggerAlert('success', isRtl ? "تم إصدار وتطبيق رمز التوقيع الأمني بنجاح." : "Signed play token issued successfully.");
      } else {
        triggerAlert('error', isRtl ? "فشل خادم التوقيع الأمني في إصدار الرمز." : "Security server failed to issue play token.");
      }
    } catch (err: any) {
      triggerAlert('error', isRtl ? "خطأ في الاتصال بخدمة توقيع الفيديو." : "Connection error contacting signing endpoint.");
    } finally {
      setIsSigning(false);
    }
  };

  // Probe Stream URL via backend diagnostic API
  const handleProbeUrl = async () => {
    setIsProbing(true);
    setShowProbePanel(true);
    setProbeResult(null);

    const targetUrl = signedUrl || resolvedSource.sourceUrl;
    try {
      const res = await fetch(getApiUrl("/api/bunny/probe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl })
      });
      const data = await res.json();
      setProbeResult(data);
    } catch (err: any) {
      setProbeResult({
        success: false,
        error: err.message || "Failed to reach diagnostic probe API"
      });
    } finally {
      setIsProbing(false);
    }
  };

  // Switch to / from sample stream
  const handleToggleSampleStream = () => {
    setIsSampleStreamActive(!isSampleStreamActive);
    setHasError(false);
    setErrorMessage("");
    if (!isSampleStreamActive) {
      triggerAlert('info', isRtl ? "تم تفعيل البث التجريبي للمعاينة والتحقق من عناصر التحكم." : "Switched to sample stream for testing controls.");
    } else {
      triggerAlert('info', isRtl ? "تمت العودة إلى رابط الفيديو الأصلي." : "Switched back to original video URL.");
    }
  };

  // Save new URL to Firestore
  const handleSaveVideoUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedUrl.trim()) return;

    setIsSavingUrl(true);
    try {
      await updateDoc(doc(db, "videos", currentVideo.id), {
        cloudflareId: editedUrl.trim()
      });
      setCurrentVideo(prev => ({
        ...prev,
        cloudflareId: editedUrl.trim()
      }));
      setIsEditingUrl(false);
      setIsSampleStreamActive(false);
      setSignedUrl(null);
      setHasError(false);
      setErrorMessage("");
      triggerAlert('success', isRtl ? "تم حفظ وتحديث رابط الفيديو بنجاح." : "Video link updated successfully.");
    } catch (err: any) {
      triggerAlert('error', isRtl ? "فشل حفظ الرابط: " + err.message : "Failed to save link: " + err.message);
    } finally {
      setIsSavingUrl(false);
    }
  };

  // Test edited URL temporarily in modal
  const handlePreviewEditedUrl = () => {
    if (!editedUrl.trim()) return;
    setCurrentVideo(prev => ({
      ...prev,
      cloudflareId: editedUrl.trim()
    }));
    setIsSampleStreamActive(false);
    setSignedUrl(null);
    setHasError(false);
    setErrorMessage("");
    triggerAlert('info', isRtl ? "جاري تجربة الرابط الجديد داخل المشغل..." : "Testing new URL in player...");
  };

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
      triggerAlert('info', isRtl ? "تم نسخ الرابط إلى الحافظة." : "Copied to clipboard.");
    }
  };

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "ArrowLeft") {
        handleSkip(isRtl ? 5 : -5);
      } else if (e.key === "ArrowRight") {
        handleSkip(isRtl ? -5 : 5);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, isMuted, duration, isRtl, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[94vh]"
        dir={isRtl ? "rtl" : "ltr"}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
              <Film className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm text-white truncate">{currentVideo.title}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {currentVideo.category || "Lecture"}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {yearName}
                </span>
                {isSampleStreamActive && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    <span>{isRtl ? "بث تجريبي نشط" : "Sample Active"}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Player Engine Switcher */}
            {embedUrl && (
              <div className="flex items-center bg-slate-800/90 rounded-lg p-0.5 border border-slate-700 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPlayerMode('stream')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    playerMode === 'stream' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isRtl ? "بث مباشر (HLS)" : "Direct Stream"}
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerMode('embed')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    playerMode === 'embed' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isRtl ? "مشغل التضمين (Embed)" : "Embed Player"}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              title={isRtl ? "إغلاق المشغل" : "Close Player"}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Video Screen Container */}
        <div 
          ref={containerRef}
          className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden group select-none"
        >
          {playerMode === 'embed' && embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full h-full border-0"
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen={true}
              title={currentVideo.title}
            />
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
                onClick={togglePlay}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => {
                  setIsBuffering(false);
                  setIsPlaying(true);
                }}
                onPause={() => setIsPlaying(false)}
                playsInline={true}
              />

              {/* Central Play/Pause Watermark / Hover Button */}
              {(!isPlaying || isBuffering) && !hasError && (
                <div 
                  onClick={togglePlay}
                  className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer transition-opacity"
                >
                  {isBuffering ? (
                    <div className="p-4 rounded-full bg-slate-900/80 border border-slate-700 text-indigo-400 shadow-xl flex flex-col items-center gap-2">
                      <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
                      <span className="text-xs font-bold text-slate-300">{isRtl ? "جاري التحميل..." : "Buffering..."}</span>
                    </div>
                  ) : (
                    <div className="p-4 sm:p-5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xl hover:scale-105 transition-all">
                      <Play className="h-8 w-8 fill-current ml-1" />
                    </div>
                  )}
                </div>
              )}

              {/* Error Overlay with Clear Diagnostic Actions */}
              {hasError && (
                <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-4 z-20">
                  <div className="p-3.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <AlertCircle className="h-8 w-8" />
                  </div>
                  
                  <div className="max-w-lg space-y-2">
                    <h4 className="font-extrabold text-base text-white">
                      {isRtl ? "تعذر تشغيل مسار الفيديو" : "Playback Network Error"}
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-right">
                      {errorMessage}
                    </p>
                  </div>

                  {/* Action buttons for resolution */}
                  <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
                    {/* Fallback sample stream */}
                    <button
                      type="button"
                      onClick={handleToggleSampleStream}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{isSampleStreamActive ? (isRtl ? "العودة للرابط الأصلي" : "Use Original URL") : (isRtl ? "تشغيل بث تجريبي للمعاينة" : "Play Sample Stream")}</span>
                    </button>

                    {/* Server Probe Tool */}
                    <button
                      type="button"
                      onClick={handleProbeUrl}
                      disabled={isProbing}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>{isProbing ? (isRtl ? "جاري الفحص..." : "Probing...") : (isRtl ? "فحص حالة الخادم (Probe)" : "Probe CDN Server")}</span>
                    </button>

                    {/* Edit URL */}
                    <button
                      type="button"
                      onClick={() => setIsEditingUrl(!isEditingUrl)}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>{isRtl ? "تعديل الرابط" : "Edit URL"}</span>
                    </button>

                    {/* Sign DRM */}
                    <button
                      type="button"
                      onClick={handleGenerateSignedToken}
                      disabled={isSigning}
                      className="px-3.5 py-2 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Key className="h-3.5 w-3.5 text-amber-300" />
                      <span>{isSigning ? (isRtl ? "جاري التوقيع..." : "Signing...") : (isRtl ? "توقيع DRM" : "Sign DRM")}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Controls Bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 sm:p-4 opacity-90 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                {/* Seek / Progress Bar */}
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:h-2 transition-all"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  {/* Left Controls */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="p-1.5 text-white hover:text-indigo-400 transition-colors cursor-pointer"
                      title={isPlaying ? (isRtl ? "إيقاف مؤقت" : "Pause") : (isRtl ? "تشغيل" : "Play")}
                    >
                      {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSkip(-10)}
                      className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-0.5"
                      title={isRtl ? "إرجاع 10 ثوانٍ" : "Rewind 10s"}
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>10s</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSkip(10)}
                      className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-0.5"
                      title={isRtl ? "تقديم 10 ثوانٍ" : "Forward 10s"}
                    >
                      <RotateCcw className="h-4 w-4 -scale-x-100" />
                      <span>10s</span>
                    </button>

                    {/* Volume Controls */}
                    <div className="flex items-center gap-1 group/vol">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        title={isMuted ? (isRtl ? "إلغاء الكتم" : "Unmute") : (isRtl ? "كتم الصوت" : "Mute")}
                      >
                        {isMuted || volume === 0 ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-14 sm:w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    {/* Time Indicator */}
                    <span className="font-mono text-[11px] text-slate-300">
                      {formatTime(currentTime)} / {formatTime(duration || (currentVideo.duration !== 'auto' ? duration : 0))}
                    </span>
                  </div>

                  {/* Right Controls */}
                  <div className="flex items-center gap-2">
                    {/* Speed Selector */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-bold text-slate-200 transition-colors cursor-pointer"
                      >
                        {playbackRate}x
                      </button>
                      {showSpeedMenu && (
                        <div className="absolute bottom-full mb-2 right-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 z-30 min-w-20">
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => handleSpeedChange(rate)}
                              className={`w-full text-center px-3 py-1 text-xs transition-colors cursor-pointer ${
                                playbackRate === rate ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {rate}x
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Fullscreen Button */}
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title={isRtl ? "شاشة كاملة" : "Fullscreen"}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Diagnostic & Editing Panels */}
        <div className="p-4 bg-slate-950/95 border-t border-slate-800 space-y-3 shrink-0 overflow-y-auto max-h-56 text-xs">
          
          {/* Inline Edit URL Form */}
          {isEditingUrl && (
            <motion.form 
              initial={{ opacity: 0, y: -5 }} 
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSaveVideoUrl} 
              className="p-3 bg-slate-900 border border-indigo-500/40 rounded-xl space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <Wrench className="h-3.5 w-3.5 text-indigo-400" />
                  <span>{isRtl ? "تعديل رابط الفيديو المباشر أو المعرف" : "Edit Direct Video Stream Link or ID"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingUrl(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={editedUrl}
                  onChange={(e) => setEditedUrl(e.target.value)}
                  placeholder="https://...playlist.m3u8 or video ID"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-indigo-500 outline-none"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handlePreviewEditedUrl}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-xs cursor-pointer shrink-0"
                  title={isRtl ? "تجربة الرابط داخل المشغل الآن" : "Preview In Player"}
                >
                  {isRtl ? "تجربة" : "Test"}
                </button>
                <button
                  type="submit"
                  disabled={isSavingUrl}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSavingUrl ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ في قاعدة البيانات" : "Save")}</span>
                </button>
              </div>
            </motion.form>
          )}

          {/* Diagnostic Probe Results Card */}
          {showProbePanel && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }} 
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <Globe className="h-3.5 w-3.5 text-indigo-400" />
                  <span>{isRtl ? "نتائج فحص اتصال خادم الفيديو (CDN Diagnostic Probe)" : "CDN Diagnostic Probe Result"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowProbePanel(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  {isRtl ? "إخفاء" : "Dismiss"}
                </button>
              </div>

              {isProbing ? (
                <div className="py-3 flex items-center justify-center gap-2 text-slate-400">
                  <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                  <span>{isRtl ? "جاري إرسال طلب فحص للخادم وتحليل الرؤوس..." : "Connecting to CDN host and analyzing response headers..."}</span>
                </div>
              ) : probeResult ? (
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{isRtl ? "كود الاستجابة:" : "HTTP Status:"}</span>
                    <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                      probeResult.status === 200 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {probeResult.status || 0} {probeResult.statusText || probeResult.error || "Failed"}
                    </span>
                    {probeResult.server && (
                      <span className="text-slate-400 ml-2">
                        Server: <strong className="text-slate-200">{probeResult.server}</strong>
                      </span>
                    )}
                  </div>

                  {probeResult.diagnosis && (
                    <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 text-slate-200 leading-relaxed font-semibold">
                      {probeResult.diagnosis}
                    </div>
                  )}

                  {probeResult.bodyPreview && (
                    <div className="mt-1">
                      <span className="text-slate-500 text-[10px] block mb-0.5">{isRtl ? "معاينة رد خادم Bunny CDN:" : "Server Response Preview:"}</span>
                      <pre className="p-2 bg-slate-950 text-amber-300 font-mono text-[10px] rounded border border-slate-800 overflow-x-auto whitespace-pre-wrap max-h-16" dir="ltr">
                        {probeResult.bodyPreview}
                      </pre>
                    </div>
                  )}
                </div>
              ) : null}
            </motion.div>
          )}

          {/* Quick Info & Actions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            {/* Bunny / Cloudflare Video ID */}
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Video Stream ID</span>
                <span className="font-mono font-bold text-indigo-300 truncate block text-[11px]">{currentVideo.cloudflareId}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(currentVideo.cloudflareId, 'vidId')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
                title={isRtl ? "نسخ المعرف" : "Copy ID"}
              >
                {copiedKey === 'vidId' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Direct Playable Source URL */}
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                  {isSampleStreamActive ? "Sample HLS Stream" : "Active Stream URL"}
                </span>
                <span className="font-mono text-slate-300 truncate block text-[11px]">{videoSrc}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(videoSrc, 'srcUrl')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
                title={isRtl ? "نسخ رابط البث" : "Copy Stream URL"}
              >
                {copiedKey === 'srcUrl' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Probe Action */}
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">CDN Health</span>
                <span className="text-[11px] font-bold text-slate-300 block">
                  {probeResult ? `${probeResult.status || 'Err'}` : (isRtl ? "غير مفحوص" : "Unprobed")}
                </span>
              </div>
              <button
                type="button"
                onClick={handleProbeUrl}
                disabled={isProbing}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-[10px] transition-all flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Globe className="h-3 w-3" />
                <span>{isProbing ? "..." : (isRtl ? "فحص" : "Probe")}</span>
              </button>
            </div>

            {/* Edit / Fallback Actions */}
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Quick Action</span>
                <span className="text-[11px] font-bold text-slate-300 block truncate">
                  {isSampleStreamActive ? "Sample Active" : "Original Link"}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleSampleStream}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isSampleStreamActive 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  title={isSampleStreamActive ? (isRtl ? "العودة للرابط الأصلي" : "Use Original") : (isRtl ? "تشغيل بث تجريبي" : "Play Sample")}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingUrl(!isEditingUrl)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={isRtl ? "تعديل الرابط" : "Edit URL"}
                >
                  <Wrench className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

          </div>
        </div>
      </motion.div>
    </div>
  );
}
