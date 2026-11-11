import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { db, bootstrapDatabase } from "./firebase";
import LoginScreen from "./components/LoginScreen";
import StudentApp from "./components/StudentApp";
import ParentApp from "./components/ParentApp";
import AdminPortal from "./components/AdminPortal";
import LegalView from "./components/LegalView";
import { Loader2, GraduationCap, AlertTriangle, RefreshCw } from "lucide-react";
import { initThemeListener } from "./lib/theme";

interface SessionUser {
  role: 'admin' | 'student' | 'parent';
  phone: string;
  name: string;
  extra?: any;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[CRITICAL APP ERROR]:", error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem("platform_session_v1");
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-white">حدث خطأ أثناء تشغيل التطبيق</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              يرجى إعادة تحميل التطبيق للمتابعة بشكل طبيعي.
            </p>
            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>إعادة المحاولة / Retry</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [legalView, setLegalView] = useState<'privacy' | 'terms' | null>(null);
  const [developerInfo, setDeveloperInfo] = useState({
    name: "Taha Tariq",
    phone: "+9647739607361",
    whatsapp: "+9647832715181",
    insta: "bz7_b",
    tele: "bz7_b"
  });

  useEffect(() => {
    const cleanupTheme = initThemeListener();
    return () => cleanupTheme();
  }, []);

  useEffect(() => {
    let unsubDev = () => {};
    try {
      unsubDev = onSnapshot(doc(db, "config", "developer"), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDeveloperInfo({
            name: data.name || "Taha Tariq",
            phone: data.phone || "+9647739607361",
            whatsapp: data.whatsapp || "+9647832715181",
            insta: data.insta || "bz7_b",
            tele: data.tele || "bz7_b"
          });
        }
      }, (err) => console.warn("[PLATFORM] Developer config watch notice:", err));
    } catch (e) {
      console.warn("[PLATFORM] Failed to attach snapshot:", e);
    }
    return () => unsubDev();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initializePlatform() {
      try {
        console.log("[PLATFORM] Initializing platform...");
        
        // Timeout guard to prevent blocking on network ping
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000));
        
        const initPromise = (async () => {
          try {
            await getDocFromServer(doc(db, "years", "test_connection_ping")).catch(() => {});
            await bootstrapDatabase().catch(() => {});
          } catch (e) {
            console.warn("[PLATFORM] Background sync warning:", e);
          }
        })();

        // Race initialization against timeout
        await Promise.race([initPromise, timeoutPromise]);

        // Check if session is persisted in local storage
        try {
          const savedSession = localStorage.getItem("platform_session_v1");
          if (savedSession) {
            const parsed = JSON.parse(savedSession);
            if (parsed && parsed.role && parsed.phone) {
              if (isMounted) setSession(parsed);
            } else {
              localStorage.removeItem("platform_session_v1");
            }
          }
        } catch (storageErr) {
          console.warn("[PLATFORM] Failed to parse session storage:", storageErr);
          localStorage.removeItem("platform_session_v1");
        }
      } catch (err) {
        console.error("[PLATFORM] Initialization issue:", err);
      } finally {
        if (isMounted) {
          setInitLoading(false);
        }
      }
    }

    initializePlatform();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLoginSuccess = (user: SessionUser) => {
    setSession(user);
    try {
      localStorage.setItem("platform_session_v1", JSON.stringify(user));
    } catch (e) {
      console.warn("Storage save error:", e);
    }
  };

  const handleLogout = () => {
    setSession(null);
    try {
      localStorage.removeItem("platform_session_v1");
    } catch (e) {
      console.warn("Storage remove error:", e);
    }
  };

  if (initLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center space-y-6 max-w-xs w-full text-center">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <GraduationCap className="h-7 w-7 text-indigo-400" />
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-black text-white tracking-tight">
              اكاديمية المعرفة التعليمية
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Educational Portal
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
            <span className="text-xs font-semibold text-slate-400">جاري التحميل...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {!session ? (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased safe-area-inset selection:bg-indigo-500 selection:text-white">
          <LoginScreen 
            onLoginSuccess={handleLoginSuccess} 
            developerInfo={developerInfo} 
            onOpenLegal={(view) => setLegalView(view)}
          />
          {legalView && (
            <LegalView 
              initialTab={legalView} 
              onClose={() => setLegalView(null)} 
              developerInfo={developerInfo} 
            />
          )}
        </div>
      ) : (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased safe-area-inset selection:bg-indigo-500 selection:text-white">
          {session.role === "admin" && (
            <AdminPortal 
              phone={session.phone} 
              name={session.name} 
              extra={session.extra} 
              onLogout={handleLogout} 
              developerInfo={developerInfo}
              onOpenLegal={(view) => setLegalView(view)}
            />
          )}
          {session.role === "student" && (
            <StudentApp 
              phone={session.phone} 
              name={session.name} 
              extra={session.extra} 
              onLogout={handleLogout} 
              developerInfo={developerInfo}
              onOpenLegal={(view) => setLegalView(view)}
            />
          )}
          {session.role === "parent" && (
            <ParentApp 
              phone={session.phone} 
              name={session.name} 
              extra={session.extra} 
              onLogout={handleLogout} 
              developerInfo={developerInfo}
              onOpenLegal={(view) => setLegalView(view)}
            />
          )}
          {legalView && (
            <LegalView 
              initialTab={legalView} 
              onClose={() => setLegalView(null)} 
              developerInfo={developerInfo} 
            />
          )}
        </div>
      )}
    </ErrorBoundary>
  );
}
