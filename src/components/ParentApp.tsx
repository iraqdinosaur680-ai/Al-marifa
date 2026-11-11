import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Calendar, Award, Settings, MessageSquare, Shield, LogOut, 
  GraduationCap, Globe, User, ChevronRight
} from "lucide-react";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, onSnapshot } from "firebase/firestore";
import { AttendanceRecord, GradeRecord, AcademicYear } from "../types";
import { translations, Language, getLanguageDirection } from "../lib/translations";
import { ThemeMode, getStoredTheme, applyTheme } from "../lib/theme";
import ThemeToggleCard from "./ThemeToggleCard";
import { useBackHandler, pushNavigationHistoryState } from "../lib/useBackHandler";

interface ParentAppProps {
  phone: string;
  name: string;
  extra: any; // Associated student profile document
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

export default function ParentApp({ phone, name, extra, onLogout, developerInfo, onOpenLegal }: ParentAppProps) {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("platform_lang");
    return (saved === "en" || saved === "ar") ? saved : "ar";
  });
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const [activeTab, setActiveTab] = useState<'info' | 'settings'>('info');

  const handleTabChange = (newTab: 'info' | 'settings') => {
    if (newTab !== activeTab) {
      if (newTab !== 'info') {
        pushNavigationHistoryState(newTab);
      }
      setActiveTab(newTab);
    }
  };

  useBackHandler({
    activeTab,
    homeTab: 'info',
    onGoHome: () => setActiveTab('info')
  });

  const [studentData, setStudentData] = useState<any>(extra);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? window.navigator.onLine : true);
  
  const [supportPhone, setSupportPhone] = useState('+15555555');
  const [supportWhatsapp, setSupportWhatsapp] = useState('+15555555');

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

  const t = translations[lang];
  const isRtl = lang === "ar";

  const handleLanguageToggle = (selectedLang: Language) => {
    setLang(selectedLang);
    localStorage.setItem("platform_lang", selectedLang);
  };

  useEffect(() => {
    // Real-time Support / Communication config fetch
    const unsubConfig = onSnapshot(doc(db, "config", "communication"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.phone) setSupportPhone(data.phone);
        if (data.whatsapp) setSupportWhatsapp(data.whatsapp);
      }
    }, (err) => console.error("Error watching config in parent app:", err));

    // 1. Real-time children student record sync
    const unsubStudent = onSnapshot(doc(db, "students", extra.phone), (docSnap) => {
      if (docSnap.exists()) {
        setStudentData(docSnap.data());
      }
    }, (err) => console.error("Error watching student in parent app:", err));

    // 2. Load years description
    getDocs(collection(db, "years")).then((snap) => {
      const yrs: AcademicYear[] = [];
      snap.forEach((d) => yrs.push(d.data() as AcademicYear));
      setAcademicYears(yrs);
    }).catch((err) => console.error("Error loading years in parent app:", err));

    // 3. Real-time Attendance records for student
    const qAtt = query(collection(db, "attendance"), where("studentPhone", "==", extra.phone));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      const atts: AttendanceRecord[] = [];
      snap.forEach((doc) => {
        atts.push(doc.data() as AttendanceRecord);
      });
      atts.sort((a, b) => b.date.localeCompare(a.date));
      setAttendance(atts);
    }, (err) => console.error("Error watching attendance in parent app:", err));

    // 4. Real-time Exams records for student
    const qGrd = query(collection(db, "grades"), where("studentPhone", "==", extra.phone));
    const unsubGrd = onSnapshot(qGrd, (snap) => {
      const grds: GradeRecord[] = [];
      snap.forEach((doc) => {
        grds.push(doc.data() as GradeRecord);
      });
      grds.sort((a, b) => b.examDate.localeCompare(a.examDate));
      setGrades(grds);
    }, (err) => console.error("Error watching grades in parent app:", err));

    return () => {
      unsubConfig();
      unsubStudent();
      unsubAtt();
      unsubGrd();
    };
  }, [extra.phone]);

  // Calculations for Attendance Index
  const totalDays = attendance.length;
  const presentDays = attendance.filter((a) => a.status === 'present').length;
  const lateDays = attendance.filter((a) => a.status === 'late').length;
  const attendanceRate = totalDays > 0 ? Math.round(((presentDays + lateDays * 0.5) / totalDays) * 100) : 100;

  const getLetterGrade = (score: number, total: number) => {
    const pct = (score / total) * 100;
    if (pct >= 90) return { label: 'A', bg: 'bg-emerald-100 text-emerald-800' };
    if (pct >= 80) return { label: 'B', bg: 'bg-blue-100 text-blue-800' };
    if (pct >= 70) return { label: 'C', bg: 'bg-yellow-100 text-yellow-800' };
    if (pct >= 60) return { label: 'D', bg: 'bg-orange-100 text-orange-800' };
    return { label: 'F', bg: 'bg-red-100 text-red-800' };
  };

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
            <div className="bg-emerald-600 text-white p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl shadow-sm shrink-0">
              <User className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h1 className="text-xs sm:text-base font-black text-gray-900 leading-none line-clamp-1">{name}</h1>
              <p className="text-[9px] sm:text-[11px] font-bold text-slate-500 mt-1 sm:mt-1.5">
                {t.parentPortal} • {t.monitoringStudent}{studentData.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
              <button
                onClick={() => handleTabChange('info')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'info' ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                <span>{isRtl ? "أداء الأبناء" : "Child Progress"}</span>
              </button>
              <button
                onClick={() => handleTabChange('settings')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'settings' ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="h-3.5 w-3.5 text-slate-500" />
                <span>{t.settingsTab}</span>
              </button>
            </nav>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        
        {/* Child Progress Tab */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            
            <div className={`${isRtl ? "text-right" : "text-left"}`}>
              <h2 className="text-xl font-black text-gray-950 tracking-tight">{t.academicOverview}</h2>
              <p className="text-xs text-slate-500 mt-1">{t.attendanceCircleDesc}</p>
            </div>

            {/* Attendance Circular Index & Notes Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Circular Attendance Card */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center space-x-6 space-x-reverse">
                <div className="relative flex items-center justify-center">
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle cx="48" cy="48" r="40" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                    <circle 
                      cx="48" cy="48" r="40" 
                      stroke="#059669" strokeWidth="8" fill="transparent" 
                      strokeDasharray={251.2}
                      strokeDashoffset={251.2 - (251.2 * attendanceRate) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-lg font-black text-slate-900">{attendanceRate}%</span>
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">{t.attendanceIndex}</h3>
                  <p className="text-[10px] text-slate-500 leading-snug mt-1">{t.attendanceCircleDesc}</p>
                  <div className="flex flex-col mt-2 text-[11px] font-bold space-y-0.5">
                    <span className="text-emerald-600">{t.presentDays}{presentDays}{isRtl ? " أيام" : t.presentDaysUnit}</span>
                    <span className="text-yellow-600">{t.lateDays}{lateDays}{isRtl ? " أيام" : t.lateDaysUnit}</span>
                    <span className="text-red-600">{t.absentDays}{totalDays - presentDays - lateDays}{isRtl ? " أيام" : t.absentDaysUnit}</span>
                  </div>
                </div>
              </div>

              {/* Coordinator's Notes */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm md:col-span-2 flex flex-col justify-between">
                <div>
                  <div className={`flex items-center space-x-2 space-x-reverse text-emerald-950 mb-1`}>
                    <MessageSquare className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-black">{t.coordinatorNotes}</h3>
                  </div>
                  <p className={`text-xs text-gray-600 italic leading-relaxed mt-2.5 ${isRtl ? "text-right" : "text-left"}`}>
                    {studentData.notes ? `"${studentData.notes}"` : t.noNotesLogged}
                  </p>
                </div>
                <div className={`pt-3 text-[10px] text-slate-400 font-bold border-t border-gray-50 flex justify-between items-center ${isRtl ? "flex-row-reverse" : ""}`}>
                  <span>{isRtl ? "توقيع الإدارة المعتمد" : "Authorized Administrative Signature"}</span>
                  <span>{t.lastUpdated}{studentData.updatedDate ? new Date(studentData.updatedDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US") : ""}</span>
                </div>
              </div>

            </div>

            {/* Split Grid for History lists */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Comprehensive Attendance History */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-gray-900 flex items-center space-x-2 space-x-reverse">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                  <span>{isRtl ? "جدول كشوف حضور المحاضرات الشامل" : "Comprehensive Attendance History"}</span>
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
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
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

              {/* Report Cards & Grading Sheets */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-gray-900 flex items-center space-x-2 space-x-reverse">
                  <Award className="h-4 w-4 text-emerald-600" />
                  <span>{isRtl ? "كشوف نتائج الاختبارات الدورية" : "Report Cards & Grading Sheets"}</span>
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

        {/* Portal Preferences Tab */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className={`${isRtl ? "text-right" : "text-left"}`}>
              <h2 className="text-xl font-black text-gray-950 tracking-tight">{isRtl ? "إعدادات وتفضيلات البوابة" : "Portal Preferences"}</h2>
              <p className="text-xs text-slate-500 mt-1">{isRtl ? "سجل إداري مغلق وخاص. للطلبات والتعديلات يرجى التواصل مع إدارة المنصة." : "Private administrative registry. All corrections must be submitted via administrator tickets."}</p>
            </div>

            {/* Profile Read-Only details */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">{isRtl ? "المواصفات الأكاديمية" : "Account Specifications"}</h3>
              <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
                <div>
                  <span className="text-gray-400 block">{isRtl ? "اسم الطالب" : "Student Name"}</span>
                  <span className="font-bold text-slate-900 block mt-0.5">{studentData.name}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">{isRtl ? "الدفعة الدراسية" : "Student Cohort Year"}</span>
                  <span className="font-bold text-slate-900 block mt-0.5">{getYearName(studentData.academicYear)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">{isRtl ? "رقم الوالد الأساسي" : "Parent Primary Phone"}</span>
                  <span className="font-bold text-slate-900 block mt-0.5 font-mono">{studentData.parentPhone}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">{isRtl ? "رقم الطالب الأساسي" : "Student Primary Phone"}</span>
                  <span className="font-bold text-slate-900 block mt-0.5 font-mono">{studentData.phone}</span>
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
                  <User className="h-5 w-5" />
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

            {/* Security Guarantee banner */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-start space-x-3 space-x-reverse text-xs">
              <Shield className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-emerald-900">{isRtl ? "بنية معلومات محمية ومؤمنة بالكامل" : "Protected Information Architecture"}</h4>
                <p className="text-emerald-700 leading-relaxed mt-1.5">
                  {isRtl 
                    ? "يتم تتبع وتأمين هذه التقارير الأكاديمية لحماية حقوق وخصوصية الطالب. أي طلبات لتعديل كشوف الحضور والغياب أو تصحيح الدرجات تتطلب تواصل فيزيائي مباشر مع الإدارة." 
                    : "This profile represents verified parent-student records. In keeping with privacy regulations, changes to registered phones or structural details require physical administrator verification."}
                </p>
              </div>
            </div>

            {/* Contact Support */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">{isRtl ? "مكتب الدعم والمساعد الأكاديمي" : "Help & Communication Desk"}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                {isRtl 
                  ? "هل لديك استفسار بخصوص حضور الطالب أو درجاته في أحد الاختبارات؟ يمكنك الاتصال المباشر بمكاتب المنسقين الأكاديميين فوراً." 
                  : "Need details regarding exam papers, attendance corrections, or have concerns regarding academic reports? Raise an official communication ticket instantly."}
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <a 
                  href={`tel:${supportPhone}`}
                  className="px-4 py-2 bg-slate-100 text-slate-900 hover:bg-slate-200 text-xs font-bold rounded-xl border border-gray-150 transition-all flex items-center gap-1.5"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>{isRtl ? `الاتصال بالإدارة: ${supportPhone}` : `Call Advisor Desk: ${supportPhone}`}</span>
                </a>
                <a 
                  href={supportWhatsapp.startsWith('http') ? supportWhatsapp : `https://wa.me/${supportWhatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{isRtl ? `تواصل عبر واتساب: ${supportWhatsapp}` : `WhatsApp Support: ${supportWhatsapp}`}</span>
                </a>
              </div>
            </div>

            {/* Footer with legal info */}
            <div className="text-center text-[10px] text-gray-400 space-y-1">
              <div>{t.appName}</div>
              <div className="flex justify-center space-x-3 space-x-reverse">
                <a 
                  href="#" 
                  onClick={(e) => { e.preventDefault(); onOpenLegal?.('privacy'); }} 
                  className="hover:underline hover:text-slate-900 transition-colors cursor-pointer"
                >
                  {isRtl ? "ميثاق الخصوصية" : "Privacy Charter"}
                </a>
                <span>•</span>
                <a 
                  href="#" 
                  onClick={(e) => { e.preventDefault(); onOpenLegal?.('terms'); }} 
                  className="hover:underline hover:text-slate-900 transition-colors cursor-pointer"
                >
                  {isRtl ? "شروط الخدمة" : "SLA Terms"}
                </a>
              </div>
              <div className="font-mono">Security State Encrypted</div>
            </div>

          </div>
        )}

      </main>

      {/* Fixed Bottom Navigation Bar for Mobile View */}
      <div className="fixed bottom-0 left-0 right-0 w-full bg-white/95 dark:bg-slate-950/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800/80 z-40 flex justify-around items-center md:hidden shadow-[0_-4px_24px_rgba(0,0,0,0.04)] px-4 pt-2.5 phone-bottom-nav-safe transition-all">
        <button
          onClick={() => handleTabChange('info')}
          className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all cursor-pointer ${
            activeTab === 'info' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
          }`}
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] leading-none">{isRtl ? "أداء الأبناء" : "Child Progress"}</span>
        </button>
        <button
          onClick={() => handleTabChange('settings')}
          className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all cursor-pointer ${
            activeTab === 'settings' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
          }`}
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px] leading-none">{t.settingsTab}</span>
        </button>
      </div>

    </div>
  );
}
