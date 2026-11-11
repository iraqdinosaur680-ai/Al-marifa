import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Play, Video, Calendar, Award, Settings, Search, Clock, LogOut, 
  ShieldAlert, Minimize, Maximize, ChevronRight, MessageSquare, Shield,
  FastForward, GraduationCap, Globe, X, ArrowDownToLine, CheckCircle2,
  Trash2, HardDrive, Lock, Cpu, RefreshCw, Pause, RotateCcw, RotateCw,
  Volume2, VolumeX, AlertTriangle
} from "lucide-react";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { Video as VideoType, AttendanceRecord, GradeRecord, AcademicYear } from "../types";
import { translations, Language, getLanguageDirection, matchesSearchQuery } from "../lib/translations";
import { ThemeMode, getStoredTheme, applyTheme } from "../lib/theme";
import ThemeToggleCard from "./ThemeToggleCard";
import { getApiUrl } from "../lib/api";
import { useBackHandler, pushNavigationHistoryState } from "../lib/useBackHandler";
import { signBunnyStreamUrlLocally, resolveVideoPlayableSource, SAMPLE_STREAMS } from "../lib/security";
import Hls from 'hls.js';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { getPreferenceSync, setPreference, getVideoProgress, saveVideoProgress, hydrateKvCache } from "../lib/offlineStorage";

interface StudentAppProps {
  phone: string;
  name: string;
  extra: any; // student Firestore record
  onLogout: () => void;
  developerInfo: {
    name: string;
    phone: string;
    whatsapp: string;
    insta: string;
    tele: string;
  };
  onOpenLegal?: (view: 'privacy' | 'terms') => void;
}

export default function StudentApp({ phone, name, extra, onLogout, developerInfo, onOpenLegal }: StudentAppProps) {
  const [lang, setLang] = useState<Language>(() => {
    const saved = getPreferenceSync("platform_lang");
    return (saved === "en" || saved === "ar") ? saved : "ar";
  });

  // Hydrate the durable (IndexedDB-backed) preference cache once on mount so that
  // progress/language values persisted on a previous native app session are
  // available even if the OS has since cleared localStorage under storage pressure.
  const [, forceRerenderAfterHydrate] = useState(0);
  useEffect(() => {
    hydrateKvCache().then(() => forceRerenderAfterHydrate(v => v + 1));
  }, []);
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const [activeTab, setActiveTab] = useState<'videos' | 'academics' | 'settings'>('videos');

  const handleTabChange = (newTab: 'videos' | 'academics' | 'settings') => {
    if (newTab !== activeTab) {
      if (newTab !== 'videos') {
        pushNavigationHistoryState(newTab);
      }
      setActiveTab(newTab);
    }
  };

  const [studentData, setStudentData] = useState<any>(extra);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [videos, setVideos] = useState<VideoType[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [studentGroup, setStudentGroup] = useState<any>(null);
  
  // Video filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState('All');
  
  const [securityTriggered, setSecurityTriggered] = useState(false);

  // Help & Communication Support States
  const [supportPhone, setSupportPhone] = useState('+15555555');
  const [supportWhatsapp, setSupportWhatsapp] = useState('+15555555');

  // Convert "MM:SS" or "HH:MM:SS" to seconds
  const durationToSeconds = (durationStr: string): number => {
    if (!durationStr) return 600;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 600;
  };

  const formatSeconds = (totalSecs: number): string => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };
  
  // Active video player state
  const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const offlinePlayerContainerRef = React.useRef<HTMLDivElement | null>(null);
  const streamRef = React.useRef<any>(null);

  const realTimePlayerCurrentTimeRef = React.useRef<number>(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [targetSeekTime, setTargetSeekTime] = useState<number | null>(null);
  const [activeVideo, setActiveVideo] = useState<VideoType | null>(null);
  const [videoQuality, setVideoQuality] = useState<'Auto' | '1080p' | '720p' | '480p' | '360p'>('Auto');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0); // 0 to 100
  const [playbackToken, setPlaybackToken] = useState<string>('');
  const [isSimulatedKey, setIsSimulatedKey] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenTransitioning, setIsFullscreenTransitioning] = useState(false);
  const [isFlippedLandscape, setIsFlippedLandscape] = useState(false);
  // Single source of truth: true only while the user has explicitly requested fullscreen
  // (never auto-set from the video's own aspect ratio on open). Drives the one consolidated
  // orientation-lock effect below.
  const [orientationLockRequested, setOrientationLockRequested] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'main' | 'speed' | 'quality'>('main');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [leftRippleActive, setLeftRippleActive] = useState(false);
  const [rightRippleActive, setRightRippleActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Measured viewport dimensions for iOS WKWebView dynamic viewport chrome & flipped landscape
  const [viewportDims, setViewportDims] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0
  }));

  useEffect(() => {
    const updateDimensions = () => {
      setViewportDims({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
    };
  }, []);
  
  // Slider thumbnail hover preview state
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [hoverPosition, setHoverPosition] = useState<number>(0); // 0 to 100 percentage
  const [isHoveringSlider, setIsHoveringSlider] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTime, setScrubTime] = useState<number>(0);
  const [bufferedProgress, setBufferedProgress] = useState<number>(0);
  
  useBackHandler({
    activeTab,
    homeTab: 'videos',
    onGoHome: () => setActiveTab('videos'),
    hasOpenModal: !!activeVideo || showSettingsSheet || securityTriggered,
    onCloseModal: () => {
      if (showSettingsSheet) {
        setShowSettingsSheet(false);
      } else if (securityTriggered) {
        setSecurityTriggered(false);
      } else if (activeVideo) {
        setActiveVideo(null);
      }
    }
  });
  const playerContainerRef = React.useRef<HTMLDivElement | null>(null);
  const lastTapRef = React.useRef<{ time: number; x: number; y: number } | null>(null);
  const lastTouchTimeRef = React.useRef<number>(0);
  const singleTapTimeoutRef = React.useRef<any>(null);
  const controlsTimeoutRef = React.useRef<any>(null);
  const controlsVisibleRef = React.useRef<boolean>(true);

  const triggerShowControls = (duration = 4500) => {
    setControlsVisible(true);
    controlsVisibleRef.current = true;
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    controlsTimeoutRef.current = setTimeout(() => {
      // Only auto-hide if playing
      if (realTimeIsPlayingRef.current) {
        setControlsVisible(false);
        controlsVisibleRef.current = false;
      }
    }, duration);
  };

  // Keep a ref to isPlaying to avoid dependency cycle in timeout
  const realTimeIsPlayingRef = React.useRef(isPlaying);
  useEffect(() => {
    realTimeIsPlayingRef.current = isPlaying;
    if (isPlaying) {
      triggerShowControls(4500);
    } else {
      setControlsVisible(true);
      controlsVisibleRef.current = true;
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    }
  }, [isPlaying]);

  const [isBuffering, setIsBuffering] = useState(false);

  const [videoNotice, setVideoNotice] = useState<string>('');
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? window.navigator.onLine : true);

  // Security & Custom Player States (DRM screenshot, screen recording block)
  const [securityBlockActive, setSecurityBlockActive] = useState(false);
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(600);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(false);
  const fullscreenControlsTimeoutRef = React.useRef<any>(null);

  const resetFullscreenControlsTimeout = () => {
    if (fullscreenControlsTimeoutRef.current) {
      clearTimeout(fullscreenControlsTimeoutRef.current);
    }
    fullscreenControlsTimeoutRef.current = setTimeout(() => {
      setFullscreenControlsVisible(false);
    }, 4000); // Hide controls after 4 seconds of inactivity
  };

  const currentPlayable = React.useMemo(() => {
    if (!activeVideo) return { isDirectHtml5: false, sourceUrl: '', isHls: false, isSampleDemo: false };
    const videoIdx = videos.findIndex(v => v.id === activeVideo.id);
    return resolveVideoPlayableSource(activeVideo.cloudflareId, activeVideo.downloadUrl, videoIdx);
  }, [activeVideo, videos]);

  const useLocalVideo = currentPlayable.isDirectHtml5;

  // Track page scroll position and enforce iOS-safe scroll locking on document.body during theater playback
  const savedScrollYRef = useRef<number>(0);
  const theaterOverlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeVideo) return;

    // Save scroll position before locking
    const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    savedScrollYRef.current = currentScrollY;

    // Save existing inline styles on document body
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    // Apply robust iOS-safe scroll lock
    document.body.style.position = 'fixed';
    document.body.style.top = `-${currentScrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    // Second layer of defense: `touchAction: 'none'` and `overflow: hidden`
    // are not always enough to stop WKWebView's native rubber-band/bounce
    // scroll once a gesture starts on the video overlay itself. Block any
    // touchmove that isn't part of a pinch/multi-touch gesture (so pinch
    // zoom on the settings sheet etc. still works) with a non-passive
    // listener so preventDefault actually takes effect.
    const blockRubberBandScroll = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // allow multi-touch gestures
      e.preventDefault();
    };
    const overlayNode = theaterOverlayRef.current;
    overlayNode?.addEventListener('touchmove', blockRubberBandScroll, { passive: false });

    return () => {
      // Restore previous styles
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;

      // Restore exact scroll position
      window.scrollTo(0, savedScrollYRef.current);

      overlayNode?.removeEventListener('touchmove', blockRubberBandScroll);
    };
  }, [!!activeVideo]);

  // Diagnostics: confirm the <video> element actually has a nonzero rendered
  // size once it's mounted/active, and force a repaint if iOS leaves it
  // black after the container is measured. This runs on every relevant
  // layout-affecting state change (video open, fullscreen toggles).
  useEffect(() => {
    if (!useLocalVideo || !activeVideo) return;
    const raf = requestAnimationFrame(() => {
      const videoEl = localVideoRef.current;
      if (!videoEl) return;
      const rect = videoEl.getBoundingClientRect();
      console.log(`[VideoDebug] mount/layout check. rect=${JSON.stringify({ w: rect.width, h: rect.height })} paused=${videoEl.paused} readyState=${videoEl.readyState}`);
      if (rect.width > 0 && rect.height > 0) {
        // Nudge the compositor: toggling a no-op style forces WKWebView to
        // repaint the video's compositing layer, which resolves the
        // "audio/time plays but frame stays black" case on some iOS builds.
        videoEl.style.opacity = '0.999';
        requestAnimationFrame(() => {
          if (videoEl) videoEl.style.opacity = '1';
        });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [useLocalVideo, activeVideo?.id, isFullscreen, isPseudoFullscreen, isFlippedLandscape]);

  const [videoSrcErrorCount, setVideoSrcErrorCount] = useState<number>(0);
  const [isStreamUnavailable, setIsStreamUnavailable] = useState<boolean>(false);
  const activeLoadTokenRef = React.useRef<number>(0);
  const MAX_FALLBACK_RETRIES = 2;

  // Reset error count and stream unavailable state when video or quality selection changes
  useEffect(() => {
    setVideoSrcErrorCount(0);
    setIsStreamUnavailable(false);
  }, [activeVideo?.id, videoQuality]);

  const getHtml5VideoSrc = () => {
    if (!activeVideo) return '';
    if (videoSrcErrorCount > 0) {
      const videoIdx = videos.findIndex(v => v.id === activeVideo.id);
      const fallbackIdx = (Math.abs(videoIdx) + videoSrcErrorCount) % SAMPLE_STREAMS.length;
      return SAMPLE_STREAMS[fallbackIdx];
    }
    if (currentPlayable.sourceUrl) {
      return currentPlayable.sourceUrl;
    }
    const resolved = resolveVideoPlayableSource(activeVideo.cloudflareId, activeVideo.downloadUrl);
    if (resolved.sourceUrl) {
      return resolved.sourceUrl;
    }
    const videoIdx = videos.findIndex(v => v.id === activeVideo.id);
    const sampleIdx = Math.abs(videoIdx) % SAMPLE_STREAMS.length;
    return SAMPLE_STREAMS[sampleIdx];
  };

  // Helper to switch HLS stream quality level
  const applyHlsQualityLevel = (hls: Hls, quality: string, levels: any[]) => {
    if (!hls || !levels || levels.length === 0) return;
    if (quality === 'Auto') {
      hls.currentLevel = -1;
      return;
    }
    const targetHeight = parseInt(quality.replace('p', ''));
    if (isNaN(targetHeight)) {
      hls.currentLevel = -1;
      return;
    }
    let bestIdx = -1;
    let minDiff = Infinity;
    levels.forEach((lvl, idx) => {
      const diff = Math.abs(lvl.height - targetHeight);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = idx;
      }
    });
    if (bestIdx !== -1) {
      hls.currentLevel = bestIdx;
      console.log(`[HLS] Switched to level index ${bestIdx} (${levels[bestIdx]?.height}p)`);
    }
  };

  // Attach and manage HLS.js or native HTML5 video stream lifecycle
  useEffect(() => {
    const currentToken = ++activeLoadTokenRef.current;

    const cleanupHls = () => {
      if (hlsRef.current) {
        const instance = hlsRef.current;
        hlsRef.current = null;
        try {
          instance.stopLoad();
        } catch (e) {}
        try {
          instance.detachMedia();
        } catch (e) {}
        try {
          instance.destroy();
        } catch (e) {}
      }
    };

    if (!activeVideo || !useLocalVideo) {
      cleanupHls();
      return;
    }

    const videoEl = localVideoRef.current;
    if (!videoEl) return;

    const videoSrc = getHtml5VideoSrc();
    if (!videoSrc) return;

    const isHls = (videoSrc.includes('.m3u8') || (videoSrc.includes('b-cdn.net') && videoSrc.includes('playlist'))) && !videoSrc.includes('.mp4');
    const shouldUseHlsJs = isHls && Hls.isSupported();
    const canPlayAppleNativeHls = Boolean(videoEl.canPlayType && videoEl.canPlayType('application/vnd.apple.mpegurl'));

    console.log(`[VideoDebug] [Token #${currentToken}] Initializing video source: ${videoSrc} (isHls: ${isHls}, hlsSupported: ${Hls.isSupported()}, nativeAppleHls: ${canPlayAppleNativeHls}, shouldUseHlsJs: ${shouldUseHlsJs}, errorCount: ${videoSrcErrorCount})`);

    // Task 2: Instrument network probe before assigning source
    (async () => {
      try {
        const probeRes = await fetch(videoSrc, { method: 'HEAD' });
        if (currentToken === activeLoadTokenRef.current) {
          console.log(`[VideoDebug] [Token #${currentToken}] Network probe HEAD response:`, {
            url: videoSrc,
            status: probeRes.status,
            statusText: probeRes.statusText,
            contentType: probeRes.headers.get('content-type'),
            corsHeader: probeRes.headers.get('access-control-allow-origin'),
            contentLength: probeRes.headers.get('content-length')
          });
        }
      } catch (probeErr: any) {
        if (currentToken === activeLoadTokenRef.current) {
          console.warn(`[VideoDebug] [Token #${currentToken}] Network probe HEAD check note:`, probeErr?.message || probeErr);
        }
      }
    })();

    if (shouldUseHlsJs) {
      cleanupHls();

      let networkRetryCount = 0;
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;

      hls.loadSource(videoSrc);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        if (currentToken !== activeLoadTokenRef.current) return;
        console.log('[VideoDebug] HLS manifest parsed successfully. Available levels:', data.levels.length);
        setIsBuffering(false);
        setHasStartedPlaying(true);
        setIsStreamUnavailable(false);

        if (videoQuality !== 'Auto' && data.levels && data.levels.length > 0) {
          applyHlsQualityLevel(hls, videoQuality, data.levels);
        }

        const targetTime = playerCurrentTime > 0 ? playerCurrentTime : (realTimePlayerCurrentTimeRef.current > 0 ? realTimePlayerCurrentTimeRef.current : 0);
        if (targetTime > 0) {
          try {
            videoEl.currentTime = targetTime;
          } catch (e) {}
        }

        if (isPlaying && videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (currentToken !== activeLoadTokenRef.current) return;
        console.warn('[VideoDebug] HLS error encountered:', data.type, data.details, 'fatal:', data.fatal);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              networkRetryCount += 1;
              if (networkRetryCount <= 1 && data.details !== 'manifestLoadError' && data.details !== 'manifestParsingError') {
                console.log('[VideoDebug] HLS network error, retrying load...');
                hls.startLoad();
              } else {
                console.warn('[VideoDebug] HLS unrecoverable network error. Falling back to alternative stream...');
                cleanupHls();
                if (videoSrcErrorCount < MAX_FALLBACK_RETRIES) {
                  setVideoSrcErrorCount(prev => prev + 1);
                } else {
                  setIsStreamUnavailable(true);
                }
                setIsBuffering(false);
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('[VideoDebug] HLS fatal media error, recovering media...');
              hls.recoverMediaError();
              break;
            default:
              console.error('[VideoDebug] HLS fatal unrecoverable error. Destroying and falling back to alternative source...');
              cleanupHls();
              if (videoSrcErrorCount < MAX_FALLBACK_RETRIES) {
                setVideoSrcErrorCount(prev => prev + 1);
              } else {
                setIsStreamUnavailable(true);
              }
              setIsBuffering(false);
              break;
          }
        }
      });

      return () => {
        cleanupHls();
      };
    } else {
      // Native Apple HLS (iOS / Safari / WKWebView) or Direct MP4
      cleanupHls();
      if (videoEl.src !== videoSrc) {
        videoEl.src = videoSrc;
      }
      if (isPlaying && videoEl.paused) {
        videoEl.play().catch((err) => {
          console.log('[VideoDebug] Native video play caught:', err?.message);
        });
      }
      return () => {
        cleanupHls();
      };
    }
  }, [activeVideo?.id, currentPlayable.sourceUrl, videoSrcErrorCount, useLocalVideo]);

  // Keep track of player position when switching qualities
  const handleQualityChange = (newQuality: 'Auto' | '1080p' | '720p' | '480p' | '360p') => {
    if (!activeVideo) return;
    if (newQuality === videoQuality) {
      setShowSettingsSheet(false);
      setSettingsActiveTab('main');
      return;
    }

    // 1. Capture exact current playback time before switching quality
    let exactCurrentTime = playerCurrentTime || 0;
    if (localVideoRef.current && typeof localVideoRef.current.currentTime === 'number' && !isNaN(localVideoRef.current.currentTime)) {
      exactCurrentTime = Math.floor(localVideoRef.current.currentTime);
    } else if (streamRef.current && typeof streamRef.current.currentTime === 'number' && !isNaN(streamRef.current.currentTime)) {
      exactCurrentTime = Math.floor(streamRef.current.currentTime);
    } else if (realTimePlayerCurrentTimeRef.current > 0) {
      exactCurrentTime = realTimePlayerCurrentTimeRef.current;
    }

    console.log(`[Quality Switch] Changing quality from ${videoQuality} to ${newQuality}. Preserving time: ${exactCurrentTime}s`);

    // 2. Persist the current timestamp into state & refs so playback restores accurately
    setPlayerCurrentTime(exactCurrentTime);
    realTimePlayerCurrentTimeRef.current = exactCurrentTime;
    if (playerDuration > 0) {
      saveVideoProgress(activeVideo.id, (exactCurrentTime / playerDuration) * 100, exactCurrentTime, true);
    }

    // 3. Update quality state so UI and player reflect the selection
    setVideoQuality(newQuality);

    // 4. Update HLS stream quality level if active
    if (hlsRef.current && hlsRef.current.levels && hlsRef.current.levels.length > 0) {
      applyHlsQualityLevel(hlsRef.current, newQuality, hlsRef.current.levels);
    }

    // 5. Update local video element directly within this user gesture
    if (localVideoRef.current) {
      try {
        const videoEl = localVideoRef.current;
        if (exactCurrentTime > 0) {
          videoEl.currentTime = exactCurrentTime;
        }
        if (isPlaying && videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      } catch (err) {
        console.warn("Quality change immediate play:", err);
      }
    }

    // 6. Close settings sheet
    setShowSettingsSheet(false);
    setSettingsActiveTab('main');
  };

  const seekTo = (targetSeconds: number) => {
    const clampedTime = Math.max(0, Math.min(playerDuration, Math.floor(targetSeconds)));
    setPlayerCurrentTime(clampedTime);
    realTimePlayerCurrentTimeRef.current = clampedTime;
    
    if (playerDuration > 0) {
      const pct = (clampedTime / playerDuration) * 100;
      setPlaybackProgress(safePercent(pct));
      if (activeVideo) {
        saveVideoProgress(activeVideo.id, safePercent(pct), clampedTime, true);
      }
    }

    if (localVideoRef.current) {
      try {
        localVideoRef.current.currentTime = clampedTime;
      } catch (err) {
        console.warn("Error seeking HTML5 video:", err);
      }
    }
  };

  const toggleMute = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localVideoRef.current) {
      localVideoRef.current.muted = nextMuted;
    }
    triggerShowControls();
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (localVideoRef.current) {
      localVideoRef.current.playbackRate = speed;
    }
    setShowSettingsSheet(false);
    setSettingsActiveTab('main');
    triggerShowControls();
  };

  const handleSkipForward = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    const current = realTimePlayerCurrentTimeRef.current || playerCurrentTime || 0;
    const target = Math.min(playerDuration, current + 10);
    seekTo(target);
    setRightRippleActive(true);
    setTimeout(() => setRightRippleActive(false), 600);
    triggerShowControls();
  };

  const handleSkipBackward = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    const current = realTimePlayerCurrentTimeRef.current || playerCurrentTime || 0;
    const target = Math.max(0, current - 10);
    seekTo(target);
    setLeftRippleActive(true);
    setTimeout(() => setLeftRippleActive(false), 600);
    triggerShowControls();
  };

  const calculateScrubTime = (clientX: number, targetElement: HTMLElement): number => {
    const rect = targetElement.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = clickX / rect.width;
    return Math.max(0, Math.min(playerDuration, pct * playerDuration));
  };

  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const targetSec = calculateScrubTime(e.clientX, e.currentTarget);
    setIsScrubbing(true);
    setScrubTime(targetSec);
    setHoverPosition((targetSec / (playerDuration || 1)) * 100);
    setHoverTime(targetSec);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    triggerShowControls();
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const targetSec = calculateScrubTime(e.clientX, e.currentTarget);
    setHoverPosition((targetSec / (playerDuration || 1)) * 100);
    setHoverTime(targetSec);
    if (isScrubbing) {
      setScrubTime(targetSec);
      triggerShowControls();
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isScrubbing) {
      setIsScrubbing(false);
      seekTo(scrubTime);
      triggerShowControls();
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handleContainerTap = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const isTouch = 'changedTouches' in e;
    
    if (isTouch) {
      lastTouchTimeRef.current = Date.now();
    } else {
      // If mouse click fires within 600ms of a touch event, it's a mobile synthetic duplicate
      if (Date.now() - lastTouchTimeRef.current < 600) {
        return;
      }
    }

    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, [data-interactive="true"]')) {
      triggerShowControls();
      return;
    }

    const now = Date.now();
    let clientX = 0;
    let clientY = 0;
    if ('clientX' in e && !isTouch) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else if (isTouch && (e as React.TouchEvent).changedTouches?.[0]) {
      const t = (e as React.TouchEvent).changedTouches[0];
      clientX = t.clientX;
      clientY = t.clientY;
    }

    const rect = playerContainerRef.current?.getBoundingClientRect();
    const prevTap = lastTapRef.current;

    // Double tap/click detected (within 300ms, close proximity)
    if (
      rect && 
      prevTap && 
      (now - prevTap.time < 300) && 
      (Math.abs(clientX - prevTap.x) < 60) && 
      (Math.abs(clientY - prevTap.y) < 60)
    ) {
      // Clear any pending single tap toggle action
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      lastTapRef.current = null;

      const relX = clientX - rect.left;
      if (relX < rect.width * 0.4) {
        handleSkipBackward();
        return;
      } else if (relX > rect.width * 0.6) {
        handleSkipForward();
        return;
      } else {
        // Double tap center toggles play/pause
        togglePlayback();
        return;
      }
    }

    // First tap: record it and schedule single-tap control visibility toggle
    lastTapRef.current = { time: now, x: clientX, y: clientY };

    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
    }

    singleTapTimeoutRef.current = setTimeout(() => {
      singleTapTimeoutRef.current = null;
      lastTapRef.current = null;
      // Single tap: toggle controls cleanly with YouTube-like duration
      if (controlsVisibleRef.current) {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
          controlsTimeoutRef.current = null;
        }
        setControlsVisible(false);
        controlsVisibleRef.current = false;
      } else {
        triggerShowControls(4500);
      }
    }, 220);
  };

  const handleCloseVideo = () => {
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.pause();
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setIsFullscreen(false);
    setIsPseudoFullscreen(false);
    setIsFlippedLandscape(false);
    setOrientationLockRequested(false);
    setActiveVideo(null);
    setIsPlaying(false);
    setIsSeeking(false);
    setTargetSeekTime(null);
    setHasStartedPlaying(false);
    setShowSettingsSheet(false);
  };

  const togglePlayback = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (localVideoRef.current) {
      const videoEl = localVideoRef.current;
      if (videoEl.paused) {
        setIsPlaying(true);
        setHasStartedPlaying(true);
        setIsBuffering(false);
        const playPromise = videoEl.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setHasStartedPlaying(true);
              setIsBuffering(false);
            })
            .catch((err) => {
              if (err && err.name !== 'AbortError') {
                console.warn("Play attempt paused by system:", err?.message || err);
              }
            });
        }
      } else {
        videoEl.pause();
        setIsPlaying(false);
      }
    }
    triggerShowControls();
  };

  const handlePlayerContainerClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isFullscreen && !isPseudoFullscreen) return;

    // Check if clicked element or its parent is interactive (like button, input)
    const target = e.target as HTMLElement;
    const isInteractive = target.closest("button, input, select, a");

    if (isInteractive) {
      // Refresh the visibility and reset the timeout
      setFullscreenControlsVisible(true);
      resetFullscreenControlsTimeout();
      return;
    }

    // Toggle controls visibility
    setFullscreenControlsVisible((prev) => {
      const next = !prev;
      if (next) {
        resetFullscreenControlsTimeout();
      } else {
        if (fullscreenControlsTimeoutRef.current) {
          clearTimeout(fullscreenControlsTimeoutRef.current);
        }
      }
      return next;
    });
  };

  // NOTE on orientation locking: this component intentionally has a SINGLE source of
  // truth for screen-orientation locking — the `orientationLockRequested` state below,
  // consumed by exactly one effect (see "Single source of truth for orientation locking").
  // `toggleFullscreen`, the native `fullscreenchange` listener, and the video-close/unmount
  // paths only ever flip that one boolean (plus `isFlippedLandscape`, which is purely a
  // CSS-transform fallback flag) — none of them call the orientation APIs directly, so
  // there is no possibility of two lock/unlock calls racing each other.
  // Native iOS webkit fullscreen listeners for native AVPlayerViewController video presentation
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (!videoEl) return;

    const handleBeginFS = () => {
      setIsFullscreen(true);
      setControlsVisible(true);
    };
    const handleEndFS = () => {
      setIsFullscreen(false);
      setIsPseudoFullscreen(false);
      setIsFlippedLandscape(false);
      setOrientationLockRequested(false);
    };

    videoEl.addEventListener('webkitbeginfullscreen', handleBeginFS);
    videoEl.addEventListener('webkitendfullscreen', handleEndFS);

    return () => {
      videoEl.removeEventListener('webkitbeginfullscreen', handleBeginFS);
      videoEl.removeEventListener('webkitendfullscreen', handleEndFS);
    };
  }, [localVideoRef.current, activeVideo?.id]);

  const toggleFullscreen = () => {
    const container = playerContainerRef.current;
    const videoEl = localVideoRef.current;
    if (!container) return;

    const isCurrentlyFS = isFullscreen || isPseudoFullscreen || isFlippedLandscape;

    if (isCurrentlyFS) {
      setIsFlippedLandscape(false);
      setIsPseudoFullscreen(false);
      setIsFullscreen(false);
      setOrientationLockRequested(false);

      if (videoEl && typeof (videoEl as any).webkitExitFullscreen === 'function') {
        try {
          (videoEl as any).webkitExitFullscreen();
        } catch (err) {
          console.log(err);
        }
      }
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.log(err));
      }
    } else {
      // 1. Prefer native iOS AVPlayerViewController fullscreen on iPhone / iPad WKWebView
      if (videoEl && typeof (videoEl as any).webkitEnterFullscreen === 'function') {
        try {
          (videoEl as any).webkitEnterFullscreen();
          setIsFullscreen(true);
          setControlsVisible(true);
          return;
        } catch (err) {
          console.warn("webkitEnterFullscreen failed, trying web fallback:", err);
        }
      }

      const requestFS = container.requestFullscreen || (container as any).webkitRequestFullscreen || (container as any).mozRequestFullScreen || (container as any).msRequestFullscreen;
      const isPortrait = window.innerHeight > window.innerWidth;
      const isMobile = window.innerWidth < 768;
      const wantsLandscapeLock = isMobile && isPortrait;

      if (requestFS) {
        const fsCall = () => {
          try {
            return requestFS.call(container, { navigationUI: "hide" } as any);
          } catch (e) {
            return requestFS.call(container);
          }
        };

        Promise.resolve(fsCall()).then(() => {
          setIsFullscreen(true);
          // Only ever lock orientation here, in response to the user's explicit
          // fullscreen action — never automatically based on the video's own aspect ratio.
          if (wantsLandscapeLock) {
            setOrientationLockRequested(true);
          }
        }).catch((err) => {
          console.warn("Standard requestFullscreen failed, using pseudo-fullscreen:", err);
          setIsPseudoFullscreen(true);
          if (wantsLandscapeLock) {
            setOrientationLockRequested(true);
            setIsFlippedLandscape(true);
          }
        });
      } else {
        setIsPseudoFullscreen(true);
        if (wantsLandscapeLock) {
          setOrientationLockRequested(true);
          setIsFlippedLandscape(true);
        }
      }
      setControlsVisible(true);
      triggerShowControls();
    }
  };

  // Auto-enter/exit fullscreen when the physical device is rotated while a
  // video is open. Previously fullscreen only activated on an explicit tap
  // of the fullscreen button, so flipping the phone left the player stuck in
  // the small embedded card — too short to show the bottom controls bar
  // (scrubber, time, fullscreen toggle) at all. Now landscape rotation itself
  // triggers the exact same enter-fullscreen path `toggleFullscreen` uses,
  // and rotating back to portrait exits it, matching native video players.
  const wasAutoFullscreenRef = React.useRef(false);
  useEffect(() => {
    if (!activeVideo) return;
    const isMobile = viewportDims.width < 768;
    if (!isMobile) return;
    const isLandscape = viewportDims.width > viewportDims.height;
    const isCurrentlyFS = isFullscreen || isPseudoFullscreen;

    if (isLandscape && !isCurrentlyFS) {
      wasAutoFullscreenRef.current = true;
      toggleFullscreen();
    } else if (!isLandscape && isCurrentlyFS && wasAutoFullscreenRef.current) {
      wasAutoFullscreenRef.current = false;
      toggleFullscreen();
    }
  }, [viewportDims.width, viewportDims.height, activeVideo?.id]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (!isCurrentlyFullscreen) {
        setIsFlippedLandscape(false);
        setIsPseudoFullscreen(false);
        // Orientation unlock is handled exclusively by the consolidated
        // orientation-lock effect (driven by `orientationLockRequested`) — do not
        // call the orientation API here to avoid racing with that effect.
        setOrientationLockRequested(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPseudoFullscreen) {
        setIsPseudoFullscreen(false);
        setFullscreenControlsVisible(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPseudoFullscreen]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Security Anti-Screenshot & Screen-Recording Guard
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPlaying) {
        // Tab backgrounded or system recording active
        setIsPlaying(false);
        setSecurityBlockActive(true);
      } else if (!document.hidden) {
        setSecurityBlockActive(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isScreenshotKey = 
        e.key === "PrintScreen" || 
        (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key)) ||
        (e.ctrlKey && e.shiftKey && ["s", "S"].includes(e.key)) ||
        (e.metaKey && e.shiftKey && ["s", "S"].includes(e.key));

      if (isScreenshotKey) {
        e.preventDefault();
        setSecurityBlockActive(true);
        setIsPlaying(false);
        setTimeout(() => setSecurityBlockActive(false), 2000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlaying]);

  // Synchronize HTML5 video playback rate
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeVideo, isPlaying]);

  // Synchronize mute/unmute state
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.muted = isMuted;
    }
  }, [isMuted, activeVideo, isPlaying]);

  // Synchronize play/pause state safely without recursive play rejection loops
  useEffect(() => {
    if (localVideoRef.current) {
      const videoEl = localVideoRef.current;
      videoEl.muted = isMuted;
      if (isPlaying) {
        if (videoEl.paused) {
          const playPromise = videoEl.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                setHasStartedPlaying(true);
                setIsBuffering(false);
              })
              .catch((err) => {
                if (err && err.name === 'NotAllowedError') {
                  // On iOS, if unmuted autoplay is blocked, mute and retry play
                  videoEl.muted = true;
                  setIsMuted(true);
                  videoEl.play().then(() => {
                    setHasStartedPlaying(true);
                    setIsBuffering(false);
                  }).catch(() => {
                    setIsPlaying(false);
                    setIsBuffering(false);
                  });
                } else {
                  setIsBuffering(false);
                }
              });
          }
        }
      } else {
        if (!videoEl.paused) {
          videoEl.pause();
        }
      }
    }
  }, [isPlaying, activeVideo?.id, isMuted]);

  // -------------------------------------------------------------------------
  // Single source of truth for orientation locking.
  //
  // `orientationLockRequested` is the ONLY thing that drives real orientation
  // lock/unlock calls. It is set to true exclusively when the user explicitly
  // enters fullscreen (in `toggleFullscreen`), and set back to false when
  // fullscreen is exited via any path (toggle button, native fullscreenchange
  // event, closing the video modal, the Android back button, or unmount).
  //
  // `appliedOrientationRef` guards against redundant lock/unlock API calls:
  // if the desired orientation state hasn't actually changed since the last
  // call we applied, we skip re-issuing it. This prevents the effect from
  // firing lock() then unlock() back-to-back if `orientationLockRequested`
  // (or its dependents) toggle rapidly during render.
  //
  // Preference order: Capacitor's native `ScreenOrientation` plugin on native
  // platforms, falling back to the web `screen.orientation` API only when the
  // Capacitor plugin is unavailable (or its lock call fails) — never both.
  // -------------------------------------------------------------------------
  const appliedOrientationRef = React.useRef<'landscape' | 'unlocked' | null>(null);

  useEffect(() => {
    let cancelled = false;

    const applyOrientationState = async () => {
      const desired: 'landscape' | 'unlocked' = orientationLockRequested ? 'landscape' : 'unlocked';

      // Guard: skip if we've already applied this exact desired state.
      if (appliedOrientationRef.current === desired) return;
      appliedOrientationRef.current = desired;

      try {
        if (desired === 'landscape') {
          if (Capacitor.isNativePlatform()) {
            await ScreenOrientation.lock({ orientation: 'landscape' });
          } else if (typeof window !== 'undefined' && (window.screen?.orientation as any)?.lock) {
            await (window.screen.orientation as any).lock('landscape');
          } else {
            // No native/web orientation-lock API available at all — rely purely
            // on the CSS-transform fallback (isFlippedLandscape).
            if (!cancelled) setIsFlippedLandscape(true);
          }
        } else {
          if (Capacitor.isNativePlatform()) {
            await ScreenOrientation.unlock();
          } else if (typeof window !== 'undefined' && (window.screen?.orientation as any)?.unlock) {
            await (window.screen.orientation as any).unlock();
          }
        }
      } catch (err) {
        console.warn(`Screen orientation ${desired === 'landscape' ? 'lock' : 'unlock'} error:`, err);
        // If a real lock attempt failed, fall back to the CSS-transform flip
        // instead of leaving the video stuck in the wrong layout.
        if (desired === 'landscape' && !cancelled) {
          setIsFlippedLandscape(true);
        }
      }
    };

    applyOrientationState();

    return () => {
      cancelled = true;
    };
  }, [orientationLockRequested]);

  // Safety net: force-unlock orientation on component unmount, in case the video
  // modal (or the whole app screen) goes away without going through the normal
  // close/exit-fullscreen paths above (e.g. abrupt navigation).
  useEffect(() => {
    return () => {
      appliedOrientationRef.current = null;
      try {
        if (Capacitor.isNativePlatform()) {
          ScreenOrientation.unlock().catch(() => {});
        } else if (typeof window !== 'undefined' && (window.screen?.orientation as any)?.unlock) {
          (window.screen.orientation as any).unlock();
        }
      } catch (err) {}
    };
  }, []);

  // Fullscreen immersive bars handling (hide notification bar at top & navigation bar at bottom)
  useEffect(() => {
    const isAnyFullscreen = isFullscreen || isPseudoFullscreen;

    // Trigger smooth fade transition
    setIsFullscreenTransitioning(true);
    const fadeTimeout = setTimeout(() => {
      setIsFullscreenTransitioning(false);
    }, 280);

    if (isAnyFullscreen) {
      // 1. Native Android Javascript Bridge
      try {
        (window as any).AndroidStorage?.setFullScreen?.(true);
      } catch (e) {}

      // 2. Capacitor StatusBar plugin
      try {
        if (Capacitor.isPluginAvailable('StatusBar')) {
          StatusBar.hide().catch(() => {});
        }
      } catch (e) {}
    } else {
      // Restore system bars
      try {
        (window as any).AndroidStorage?.setFullScreen?.(false);
      } catch (e) {}

      try {
        if (Capacitor.isPluginAvailable('StatusBar')) {
          StatusBar.show().catch(() => {});
        }
      } catch (e) {}
    }

    return () => {
      clearTimeout(fadeTimeout);
      try {
        (window as any).AndroidStorage?.setFullScreen?.(false);
      } catch (e) {}
      try {
        if (Capacitor.isPluginAvailable('StatusBar')) {
          StatusBar.show().catch(() => {});
        }
      } catch (e) {}
    };
  }, [isFullscreen, isPseudoFullscreen]);

  // Whenever the video modal closes (activeVideo becomes null) for ANY reason —
  // the close button, the Android hardware back button, or otherwise — make sure
  // we release any orientation lock so the rest of the app returns to normal
  // portrait behavior immediately.
  useEffect(() => {
    if (!activeVideo) {
      setOrientationLockRequested(false);
      setIsFlippedLandscape(false);
      setIsFullscreen(false);
      setIsPseudoFullscreen(false);
    }
  }, [activeVideo]);



  const t = translations[lang];
  const isRtl = lang === "ar";

  const handleLanguageToggle = (selectedLang: Language) => {
    setLang(selectedLang);
    setPreference("platform_lang", selectedLang);
  };

  // Fetch student data and real-time streams from Firestore
  useEffect(() => {
    // 1. Real-time student profile watcher
    const unsubStudent = onSnapshot(doc(db, "students", phone), (docSnap) => {
      if (docSnap.exists()) {
        setStudentData(docSnap.data());
      }
    }, (err) => console.error("Error watching student:", err));

    // 2. Load Academic Years
    getDocs(collection(db, "years")).then((snap) => {
      const yrs: AcademicYear[] = [];
      snap.forEach((d) => yrs.push(d.data() as AcademicYear));
      setAcademicYears(yrs);
    }).catch((err) => console.error("Error loading years:", err));

    // 3. Real-time Attendance watcher for this student
    const qAtt = query(collection(db, "attendance"), where("studentPhone", "==", phone));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      const atts: AttendanceRecord[] = [];
      snap.forEach((doc) => {
        atts.push(doc.data() as AttendanceRecord);
      });
      atts.sort((a, b) => b.date.localeCompare(a.date));
      setAttendance(atts);
    }, (err) => console.error("Error watching attendance:", err));

    // 4. Real-time Grades watcher for this student
    const qGrd = query(collection(db, "grades"), where("studentPhone", "==", phone));
    const unsubGrd = onSnapshot(qGrd, (snap) => {
      const grds: GradeRecord[] = [];
      snap.forEach((doc) => {
        grds.push(doc.data() as GradeRecord);
      });
      grds.sort((a, b) => b.examDate.localeCompare(a.examDate));
      setGrades(grds);
    }, (err) => console.error("Error watching grades:", err));

    // 5. Watch videos for student's current academic year
    const qVid = query(collection(db, "videos"), where("academicYear", "==", extra.academicYear), where("visibility", "==", "public"));
    const unsubVid = onSnapshot(qVid, (snap) => {
      const vids: VideoType[] = [];
      snap.forEach((doc) => {
        vids.push(doc.data() as VideoType);
      });
      vids.sort((a, b) => a.displayOrder - b.displayOrder);
      setVideos(vids);
    }, (err) => console.error("Error watching videos:", err));

    // 6. Real-time Support / Communication config fetch
    const unsubConfig = onSnapshot(doc(db, "config", "communication"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.phone) setSupportPhone(data.phone);
        if (data.whatsapp) setSupportWhatsapp(data.whatsapp);
      }
    }, (err) => console.error("Error watching config:", err));

    return () => {
      unsubStudent();
      unsubAtt();
      unsubGrd();
      unsubVid();
      unsubConfig();
    };
  }, [phone, extra.academicYear]);

  // Watch student group changes
  useEffect(() => {
    if (studentData?.groupId) {
      const unsubGroup = onSnapshot(doc(db, "groups", studentData.groupId), (docSnap) => {
        if (docSnap.exists()) {
          setStudentGroup(docSnap.data());
        } else {
          setStudentGroup(null);
        }
      }, (err) => console.error("Error watching student group:", err));
      return () => unsubGroup();
    } else {
      setStudentGroup(null);
    }
  }, [studentData?.groupId]);

  // Request Cloudflare signature from server for selected video
  const playVideo = async (video: VideoType) => {
    setActiveVideo(video);
    setSecurityTriggered(false);
    setIsSeeking(false);
    setTargetSeekTime(null);
    setHasStartedPlaying(false);
    setIsBuffering(false);
    setVideoSrcErrorCount(0);

    const maxSecs = durationToSeconds(video.duration);
    setPlayerDuration(maxSecs);

    // Restore exact progress position in seconds immediately
    const { percent: savedProgressPct, timeSec: savedTimeSec } = getVideoProgress(video.id);

    let initialTime = 0;
    if (savedTimeSec > 0) {
      initialTime = Math.floor(savedTimeSec);
    } else if (savedProgressPct > 0) {
      initialTime = Math.round((savedProgressPct / 100) * maxSecs);
    }

    // Reset if video was finished or within last 5 seconds
    if (maxSecs > 10 && initialTime >= maxSecs - 5) {
      initialTime = 0;
    }

    setPlayerCurrentTime(initialTime);
    realTimePlayerCurrentTimeRef.current = initialTime;
    if (maxSecs > 0) {
      setPlaybackProgress((initialTime / maxSecs) * 100);
    } else {
      setPlaybackProgress(0);
    }

    setVideoNotice("");
    setIsPlaying(true);
    setHasStartedPlaying(true);
  };

  // Persist current playback time on unmount or video close
  useEffect(() => {
    return () => {
      if (activeVideo && realTimePlayerCurrentTimeRef.current > 0) {
        const pct = playerDuration > 0 ? (realTimePlayerCurrentTimeRef.current / playerDuration) * 100 : 0;
        // immediate=true: this is a teardown path, must flush synchronously rather than wait for the throttle
        saveVideoProgress(activeVideo.id, pct, realTimePlayerCurrentTimeRef.current, true);
      }
    };
  }, [activeVideo?.id, playerDuration]);

  // Calculations for Attendance Card
  const totalDays = attendance.length;
  const presentDays = attendance.filter((a) => a.status === 'present').length;
  const lateDays = attendance.filter((a) => a.status === 'late').length;
  const attendanceRate = totalDays > 0 ? Math.round(((presentDays + lateDays * 0.5) / totalDays) * 100) : 100;

  // Grade badges
  const getLetterGrade = (score: number, total: number) => {
    const pct = (score / total) * 100;
    if (pct >= 90) return { label: 'A', bg: 'bg-emerald-100 text-emerald-800' };
    if (pct >= 80) return { label: 'B', bg: 'bg-blue-100 text-blue-800' };
    if (pct >= 70) return { label: 'C', bg: 'bg-yellow-100 text-yellow-800' };
    if (pct >= 60) return { label: 'D', bg: 'bg-orange-100 text-orange-800' };
    return { label: 'F', bg: 'bg-red-100 text-red-800' };
  };

  // Video playlists list (using category property)
  const playlists = ['All', ...Array.from(new Set(videos.map((v) => v.category)))];

  // Filtered videos with robust Arabic/English normalization and multi-field matching
  const filteredVideos = videos.filter((v) => {
    const matchesSearch = matchesSearchQuery(searchQuery, v.title, v.description, v.category);
    const matchesPlaylist = selectedPlaylist === 'All'
      ? true
      : v.category === selectedPlaylist;
    return matchesSearch && matchesPlaylist;
  });

  const safePercent = (val: number): number => {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
    return Math.min(100, Math.max(0, val));
  };

  const currentProgressPct = safePercent(isScrubbing 
    ? (playerDuration > 0 ? (scrubTime / playerDuration) * 100 : 0)
    : playbackProgress);

  const tooltipPosition = safePercent(isScrubbing 
    ? (playerDuration > 0 ? (scrubTime / playerDuration) * 100 : 0)
    : hoverPosition);

  const tooltipTime = isScrubbing ? scrubTime : hoverTime;

  const showTooltip = (isHoveringSlider || isScrubbing) && activeVideo && playerDuration > 0;

  const getYearName = (id: string) => {
    return academicYears.find((y) => y.id === id)?.name || (isRtl ? `الصف ${id}` : `Year ${id}`);
  };

  return (
    <div 
      className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans phone-page-bottom-padding"
      dir={getLanguageDirection(lang)}
    >
      
      {/* Top Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 px-3.5 phone-header-safe sm:px-6 sm:py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-slate-900 text-white p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl shadow-sm shrink-0">
              <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xs sm:text-base font-black text-gray-900 leading-none line-clamp-1">{studentData.name}</h1>
              <p className="text-[9px] sm:text-[11px] font-bold text-slate-500 mt-1 sm:mt-1.5">{t.studentPortal} • {getYearName(studentData.academicYear)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
              <button
                onClick={() => handleTabChange('videos')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'videos' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Video className="h-3.5 w-3.5 text-indigo-600" />
                <span>{t.lecturesTab}</span>
              </button>
              <button
                onClick={() => handleTabChange('academics')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'academics' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="h-3.5 w-3.5 text-amber-500" />
                <span>{t.academicsTab}</span>
              </button>
              <button
                onClick={() => handleTabChange('settings')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'settings' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="h-3.5 w-3.5 text-slate-500" />
                <span>{t.settingsTab}</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="flex-grow max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        
        {/* Videos Tab */}
        {activeTab === 'videos' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-gray-950 tracking-tight">{t.cloudflareLectures}</h2>
                <p className="text-xs text-slate-500 mt-1">{t.lecturesDesc}</p>
              </div>
              
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className={`absolute top-3.5 h-4 w-4 text-gray-400 pointer-events-none ${isRtl ? "right-3.5" : "left-3.5"}`} />
                <input
                  type="text"
                  name="search"
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  dir="auto"
                  autoCapitalize="none"
                  className={`w-full py-2.5 border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white transition-all shadow-xs ${
                    isRtl ? "pr-10 pl-9 text-right" : "pl-10 pr-9 text-left"
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className={`absolute top-2.5 p-1 rounded-full text-gray-400 hover:text-gray-700 active:scale-95 transition-all cursor-pointer ${
                      isRtl ? "left-2.5" : "right-2.5"
                    }`}
                    title={isRtl ? "مسح البحث" : "Clear search"}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Playlist horizontal scroller */}
            <div className="flex space-x-2 space-x-reverse overflow-x-auto pb-2 scrollbar-none">
              {playlists.map((playlist) => (
                <button
                  key={playlist}
                  onClick={() => setSelectedPlaylist(playlist)}
                  className={`px-4.5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    selectedPlaylist === playlist 
                      ? 'bg-slate-950 text-white shadow-sm' 
                      : 'bg-white text-gray-600 border border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <span>
                    {playlist === 'All' 
                      ? t.allPlaylists 
                      : playlist}
                  </span>
                </button>
              ))}
            </div>

            {/* Video List */}
            {filteredVideos.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm max-w-md mx-auto mt-8">
                <Video className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-gray-900">{t.noLecturesFound}</h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  {t.noLecturesDesc}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredVideos.map((vid) => {
                  const progressNum = getVideoProgress(vid.id).percent;

                  return (
                    <motion.div
                      layout
                      key={vid.id}
                      className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div className="relative aspect-video bg-gray-950 cursor-pointer group" onClick={() => playVideo(vid)}>
                        <img 
                          src={vid.thumbnailUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600"} 
                          alt={vid.title} 
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-all duration-300"
                          referrerPolicy="no-referrer"
                        />
                        <span className={`absolute bottom-2 bg-slate-950/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center space-x-1 space-x-reverse ${
                          isRtl ? "left-2" : "right-2"
                        }`}>
                          <Clock className="h-3 w-3" />
                          <span>{vid.duration === 'auto' ? (isRtl ? "تلقائي" : "Auto") : vid.duration}</span>
                        </span>
                        
                        {/* Playback progress bar */}
                        {progressNum > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200/40">
                            <div 
                              className="h-full bg-slate-950" 
                              style={{ width: `${progressNum}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-2 flex-grow flex flex-col justify-between">
                        <div>
                          <div className={`flex items-center justify-between ${isRtl ? "flex-row-reverse" : ""}`}>
                            <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-extrabold text-slate-700 rounded tracking-wider">
                              {vid.category}
                            </span>
                            {progressNum > 0 && (
                              <span className="text-[10px] text-slate-500 font-bold">
                                {progressNum >= 98 ? t.completedProgress : `${t.watchingProgress}${Math.round(progressNum)}%`}
                              </span>
                            )}
                          </div>
                          <h3 className={`text-sm font-black text-gray-900 mt-2 line-clamp-1 ${isRtl ? "text-right" : "text-left"}`}>{vid.title}</h3>
                          <p className={`text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed ${isRtl ? "text-right" : "text-left"}`}>{vid.description}</p>
                        </div>
                        
                        {/* Sleek Unified Card Action Bar */}
                        <div className="pt-3.5 mt-2 border-t border-gray-100 flex items-center justify-end text-xs">
                          <button 
                            onClick={() => playVideo(vid)}
                            className="bg-slate-950 hover:bg-slate-800 text-white px-5 py-2 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Play className="h-3.5 w-3.5 fill-current text-white" />
                            <span>{t.watchLabel}</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Attendance & Grades Tab */}
        {activeTab === 'academics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-gray-950 tracking-tight">{t.attendanceIndex}</h2>
              <p className="text-xs text-slate-500 mt-1">{t.calculatedRealtime}</p>
            </div>

            {/* Horizontal Weekday Schedule */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-purple-600 shrink-0" />
                  <span>{isRtl ? "جدول المواعيد الأسبوعي للمجموعة" : "Weekly Class Schedule"}</span>
                  {studentGroup && (
                    <span className="text-[10px] bg-purple-50 text-purple-700 font-extrabold px-2 py-0.5 rounded-full border border-purple-100">
                      {studentGroup.name || (isRtl ? `مجموعة ${studentGroup.groupNumber}` : `Group ${studentGroup.groupNumber}`)}
                    </span>
                  )}
                </span>
                {!studentGroup && (
                  <span className="text-[10px] text-slate-400 font-bold italic">
                    {isRtl ? "لم يتم تخصيص مجموعة بعد" : "No group assigned yet"}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {[
                  { key: "saturday", en: "Sat", ar: "السبت" },
                  { key: "sunday", en: "Sun", ar: "الأحد" },
                  { key: "monday", en: "Mon", ar: "الإثنين" },
                  { key: "tuesday", en: "Tue", ar: "الثلاثاء" },
                  { key: "wednesday", en: "Wed", ar: "الأربعاء" },
                  { key: "thursday", en: "Thu", ar: "الخميس" },
                  { key: "friday", en: "Fri", ar: "الجمعة" },
                ].map((day) => {
                  const classTime = studentGroup?.schedule?.[day.key];
                  const hasClass = studentGroup?.schedule && day.key in studentGroup.schedule;
                  return (
                    <div 
                      key={day.key} 
                      className={`flex flex-col items-center justify-center py-2 px-0.5 rounded-xl border text-center transition-all ${
                        hasClass 
                          ? "bg-purple-600 border-purple-600 text-white shadow-sm shadow-purple-100" 
                          : "bg-slate-50 border-gray-100 text-slate-400"
                      }`}
                    >
                      <span className={`text-[10px] font-black ${hasClass ? "text-purple-100" : "text-slate-400"}`}>
                        {isRtl ? day.ar : day.en}
                      </span>
                      {hasClass ? (
                        <span className="text-[8px] sm:text-[9px] font-extrabold mt-1 text-white line-clamp-2 max-w-full px-0.5 break-words leading-tight">
                          {classTime && classTime.trim() !== "" ? classTime : "✓"}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold mt-1 text-slate-300">
                          -
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Circular Attendance Card */}
              <div className={`bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center space-x-6 space-x-reverse`}>
                <div className="relative flex items-center justify-center">
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle cx="48" cy="48" r="40" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                    <circle 
                      cx="48" cy="48" r="40" 
                      stroke="#0f172a" strokeWidth="8" fill="transparent" 
                      strokeDasharray={251.2}
                      strokeDashoffset={251.2 - (251.2 * attendanceRate) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-lg font-black text-slate-900">{attendanceRate}%</span>
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">{t.attendanceIndex}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t.calculatedRealtime}</p>
                  <div className="flex space-x-3 space-x-reverse mt-2 text-[11px]">
                    <span className="text-emerald-600 font-extrabold">{t.presentDays}{presentDays}</span>
                    <span className="text-yellow-600 font-extrabold">{t.lateDays}{lateDays}</span>
                    <span className="text-red-600 font-extrabold">{t.absentDays}{totalDays - presentDays - lateDays}</span>
                  </div>
                </div>
              </div>

              {/* Private Notes Card */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm md:col-span-2 flex flex-col justify-between">
                <div>
                  <div className={`flex items-center space-x-2 space-x-reverse text-slate-950 mb-1`}>
                    <MessageSquare className="h-4 w-4 text-slate-600" />
                    <h3 className="text-sm font-black">{t.coordinatorNotes}</h3>
                  </div>
                  <p className={`text-xs text-gray-600 italic leading-relaxed mt-2 ${isRtl ? "text-right" : "text-left"}`}>
                    {studentData.notes ? `"${studentData.notes}"` : t.noNotesLogged}
                  </p>
                </div>
                <div className={`pt-3 text-[10px] text-slate-400 font-bold ${isRtl ? "text-left" : "text-right"}`}>
                  {t.lastUpdated}{studentData.updatedDate ? new Date(studentData.updatedDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US") : ""}
                </div>
              </div>

            </div>

            {/* Split Grid for History lists */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Attendance Table */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-gray-900 flex items-center space-x-2 space-x-reverse">
                  <Calendar className="h-4 w-4 text-slate-700" />
                  <span>{t.attendanceHistoryTitle}</span>
                </h3>

                {attendance.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">{t.noAttendanceLogged}</p>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                    {attendance.map((att) => (
                      <div key={att.id} className="py-2.5 flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">
                          {new Date(att.date).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          att.status === 'present' ? 'bg-emerald-100 text-emerald-800' :
                          att.status === 'late' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {att.status === 'present' ? t.attendanceStatusPresent || "حاضر" :
                           att.status === 'late' ? t.attendanceStatusLate || "متأخر" :
                           t.attendanceStatusAbsent || "غائب"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Exam scorecard list */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-gray-900 flex items-center space-x-2 space-x-reverse">
                  <Award className="h-4 w-4 text-slate-700" />
                  <span>{t.examScoresTitle}</span>
                </h3>

                {grades.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">{t.noExamsLogged}</p>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                    {grades.map((grd) => {
                      const badge = getLetterGrade(grd.score, grd.totalMarks);
                      return (
                        <div key={grd.id} className="py-3 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-extrabold text-slate-900 block">{grd.examName}</span>
                            <span className="text-[10px] text-gray-400 block mt-0.5">
                              {t.examDateLabel}{new Date(grd.examDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                            </span>
                          </div>
                          <div className="flex items-center space-x-3 space-x-reverse">
                            <span className="font-mono text-slate-700 font-extrabold">{grd.score} / {grd.totalMarks}</span>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${badge.bg}`}>
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Help & Communication Desk */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">{isRtl ? "مكتب الدعم والمساعدة والتواصل" : "Help & Communication Desk"}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isRtl 
                  ? "لأي استفسارات حول المحاضرات، الحضور، أو الدرجات الأكاديمية، يمكنك التواصل المباشر مع إدارة المنصة عبر الأرقام التالية." 
                  : "Need assistance regarding lectures, attendance, or exam reports? Reach out to the administration."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <a 
                  href={`tel:${supportPhone}`}
                  className="flex items-center space-x-2 space-x-reverse p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 font-bold text-slate-900 transition-all"
                >
                  <MessageSquare className="h-4 w-4 text-slate-700" />
                  <span>{isRtl ? `الاتصال بالإدارة: ${supportPhone}` : `Call Advisor Desk: ${supportPhone}`}</span>
                </a>
                <a 
                  href={supportWhatsapp.startsWith('http') ? supportWhatsapp : `https://wa.me/${supportWhatsapp}`}
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center space-x-2 space-x-reverse p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 font-bold text-emerald-800 transition-all"
                >
                  <Globe className="h-4 w-4 text-emerald-600" />
                  <span>{isRtl ? `تواصل عبر الواتساب: ${supportWhatsapp}` : `WhatsApp Support: ${supportWhatsapp}`}</span>
                </a>
              </div>
            </div>

            {/* Profile Detail List */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">{isRtl ? "تفاصيل الحساب" : "Account Information"}</h3>
              <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
                <div>
                  <span className="text-gray-400 block">{isRtl ? "اسم الطالب" : "Student Name"}</span>
                  <span className="font-bold text-slate-900 block mt-0.5">{studentData.name}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">{isRtl ? "الصف الدراسي" : "Academic Year"}</span>
                  <span className="font-bold text-slate-900 block mt-0.5">{getYearName(studentData.academicYear)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">{isRtl ? "رقم الهاتف" : "Student Phone Number"}</span>
                  <span className="font-bold text-slate-900 block mt-0.5 font-mono">{studentData.phone}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">{isRtl ? "هاتف ولي الأمر" : "Parent Phone Number"}</span>
                  <span className="font-bold text-slate-900 block mt-0.5 font-mono">{studentData.parentPhone}</span>
                </div>
              </div>
            </div>



            {/* Theme Appearance Selection in Settings */}
            <ThemeToggleCard lang={lang} theme={theme} onThemeChange={handleThemeChange} />

            {/* Language Selection in Settings */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">{isRtl ? "لغة المنصة" : "Platform Language"}</h3>
              <div className="flex space-x-3 space-x-reverse">
                <button
                  onClick={() => handleLanguageToggle("ar")}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold border transition-all ${
                    lang === "ar" 
                      ? "bg-slate-950 text-white border-slate-950 shadow-sm" 
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  العربية (Default)
                </button>
                <button
                  onClick={() => handleLanguageToggle("en")}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold border transition-all ${
                    lang === "en" 
                      ? "bg-slate-950 text-white border-slate-950 shadow-sm" 
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* Developer Credits Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                  {isRtl ? "معلومات مطور المنصة" : "Platform Developer"}
                </span>
              </div>
              
              <div className="flex items-start gap-3.5">
                <div className="bg-slate-900 text-white p-2.5 rounded-xl shrink-0">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">
                    {isRtl ? `تم التطوير بواسطة: ${developerInfo.name}` : `Developed by: ${developerInfo.name}`}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {isRtl ? "إذا كانت لديك أي أسئلة برمجية أو استفسارات تقنية حول تشغيل المنصة، يمكنك التواصل مباشرة مع مطور النظام." : "For technical inquiries, software customization, or system issues, contact the system developer directly."}
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-2 text-xs font-bold">
                <a 
                  href={`https://wa.me/${developerInfo.whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank" 
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-100 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>💬</span>
                  <span>{isRtl ? "واتساب" : "WhatsApp"}</span>
                </a>
                <a 
                  href={`tel:${developerInfo.phone}`}
                  className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-100 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>📞</span>
                  <span>{isRtl ? "اتصال" : "Call"}</span>
                </a>
                <a 
                  href={`https://instagram.com/${developerInfo.insta.replace('@', '')}`}
                  target="_blank" 
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-800 border border-pink-100 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>📸</span>
                  <span>Instagram</span>
                </a>
                <a 
                  href={`https://t.me/${developerInfo.tele.replace('@', '')}`}
                  target="_blank" 
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-100 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>✈️</span>
                  <span>Telegram</span>
                </a>
              </div>
            </div>

            {/* Sign Out Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-black text-gray-900">{isRtl ? "تسجيل الخروج" : "Sign Out"}</h3>
                <p className="text-xs text-slate-500 mt-1">{isRtl ? "قم بتسجيل الخروج بأمان من حسابك الحالي" : "Safely end your session and sign out of your account"}</p>
              </div>
              <button 
                onClick={onLogout}
                className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-5 text-xs font-bold bg-red-50 text-red-600 rounded-xl hover:bg-red-100 border border-red-100 transition-all cursor-pointer whitespace-nowrap font-black"
              >
                <LogOut className="h-4 w-4" />
                <span>{t.signOut}</span>
              </button>
            </div>

            {/* Footer with legal info */}
            <div className="text-center text-[10px] text-gray-400 space-y-1">
              <div className="flex justify-center space-x-3 space-x-reverse">
                <a 
                  href="#" 
                  onClick={(e) => { e.preventDefault(); onOpenLegal?.('privacy'); }} 
                  className="hover:underline hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {isRtl ? "سياسة الخصوصية" : "Privacy Policy"}
                </a>
                <span>•</span>
                <a 
                  href="#" 
                  onClick={(e) => { e.preventDefault(); onOpenLegal?.('terms'); }} 
                  className="hover:underline hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {isRtl ? "شروط الخدمة" : "Terms of Service"}
                </a>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Video Player Modal / Dedicated Fullscreen Theater Mode Overlay */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {activeVideo && (
            <motion.div 
              ref={theaterOverlayRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-50 flex flex-col justify-between overflow-hidden select-none"
            >
            {/* Modal Header — safe-area top padding only applies while fullscreen
                (native OR pseudo-fullscreen) so the normal embedded player view
                keeps its regular compact spacing. Left/right safe-area padding
                is always applied on top of the base px so the close button
                (and, in the controls bar below, the fullscreen button) never
                sit under the notch/rounded-corner/home-indicator cutout when
                the phone is flipped into landscape. */}
            <div
              style={{
                paddingLeft: 'max(env(safe-area-inset-left), 1rem)',
                paddingRight: 'max(env(safe-area-inset-right), 1rem)',
              }}
              className={`w-full bg-slate-950/90 backdrop-blur-md pb-3 sm:pb-4 flex items-center justify-between text-white shrink-0 z-30 border-b border-white/10 transition-all duration-300 ease-in-out ${(isFullscreen || isPseudoFullscreen) ? 'video-modal-header-safe opacity-0 pointer-events-none -translate-y-2' : 'pt-3 sm:pt-4 opacity-100 translate-y-0'} ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div className={`${isRtl ? 'text-right' : 'text-left'} flex-1 min-w-0 pr-4`}>
                <h3 className="font-black text-sm sm:text-base tracking-tight truncate text-white">{activeVideo.title}</h3>
                {activeVideo.description && (
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{activeVideo.description}</p>
                )}
              </div>
              
              <button 
                type="button"
                onClick={handleCloseVideo}
                className="bg-white/10 hover:bg-orange-500 hover:text-white text-white p-2 sm:p-2.5 rounded-full transition-all border border-white/10 cursor-pointer flex items-center justify-center shadow-lg shrink-0 active:scale-95"
                title={isRtl ? "إغلاق الفيديو" : "Close Video"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Middle Stage: Video Player Container */}
            <div className={`flex-grow flex items-center justify-center w-full max-w-5xl mx-auto z-20 p-0 transition-all duration-300 ease-in-out ${(isFullscreen || isPseudoFullscreen) ? 'max-w-none h-full' : 'sm:p-4'}`}>
              
              {/* Video Player Box */}
              <div 
                ref={playerContainerRef}
                onClick={handleContainerTap}
                onTouchEnd={handleContainerTap}
                onMouseMove={() => {
                  if (Date.now() - lastTouchTimeRef.current < 1000) return;
                  triggerShowControls(4500);
                }}
                className={`relative bg-black overflow-hidden flex items-center justify-center shadow-2xl group select-none transition-all duration-300 ease-in-out ${
                  (isFullscreen || isPseudoFullscreen)
                    ? 'fixed inset-0 z-50 w-full h-full max-w-none rounded-none border-0'
                    : 'w-full aspect-video rounded-none sm:rounded-2xl border-0 sm:border sm:border-slate-800'
                }`}
              >
                {/* Smooth Crossfade Overlay for Entering/Exiting Fullscreen */}
                <div 
                  className={`absolute inset-0 bg-black pointer-events-none z-30 transition-opacity duration-300 ease-in-out ${
                    isFullscreenTransitioning ? 'opacity-40' : 'opacity-0'
                  }`}
                  aria-hidden="true"
                />

                {/* 1. Single Unified Video Layer */}
                <div className="w-full h-full relative pointer-events-none transition-transform duration-300 ease-out">
                  <video
                    key={activeVideo.id}
                    ref={localVideoRef}
                    className="w-full h-full object-contain bg-black select-none pointer-events-none"
                    playsInline={true}
                    preload="auto"
                    muted={isMuted}
                    controls={false}
                    disablePictureInPicture={true}
                    disableRemotePlayback={true}
                    tabIndex={-1}
                    aria-hidden="true"
                    style={{
                      width: '100%',
                      height: '100%',
                      maxHeight: '-webkit-fill-available',
                      objectFit: 'contain',
                      WebkitTransform: 'translate3d(0,0,0)',
                      transform: 'translate3d(0,0,0)',
                      WebkitBackfaceVisibility: 'hidden',
                      backfaceVisibility: 'hidden',
                      userSelect: 'none',
                      WebkitUserSelect: 'none'
                    }}
                    onLoadStart={() => {
                      console.log('[VideoDebug] loadstart. src=', getHtml5VideoSrc());
                    }}
                    onPause={() => {
                      setIsPlaying(false);
                    }}
                    onPlay={() => {
                      setIsPlaying(true);
                      setIsBuffering(false);
                      setHasStartedPlaying(true);
                    }}
                    onPlaying={() => {
                      setHasStartedPlaying(true);
                      setIsBuffering(false);
                    }}
                    onWaiting={() => {
                      setIsBuffering(true);
                    }}
                    onSeeking={() => {
                      setIsBuffering(true);
                    }}
                    onSeeked={() => {
                      setIsBuffering(false);
                    }}
                    onCanPlay={(e) => {
                      setIsBuffering(false);
                      setHasStartedPlaying(true);
                      const videoEl = e.currentTarget;
                      if (isPlaying && videoEl.paused) {
                        videoEl.play().catch(() => {});
                      }
                    }}
                    onLoadedData={(e) => {
                      setIsBuffering(false);
                      setHasStartedPlaying(true);
                      const videoEl = e.currentTarget;
                      const targetTime = playerCurrentTime > 0 ? playerCurrentTime : (realTimePlayerCurrentTimeRef.current > 0 ? realTimePlayerCurrentTimeRef.current : 0);
                      if (targetTime > 0 && videoEl.duration && Math.abs(videoEl.currentTime - targetTime) > 1.5) {
                        videoEl.currentTime = targetTime;
                      }
                      if (isPlaying && videoEl.paused) {
                        videoEl.play().catch(() => {});
                      }
                    }}
                    onProgress={(e) => {
                      const videoEl = e.currentTarget;
                      const buf = videoEl.buffered;
                      if (buf && buf.length > 0 && videoEl.duration && videoEl.duration > 0) {
                        const bufferedEnd = buf.end(buf.length - 1);
                        setBufferedProgress(safePercent((bufferedEnd / videoEl.duration) * 100));
                      }
                    }}
                    onTimeUpdate={(e) => {
                      const videoEl = e.currentTarget;
                      const curTime = videoEl.currentTime;
                      if (typeof curTime === 'number' && !isNaN(curTime) && isFinite(curTime)) {
                        const intTime = Math.floor(curTime);
                        setPlayerCurrentTime(intTime);
                        realTimePlayerCurrentTimeRef.current = intTime;
                        if (activeVideo && !(videoEl.duration && videoEl.duration > 0)) {
                          saveVideoProgress(activeVideo.id, getVideoProgress(activeVideo.id).percent, intTime);
                        }
                        if (videoEl.duration && videoEl.duration > 0) {
                          const pct = (curTime / videoEl.duration) * 100;
                          const safePct = safePercent(pct);
                          setPlaybackProgress(safePct);
                          if (activeVideo) {
                            saveVideoProgress(activeVideo.id, safePct, intTime);
                          }
                          const buf = videoEl.buffered;
                          if (buf && buf.length > 0) {
                            const bufferedEnd = buf.end(buf.length - 1);
                            setBufferedProgress(safePercent((bufferedEnd / videoEl.duration) * 100));
                          }
                        }
                      }
                      if (targetSeekTime !== null) {
                        if (Math.abs(curTime - targetSeekTime) <= 1.5) {
                          setIsSeeking(false);
                          setTargetSeekTime(null);
                        }
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      const videoEl = e.currentTarget;
                      const rawDuration = (videoEl.duration && !isNaN(videoEl.duration) && isFinite(videoEl.duration)) ? videoEl.duration : 600;
                      setPlayerDuration(Math.floor(rawDuration));
                      
                      const targetTime = playerCurrentTime > 0 ? playerCurrentTime : (realTimePlayerCurrentTimeRef.current > 0 ? realTimePlayerCurrentTimeRef.current : 0);
                      if (targetTime > 0 && videoEl.duration) {
                        videoEl.currentTime = targetTime;
                        setPlaybackProgress(safePercent((targetTime / videoEl.duration) * 100));
                      } else {
                        const savedProgress = getVideoProgress(activeVideo.id).percent;
                        if (savedProgress > 0 && videoEl.duration) {
                          const pct = savedProgress;
                          if (!isNaN(pct)) {
                            const targetTimeCalc = (pct / 100) * videoEl.duration;
                            videoEl.currentTime = targetTimeCalc;
                            setPlayerCurrentTime(Math.floor(targetTimeCalc));
                            setPlaybackProgress(safePercent(pct));
                          }
                        }
                      }
                    }}
                    onError={(e) => {
                      const target = e.currentTarget;
                      const mediaError = target.error;
                      setIsBuffering(false);

                      console.error('[VideoDebug] <video> onError details:', {
                        code: mediaError?.code,
                        message: mediaError?.message,
                        src: target.src,
                        currentSrc: target.currentSrc,
                        networkState: target.networkState,
                        readyState: target.readyState,
                        errorCount: videoSrcErrorCount,
                        token: activeLoadTokenRef.current
                      });

                      if (!mediaError || mediaError.code === 1) return;
                      if (!target.src || target.src === '' || target.src === window.location.href) return;

                      if (videoSrcErrorCount < MAX_FALLBACK_RETRIES) {
                        setVideoSrcErrorCount(prev => prev + 1);
                      } else {
                        setIsStreamUnavailable(true);
                      }
                    }}
                    onEnded={() => {
                      setIsPlaying(false);
                    }}
                  />
                </div>

                {/* Left Double-Tap Ripple Feedback (-10s) */}
                {leftRippleActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1/3 z-35 flex flex-col items-center justify-center bg-white/10 rounded-r-full backdrop-blur-xs animate-ping pointer-events-none">
                    <RotateCcw className="w-10 h-10 text-white drop-shadow-lg animate-spin" />
                    <span className="text-sm font-bold text-white mt-1 drop-shadow">-10s</span>
                  </div>
                )}

                {/* Right Double-Tap Ripple Feedback (+10s) */}
                {rightRippleActive && (
                  <div className="absolute right-0 top-0 bottom-0 w-1/3 z-35 flex flex-col items-center justify-center bg-white/10 rounded-l-full backdrop-blur-xs animate-ping pointer-events-none">
                    <RotateCw className="w-10 h-10 text-white drop-shadow-lg animate-spin" />
                    <span className="text-sm font-bold text-white mt-1 drop-shadow">+10s</span>
                  </div>
                )}

                {/* Stream Unavailable Overlay */}
                {isStreamUnavailable && !securityBlockActive && (
                  <div className="absolute inset-0 z-45 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center text-white text-center p-6 space-y-4 select-none">
                    <div className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-2xl border border-red-500/30 shadow-lg">
                      <AlertTriangle className="w-7 h-7 text-red-400" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <h4 className="font-bold text-sm sm:text-base text-white">
                        {isRtl ? "تعذر تشغيل البث" : "Video Stream Unavailable"}
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {isRtl 
                          ? "يرجى التحقق من اتصال الإنترنت أو النقر لإعادة المحاولة." 
                          : "Please check your network connection or tap retry to reload the stream."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsStreamUnavailable(false);
                        setVideoSrcErrorCount(0);
                        setIsBuffering(true);
                      }}
                      className="mt-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 pointer-events-auto"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{isRtl ? "إعادة المحاولة" : "Retry"}</span>
                    </button>
                  </div>
                )}

                {/* Privacy Shield Overlay during Screen Recording or Screenshot */}
                {securityBlockActive && (
                  <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center text-white text-center p-6 space-y-4 select-none">
                    <div className="w-16 h-16 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-3xl border border-orange-500/30 animate-pulse">
                      <Shield className="w-8 h-8 text-orange-400" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <h4 className="font-bold text-base text-orange-400">
                        {isRtl ? "⚠️ التسجيل أو لقطة الشاشة محظورة" : "⚠️ Recording & Screenshots Prohibited"}
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {isRtl 
                          ? "حماية للمحتوى التعليمي وحقوق الملكية، يمنع منعاً باتاً تصوير أو تسجيل شاشة الفيديو." 
                          : "To protect intellectual property, screen recording and screenshots are strictly forbidden."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Loading / Buffering Overlay */}
                {isPlaying && (isBuffering || !hasStartedPlaying) && !securityBlockActive && (
                  <div className="absolute inset-0 z-25 flex flex-col items-center justify-center bg-black/60 transition-all duration-300 pointer-events-none">
                    {!hasStartedPlaying && activeVideo && (
                      <img 
                        src={activeVideo.thumbnailUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600"} 
                        className="w-full h-full object-cover opacity-20 absolute inset-0 pointer-events-none z-0" 
                        alt="LoadingBackground"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    
                    <div className="relative flex flex-col items-center justify-center z-10">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 border-4 border-slate-500/20 border-t-orange-500 rounded-full animate-spin shadow-2xl" />
                      <span className="mt-3 text-xs font-bold text-white/95 font-sans tracking-wide bg-slate-950/90 px-3.5 py-1.5 rounded-full border border-white/10 shadow">
                        {!hasStartedPlaying 
                          ? (isRtl ? "جاري تشغيل الفيديو..." : "Opening Video...") 
                          : (isRtl ? "جاري تحميل البث..." : "Buffering...")}
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. Custom Video Player Controls Overlay */}
                {!securityBlockActive && (
                  <div 
                    className={`absolute inset-0 z-30 flex flex-col justify-between pointer-events-none transition-opacity duration-300 ${
                      (controlsVisible || !isPlaying) ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {/* Top Controls Bar */}
                    <div 
                      style={{
                        paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
                        paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
                      }}
                      className={`pointer-events-auto w-full bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3 sm:p-4 pt-[max(env(safe-area-inset-top),0.75rem)] flex items-center justify-between text-white transition-transform duration-300 ${
                        isRtl ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 max-w-[65%] truncate">
                        <span className="bg-orange-500/90 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow shrink-0">
                          {activeVideo.category || "HD"}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-white truncate drop-shadow">
                          {activeVideo.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {/* Settings Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSettingsActiveTab('main');
                            setShowSettingsSheet(true);
                            triggerShowControls();
                          }}
                          className="p-1.5 sm:p-2 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/15 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                          title={isRtl ? "الإعدادات" : "Settings"}
                        >
                          <Settings className="w-4 h-4 text-white" />
                        </button>

                        {/* Fullscreen Minimize / Fullscreen Toggle Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFullscreen();
                          }}
                          className="p-1.5 sm:p-2 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/15 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                          title={(isFullscreen || isPseudoFullscreen) ? (isRtl ? "الخروج من ملء الشاشة" : "Exit Fullscreen") : (isRtl ? "ملء الشاشة" : "Fullscreen")}
                        >
                          {(isFullscreen || isPseudoFullscreen) ? (
                            <Minimize className="w-4 h-4 text-white" />
                          ) : (
                            <Maximize className="w-4 h-4 text-white" />
                          )}
                        </button>

                        {/* Dedicated Exit Video Button (Always available) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseVideo();
                          }}
                          className="p-1.5 sm:p-2 rounded-full bg-red-600/80 hover:bg-red-600 text-white border border-red-400/30 backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-md"
                          title={isRtl ? "الخروج من الفيديو" : "Exit Video"}
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    </div>

                    {/* Center Action Controls */}
                    <div className="pointer-events-auto flex items-center justify-center my-auto">
                      {/* Big Play / Pause Button (Transparent) */}
                      <button
                        type="button"
                        onClick={togglePlayback}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-transparent hover:bg-white/15 active:scale-90 text-white flex items-center justify-center transition-all cursor-pointer drop-shadow-lg"
                        title={isPlaying ? (isRtl ? "إيقاف مؤقت" : "Pause") : (isRtl ? "تشغيل" : "Play")}
                      >
                        {isPlaying ? (
                          <Pause className="w-10 h-10 sm:w-12 sm:h-12 fill-current text-white" />
                        ) : (
                          <Play className="w-10 h-10 sm:w-12 sm:h-12 fill-current text-white ml-1" />
                        )}
                      </button>
                    </div>

                    {/* Bottom Controls Bar & Scrubber */}
                    <div 
                      style={{
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 0.75rem)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 0.75rem)',
                        paddingBottom: 'max(1.75rem, calc(0.875rem + env(safe-area-inset-bottom, 0px)))',
                      }}
                      className="pointer-events-auto w-full bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 sm:p-4 flex flex-col gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Scrubber Slider Container */}
                      <div 
                        className="relative w-full h-7 flex items-center cursor-pointer group/seek touch-none select-none"
                        onPointerDown={handleScrubberPointerDown}
                        onPointerMove={handleScrubberPointerMove}
                        onPointerUp={handleScrubberPointerUp}
                        onPointerLeave={() => setIsHoveringSlider(false)}
                        onPointerEnter={() => setIsHoveringSlider(true)}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const touch = e.touches[0];
                          if (touch) {
                            const targetSec = calculateScrubTime(touch.clientX, e.currentTarget);
                            setIsScrubbing(true);
                            setScrubTime(targetSec);
                            setHoverPosition((targetSec / (playerDuration || 1)) * 100);
                            setHoverTime(targetSec);
                            triggerShowControls();
                          }
                        }}
                        onTouchMove={(e) => {
                          e.stopPropagation();
                          const touch = e.touches[0];
                          if (touch && isScrubbing) {
                            const targetSec = calculateScrubTime(touch.clientX, e.currentTarget);
                            setScrubTime(targetSec);
                            setHoverPosition((targetSec / (playerDuration || 1)) * 100);
                            setHoverTime(targetSec);
                            triggerShowControls();
                          }
                        }}
                        onTouchEnd={(e) => {
                          e.stopPropagation();
                          if (isScrubbing) {
                            setIsScrubbing(false);
                            seekTo(scrubTime);
                            triggerShowControls();
                          }
                        }}
                      >
                        {/* Hover / Drag Time Tooltip */}
                        {(isHoveringSlider || isScrubbing) && (
                          <div 
                            className="absolute -top-7 -translate-x-1/2 bg-slate-900/95 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow border border-white/20 pointer-events-none whitespace-nowrap z-40"
                            style={{ left: `${Math.max(5, Math.min(95, hoverPosition))}%` }}
                          >
                            {formatSeconds(isScrubbing ? scrubTime : hoverTime)}
                          </div>
                        )}

                        {/* Track Background */}
                        <div className="relative w-full h-1.5 group-hover/seek:h-2.5 rounded-full bg-white/20 overflow-hidden transition-all duration-150">
                          {/* Buffered Track */}
                          <div 
                            className="absolute top-0 bottom-0 left-0 bg-white/35 rounded-full transition-all duration-200"
                            style={{ width: `${Math.min(100, Math.max(0, bufferedProgress))}%` }}
                          />
                          {/* Played Progress Track */}
                          <div 
                            className="absolute top-0 bottom-0 left-0 bg-orange-500 rounded-full"
                            style={{ 
                              width: `${Math.min(100, Math.max(0, isScrubbing ? (scrubTime / (playerDuration || 1)) * 100 : (playerCurrentTime / (playerDuration || 1)) * 100))}%` 
                            }}
                          />
                        </div>

                        {/* Draggable Thumb */}
                        <div 
                          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white border-2 border-orange-500 shadow-md transition-transform pointer-events-none ${
                            isScrubbing ? 'w-4 h-4 scale-125' : 'w-3.5 h-3.5 group-hover/seek:scale-125'
                          }`}
                          style={{ 
                            left: `${Math.min(100, Math.max(0, isScrubbing ? (scrubTime / (playerDuration || 1)) * 100 : (playerCurrentTime / (playerDuration || 1)) * 100))}%` 
                          }}
                        />
                      </div>

                      {/* Bottom Action Row */}
                      <div className={`flex items-center justify-between text-white ${isRtl ? 'flex-row-reverse' : ''}`}>
                        {/* Time Display */}
                        <div className="font-mono text-xs text-white/90 select-none tracking-tight flex items-center gap-1 font-semibold">
                          <span>{formatSeconds(isScrubbing ? scrubTime : playerCurrentTime)}</span>
                          <span className="text-white/40">/</span>
                          <span className="text-white/70">{formatSeconds(playerDuration)}</span>
                        </div>

                        {/* Fullscreen Toggle Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFullscreen();
                          }}
                          className="p-2 sm:p-1.5 hover:text-orange-400 active:scale-95 transition-colors cursor-pointer shrink-0 inline-flex items-center justify-center text-white"
                          title={(isFullscreen || isPseudoFullscreen) ? (isRtl ? "تصغير" : "Exit Fullscreen") : (isRtl ? "ملء الشاشة" : "Fullscreen")}
                        >
                          {(isFullscreen || isPseudoFullscreen) ? (
                            <Minimize className="w-5 h-5" />
                          ) : (
                            <Maximize className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Settings Modal / Sheet */}
                {showSettingsSheet && (
                  <div 
                    className="absolute inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 select-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettingsSheet(false);
                      setSettingsActiveTab('main');
                    }}
                  >
                    <div 
                      className="w-full sm:max-w-xs bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 text-white space-y-3 pb-[max(env(safe-area-inset-bottom),1rem)]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <h4 className="font-bold text-sm text-white">
                          {settingsActiveTab === 'speed' 
                            ? (isRtl ? "سرعة التشغيل" : "Playback Speed") 
                            : settingsActiveTab === 'quality' 
                              ? (isRtl ? "جودة الفيديو" : "Video Quality") 
                              : (isRtl ? "إعدادات المشغل" : "Player Settings")}
                        </h4>
                        <button
                          type="button"
                          onClick={() => {
                            if (settingsActiveTab !== 'main') {
                              setSettingsActiveTab('main');
                            } else {
                              setShowSettingsSheet(false);
                            }
                          }}
                          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Main Settings Menu */}
                      {settingsActiveTab === 'main' && (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => setSettingsActiveTab('speed')}
                            className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800 text-sm font-medium transition-colors cursor-pointer"
                          >
                            <span>{isRtl ? "سرعة التشغيل" : "Playback Speed"}</span>
                            <span className="text-xs text-orange-400 font-mono font-bold flex items-center gap-1">
                              {playbackRate}x <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSettingsActiveTab('quality')}
                            className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800 text-sm font-medium transition-colors cursor-pointer"
                          >
                            <span>{isRtl ? "جودة البث" : "Video Quality"}</span>
                            <span className="text-xs text-orange-400 font-mono font-bold flex items-center gap-1">
                              {videoQuality} <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </button>
                        </div>
                      )}

                      {/* Speed Selection */}
                      {settingsActiveTab === 'speed' && (
                        <div className="space-y-1 max-h-60 overflow-y-auto no-scrollbar">
                          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => handleSpeedChange(rate)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                                playbackRate === rate ? 'bg-orange-500 text-white font-bold' : 'hover:bg-slate-800 text-slate-200'
                              }`}
                            >
                              <span>{rate === 1 ? (isRtl ? "1x (عادي)" : "1x (Normal)") : `${rate}x`}</span>
                              {playbackRate === rate && <CheckCircle2 className="w-4 h-4" />}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Quality Selection */}
                      {settingsActiveTab === 'quality' && (
                        <div className="space-y-1 max-h-60 overflow-y-auto no-scrollbar">
                          {(['Auto', '1080p', '720p', '480p', '360p'] as const).map((qual) => (
                            <button
                              key={qual}
                              type="button"
                              onClick={() => handleQualityChange(qual)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                                videoQuality === qual ? 'bg-orange-500 text-white font-bold' : 'hover:bg-slate-800 text-slate-200'
                              }`}
                            >
                              <span>{qual === 'Auto' ? (isRtl ? "تلقائي (Auto)" : "Auto") : qual}</span>
                              {videoQuality === qual && <CheckCircle2 className="w-4 h-4" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Modal Bottom Banner */}
            <div className="w-full text-center p-3 text-[10px] text-slate-500 border-t border-slate-900 bg-slate-950/90 font-mono select-none tracking-wider shrink-0 z-30">
              {isRtl ? "بث تعليمي مشفر ومحمي • منصة المعرفة" : "ENCRYPTED SECURE STREAM • ALMARFA PLATFORM"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}

      {/* Fixed Bottom Navigation Bar for Mobile & Compact Views - HIDDEN WHEN ANY MODAL IS OPEN */}
      {!activeVideo && !securityTriggered && (
        <div className="fixed bottom-0 left-0 right-0 w-full bg-white/95 dark:bg-slate-950/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800/80 z-40 flex justify-around items-center md:hidden shadow-[0_-4px_24px_rgba(0,0,0,0.04)] px-4 pt-2.5 phone-bottom-nav-safe transition-all">
          <button
            onClick={() => handleTabChange('videos')}
            className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all cursor-pointer ${
              activeTab === 'videos' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
            }`}
          >
            <Video className="h-5 w-5" />
            <span className="text-[10px] leading-none">{t.lecturesTab}</span>
          </button>
          <button
            onClick={() => handleTabChange('academics')}
            className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all cursor-pointer ${
              activeTab === 'academics' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
            }`}
          >
            <Award className="h-5 w-5" />
            <span className="text-[10px] leading-none">{t.academicsTab}</span>
          </button>
          <button
            onClick={() => handleTabChange('settings')}
            className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all cursor-pointer ${
              activeTab === 'settings' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
            }`}
          >
            <Settings className="h-5 w-5" />
            <span className="text-[10px] leading-none">{t.settingsTab}</span>
          </button>
        </div>
      )}

    </div>
  );
}
