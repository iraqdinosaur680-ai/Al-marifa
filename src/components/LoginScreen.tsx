import React, { useState } from "react";
import { motion } from "motion/react";
import { Phone, Lock, Eye, EyeOff, GraduationCap, Shield, User, Loader2, Globe } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { translations, Language, getLanguageDirection } from "../lib/translations";
import { verifyPassword, sanitizeString } from "../lib/security";

interface LoginScreenProps {
  onLoginSuccess: (user: { role: 'admin' | 'student' | 'parent'; phone: string; name: string; extra?: any }) => void;
  developerInfo: {
    name: string;
    phone: string;
    whatsapp: string;
    insta: string;
    tele: string;
  };
  onOpenLegal?: (view: 'privacy' | 'terms') => void;
}

// Client-side rate limiting tracking
let failedAttempts = 0;
let lockoutUntil = 0;

export default function LoginScreen({ onLoginSuccess, developerInfo, onOpenLegal }: LoginScreenProps) {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("platform_lang");
    return (saved === "en" || saved === "ar") ? saved : "ar";
  });
  
  const [role, setRole] = useState<'student' | 'parent' | 'admin'>('student');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const t = translations[lang];
  const isRtl = lang === "ar";

  const handleLanguageToggle = (selectedLang: Language) => {
    setLang(selectedLang);
    localStorage.setItem("platform_lang", selectedLang);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check rate limit / brute force lockout
    if (Date.now() < lockoutUntil) {
      const remainingSecs = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(
        lang === "ar"
          ? `تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار ${remainingSecs} ثانية.`
          : `Too many failed login attempts. Please wait ${remainingSecs} seconds.`
      );
      return;
    }

    const cleanPhone = sanitizeString(phone.replace(/\D/g, ''), 20);
    const cleanPassword = password;

    if (!cleanPhone || !cleanPassword) {
      setError(t.emptyFieldsError);
      return;
    }

    setError('');
    setLoading(true);

    const genericAuthError = t.incorrectPasswordError;

    try {
      if (role === 'admin') {
        const q = query(collection(db, "admins"), where("phone", "==", cleanPhone));
        let snap;
        try {
          snap = await getDocs(q);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, "admins");
          return;
        }

        if (snap.empty) {
          failedAttempts++;
          if (failedAttempts >= 5) {
            lockoutUntil = Date.now() + 60000;
          }
          setError(genericAuthError);
          setLoading(false);
          return;
        }
        const adminData = snap.docs[0].data();
        const isValid = await verifyPassword(cleanPassword, adminData.password);
        if (isValid) {
          failedAttempts = 0;
          onLoginSuccess({
            role: 'admin',
            phone: adminData.phone,
            name: adminData.name,
            extra: adminData
          });
        } else {
          failedAttempts++;
          if (failedAttempts >= 5) {
            lockoutUntil = Date.now() + 60000;
          }
          setError(genericAuthError);
        }
      } else if (role === 'student') {
        const q = query(collection(db, "students"), where("phone", "==", cleanPhone));
        let snap;
        try {
          snap = await getDocs(q);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, "students");
          return;
        }

        if (snap.empty) {
          failedAttempts++;
          if (failedAttempts >= 5) {
            lockoutUntil = Date.now() + 60000;
          }
          setError(genericAuthError);
          setLoading(false);
          return;
        }
        const studentData = snap.docs[0].data();
        if (!studentData.enabled) {
          setError(t.studentDeactivatedError);
          setLoading(false);
          return;
        }
        const isValid = await verifyPassword(cleanPassword, studentData.password);
        if (isValid) {
          failedAttempts = 0;
          onLoginSuccess({
            role: 'student',
            phone: studentData.phone,
            name: studentData.name,
            extra: studentData
          });
        } else {
          failedAttempts++;
          if (failedAttempts >= 5) {
            lockoutUntil = Date.now() + 60000;
          }
          setError(genericAuthError);
        }
      } else if (role === 'parent') {
        const q = query(collection(db, "students"), where("parentPhone", "==", cleanPhone));
        let snap;
        try {
          snap = await getDocs(q);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, "students");
          return;
        }

        if (snap.empty) {
          failedAttempts++;
          if (failedAttempts >= 5) {
            lockoutUntil = Date.now() + 60000;
          }
          setError(genericAuthError);
          setLoading(false);
          return;
        }
        let authenticated = false;
        for (const docSnap of snap.docs) {
          const studentData = docSnap.data();
          const expectedParentPass = studentData.parentPassword || studentData.password;
          const isValid = await verifyPassword(cleanPassword, expectedParentPass);
          if (isValid) {
            if (!studentData.enabled) {
              setError(t.parentDeactivatedError);
              setLoading(false);
              return;
            }
            failedAttempts = 0;
            onLoginSuccess({
              role: 'parent',
              phone: studentData.parentPhone,
              name: lang === "ar" ? `ولي أمر ${studentData.name}` : `${studentData.name}'s Parent`,
              extra: studentData
            });
            authenticated = true;
            break;
          }
        }
        if (!authenticated) {
          failedAttempts++;
          if (failedAttempts >= 5) {
            lockoutUntil = Date.now() + 60000;
          }
          setError(genericAuthError);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(t.connError + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-8 sm:px-6 lg:px-8 font-sans transition-all duration-300 phone-header-safe phone-bottom-safe"
      dir={getLanguageDirection(lang)}
    >
      {/* Language Switcher Top Header */}
      <div className="w-full max-w-md flex justify-end mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-1 flex items-center space-x-1 shadow-sm">
          <Globe className="h-4 w-4 text-gray-500 mx-2" />
          <button
            onClick={() => handleLanguageToggle("ar")}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              lang === "ar" ? "bg-slate-900 text-white" : "text-gray-600 hover:text-slate-900"
            }`}
          >
            العربية (Default)
          </button>
          <button
            onClick={() => handleLanguageToggle("en")}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              lang === "en" ? "bg-slate-900 text-white" : "text-gray-600 hover:text-slate-900"
            }`}
          >
            English
          </button>
        </div>
      </div>

      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-8 space-y-6">
        
        {/* Main Content: Login Form */}
        <div className="flex flex-col space-y-6">
          <div className={`${isRtl ? "text-right" : "text-left"}`}>
            <div className={`flex items-center space-x-3 mb-4 ${isRtl ? "space-x-reverse justify-start" : "justify-start"}`}>
              <div className="bg-slate-900 text-white p-2.5 rounded-2xl shadow-md">
                <GraduationCap className="h-6 w-6" />
              </div>
              <span className="text-lg font-black text-gray-950 tracking-tight">{t.appName}</span>
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight mt-6">{t.loginTitle}</h2>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              {t.loginSubtitle}
            </p>
          </div>

          {/* Role selector buttons */}
          <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl">
            <button
              onClick={() => { setRole('student'); setError(''); }}
              className={`py-2.5 px-3 text-xs font-extrabold rounded-xl transition-all duration-200 ${
                role === 'student' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.studentRole}
            </button>
            <button
              onClick={() => { setRole('parent'); setError(''); }}
              className={`py-2.5 px-3 text-xs font-extrabold rounded-xl transition-all duration-200 ${
                role === 'parent' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.parentRole}
            </button>
            <button
              onClick={() => { setRole('admin'); setError(''); }}
              className={`py-2.5 px-3 text-xs font-extrabold rounded-xl transition-all duration-200 ${
                role === 'admin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.adminRole}
            </button>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 bg-red-50 border border-red-100 rounded-2xl text-xs font-bold text-red-600"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                {t.phoneLabel}
              </label>
              <div className="relative rounded-2xl shadow-sm">
                <div className={`absolute inset-y-0 flex items-center pointer-events-none text-slate-400 ${isRtl ? "right-0 pr-3.5" : "left-0 pl-3.5"}`}>
                  <Phone className="h-4 w-4" />
                </div>
                <input
                  id="login-phone-input"
                  name="phoneNumber"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  autoComplete="tel"
                  placeholder={role === 'parent' ? (isRtl ? "رقم هاتف ولي الأمر" : "Parent Phone Number") : role === 'admin' ? (isRtl ? "رقم هاتف المشرف" : "Staff Phone Number") : (isRtl ? "رقم هاتف الطالب" : "Student Phone Number")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className={`block w-full py-3.5 bg-white dark:bg-slate-800 text-slate-950 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-slate-100 focus:border-slate-950 dark:focus:border-slate-100 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                    isRtl ? "pr-11 pl-3.5 text-right" : "pl-11 pr-3.5 text-left"
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                {t.passwordLabel}
              </label>
              <div className="relative rounded-2xl shadow-sm">
                <div className={`absolute inset-y-0 flex items-center pointer-events-none text-slate-400 ${isRtl ? "right-0 pr-3.5" : "left-0 pl-3.5"}`}>
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="login-password-input"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`block w-full py-3.5 bg-white dark:bg-slate-800 text-slate-950 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-slate-100 focus:border-slate-950 dark:focus:border-slate-100 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                    isRtl ? "pr-11 pl-11 text-right" : "pl-11 pr-11 text-left"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 flex items-center text-slate-400 hover:text-slate-600 ${isRtl ? "left-0 pl-3.5" : "right-0 pr-3.5"}`}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-2xl shadow-md text-sm font-bold text-white bg-slate-900 hover:bg-slate-850 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  <span>{t.verifyingCredentials}</span>
                </>
              ) : (
                <span>{t.accessPortalBtn}</span>
              )}
            </button>
          </form>
        </div>

      </div>

      {/* Developer Credits Footer */}
      <div className="mt-8 text-center space-y-3 max-w-sm">
        <p className="text-xs font-extrabold text-slate-600">
          {lang === "ar" ? `تم تطوير التطبيق بواسطة ${developerInfo.name}` : `App was developed by ${developerInfo.name}`}
        </p>
        <div className="flex justify-center items-center gap-3 text-[11px] text-slate-500 font-bold flex-wrap">
          <a 
            href={`https://wa.me/${developerInfo.whatsapp.replace(/[^0-9]/g, '')}`}
            target="_blank" 
            rel="noreferrer" 
            className="hover:text-emerald-600 transition-colors flex items-center gap-1"
          >
            <span>💬</span>
            <span>WhatsApp</span>
          </a>
          <span>•</span>
          <a 
            href={`tel:${developerInfo.phone}`}
            className="hover:text-blue-600 transition-colors flex items-center gap-1"
          >
            <span>📞</span>
            <span>{lang === "ar" ? "اتصال" : "Call"}</span>
          </a>
          <span>•</span>
          <a 
            href={`https://instagram.com/${developerInfo.insta.replace('@', '')}`}
            target="_blank" 
            rel="noreferrer" 
            className="hover:text-pink-600 transition-colors flex items-center gap-1"
          >
            <span>📸</span>
            <span>Instagram</span>
          </a>
          <span>•</span>
          <a 
            href={`https://t.me/${developerInfo.tele.replace('@', '')}`}
            target="_blank" 
            rel="noreferrer" 
            className="hover:text-sky-500 transition-colors flex items-center gap-1"
          >
            <span>✈️</span>
            <span>Telegram</span>
          </a>
        </div>
        <div className="flex justify-center items-center gap-3 text-[11px] text-slate-500 font-bold flex-wrap pt-1">
          <button
            type="button"
            onClick={() => onOpenLegal?.('privacy')}
            className="hover:text-slate-900 underline transition-colors cursor-pointer"
          >
            {lang === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => onOpenLegal?.('terms')}
            className="hover:text-slate-900 underline transition-colors cursor-pointer"
          >
            {lang === "ar" ? "شروط الخدمة" : "Terms of Service"}
          </button>
        </div>
      </div>

    </div>
  );
}
