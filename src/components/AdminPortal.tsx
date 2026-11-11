import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart3, Users, Video, Calendar, Award, ShieldAlert, 
  Settings, LogOut, Plus, Search, Edit2, Trash2, Key, 
  Check, X, ChevronRight, AlertTriangle, Play, RefreshCw,
  Sliders, UserPlus, Info, CheckCircle, HelpCircle, Eye, EyeOff, Globe, Layers,
  GraduationCap, Upload, Download
} from "lucide-react";
import StudentsInfoTab from "./StudentsInfoTab";
import StudentImportExportModal from "./StudentImportExportModal";
import AdminVideoPlayerModal from "./AdminVideoPlayerModal";
import ParentAccountsAuditModal from "./ParentAccountsAuditModal";
import { db } from "../firebase";
import { 
  collection, query, where, getDocs, doc, setDoc, 
  updateDoc, deleteDoc, onSnapshot, writeBatch 
} from "firebase/firestore";
import { 
  AcademicYear, Group, Student, AttendanceRecord, GradeRecord, Video as VideoType, AdminUser 
} from "../types";
import { translations, Language, getLanguageDirection, matchesSearchQuery } from "../lib/translations";
import { ThemeMode, getStoredTheme, applyTheme } from "../lib/theme";
import ThemeToggleCard from "./ThemeToggleCard";
import { getApiUrl } from "../lib/api";
import { verifyPassword } from "../lib/security";
import { useBackHandler, pushNavigationHistoryState } from "../lib/useBackHandler";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from "recharts";

interface AdminPortalProps {
  phone: string;
  name: string;
  extra: any; // admin details
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

const SEVEN_DAYS = [
  { key: "saturday", en: "Saturday", ar: "السبت" },
  { key: "sunday", en: "Sunday", ar: "الأحد" },
  { key: "monday", en: "Monday", ar: "الإثنين" },
  { key: "tuesday", en: "Tuesday", ar: "الثلاثاء" },
  { key: "wednesday", en: "Wednesday", ar: "الأربعاء" },
  { key: "thursday", en: "Thursday", ar: "الخميس" },
  { key: "friday", en: "Friday", ar: "الجمعة" },
];

export default function AdminPortal({ phone, name, extra, onLogout, developerInfo, onOpenLegal }: AdminPortalProps) {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("platform_lang");
    return (saved === "en" || saved === "ar") ? saved : "ar";
  });
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };
  const [activeTab, setActiveTab] = useState<'dashboard' | 'studentsInfo' | 'students' | 'years' | 'attendance' | 'grades' | 'videos' | 'admins' | 'settings'>('dashboard');

  const handleTabChange = (newTab: 'dashboard' | 'studentsInfo' | 'students' | 'years' | 'attendance' | 'grades' | 'videos' | 'admins' | 'settings') => {
    if (newTab !== activeTab) {
      if (newTab !== 'dashboard') {
        pushNavigationHistoryState(newTab);
      }
      setActiveTab(newTab);
    }
  };

  const t = translations[lang];
  const isRtl = lang === "ar";

  const handleLanguageToggle = (selectedLang: Language) => {
    setLang(selectedLang);
    localStorage.setItem("platform_lang", selectedLang);
  };

  // Database collection states
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [videos, setVideos] = useState<VideoType[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);

  // Support / Communication help desk configuration states
  const [supportPhone, setSupportPhone] = useState('+15555555');
  const [supportWhatsapp, setSupportWhatsapp] = useState('+15555555');
  const [savingConfig, setSavingConfig] = useState(false);

  // Reusable custom confirmation modal state (bypassing window.confirm for cross-origin iframe compliance)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmBtnText: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmBtnText: "",
    onConfirm: () => {}
  });

  // Local utility operations
  const [loading, setLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Developer edit states
  const [showDevModal, setShowDevModal] = useState(false);

  // Parent Accounts Audit & Issues Modal state
  const [showParentAuditModal, setShowParentAuditModal] = useState(false);

  // Student Import & Export Modal state
  const [importExportModal, setImportExportModal] = useState<{
    isOpen: boolean;
    initialMode: 'import' | 'export';
    targetGroup: Group | null;
    targetYear: AcademicYear | null;
  }>({
    isOpen: false,
    initialMode: 'import',
    targetGroup: null,
    targetYear: null
  });

  const handleOpenImportGroup = (group: Group) => {
    setImportExportModal({
      isOpen: true,
      initialMode: 'import',
      targetGroup: group,
      targetYear: years.find(y => y.id === group.academicYear) || null
    });
  };

  const handleOpenExportGroup = (group: Group) => {
    setImportExportModal({
      isOpen: true,
      initialMode: 'export',
      targetGroup: group,
      targetYear: years.find(y => y.id === group.academicYear) || null
    });
  };

  const handleOpenGeneralImport = () => {
    setImportExportModal({
      isOpen: true,
      initialMode: 'import',
      targetGroup: null,
      targetYear: null
    });
  };

  const handleOpenGeneralExport = () => {
    setImportExportModal({
      isOpen: true,
      initialMode: 'export',
      targetGroup: null,
      targetYear: null
    });
  };

  const [watchingVideo, setWatchingVideo] = useState<VideoType | null>(null);

  useBackHandler({
    activeTab,
    homeTab: 'dashboard',
    onGoHome: () => setActiveTab('dashboard'),
    hasOpenModal: confirmModal.isOpen || showDevModal || importExportModal.isOpen || watchingVideo !== null,
    onCloseModal: () => {
      if (confirmModal.isOpen) {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      } else if (showDevModal) {
        setShowDevModal(false);
      } else if (importExportModal.isOpen) {
        setImportExportModal(prev => ({ ...prev, isOpen: false }));
      } else if (watchingVideo !== null) {
        setWatchingVideo(null);
      }
    }
  });
  const [devPassword, setDevPassword] = useState("");
  const [isDevPasswordVerified, setIsDevPasswordVerified] = useState(false);
  const [devNameEdit, setDevNameEdit] = useState("");
  const [devPhoneEdit, setDevPhoneEdit] = useState("");
  const [devWhatsappEdit, setDevWhatsappEdit] = useState("");
  const [devInstaEdit, setDevInstaEdit] = useState("");
  const [devTeleEdit, setDevTeleEdit] = useState("");
  const [devError, setDevError] = useState("");
  const [devSaving, setDevSaving] = useState(false);

  const openEditDeveloperModal = () => {
    setDevPassword("");
    setIsDevPasswordVerified(false);
    setDevNameEdit(developerInfo.name);
    setDevPhoneEdit(developerInfo.phone);
    setDevWhatsappEdit(developerInfo.whatsapp);
    setDevInstaEdit(developerInfo.insta);
    setDevTeleEdit(developerInfo.tele);
    setDevError("");
    setShowDevModal(true);
  };

  const handleVerifyDevPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devPassword) {
      setDevError(isRtl ? "كلمة المرور مطلوبة!" : "Password is required!");
      return;
    }
    const adminPass = extra?.password || "";
    const isValid = await verifyPassword(devPassword, adminPass);
    if (isValid) {
      setIsDevPasswordVerified(true);
      setDevError("");
    } else {
      setDevError(isRtl ? "كلمة المرور غير صحيحة!" : "Incorrect password!");
    }
  };

  const handleSaveDeveloperInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setDevSaving(true);
    setDevError("");
    try {
      await setDoc(doc(db, "config", "developer"), {
        name: devNameEdit.trim(),
        phone: devPhoneEdit.trim(),
        whatsapp: devWhatsappEdit.trim(),
        insta: devInstaEdit.trim(),
        tele: devTeleEdit.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setShowDevModal(false);
      setSuccessMsg(isRtl ? "تم تحديث معلومات المطور بنجاح" : "Developer info updated successfully");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      console.error(err);
      setDevError(isRtl ? "فشل حفظ التعديلات: " + err.message : "Failed to save: " + err.message);
    } finally {
      setDevSaving(false);
    }
  };

  // 1. Real-time Firebase listeners
  useEffect(() => {
    const unsubYears = onSnapshot(collection(db, "years"), (snap) => {
      const arr: AcademicYear[] = [];
      snap.forEach((d) => arr.push(d.data() as AcademicYear));
      setYears(arr.sort((a, b) => a.id.localeCompare(b.id)));
    }, (err) => console.error("Error fetching years snapshot:", err));

    const unsubGroups = onSnapshot(collection(db, "groups"), (snap) => {
      const arr: Group[] = [];
      snap.forEach((d) => arr.push(d.data() as Group));
      setGroups(arr.sort((a, b) => a.groupNumber.localeCompare(b.groupNumber, undefined, { numeric: true })));
    }, (err) => console.error("Error fetching groups snapshot:", err));

    const unsubStudents = onSnapshot(collection(db, "students"), (snap) => {
      const arr: Student[] = [];
      snap.forEach((d) => arr.push(d.data() as Student));
      setStudents(arr.sort((a, b) => a.name.localeCompare(b.name)));
    }, (err) => console.error("Error fetching students snapshot:", err));

    const unsubAttendance = onSnapshot(collection(db, "attendance"), (snap) => {
      const arr: AttendanceRecord[] = [];
      snap.forEach((d) => arr.push(d.data() as AttendanceRecord));
      setAttendance(arr);
    }, (err) => console.error("Error fetching attendance snapshot:", err));

    const unsubGrades = onSnapshot(collection(db, "grades"), (snap) => {
      const arr: GradeRecord[] = [];
      snap.forEach((d) => arr.push(d.data() as GradeRecord));
      setGrades(arr);
    }, (err) => console.error("Error fetching grades snapshot:", err));

    const unsubVideos = onSnapshot(collection(db, "videos"), (snap) => {
      const arr: VideoType[] = [];
      snap.forEach((d) => arr.push(d.data() as VideoType));
      setVideos(arr.sort((a, b) => a.displayOrder - b.displayOrder));
    }, (err) => console.error("Error fetching videos snapshot:", err));

    const unsubAdmins = onSnapshot(collection(db, "admins"), (snap) => {
      const arr: AdminUser[] = [];
      snap.forEach((d) => arr.push(d.data() as AdminUser));
      setAdmins(arr);
    }, (err) => console.error("Error fetching admins snapshot:", err));

    const unsubConfig = onSnapshot(doc(db, "config", "communication"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.phone) setSupportPhone(data.phone);
        if (data.whatsapp) setSupportWhatsapp(data.whatsapp);
      }
    }, (err) => console.error("Error fetching config snapshot:", err));

    return () => {
      unsubYears();
      unsubGroups();
      unsubStudents();
      unsubAttendance();
      unsubGrades();
      unsubVideos();
      unsubAdmins();
      unsubConfig();
    };
  }, []);

  const triggerAlert = (type: 'success' | 'error', text: string) => {
    if (type === 'success') {
      setSuccessMsg(text);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(text);
      setTimeout(() => setErrorMsg(''), 5000);
    }
  };

  // Helper: Auto password generator (9X3M7Q8L style - 8 alphanumeric characters)
  const generateRandomPassword = () => {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // safe characters
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // ==========================================
  // TAB 1: DASHBOARD ANALYTICS
  // ==========================================
  const renderDashboard = () => {
    const validParentPhones = students.map((s) => s.parentPhone?.trim()).filter(Boolean) as string[];
    const parentCount = Array.from(new Set(validParentPhones)).length;
    const totalVideos = videos.length;

    // Detect students with parent account issues (empty phone, same as student phone, malformed, or missing pass)
    const parentIssuesCount = students.filter(s => {
      const p = (s.parentPhone || '').trim();
      if (!p) return true;
      if (s.phone && p === s.phone.trim()) return true;
      if (p.replace(/\D/g, '').length < 8) return true;
      if (!s.parentPassword) return true;
      return false;
    }).length;
    
    // Attendance rates calculations
    const totalAttRecords = attendance.length;
    const presentCount = attendance.filter((a) => a.status === 'present').length;
    const lateCount = attendance.filter((a) => a.status === 'late').length;
    const avgAttendance = totalAttRecords > 0 ? Math.round(((presentCount + lateCount * 0.5) / totalAttRecords) * 100) : 100;

    // Charts data prep: Attendance history over the last 5 calendar dates
    const dateGroups: { [date: string]: { present: number; total: number } } = {};
    attendance.forEach((att) => {
      if (!dateGroups[att.date]) dateGroups[att.date] = { present: 0, total: 0 };
      dateGroups[att.date].total += 1;
      if (att.status === 'present' || att.status === 'late') {
        dateGroups[att.date].present += (att.status === 'present' ? 1 : 0.5);
      }
    });
    const attendanceChartData = Object.keys(dateGroups)
      .sort()
      .slice(-6)
      .map((date) => ({
        name: date.substring(5), // MM-DD
        "Attendance Rate (%)": Math.round((dateGroups[date].present / dateGroups[date].total) * 100)
      }));

    // Grades Statistics charts: Exam passing rates
    const examsList = Array.from(new Set(grades.map((g) => g.examName)));
    const examAverages = examsList.map((exam) => {
      const records = grades.filter((g) => g.examName === exam);
      const avgScore = records.reduce((acc, curr) => acc + (curr.score / curr.totalMarks) * 100, 0) / records.length;
      return {
        name: exam,
        "Class Average (%)": Math.round(avgScore)
      };
    });

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Ecosystem Statistics</h2>
          <p className="text-xs text-slate-500 mt-1">Real-time indicators synced with active student databases.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">
              {isRtl ? "الطلاب المسجلون" : "Registered Students"}
            </div>
            <div className="text-3xl font-black text-slate-900 mt-2 flex items-center justify-between">
              <span>{students.length}</span>
              <Users className="h-6 w-6 text-slate-400" />
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              {isRtl 
                ? `المفعلون: ${students.filter(s => s.enabled).length} | المعطلون: ${students.filter(s => !s.enabled).length}`
                : `Active: ${students.filter(s => s.enabled).length} | Deactivated: ${students.filter(s => !s.enabled).length}`}
            </div>
          </div>

          <div 
            onClick={() => setShowParentAuditModal(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowParentAuditModal(true); }}
            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group active:scale-[0.99] flex flex-col justify-between"
            title={isRtl ? "انقر لعرض تفاصيل حسابات أولياء الأمور والحالات التي بها مشاكل" : "Click to view parent accounts audit & issue accounts"}
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">
                  {isRtl ? "أولياء الأمور (الحسابات الفريدة)" : "Unique Parent Accounts"}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:bg-emerald-100 transition-colors flex items-center gap-1">
                  <span>{isRtl ? "فحص وتدقيق" : "Audit"}</span>
                  <ChevronRight className={`h-3 w-3 ${isRtl ? 'rotate-180' : ''}`} />
                </span>
              </div>

              <div className="text-3xl font-black text-slate-900 mt-2 flex items-center justify-between">
                <span>{parentCount}</span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-105 transition-all">
                  <Users className="h-5 w-5" />
                </div>
              </div>

              <div className="text-[11px] text-gray-500 mt-1.5 leading-snug">
                {isRtl 
                  ? "أرقام هواتف فريدة (الأخوة يشتركون في نفس حساب ولي الأمر)"
                  : "Unique phone numbers (siblings share 1 parent account)"}
              </div>
            </div>

            {/* Click prompt and status pill */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              {parentIssuesCount > 0 ? (
                <span className="flex items-center gap-1 text-amber-700 font-bold">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>{isRtl ? `${parentIssuesCount} حالة بحاجة لمراجعة` : `${parentIssuesCount} issues detected`}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-700 font-bold">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>{isRtl ? "كافة السجلات سليمة" : "All records healthy"}</span>
                </span>
              )}
              <span className="text-[11px] text-emerald-700 font-extrabold group-hover:underline flex items-center gap-0.5">
                <span>{isRtl ? "عرض المشاكل ←" : "View Issues →"}</span>
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">
              {isRtl ? "فيديوهات المنصة" : "Bunny Stream Videos"}
            </div>
            <div className="text-3xl font-black text-slate-900 mt-2 flex items-center justify-between">
              <span>{totalVideos}</span>
              <Video className="h-6 w-6 text-slate-500" />
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              {isRtl 
                ? `عامة: ${videos.filter(v => v.visibility === 'public').length} | خاصة: ${videos.filter(v => v.visibility === 'hidden').length}`
                : `Public: ${videos.filter(v => v.visibility === 'public').length} | Private: ${videos.filter(v => v.visibility === 'hidden').length}`}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">
              {isRtl ? "متوسط نسبة الحضور" : "Average Attendance"}
            </div>
            <div className="text-3xl font-black text-slate-900 mt-2 flex items-center justify-between">
              <span>{avgAttendance}%</span>
              <Calendar className="h-6 w-6 text-slate-600" />
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              {isRtl 
                ? `حاضر: ${presentCount} | متأخر: ${lateCount}`
                : `Present: ${presentCount} | Late: ${lateCount}`}
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Attendance trends chart */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Attendance Rate History</h3>
            <div className="h-64 w-full">
              {attendanceChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">Not enough attendance logs to compute timeline.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={attendanceChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="Attendance Rate (%)" stroke="#0f172a" strokeWidth={3} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Performance scorecard averages chart */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Exam Results Class Averages</h3>
            <div className="h-64 w-full">
              {examAverages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">No grades registered yet to calculate exam scores.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={examAverages}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="Class Average (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </div>

        {/* Activity Feed */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Ecosystem Activities</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Device Logs / Online State</span>
              <p className="text-gray-600 leading-relaxed">
                App locks are fully synchronized. Offline caching is operational. Screen recording blocks activated for Android (FLAG_SECURE) and iOS.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">FCM Push Logs</span>
              <p className="text-gray-600 leading-relaxed">
                Notification push vectors are active. Broadcast target limits: students and parents are parsed dynamically based on academic years.
              </p>
            </div>
          </div>
        </div>

        {/* Help & Communication Desk Settings */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-950">
            <Sliders className="h-4 w-4 text-slate-600" />
            <h3 className="text-xs font-black uppercase tracking-wider">Help & Communication Desk Settings</h3>
          </div>
          <p className="text-xs text-slate-500">
            Configure contact numbers displayed on the parents' Help & Communication Desk. Parents will be able to click directly to call or message via WhatsApp.
          </p>

          <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs">
            <div>
              <label className="block text-slate-500 font-bold mb-1">Support Phone (for Voice Calls)</label>
              <input
                type="text"
                required
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                placeholder="e.g. +96650000000"
                className="w-full border border-gray-200 rounded-xl p-2.5 font-mono focus:ring-2 focus:ring-slate-900"
              />
            </div>
            
            <div>
              <label className="block text-slate-500 font-bold mb-1">Support WhatsApp (Number or Link)</label>
              <input
                type="text"
                required
                value={supportWhatsapp}
                onChange={(e) => setSupportWhatsapp(e.target.value)}
                placeholder="e.g. +96650000000"
                className="w-full border border-gray-200 rounded-xl p-2.5 font-mono focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="py-2.5 px-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 text-center"
            >
              {savingConfig ? "Saving Config..." : "Save Config Details"}
            </button>
          </form>
        </div>

      </div>
    );
  };

  // ==========================================
  // TAB 2: STUDENT MANAGEMENT
  // ==========================================
  const [selectedYearTab, setSelectedYearTab] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Student Form Fields
  const [stdName, setStdName] = useState('');
  const [stdPhone, setStdPhone] = useState('');
  const [stdParentPhone, setStdParentPhone] = useState('');
  const [stdYear, setStdYear] = useState('');
  const [stdGroupId, setStdGroupId] = useState('');
  const [stdGender, setStdGender] = useState<'male' | 'female'>('male');
  const [stdPassword, setStdPassword] = useState('');
  const [stdParentPassword, setStdParentPassword] = useState('');
  const [stdNotes, setStdNotes] = useState('');
  const [stdEnabled, setStdEnabled] = useState(true);

  // Filters for student management
  const [selectedGenderTab, setSelectedGenderTab] = useState<'all' | 'male' | 'female'>('all');

  // Academic Year Boys/Girls Tab State
  const [selectedCohortYearId, setSelectedCohortYearId] = useState<string>('');
  const [cohortGenderTab, setCohortGenderTab] = useState<'male' | 'female'>('male');

  // Attendance and grades sub-editor fields for Selected Student
  const [activeStudentSubEdit, setActiveStudentSubEdit] = useState<Student | null>(null);
  const [subEditAttDate, setSubEditAttDate] = useState(new Date().toISOString().substring(0, 10));
  const [subEditAttStatus, setSubEditAttStatus] = useState<'present' | 'absent' | 'late'>('present');
  const [subEditExamName, setSubEditExamName] = useState('');
  const [subEditExamScore, setSubEditExamScore] = useState('');
  const [subEditExamTotal, setSubEditExamTotal] = useState('100');

  const openStudentModal = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setStdName(student.name);
      setStdPhone(student.phone);
      setStdParentPhone(student.parentPhone);
      setStdYear(student.academicYear);
      setStdGroupId(student.groupId || '');
      setStdGender(student.gender || 'male');
      setStdPassword(student.password || generateRandomPassword());
      setStdParentPassword(student.parentPassword || generateRandomPassword());
      setStdNotes(student.notes || '');
      setStdEnabled(student.enabled);
    } else {
      setEditingStudent(null);
      setStdName('');
      setStdPhone('');
      setStdParentPhone('');
      setStdYear(years[0]?.id || '');
      setStdGroupId('');
      setStdGender('male');
      setStdPassword(generateRandomPassword());
      setStdParentPassword(generateRandomPassword());
      setStdNotes('');
      setStdEnabled(true);
    }
    setStudentModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stdName || !stdPhone || !stdParentPhone || !stdYear) {
      triggerAlert('error', isRtl ? 'جميع الحقول الأساسية مطلوبة.' : 'All fields are required.');
      return;
    }

    setLoading('student');
    const studentId = stdPhone; // ID is student phone

    try {
      const finalStudentPass = stdPassword || generateRandomPassword();
      const finalParentPass = stdParentPassword || generateRandomPassword();

      if (editingStudent) {
        // Edit student
        const studentRef = doc(db, "students", editingStudent.id);
        await updateDoc(studentRef, {
          name: stdName,
          parentPhone: stdParentPhone,
          academicYear: stdYear,
          groupId: stdGroupId || '',
          gender: stdGender,
          password: finalStudentPass,
          parentPassword: finalParentPass,
          notes: stdNotes,
          enabled: stdEnabled,
          updatedDate: new Date().toISOString()
        });
        triggerAlert('success', isRtl ? `تم تحديث ملف الطالب '${stdName}' بنجاح.` : `Student '${stdName}' updated successfully.`);
      } else {
        // Create student with auto passwords
        const newStudent: Student = {
          id: studentId,
          name: stdName,
          phone: stdPhone,
          parentPhone: stdParentPhone,
          academicYear: stdYear,
          groupId: stdGroupId || '',
          gender: stdGender,
          password: finalStudentPass,
          parentPassword: finalParentPass,
          enabled: stdEnabled,
          notes: stdNotes,
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString()
        };

        await setDoc(doc(db, "students", studentId), newStudent);
        triggerAlert('success', isRtl 
          ? `تم إنشاء حساب الطالب بنجاح.\nكلمة مرور الطالب: ${finalStudentPass}\nكلمة مرور ولي الأمر: ${finalParentPass}` 
          : `Student created.\nStudent Pass: ${finalStudentPass}\nParent Pass: ${finalParentPass}`);
      }
      setStudentModalOpen(false);
    } catch (err: any) {
      triggerAlert('error', "Failed to save student: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteStudent = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: isRtl ? "تأكيد حذف الطالب" : "Confirm Student Deletion",
      message: `${t.studentConfirmDelete}\n(${name})`,
      confirmBtnText: isRtl ? "حذف نهائي" : "Delete Permanently",
      onConfirm: async () => {
        setLoading('student');
        try {
          await deleteDoc(doc(db, "students", id));
          triggerAlert('success', isRtl ? `تم حذف حساب الطالب '${name}' بنجاح.` : `Student '${name}' deleted successfully.`);
        } catch (err: any) {
          triggerAlert('error', "Deletion error: " + err.message);
        } finally {
          setLoading(null);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const resetStudentPassword = (student: Student, target: 'student' | 'parent') => {
    const newPass = generateRandomPassword();
    const isStudentTarget = target === 'student';
    const targetLabel = isStudentTarget 
      ? (isRtl ? "كلمة مرور الطالب" : "Student Password")
      : (isRtl ? "كلمة مرور ولي الأمر" : "Parent Password");

    setConfirmModal({
      isOpen: true,
      title: isRtl ? `إعادة تعيين ${targetLabel}` : `Reset ${targetLabel}`,
      message: isRtl 
        ? `هل تريد بالتأكيد إعادة تعيين ${targetLabel} للحساب الخاص بـ '${student.name}'؟ سيتم توليد كلمة مرور جديدة عشوائياً.`
        : `Reset ${targetLabel} for '${student.name}'? A new random password will be auto-generated.`,
      confirmBtnText: isRtl ? "إعادة تعيين كلمة المرور" : "Reset Password",
      onConfirm: async () => {
        try {
          const updateData = isStudentTarget 
            ? { password: newPass, updatedDate: new Date().toISOString() }
            : { parentPassword: newPass, updatedDate: new Date().toISOString() };

          await updateDoc(doc(db, "students", student.id), updateData);
          triggerAlert('success', isRtl 
            ? `تم تعيين ${targetLabel} الجديدة للطالب ${student.name} بنجاح: ${newPass}` 
            : `${targetLabel} successfully reset for ${student.name}: ${newPass}`);
        } catch (err: any) {
          triggerAlert('error', "Password reset failure: " + err.message);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Add a quick attendance record for a student
  const addStudentAttendance = async (student: Student) => {
    if (!subEditAttDate) return;
    const attId = `${student.phone}_${subEditAttDate}`;
    try {
      await setDoc(doc(db, "attendance", attId), {
        id: attId,
        studentPhone: student.phone,
        studentName: student.name,
        date: subEditAttDate,
        status: subEditAttStatus
      });
      triggerAlert('success', `Attendance marked ${subEditAttStatus} for ${student.name} on ${subEditAttDate}`);
    } catch (err: any) {
      triggerAlert('error', "Failed to log attendance: " + err.message);
    }
  };

  // Add a quick exam grade for a student
  const addStudentGrade = async (student: Student) => {
    if (!subEditExamName || !subEditExamScore || !subEditExamTotal) return;
    const gradeId = `g_${Math.random().toString(36).substring(2, 9)}`;
    try {
      await setDoc(doc(db, "grades", gradeId), {
        id: gradeId,
        examName: subEditExamName,
        examDate: new Date().toISOString().substring(0, 10),
        totalMarks: parseFloat(subEditExamTotal),
        studentPhone: student.phone,
        studentName: student.name,
        score: parseFloat(subEditExamScore)
      });
      setSubEditExamName('');
      setSubEditExamScore('');
      triggerAlert('success', `Scorecard logged successfully for ${student.name}`);
    } catch (err: any) {
      triggerAlert('error', "Failed to log scorecard: " + err.message);
    }
  };

  const filteredStudents = students.filter((s) => {
    const matchesYear = selectedYearTab === 'all' || s.academicYear === selectedYearTab;
    const matchesGender = selectedGenderTab === 'all' || (s.gender || 'male') === selectedGenderTab;
    const matchesSearch = matchesSearchQuery(studentSearch, s.name, s.phone, s.parentPhone);
    return matchesYear && matchesGender && matchesSearch;
  });

  const renderStudents = () => {
    const maleCount = students.filter((s) => (s.gender || 'male') === 'male').length;
    const femaleCount = students.filter((s) => s.gender === 'female').length;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
              {isRtl ? "إدارة حسابات الطلاب وأولياء الأمور" : "Student & Parent Accounts"}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isRtl ? "إضافة الطلاب، اختيار الجنس (بنين / بنات)، وتوليد كلمات مرور منفصلة لكل من الطالب وولي الأمر." : "Add students, choose gender (Boys/Girls), and manage separate auto-generated passwords for students and parents."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenGeneralImport}
              className="flex items-center space-x-1.5 space-x-reverse py-2.5 px-3.5 bg-purple-50 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold hover:bg-purple-100 transition-all shadow-xs cursor-pointer"
              title={isRtl ? "استيراد بيانات الطلاب من ملف JSON" : "Import Students from JSON"}
            >
              <Upload className="h-4 w-4 text-purple-600" />
              <span>{isRtl ? "استيراد ملف (JSON)" : "Import (JSON)"}</span>
            </button>
            <button
              onClick={handleOpenGeneralExport}
              className="flex items-center space-x-1.5 space-x-reverse py-2.5 px-3.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all shadow-xs cursor-pointer"
              title={isRtl ? "تصدير بيانات الطلاب إلى ملف JSON" : "Export Students to JSON"}
            >
              <Download className="h-4 w-4 text-blue-600" />
              <span>{isRtl ? "تصدير ملف (JSON)" : "Export (JSON)"}</span>
            </button>
            <button
              onClick={() => openStudentModal()}
              className="flex items-center space-x-1.5 py-2.5 px-4 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-850 transition-all shadow-sm cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>{isRtl ? "إضافة طالب جديد" : "Add Student"}</span>
            </button>
          </div>
        </div>

        {/* Academic Year Selector Tabs & Gender Filter Bar */}
        <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-150 shadow-sm">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-500 mb-1">
            <span>{isRtl ? "تصفية حسب السنة الدراسية:" : "Filter by Academic Year:"}</span>
          </div>
          <div className="flex space-x-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedYearTab('all')}
              className={`px-3.5 py-1.5 text-xs font-extrabold transition-all rounded-xl ${
                selectedYearTab === 'all' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
              }`}
            >
              {isRtl ? `جميع السنوات (${students.length})` : `All Years (${students.length})`}
            </button>
            {years.map((y) => {
              const count = students.filter((s) => s.academicYear === y.id).length;
              return (
                <button
                  key={y.id}
                  onClick={() => setSelectedYearTab(y.id)}
                  className={`px-3.5 py-1.5 text-xs font-extrabold transition-all rounded-xl ${
                    selectedYearTab === y.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                  }`}
                >
                  {y.name} ({count})
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex space-x-2">
              <button
                onClick={() => setSelectedGenderTab('all')}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  selectedGenderTab === 'all' ? 'bg-blue-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isRtl ? `الكل (${students.length})` : `All Genders (${students.length})`}
              </button>
              <button
                onClick={() => setSelectedGenderTab('male')}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center space-x-1 ${
                  selectedGenderTab === 'male' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <span>👦</span>
                <span>{isRtl ? `البنين / الذكور (${maleCount})` : `Boys (${maleCount})`}</span>
              </button>
              <button
                onClick={() => setSelectedGenderTab('female')}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center space-x-1 ${
                  selectedGenderTab === 'female' ? 'bg-pink-600 text-white shadow-xs' : 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                }`}
              >
                <span>👧</span>
                <span>{isRtl ? `البنات / الإناث (${femaleCount})` : `Girls (${femaleCount})`}</span>
              </button>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className={`absolute top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none ${isRtl ? "right-3" : "left-3"}`} />
              <input
                type="text"
                name="studentSearch"
                dir="auto"
                autoCapitalize="none"
                placeholder={isRtl ? "بحث بالاسم أو الهاتف..." : "Search name or phone..."}
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className={`w-full py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                  isRtl ? "pr-8 pl-3 text-right" : "pl-8 pr-3 text-left"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Students list table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="p-4">{isRtl ? "الطالب والجنس" : "Student & Gender"}</th>
                  <th className="p-4">{isRtl ? "أرقام التواصل" : "Contact Phones"}</th>
                  <th className="p-4">{isRtl ? "السنة الدراسية" : "Academic Year"}</th>
                  <th className="p-4">{isRtl ? "كلمة مرور الطالب" : "Student Pass"}</th>
                  <th className="p-4">{isRtl ? "كلمة مرور ولي الأمر" : "Parent Pass"}</th>
                  <th className="p-4">{isRtl ? "الحالة" : "Status"}</th>
                  <th className="p-4 text-right">{isRtl ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                      {isRtl ? "لا يوجد طلاب مطابقون لمعايير البحث." : "No registered students found matching search filters."}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const isFemale = student.gender === 'female';
                    return (
                      <React.Fragment key={student.id}>
                        <tr className="hover:bg-slate-50/50">
                          <td className="p-4">
                            <div className="flex items-center space-x-2">
                              <span className="text-base">{isFemale ? '👧' : '👦'}</span>
                              <div>
                                <span className="font-extrabold text-slate-900 block">{student.name}</span>
                                <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold mt-0.5 ${
                                  isFemale ? 'bg-pink-100 text-pink-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {isFemale ? (isRtl ? 'أنثى / طالبة' : 'Female') : (isRtl ? 'ذكر / طالب' : 'Male')}
                                </span>
                              </div>
                            </div>
                            {student.notes && (
                              <span className="text-[10px] text-slate-400 block mt-1 max-w-[200px] truncate" title={student.notes}>
                                {student.notes}
                              </span>
                            )}
                          </td>
                          <td className="p-4 space-y-1 font-mono text-[11px]">
                            <div>Stud: <span className="text-slate-800 font-bold">{student.phone}</span></div>
                            <div>Prnt: <span className="text-slate-600">{student.parentPhone}</span></div>
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            {years.find((y) => y.id === student.academicYear)?.name || `Year ${student.academicYear}`}
                          </td>
                          <td className="p-4 font-mono font-black text-blue-900 text-[12px]">
                            <div className="flex items-center space-x-1.5 bg-blue-50/60 px-2 py-1 rounded-lg w-fit border border-blue-100">
                              <span>{student.password}</span>
                              <button
                                onClick={() => resetStudentPassword(student, 'student')}
                                className="text-blue-600 hover:text-blue-900 p-0.5 rounded"
                                title={isRtl ? "إعادة تعيين كلمة مرور الطالب" : "Reset student password"}
                              >
                                <Key className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="p-4 font-mono font-black text-emerald-900 text-[12px]">
                            <div className="flex items-center space-x-1.5 bg-emerald-50/60 px-2 py-1 rounded-lg w-fit border border-emerald-100">
                              <span>{student.parentPassword || student.password}</span>
                              <button
                                onClick={() => resetStudentPassword(student, 'parent')}
                                className="text-emerald-600 hover:text-emerald-900 p-0.5 rounded"
                                title={isRtl ? "إعادة تعيين كلمة مرور ولي الأمر" : "Reset parent password"}
                              >
                                <Key className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                              student.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {student.enabled ? (isRtl ? 'مفعل' : 'ACTIVE') : (isRtl ? 'معطل' : 'DEACTIVATED')}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-1.5">
                            <button
                              onClick={() => {
                                setActiveStudentSubEdit(
                                  activeStudentSubEdit?.id === student.id ? null : student
                                );
                              }}
                              className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[10px] font-bold"
                            >
                              {isRtl ? "السجل الأكاديمي" : "Academic Editor"}
                            </button>
                            <button
                              onClick={() => openStudentModal(student)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded bg-slate-50"
                              title={isRtl ? "تعديل البيانات" : "Edit"}
                            >
                              <Edit2 className="h-3.5 w-3.5 inline" />
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(student.id, student.name)}
                              className="p-1.5 text-red-500 hover:text-red-700 rounded bg-red-50"
                              title={isRtl ? "حذف الحساب" : "Delete"}
                            >
                              <Trash2 className="h-3.5 w-3.5 inline" />
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Academics/Scores Editor Block */}
                        {activeStudentSubEdit?.id === student.id && (
                          <tr className="bg-slate-50">
                            <td colSpan={7} className="p-5 border-y border-slate-100">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Inline Attendance marking */}
                                <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-3">
                                  <h4 className="text-xs font-black text-slate-900 uppercase">
                                    {isRtl ? "سجل الحضور والغياب السريع" : "Quick Attendance Logger"}
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                      <label className="text-slate-400 block mb-1">{isRtl ? "التاريخ" : "Pick Date"}</label>
                                      <input 
                                        type="date" 
                                        value={subEditAttDate}
                                        onChange={(e) => setSubEditAttDate(e.target.value)}
                                        className="border rounded px-2 py-1 w-full bg-slate-50"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-slate-400 block mb-1">{isRtl ? "حالة الحضور" : "Status"}</label>
                                      <select
                                        value={subEditAttStatus}
                                        onChange={(e: any) => setSubEditAttStatus(e.target.value)}
                                        className="border rounded px-2 py-1 w-full bg-slate-50 font-bold"
                                      >
                                        <option value="present">{isRtl ? "حاضر" : "Present"}</option>
                                        <option value="absent">{isRtl ? "غائب" : "Absent"}</option>
                                        <option value="late">{isRtl ? "متأخر" : "Late"}</option>
                                      </select>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => addStudentAttendance(student)}
                                    className="w-full py-1.5 bg-slate-900 text-white rounded text-[11px] font-bold"
                                  >
                                    {isRtl ? "تسجيل الحضور" : "Submit Attendance Marker"}
                                  </button>
                                </div>

                                {/* Inline Exam grades entry */}
                                <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-3">
                                  <h4 className="text-xs font-black text-slate-900 uppercase">
                                    {isRtl ? "رصد درجة دراسية جديدة" : "New Examination Scorecard"}
                                  </h4>
                                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                                    <div className="col-span-1">
                                      <label className="text-slate-400 block mb-1">{isRtl ? "اسم الاختبار" : "Exam Name"}</label>
                                      <input 
                                        type="text" 
                                        placeholder={isRtl ? "مثال: منتصف الفصل" : "e.g. Midterm"}
                                        value={subEditExamName}
                                        onChange={(e) => setSubEditExamName(e.target.value)}
                                        className="border rounded px-2 py-1 w-full bg-slate-50"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-slate-400 block mb-1">{isRtl ? "الدرجة" : "Score"}</label>
                                      <input 
                                        type="number" 
                                        placeholder="Score"
                                        value={subEditExamScore}
                                        onChange={(e) => setSubEditExamScore(e.target.value)}
                                        className="border rounded px-2 py-1 w-full bg-slate-50"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-slate-400 block mb-1">{isRtl ? "من أصل" : "Total"}</label>
                                      <input 
                                        type="number" 
                                        placeholder="Total"
                                        value={subEditExamTotal}
                                        onChange={(e) => setSubEditExamTotal(e.target.value)}
                                        className="border rounded px-2 py-1 w-full bg-slate-50"
                                      />
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => addStudentGrade(student)}
                                    className="w-full py-1.5 bg-emerald-600 text-white rounded text-[11px] font-bold"
                                  >
                                    {isRtl ? "تسجيل الدرجة" : "Submit Examination Scorecard"}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Create/Edit Student */}
        {studentModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
              <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider mb-4">
                {editingStudent 
                  ? (isRtl ? `تعديل بيانات الطالب '${editingStudent.name}'` : `Modify student '${editingStudent.name}'`)
                  : (isRtl ? "إضافة طالب جديد" : "Create new student profile")}
              </h3>
              <form onSubmit={handleSaveStudent} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1 font-bold">{isRtl ? "الاسم الكامل للطالب" : "Student Full Name"}</label>
                  <input
                    type="text"
                    required
                    value={stdName}
                    onChange={(e) => setStdName(e.target.value)}
                    className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900"
                    placeholder={isRtl ? "أدخل الاسم الرباعي" : "Enter full name"}
                  />
                </div>

                {/* Gender Choice: Male / Female */}
                <div>
                  <label className="block text-slate-500 mb-1 font-bold">{isRtl ? "الجنس (بنين / بنات)" : "Gender (Boys / Girls)"}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStdGender('male')}
                      className={`py-2 px-3 rounded-xl border flex items-center justify-center space-x-1.5 font-bold transition-all ${
                        stdGender === 'male' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 border-gray-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>👦</span>
                      <span>{isRtl ? "بنين (ذكر)" : "Male (Boys)"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStdGender('female')}
                      className={`py-2 px-3 rounded-xl border flex items-center justify-center space-x-1.5 font-bold transition-all ${
                        stdGender === 'female' ? 'bg-pink-600 text-white border-pink-600 shadow-sm' : 'bg-white text-slate-700 border-gray-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>👧</span>
                      <span>{isRtl ? "بنات (أنثى)" : "Female (Girls)"}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1 font-bold">{isRtl ? "هاتف الطالب (تسجيل الدخول)" : "Student Phone"}</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      disabled={!!editingStudent}
                      value={stdPhone}
                      onChange={(e) => setStdPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900 disabled:bg-gray-50 font-mono"
                      placeholder="e.g. 0100100100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1 font-bold">{isRtl ? "هاتف ولي الأمر (تسجيل الدخول)" : "Parent Phone"}</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      value={stdParentPhone}
                      onChange={(e) => setStdParentPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900 font-mono"
                      placeholder="e.g. 0900900900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1 font-bold">{isRtl ? "السنة الدراسية" : "Academic Year"}</label>
                    <select
                      value={stdYear}
                      onChange={(e) => {
                        setStdYear(e.target.value);
                        setStdGroupId('');
                      }}
                      className="w-full border rounded-xl p-2.5 bg-white font-bold"
                    >
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>{y.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1 font-bold">{isRtl ? "المجموعة المدرسية" : "Assign Group"}</label>
                    <select
                      value={stdGroupId}
                      onChange={(e) => setStdGroupId(e.target.value)}
                      className="w-full border rounded-xl p-2.5 bg-white font-bold"
                    >
                      <option value="">{isRtl ? "بدون مجموعة" : "No Group"}</option>
                      {groups
                        .filter((g) => g.academicYear === stdYear && g.gender === stdGender)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name || (isRtl ? `مجموعة ${g.groupNumber}` : `Group ${g.groupNumber}`)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1 font-bold">{isRtl ? "حالة الحساب" : "Account State"}</label>
                    <select
                      value={stdEnabled ? 'true' : 'false'}
                      onChange={(e) => setStdEnabled(e.target.value === 'true')}
                      className="w-full border rounded-xl p-2.5 bg-white font-bold"
                    >
                      <option value="true">{isRtl ? "مفعل (نشط)" : "Active (Enabled)"}</option>
                      <option value="false">{isRtl ? "معطل" : "Deactivated"}</option>
                    </select>
                  </div>
                </div>

                {/* Separate Generated Passwords section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-slate-600 font-bold text-[11px]">{isRtl ? "كلمة مرور الطالب" : "Student Pass"}</label>
                      <button
                        type="button"
                        onClick={() => setStdPassword(generateRandomPassword())}
                        className="text-[10px] text-blue-600 hover:underline font-bold"
                      >
                        {isRtl ? "توليد جديد" : "Regenerate"}
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={stdPassword}
                      onChange={(e) => setStdPassword(e.target.value)}
                      className="w-full border rounded-lg p-2 font-mono font-black text-blue-900 bg-white text-xs"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-slate-600 font-bold text-[11px]">{isRtl ? "كلمة مرور ولي الأمر" : "Parent Pass"}</label>
                      <button
                        type="button"
                        onClick={() => setStdParentPassword(generateRandomPassword())}
                        className="text-[10px] text-emerald-600 hover:underline font-bold"
                      >
                        {isRtl ? "توليد جديد" : "Regenerate"}
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={stdParentPassword}
                      onChange={(e) => setStdParentPassword(e.target.value)}
                      className="w-full border rounded-lg p-2 font-mono font-black text-emerald-900 bg-white text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1 font-bold">{isRtl ? "ملاحظات إدارية" : "Administrative Notes"}</label>
                  <textarea
                    rows={2}
                    value={stdNotes}
                    onChange={(e) => setStdNotes(e.target.value)}
                    className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900"
                    placeholder={isRtl ? "أي ملاحظات إضافية..." : "Enter private commentary or academic updates"}
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStudentModalOpen(false)}
                    className="px-4 py-2 border rounded-xl hover:bg-gray-50 font-semibold"
                  >
                    {isRtl ? "إلغاء" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-950 text-white rounded-xl hover:bg-slate-850 font-bold"
                  >
                    {loading === 'student' ? (isRtl ? "جارٍ الحفظ..." : "Saving...") : (isRtl ? "حفظ البيانات" : "Save Profile")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // TAB 3: ACADEMIC YEARS
  // ==========================================
  const [yearNameInput, setYearNameInput] = useState('');
  const [yearIdInput, setYearIdInput] = useState('');
  const [cascadeConfirmOpen, setCascadeConfirmOpen] = useState<string | null>(null); // holds yearId to delete
  const [cascadeConfirmText, setCascadeConfirmText] = useState('');

  const handleAddYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearIdInput || !yearNameInput) return;
    try {
      await setDoc(doc(db, "years", yearIdInput), {
        id: yearIdInput,
        name: yearNameInput
      });
      triggerAlert('success', `Academic Year '${yearNameInput}' registered successfully.`);
      setYearIdInput('');
      setYearNameInput('');
    } catch (err: any) {
      triggerAlert('error', "Failed to create year: " + err.message);
    }
  };

  const handleCascadeDeleteYear = async (yearId: string) => {
    if (cascadeConfirmText !== 'DELETE') {
      triggerAlert('error', "Please type 'DELETE' precisely to confirm.");
      return;
    }

    setLoading('years_cascade');
    try {
      // Find students in this year and delete them
      const studentsInYear = students.filter((s) => s.academicYear === yearId);
      
      const batch = writeBatch(db);
      
      // Delete students
      studentsInYear.forEach((std) => {
        batch.delete(doc(db, "students", std.id));
      });
      
      // Delete year
      batch.delete(doc(db, "years", yearId));
      
      await batch.commit();
      triggerAlert('success', `Academic year '${yearId}' and all its ${studentsInYear.length} registered students deleted successfully.`);
      setCascadeConfirmOpen(null);
      setCascadeConfirmText('');
    } catch (err: any) {
      triggerAlert('error', "Failed to execute cascade deletion: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const [groupNumberInput, setGroupNumberInput] = useState('');
  const [groupGenderInput, setGroupGenderInput] = useState<'male' | 'female'>('male');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupScheduleInput, setGroupScheduleInput] = useState<{[day: string]: string}>({});
  const [selectedGroupToSchedule, setSelectedGroupToSchedule] = useState<Group | null>(null);
  const [groupScheduleEdit, setGroupScheduleEdit] = useState<{[day: string]: string}>({});
  const [groupLabelEdit, setGroupLabelEdit] = useState("");

  const handleAddGroup = async (e: React.FormEvent, academicYearId: string) => {
    e.preventDefault();
    if (!groupNumberInput.trim() || !academicYearId) {
      triggerAlert('error', isRtl ? 'يرجى إدخال رقم المجموعة' : 'Group number is required');
      return;
    }

    const num = groupNumberInput.trim();
    const groupId = `grp_${academicYearId}_${groupGenderInput}_${num}`;
    try {
      const gName = groupNameInput.trim() || (isRtl ? `مجموعة ${num}` : `Group ${num}`);
      await setDoc(doc(db, "groups", groupId), {
        id: groupId,
        academicYear: academicYearId,
        groupNumber: num,
        gender: groupGenderInput,
        name: gName,
        schedule: groupScheduleInput
      } as Group);

      triggerAlert('success', isRtl ? `تمت إضافة المجموعة ${num} بنجاح` : `Group ${num} added successfully`);
      setGroupNumberInput('');
      setGroupNameInput('');
      setGroupScheduleInput({});
    } catch (err: any) {
      triggerAlert('error', "Failed to add group: " + err.message);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await deleteDoc(doc(db, "groups", groupId));
      triggerAlert('success', isRtl ? 'تم حذف المجموعة' : 'Group deleted');
    } catch (err: any) {
      triggerAlert('error', "Failed to delete group: " + err.message);
    }
  };

  const handleSaveGroupSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupToSchedule) return;

    try {
      setLoading("saving_schedule");
      const groupRef = doc(db, "groups", selectedGroupToSchedule.id);
      await updateDoc(groupRef, {
        name: groupLabelEdit.trim(),
        schedule: groupScheduleEdit
      });

      triggerAlert("success", isRtl ? "تم تحديث مسمى وجدول المجموعة بنجاح" : "Group settings and schedule updated successfully");
      setSelectedGroupToSchedule(null);
    } catch (err: any) {
      triggerAlert("error", "Failed to update group schedule: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const renderYears = () => {
    const currentSelectedYear = years.find((y) => y.id === (selectedCohortYearId || years[0]?.id));
    const activeCohortId = currentSelectedYear?.id || '';

    const cohortStudents = students.filter((s) => s.academicYear === activeCohortId);
    const cohortBoys = cohortStudents.filter((s) => (s.gender || 'male') === 'male');
    const cohortGirls = cohortStudents.filter((s) => s.gender === 'female');

    const activeList = cohortGenderTab === 'male' ? cohortBoys : cohortGirls;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
            {isRtl ? "إدارة السنوات الدراسية والمجموعات وتقسيم البنين والبنات" : "Academic Years, Groups & Gender Division"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl 
              ? "إدارة الدفعات، إنشاء المجموعات (بنين وبنات) برقم محدد، واستعراض تبويبات الطلاب المسجلين." 
              : "Manage academic intakes, create numbered male and female groups, and view student rosters."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Create form */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 h-fit">
            <h3 className="text-xs font-black text-slate-900 uppercase">
              {isRtl ? "إنشاء سنة دراسية جديدة" : "Create New Session"}
            </h3>
            <form onSubmit={handleAddYear} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-500 block mb-1 font-bold">{isRtl ? "معرف السنة (مثال: 2025)" : "Session ID (e.g. 2025)"}</label>
                <input 
                  type="text" 
                  required
                  placeholder="2025"
                  value={yearIdInput}
                  onChange={(e) => setYearIdInput(e.target.value)}
                  className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1 font-bold">{isRtl ? "اسم الدفعة / السنة" : "Display Label"}</label>
                <input 
                  type="text" 
                  required
                  placeholder={isRtl ? "دفعة 2025" : "Class of 2025"}
                  value={yearNameInput}
                  onChange={(e) => setYearNameInput(e.target.value)}
                  className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-3 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-850"
              >
                {isRtl ? "إضافة السنة الدراسية" : "Register Academic Cohort"}
              </button>
            </form>
          </div>

          {/* List of active years */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-50 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-900 uppercase">
                {isRtl ? "السنوات الدراسية المسجلة" : "Registered Intake Years"}
              </h3>
              <span className="text-[11px] font-extrabold text-slate-500">
                {years.length} {isRtl ? "سنوات" : "Years"}
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {years.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-400">{isRtl ? "لا توجد سنوات مسجلة." : "No session years registered."}</p>
              ) : (
                years.map((y) => {
                  const numBoys = students.filter((s) => s.academicYear === y.id && (s.gender || 'male') === 'male').length;
                  const numGirls = students.filter((s) => s.academicYear === y.id && s.gender === 'female').length;
                  const yearGroups = groups.filter((g) => g.academicYear === y.id);
                  const isSelected = y.id === activeCohortId;

                  return (
                    <div 
                      key={y.id} 
                      onClick={() => setSelectedCohortYearId(y.id)}
                      className={`p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs gap-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div>
                        <span className="font-extrabold text-slate-950 text-sm block">{y.name}</span>
                        <div className="flex items-center space-x-3 text-[11px] text-gray-500 mt-1">
                          <span>ID: <strong className="font-mono text-slate-700">{y.id}</strong></span>
                          <span>•</span>
                          <span className="text-purple-700 font-bold">🏷️ {yearGroups.length} {isRtl ? "مجموعات" : "Groups"}</span>
                          <span>•</span>
                          <span className="text-blue-700 font-bold">👦 {numBoys} {isRtl ? "بنين" : "Boys"}</span>
                          <span>•</span>
                          <span className="text-pink-700 font-bold">👧 {numGirls} {isRtl ? "بنات" : "Girls"}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCohortYearId(y.id);
                          }}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {isRtl ? "إدارة المجموعات والتبويبات" : "Manage Groups & Tabs"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCascadeConfirmOpen(y.id);
                            setCascadeConfirmText('');
                          }}
                          className="px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-[11px]"
                        >
                          {isRtl ? "حذف" : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Dedicated Groups & Boys/Girls Tabs Section for Selected Academic Year */}
        {currentSelectedYear && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                  <span>{isRtl ? `إدارة المجموعات والتبويبات للسنة الدراسية: ${currentSelectedYear.name}` : `Groups & Gender Division: ${currentSelectedYear.name}`}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isRtl ? `إجمالي الطلاب في هذه السنة: ${cohortStudents.length} طالب وطالبة` : `Total Enrolled: ${cohortStudents.length} Students`}
                </p>
              </div>

              {/* TWO TABS: BOYS AND GIRLS */}
              <div className="flex p-1 bg-slate-100 rounded-xl space-x-1">
                <button
                  onClick={() => setCohortGenderTab('male')}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center space-x-1.5 ${
                    cohortGenderTab === 'male' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>👦</span>
                  <span>{isRtl ? `تبويب البنين / الذكور (${cohortBoys.length})` : `Boys Tab (${cohortBoys.length})`}</span>
                </button>
                <button
                  onClick={() => setCohortGenderTab('female')}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center space-x-1.5 ${
                    cohortGenderTab === 'female' 
                      ? 'bg-pink-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>👧</span>
                  <span>{isRtl ? `تبويب البنات / الإناث (${cohortGirls.length})` : `Girls Tab (${cohortGirls.length})`}</span>
                </button>
              </div>
            </div>

            {/* GROUPS MANAGEMENT FOR SELECTED ACADEMIC YEAR */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black uppercase text-slate-800 flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-purple-600" />
                  <span>{isRtl ? `إضافة المجموعات المدرسية (${currentSelectedYear.name})` : `Add Academic Groups (${currentSelectedYear.name})`}</span>
                </h4>
              </div>

              {/* Form to Add New Group */}
              <form onSubmit={(e) => handleAddGroup(e, currentSelectedYear.id)} className="bg-white p-4 rounded-lg border border-slate-200 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1 font-bold">{isRtl ? "رقم المجموعة *" : "Group Number *"}</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 1, 2, 3"
                      value={groupNumberInput}
                      onChange={(e) => setGroupNumberInput(e.target.value)}
                      className="w-full border rounded-lg p-2 font-mono font-bold focus:ring-1 focus:ring-purple-600"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-bold">{isRtl ? "نوع المجموعة" : "Gender"}</label>
                    <select
                      value={groupGenderInput}
                      onChange={(e) => setGroupGenderInput(e.target.value as 'male' | 'female')}
                      className="w-full border rounded-lg p-2 font-bold bg-white"
                    >
                      <option value="male">👦 {isRtl ? "مجموعة بنين" : "Boys Group"}</option>
                      <option value="female">👧 {isRtl ? "مجموعة بنات" : "Girls Group"}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-bold">{isRtl ? "اسم المجموعة (اختياري)" : "Group Label (Optional)"}</label>
                    <input
                      type="text"
                      placeholder={isRtl ? "مثال: مجموعة 1" : "e.g. Group 1"}
                      value={groupNameInput}
                      onChange={(e) => setGroupNameInput(e.target.value)}
                      className="w-full border rounded-lg p-2 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>
                </div>

                {/* Days Schedule Selection */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                  <span className="font-bold text-slate-700 block text-[11px] mb-1">
                    📅 {isRtl ? "تحديد مواعيد أيام الأسبوع لهذه المجموعة (اختياري)" : "Set Days & Times for this Group (Optional)"}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {SEVEN_DAYS.map((day) => {
                      const value = groupScheduleInput[day.key] || "";
                      const isChecked = day.key in groupScheduleInput;
                      return (
                        <div key={day.key} className="bg-white p-2 rounded border border-slate-150 flex flex-col justify-between space-y-1.5 shadow-xs">
                          <label className="flex items-center space-x-1.5 space-x-reverse cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setGroupScheduleInput(prev => ({ ...prev, [day.key]: "" }));
                                } else {
                                  const updated = { ...groupScheduleInput };
                                  delete updated[day.key];
                                  setGroupScheduleInput(updated);
                                }
                              }}
                              className="rounded text-purple-600 focus:ring-purple-600 h-3.5 w-3.5"
                            />
                            <span className="font-bold text-slate-800 text-[11px]">{isRtl ? day.ar : day.en}</span>
                          </label>
                          {isChecked && (
                            <input 
                              type="text"
                              placeholder={isRtl ? "مثال: 6:00 ص - 7:30 ص (اختياري)" : "e.g. 6:00 AM - 7:30 AM (Optional)"}
                              value={value}
                              onChange={(e) => {
                                setGroupScheduleInput(prev => ({ ...prev, [day.key]: e.target.value }));
                              }}
                              className="w-full text-[10px] p-1 border rounded focus:ring-1 focus:ring-purple-600 font-mono font-bold"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="py-2 px-4 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg transition-all"
                  >
                    {isRtl ? "+ إضافة مجموعة" : "+ Add Group"}
                  </button>
                </div>
              </form>

              {/* Active Groups Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Male Groups */}
                <div className="bg-white p-3 rounded-lg border border-blue-100">
                  <span className="text-[11px] font-black text-blue-900 block mb-2 flex items-center space-x-1">
                    <span>👦</span>
                    <span>{isRtl ? "مجموعات البنين المسجلة" : "Male Groups Registered"}</span>
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    {groups.filter(g => g.academicYear === currentSelectedYear.id && g.gender === 'male').length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">{isRtl ? "لا توجد مجموعات بنين مسجلة." : "No male groups created."}</span>
                    ) : (
                      groups.filter(g => g.academicYear === currentSelectedYear.id && g.gender === 'male').map(g => {
                        const inGroup = students.filter(s => s.academicYear === currentSelectedYear.id && s.groupId === g.id).length;
                        return (
                          <div key={g.id} className="flex flex-col bg-blue-50/70 border border-blue-200 p-2.5 rounded-lg text-xs space-y-1.5 w-full">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-blue-900">
                                {g.name || (isRtl ? `مجموعة ${g.groupNumber}` : `Group ${g.groupNumber}`)}
                              </span>
                              <div className="flex items-center space-x-1.5 space-x-reverse">
                                <span className="text-[10px] bg-blue-200 text-blue-900 px-1.5 py-0.2 rounded font-bold">
                                  {inGroup} {isRtl ? "طالب" : "students"}
                                </span>
                                <button 
                                  onClick={() => {
                                    setSelectedGroupToSchedule(g);
                                    setGroupLabelEdit(g.name || "");
                                    setGroupScheduleEdit(g.schedule || {});
                                  }}
                                  className="text-purple-600 hover:text-purple-800 p-0.5 rounded transition-all" 
                                  title={isRtl ? "تعديل جدول ومسمى المجموعة" : "Edit Name & Schedule"}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleDeleteGroup(g.id)} className="text-red-500 hover:text-red-700 p-0.5 rounded transition-all" title="Delete Group">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            
                            {/* Schedule Listing */}
                            {g.schedule && Object.keys(g.schedule).length > 0 && (
                              <div className="grid grid-cols-2 gap-1 text-[10px] text-blue-800 pt-1.5 border-t border-blue-100 font-medium">
                                {Object.entries(g.schedule).map(([dayKey, timeVal]) => {
                                  const dayObj = SEVEN_DAYS.find(d => d.key === dayKey);
                                  const displayVal = typeof timeVal === "string" ? timeVal : "";
                                  return (
                                    <div key={dayKey} className="flex justify-between items-center bg-white/70 px-1.5 py-0.5 rounded border border-blue-100">
                                      <span className="font-bold text-blue-900">{isRtl ? dayObj?.ar : dayObj?.en}:</span>
                                      <span className="font-mono text-purple-700 font-semibold">{displayVal.trim() !== "" ? displayVal : (isRtl ? "بدون تحديد وقت" : "Day selected")}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Group File Import & Export Actions */}
                            <div className="flex items-center gap-1.5 pt-1.5 border-t border-blue-100">
                              <button
                                type="button"
                                onClick={() => handleOpenImportGroup(g)}
                                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-md bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px] transition-colors cursor-pointer"
                                title={isRtl ? "إدراج ملف لإضافة طلاب لهذه المجموعة" : "Insert file to add students to this group"}
                              >
                                <Upload className="h-3 w-3 text-purple-600" />
                                <span>{isRtl ? "إدراج ملف طلاب" : "Insert File"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenExportGroup(g)}
                                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-md bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px] transition-colors cursor-pointer"
                                title={isRtl ? "استخراج وتصدير ملف طلاب هذه المجموعة" : "Export students file for this group"}
                              >
                                <Download className="h-3 w-3 text-blue-600" />
                                <span>{isRtl ? "استخراج ملف طلاب" : "Export File"}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Female Groups */}
                <div className="bg-white p-3 rounded-lg border border-pink-100">
                  <span className="text-[11px] font-black text-pink-900 block mb-2 flex items-center space-x-1">
                    <span>👧</span>
                    <span>{isRtl ? "مجموعات البنات المسجلة" : "Female Groups Registered"}</span>
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    {groups.filter(g => g.academicYear === currentSelectedYear.id && g.gender === 'female').length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">{isRtl ? "لا توجد مجموعات بنات مسجلة." : "No female groups created."}</span>
                    ) : (
                      groups.filter(g => g.academicYear === currentSelectedYear.id && g.gender === 'female').map(g => {
                        const inGroup = students.filter(s => s.academicYear === currentSelectedYear.id && s.groupId === g.id).length;
                        return (
                          <div key={g.id} className="flex flex-col bg-pink-50/70 border border-pink-200 p-2.5 rounded-lg text-xs space-y-1.5 w-full">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-pink-900">
                                {g.name || (isRtl ? `مجموعة ${g.groupNumber}` : `Group ${g.groupNumber}`)}
                              </span>
                              <div className="flex items-center space-x-1.5 space-x-reverse">
                                <span className="text-[10px] bg-pink-200 text-pink-900 px-1.5 py-0.2 rounded font-bold">
                                  {inGroup} {isRtl ? "طالبة" : "students"}
                                </span>
                                <button 
                                  onClick={() => {
                                    setSelectedGroupToSchedule(g);
                                    setGroupLabelEdit(g.name || "");
                                    setGroupScheduleEdit(g.schedule || {});
                                  }}
                                  className="text-purple-600 hover:text-purple-800 p-0.5 rounded transition-all" 
                                  title={isRtl ? "تعديل جدول ومسمى المجموعة" : "Edit Name & Schedule"}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleDeleteGroup(g.id)} className="text-red-500 hover:text-red-700 p-0.5 rounded transition-all" title="Delete Group">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            
                            {/* Schedule Listing */}
                            {g.schedule && Object.keys(g.schedule).length > 0 && (
                              <div className="grid grid-cols-2 gap-1 text-[10px] text-pink-800 pt-1.5 border-t border-pink-100 font-medium">
                                {Object.entries(g.schedule).map(([dayKey, timeVal]) => {
                                  const dayObj = SEVEN_DAYS.find(d => d.key === dayKey);
                                  const displayVal = typeof timeVal === "string" ? timeVal : "";
                                  return (
                                    <div key={dayKey} className="flex justify-between items-center bg-white/70 px-1.5 py-0.5 rounded border border-pink-100">
                                      <span className="font-bold text-pink-900">{isRtl ? dayObj?.ar : dayObj?.en}:</span>
                                      <span className="font-mono text-purple-700 font-semibold">{displayVal.trim() !== "" ? displayVal : (isRtl ? "بدون تحديد وقت" : "Day selected")}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Group File Import & Export Actions */}
                            <div className="flex items-center gap-1.5 pt-1.5 border-t border-pink-100">
                              <button
                                type="button"
                                onClick={() => handleOpenImportGroup(g)}
                                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-md bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px] transition-colors cursor-pointer"
                                title={isRtl ? "إدراج ملف لإضافة طالبات لهذه المجموعة" : "Insert file to add students to this group"}
                              >
                                <Upload className="h-3 w-3 text-purple-600" />
                                <span>{isRtl ? "إدراج ملف طالبات" : "Insert File"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenExportGroup(g)}
                                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-md bg-white hover:bg-pink-50 text-pink-700 border border-pink-200 font-bold text-[10px] transition-colors cursor-pointer"
                                title={isRtl ? "استخراج وتصدير ملف طالبات هذه المجموعة" : "Export students file for this group"}
                              >
                                <Download className="h-3 w-3 text-pink-600" />
                                <span>{isRtl ? "استخراج ملف طالبات" : "Export File"}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* List of students in selected gender tab */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="p-3">{isRtl ? "اسم الطالب والمجموعة" : "Student Name & Group"}</th>
                    <th className="p-3">{isRtl ? "هاتف الطالب" : "Student Phone"}</th>
                    <th className="p-3">{isRtl ? "هاتف ولي الأمر" : "Parent Phone"}</th>
                    <th className="p-3">{isRtl ? "كلمة مرور الطالب" : "Student Password"}</th>
                    <th className="p-3">{isRtl ? "كلمة مرور ولي الأمر" : "Parent Password"}</th>
                    <th className="p-3 text-right">{isRtl ? "الإجراءات" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {activeList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                        {isRtl 
                          ? `لا يوجد طلاب مسجلون في تبويب ${cohortGenderTab === 'male' ? 'البنين' : 'البنات'} لهذه السنة الدراسية.` 
                          : `No students enrolled in the ${cohortGenderTab === 'male' ? 'Boys' : 'Girls'} tab for this year.`}
                      </td>
                    </tr>
                  ) : (
                    activeList.map((st) => {
                      const studentGrp = groups.find(g => g.id === st.groupId);
                      return (
                        <tr key={st.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <span className="font-extrabold text-slate-900 block">{st.name}</span>
                              {studentGrp && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                  {studentGrp.name || (isRtl ? `مجموعة ${studentGrp.groupNumber}` : `Group ${studentGrp.groupNumber}`)}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block">ID: {st.id}</span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800">{st.phone}</td>
                          <td className="p-3 font-mono text-slate-600">{st.parentPhone}</td>
                          <td className="p-3 font-mono font-extrabold text-blue-900 bg-blue-50/50 rounded p-1 text-center">
                            {st.password}
                          </td>
                          <td className="p-3 font-mono font-extrabold text-emerald-900 bg-emerald-50/50 rounded p-1 text-center">
                            {st.parentPassword || st.password}
                          </td>
                          <td className="p-3 text-right space-x-1">
                            <button
                              onClick={() => resetStudentPassword(st, 'student')}
                              className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-[10px] font-bold"
                              title="Reset student pass"
                            >
                              {isRtl ? "كلمة الطالب" : "Reset Stud"}
                            </button>
                            <button
                              onClick={() => resetStudentPassword(st, 'parent')}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[10px] font-bold"
                              title="Reset parent pass"
                            >
                              {isRtl ? "كلمة الولي" : "Reset Parent"}
                            </button>
                            <button
                              onClick={() => openStudentModal(st)}
                              className="p-1 text-slate-500 hover:text-slate-900"
                            >
                              <Edit2 className="h-3.5 w-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Cascading Confirmation */}
        {cascadeConfirmOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 space-y-4">
              <div className="flex items-center space-x-3 text-red-600">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-sm font-black uppercase">CRITICAL: Cascading Erasure Warning</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Deleting academic year <span className="font-bold text-red-600">'{cascadeConfirmOpen}'</span> will 
                permanently erase <span className="font-bold text-red-600">ALL students</span> currently registered in that intake year! This action is irreversible.
              </p>
              <div className="text-xs space-y-2">
                <label className="block text-slate-500 font-bold">To proceed, please type <span className="font-mono text-red-600 font-black">DELETE</span> below:</label>
                <input 
                  type="text" 
                  value={cascadeConfirmText}
                  onChange={(e) => setCascadeConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="w-full border border-red-200 rounded-xl p-2.5 focus:ring-2 focus:ring-red-500 text-center font-mono font-black text-red-600 bg-red-50/20"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 text-xs font-bold">
                <button
                  onClick={() => setCascadeConfirmOpen(null)}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  disabled={cascadeConfirmText !== 'DELETE'}
                  onClick={() => handleCascadeDeleteYear(cascadeConfirmOpen)}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-30"
                >
                  {loading === 'years_cascade' ? "Erasing..." : "Authorize Erasure"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // TAB 4: BULK ATTENDANCE EDITOR
  // ==========================================
  const [bulkAttYear, setBulkAttYear] = useState('');
  const [bulkAttGroupId, setBulkAttGroupId] = useState('all');
  const [bulkAttGroupSearch, setBulkAttGroupSearch] = useState('');
  const [bulkAttStudentSearch, setBulkAttStudentSearch] = useState('');
  const [bulkAttDate, setBulkAttDate] = useState(new Date().toISOString().substring(0, 10));
  const [bulkAttendanceState, setBulkAttendanceState] = useState<{ [studentPhone: string]: 'present' | 'absent' | 'late' }>({});

  useEffect(() => {
    if (years.length > 0 && !bulkAttYear) {
      setBulkAttYear(years[0].id);
    }
  }, [years, bulkAttYear]);

  // Read current attendance markers for chosen date & year and load them into bulk state
  const loadBulkAttendance = async () => {
    if (!bulkAttYear || !bulkAttDate) return;
    const studentsInYear = students.filter((s) => 
      s.academicYear === bulkAttYear && 
      s.enabled && 
      (!bulkAttGroupId || bulkAttGroupId === 'all' || s.groupId === bulkAttGroupId)
    );
    
    setLoading('load_bulk_att');
    try {
      // Find current records for this date
      const q = query(collection(db, "attendance"), where("date", "==", bulkAttDate));
      const snap = await getDocs(q);
      
      const map: { [phone: string]: 'present' | 'absent' | 'late' } = {};
      
      // Default present for all active students in that year & group
      studentsInYear.forEach((s) => {
        map[s.phone] = 'present';
      });

      snap.forEach((doc) => {
        const d = doc.data();
        if (map[d.studentPhone] !== undefined) {
          map[d.studentPhone] = d.status;
        }
      });

      setBulkAttendanceState(map);
      triggerAlert('success', isRtl ? `تم تحميل كشف الحضور للسنة/المجموعة المحددة في ${bulkAttDate}` : `Attendance sheet loaded for selected group on ${bulkAttDate}`);
    } catch (err: any) {
      triggerAlert('error', "Bulk fetch error: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const toggleBulkStatus = (phone: string, status: 'present' | 'absent' | 'late') => {
    setBulkAttendanceState((prev) => ({
      ...prev,
      [phone]: status
    }));
  };

  const saveBulkAttendance = async () => {
    setLoading('save_bulk_att');
    try {
      const batch = writeBatch(db);
      const studentKeys = Object.keys(bulkAttendanceState);

      for (const phone of studentKeys) {
        const student = students.find((s) => s.phone === phone);
        if (!student) continue;

        const attId = `${phone}_${bulkAttDate}`;
        const ref = doc(db, "attendance", attId);
        
        batch.set(ref, {
          id: attId,
          studentPhone: phone,
          studentName: student.name,
          date: bulkAttDate,
          status: bulkAttendanceState[phone]
        });
      }

      await batch.commit();
      triggerAlert('success', isRtl ? `تم حفظ غياب وحضور ${studentKeys.length} طالب/طالبة بنجاح` : `Bulk attendance saved for ${studentKeys.length} students on ${bulkAttDate}`);
    } catch (err: any) {
      triggerAlert('error', "Bulk save failed: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const markAllVisibleStudents = (status: 'present' | 'absent' | 'late') => {
    setBulkAttendanceState((prev) => {
      const updated = { ...prev };
      studentsInYearForAttendance.forEach((s) => {
        updated[s.phone] = status;
      });
      return updated;
    });
  };

  const availableGroupsForAttendance = groups.filter((g) => g.academicYear === bulkAttYear);

  const filteredGroupsForSelect = availableGroupsForAttendance.filter((g) => {
    if (!bulkAttGroupSearch.trim()) return true;
    const q = bulkAttGroupSearch.toLowerCase().trim();
    const nameMatch = (g.name || '').toLowerCase().includes(q);
    const numMatch = (g.groupNumber || '').toLowerCase().includes(q);
    const genderMatch = (g.gender === 'male' ? (isRtl ? 'بنين' : 'boys') : (isRtl ? 'بنات' : 'girls')).includes(q);
    return nameMatch || numMatch || genderMatch;
  });

  const studentsInYearForAttendance = students.filter((s) => {
    if (s.academicYear !== bulkAttYear || !s.enabled) return false;

    // Filter by group dropdown
    if (bulkAttGroupId && bulkAttGroupId !== 'all' && s.groupId !== bulkAttGroupId) {
      return false;
    }

    // Filter by group search text
    if (bulkAttGroupSearch.trim()) {
      const q = bulkAttGroupSearch.toLowerCase().trim();
      const studentGrp = groups.find(g => g.id === s.groupId);
      const grpName = (studentGrp?.name || '').toLowerCase();
      const grpNum = (studentGrp?.groupNumber || '').toLowerCase();
      const grpGender = studentGrp?.gender === 'male' ? (isRtl ? 'بنين' : 'boys') : (isRtl ? 'بنات' : 'girls');
      const matchesGrp = grpName.includes(q) || grpNum.includes(q) || grpGender.includes(q);
      if (!matchesGrp) return false;
    }

    // Filter by student search text
    if (bulkAttStudentSearch.trim()) {
      const q = bulkAttStudentSearch.toLowerCase().trim();
      const matchesName = s.name.toLowerCase().includes(q);
      const matchesPhone = s.phone.includes(q);
      const matchesParent = (s.parentPhone || '').includes(q);
      const studentGrp = groups.find(g => g.id === s.groupId);
      const matchesGrp = (studentGrp?.name || '').toLowerCase().includes(q) || (studentGrp?.groupNumber || '').toLowerCase().includes(q);
      if (!matchesName && !matchesPhone && !matchesParent && !matchesGrp) {
        return false;
      }
    }

    return true;
  });

  // Calculate real-time attendance statistics
  const totalStudentsCount = studentsInYearForAttendance.length;
  const presentCount = studentsInYearForAttendance.filter((s) => (bulkAttendanceState[s.phone] || 'present') === 'present').length;
  const absentCount = studentsInYearForAttendance.filter((s) => bulkAttendanceState[s.phone] === 'absent').length;
  const lateCount = studentsInYearForAttendance.filter((s) => bulkAttendanceState[s.phone] === 'late').length;
  const presentPercentage = totalStudentsCount > 0 ? Math.round((presentCount / totalStudentsCount) * 100) : 0;
  const areAllPresent = totalStudentsCount > 0 && presentCount === totalStudentsCount;

  const renderAttendance = () => {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
            {isRtl ? "تسجيل الحضور والغياب (حسب السنة والمجموعة)" : "Bulk Attendance Editor"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl ? "اختر السنة الدراسية، ابحث عن المجموعة، ثم حدد تاريخ اليوم لرصد الحضور والغياب." : "Submit attendance sheets in bulk by academic year and specific group."}
          </p>
        </div>

        {/* Configurations Box */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap gap-4 items-end text-xs">
          <div>
            <label className="text-slate-500 block mb-1 font-bold">{isRtl ? "السنة الدراسية" : "Academic Year"}</label>
            <select
              value={bulkAttYear}
              onChange={(e) => {
                setBulkAttYear(e.target.value);
                setBulkAttGroupId('all');
              }}
              className="border rounded-xl px-3 py-2 w-48 bg-white font-bold"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>

          {/* Group Search Box */}
          <div>
            <label className="text-slate-500 block mb-1 font-bold">
              {isRtl ? "🔍 البحث عن مجموعة" : "🔍 Search Group"}
            </label>
            <div className="relative w-52">
              <input
                type="text"
                placeholder={isRtl ? "ابحث باسم أو رقم المجموعة..." : "Group name, number..."}
                value={bulkAttGroupSearch}
                onChange={(e) => setBulkAttGroupSearch(e.target.value)}
                className="w-full border rounded-xl pl-3 pr-7 py-2 bg-white font-medium focus:ring-2 focus:ring-slate-900"
              />
              {bulkAttGroupSearch && (
                <button
                  type="button"
                  onClick={() => setBulkAttGroupSearch('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-700 font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-slate-500 block mb-1 font-bold">{isRtl ? "تحديد المجموعة" : "Group Filter"}</label>
            <select
              value={bulkAttGroupId}
              onChange={(e) => setBulkAttGroupId(e.target.value)}
              className="border rounded-xl px-3 py-2 w-56 bg-white font-bold"
            >
              <option value="all">{isRtl ? `جميع المجموعات (${filteredGroupsForSelect.length})` : `All Groups (${filteredGroupsForSelect.length})`}</option>
              {filteredGroupsForSelect.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.gender === 'male' ? '👦' : '👧'} {g.name || (isRtl ? `مجموعة ${g.groupNumber}` : `Group ${g.groupNumber}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Student Search Box inside sheet */}
          <div>
            <label className="text-slate-500 block mb-1 font-bold">
              {isRtl ? "🔍 تصفية الطلاب بالاسم" : "🔍 Filter Student"}
            </label>
            <div className="relative w-52">
              <input
                type="text"
                dir="auto"
                autoCapitalize="none"
                placeholder={isRtl ? "اسم الطالب، الهاتف..." : "Student name, phone..."}
                value={bulkAttStudentSearch}
                onChange={(e) => setBulkAttStudentSearch(e.target.value)}
                className="w-full border rounded-xl pl-3 pr-7 py-2 bg-white font-medium focus:ring-2 focus:ring-slate-900"
              />
              {bulkAttStudentSearch && (
                <button
                  type="button"
                  onClick={() => setBulkAttStudentSearch('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-700 font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-slate-500 block mb-1 font-bold">{isRtl ? "التاريخ" : "Pick Date"}</label>
            <input
              type="date"
              value={bulkAttDate}
              onChange={(e) => setBulkAttDate(e.target.value)}
              className="border rounded-xl px-3 py-2 w-44 bg-white font-mono"
            />
          </div>

          <button
            onClick={loadBulkAttendance}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center space-x-1"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{isRtl ? "تحميل كشف الحضور" : "Load Sheet"}</span>
          </button>
        </div>

        {/* Attendance checklist sheet */}
        {Object.keys(bulkAttendanceState).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm space-y-4">
            {/* Real-time Summary Counter Banner */}
            <div className="p-4 bg-slate-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                    {isRtl ? "ملخص الحضور المباشر" : "Real-time Attendance Summary"}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {presentPercentage}% {isRtl ? "نسبة الحضور" : "Attendance Rate"}
                  </span>
                </div>
                <div className="flex items-center space-x-3 space-x-reverse text-sm font-extrabold">
                  <span className="text-emerald-400">
                    {isRtl ? `حاضر: ${presentCount} / ${totalStudentsCount}` : `Present: ${presentCount} / ${totalStudentsCount}`}
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-red-400">
                    {isRtl ? `غائب: ${absentCount}` : `Absent: ${absentCount}`}
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-amber-400">
                    {isRtl ? `متأخر: ${lateCount}` : `Late: ${lateCount}`}
                  </span>
                </div>
              </div>

              {/* Progress bar and Toggle button */}
              <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Visual Progress Bar */}
                <div className="w-full md:w-44 bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${presentPercentage}%` }}
                  />
                </div>

                {/* Mark All Present Toggle Button */}
                <button
                  type="button"
                  onClick={() => markAllVisibleStudents(areAllPresent ? 'absent' : 'present')}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 space-x-reverse shadow-sm ${
                    areAllPresent
                      ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 ring-2 ring-emerald-300'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  <span className="text-sm">{areAllPresent ? '✓' : '⚡'}</span>
                  <span>
                    {areAllPresent
                      ? (isRtl ? "الكل حاضر (انقر للتغيير)" : "All Marked Present (Toggle)")
                      : (isRtl ? "✓ تحديد الجميع كـ حاضر" : "✓ Mark All Present")}
                  </span>
                </button>
              </div>
            </div>

            {/* Sheet Control Header & Mass Actions */}
            <div className="p-4 bg-slate-50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <span className="text-xs font-black text-slate-800">
                  {isRtl 
                    ? `عدد الطلاب المعروضين: ${studentsInYearForAttendance.length} طالب` 
                    : `Showing ${studentsInYearForAttendance.length} student(s)`}
                </span>
                {(bulkAttGroupSearch || bulkAttStudentSearch || bulkAttGroupId !== 'all') && (
                  <span className="text-[11px] text-blue-600 block font-bold mt-0.5">
                    {isRtl ? "تم تطبيق فلاتر البحث والفلترة للمجموعات والطلاب" : "Search & group filters active"}
                  </span>
                )}
              </div>

              {/* Mass Actions buttons */}
              <div className="flex items-center space-x-2 text-[11px] font-bold">
                <span className="text-slate-500 hidden sm:inline">{isRtl ? "تحديد سريع:" : "Quick actions:"}</span>
                <button
                  type="button"
                  onClick={() => markAllVisibleStudents('present')}
                  className="px-3 py-1.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg transition-all"
                >
                  {isRtl ? "✓ تحديد المعروضين كـ حاضر" : "✓ Mark All Present"}
                </button>
                <button
                  type="button"
                  onClick={() => markAllVisibleStudents('absent')}
                  className="px-3 py-1.5 bg-red-100 text-red-800 hover:bg-red-200 rounded-lg transition-all"
                >
                  {isRtl ? "✕ تحديد المعروضين كـ غائب" : "✕ Mark All Absent"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="p-4">{isRtl ? "اسم الطالب والمجموعة" : "Student Name & Group"}</th>
                    <th className="p-4">{isRtl ? "رقم الهاتف" : "Phone Contact"}</th>
                    <th className="p-4">{isRtl ? "حالة الحضور اليومية" : "Daily Attendance Toggle"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {studentsInYearForAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-400 italic">
                        {isRtl 
                          ? "لا يوجد طلاب يطابقون شروط البحث أو الفلترة الحالية." 
                          : "No students found matching the selected group or search query."}
                      </td>
                    </tr>
                  ) : (
                    studentsInYearForAttendance.map((student) => {
                      const currentStatus = bulkAttendanceState[student.phone] || 'present';
                      const studentGrp = groups.find(g => g.id === student.groupId);
                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50">
                          <td className="p-4">
                            <span className="font-extrabold text-slate-900 block">{student.name}</span>
                            {studentGrp && (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200 mt-0.5">
                                {studentGrp.name || (isRtl ? `مجموعة ${studentGrp.groupNumber}` : `Group ${studentGrp.groupNumber}`)}
                              </span>
                            )}
                          </td>
                          <td className="p-4 font-mono">{student.phone}</td>
                          <td className="p-4">
                            <div className="flex space-x-2">
                              {(['present', 'absent', 'late'] as const).map((status) => (
                                <button
                                  key={status}
                                  onClick={() => toggleBulkStatus(student.phone, status)}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                    currentStatus === status
                                      ? status === 'present' ? 'bg-emerald-600 text-white' :
                                        status === 'absent' ? 'bg-red-600 text-white' :
                                        'bg-yellow-500 text-white'
                                      : 'bg-gray-100 text-slate-500 hover:bg-gray-200'
                                  }`}
                                >
                                  {status === 'present' ? (isRtl ? "حاضر" : "Present") :
                                   status === 'absent' ? (isRtl ? "غائب" : "Absent") :
                                   (isRtl ? "متأخر" : "Late")}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-50 flex justify-end">
              <button
                onClick={saveBulkAttendance}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-sm"
              >
                {loading === 'save_bulk_att' ? (isRtl ? "جاري الحفظ..." : "Saving Sheets...") : (isRtl ? "حفظ كشف الحضور والغياب" : "Save Daily Attendance Sheet")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // TAB 5: EXAMS & GRADES MANAGER
  // ==========================================
  const [examNameInput, setExamNameInput] = useState('');
  const [examDateInput, setExamDateInput] = useState(new Date().toISOString().substring(0, 10));
  const [examTotalInput, setExamTotalInput] = useState('100');
  const [examCohort, setExamCohort] = useState('');

  // Selected exam to grade
  const [activeGradeExam, setActiveGradeExam] = useState<string>('');
  const [studentGradesState, setStudentGradesState] = useState<{ [studentPhone: string]: string }>({});
  const [gradeYearFilter, setGradeYearFilter] = useState('all');
  const [gradeGroupFilter, setGradeGroupFilter] = useState('all');
  const [gradeStudentSearch, setGradeStudentSearch] = useState('');

  useEffect(() => {
    if (years.length > 0 && !examCohort) {
      setExamCohort(years[0].id);
    }
  }, [years, examCohort]);

  // Unique exams registered in the DB
  const examsList = Array.from(new Set(grades.map((g) => g.examName))) as string[];

  const handleLoadExamSheet = async (examName: string) => {
    setActiveGradeExam(examName);
    
    // Default values
    const map: { [phone: string]: string } = {};
    students.forEach((s) => {
      map[s.phone] = '';
    });

    // Populate existing
    const records = grades.filter((g) => g.examName === examName);
    records.forEach((r) => {
      map[r.studentPhone] = r.score.toString();
    });

    setStudentGradesState(map);
  };

  const handleSaveExamScores = async () => {
    if (!activeGradeExam) return;
    setLoading('save_exam_scores');
    
    try {
      const batch = writeBatch(db);
      const studentKeys = Object.keys(studentGradesState);

      for (const phone of studentKeys) {
        const scoreStr = studentGradesState[phone];
        if (scoreStr === '') continue; // Skip unentered scores

        const student = students.find((s) => s.phone === phone);
        if (!student) continue;

        // Find existing record id or generate one
        const existingRecord = grades.find((g) => g.examName === activeGradeExam && g.studentPhone === phone);
        const recordId = existingRecord ? existingRecord.id : `g_${Math.random().toString(36).substring(2, 9)}`;

        const ref = doc(db, "grades", recordId);
        batch.set(ref, {
          id: recordId,
          examName: activeGradeExam,
          examDate: examDateInput,
          totalMarks: parseFloat(examTotalInput),
          studentPhone: phone,
          studentName: student.name,
          score: parseFloat(scoreStr)
        });
      }

      await batch.commit();
      triggerAlert('success', isRtl ? `تم حفظ الدرجات للامتحان '${activeGradeExam}' بنجاح` : `Exam scores updated successfully for '${activeGradeExam}'`);
    } catch (err: any) {
      triggerAlert('error', "Failed to save exam sheets: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const renderGrades = () => {
    const filteredStudentsForGrading = students.filter((s) => {
      if (!s.enabled) return false;

      if (gradeStudentSearch.trim() !== '') {
        const matchesSearch = matchesSearchQuery(gradeStudentSearch, s.name, s.phone, s.parentPhone, s.studentCode);
        if (!matchesSearch) {
          return false;
        }
      }

      if (gradeYearFilter && gradeYearFilter !== 'all' && s.academicYear !== gradeYearFilter) {
        return false;
      }

      if (gradeGroupFilter && gradeGroupFilter !== 'all' && s.groupId !== gradeGroupFilter) {
        return false;
      }

      return true;
    });

    const groupsForGradeYear = groups.filter(g => !gradeYearFilter || gradeYearFilter === 'all' || g.academicYear === gradeYearFilter);

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
            {isRtl ? "إدارة الامتحانات والدرجات (حسب السنة والمجموعة)" : "Grades & Exams Manager"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl ? "إضافة الامتحانات ورصد درجات الطلاب حسب السنة والمجموعة المدرسية أو البحث عن طالب محدد." : "Publish midterm scorecards and view performance distributions."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Create Exam */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 h-fit text-xs">
            <h3 className="text-xs font-black text-slate-900 uppercase">{isRtl ? "إنشاء اختبار جديد" : "Publish New Exam Panel"}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-slate-500 block mb-1">{isRtl ? "اسم الامتحان / المادة" : "Exam Name / Subject Code"}</label>
                <input 
                  type="text"
                  placeholder={isRtl ? "مثال: اختبار الشهر الأول" : "e.g. Physics Midterm 2026"}
                  value={examNameInput}
                  onChange={(e) => setExamNameInput(e.target.value)}
                  className="w-full border rounded-xl p-2 focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-500 block mb-1">{isRtl ? "الدرجة الكلية" : "Max Score possible"}</label>
                  <input 
                    type="number"
                    value={examTotalInput}
                    onChange={(e) => setExamTotalInput(e.target.value)}
                    className="w-full border rounded-xl p-2"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">{isRtl ? "تاريخ الامتحان" : "Exam Date"}</label>
                  <input 
                    type="date"
                    value={examDateInput}
                    onChange={(e) => setExamDateInput(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2 font-mono"
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  if (examNameInput) {
                    handleLoadExamSheet(examNameInput);
                    triggerAlert('success', isRtl ? `تم فتح كشف الدرجات لـ '${examNameInput}'. رصد الدرجات أدناه.` : `Scorecard table initialized for '${examNameInput}'. Fill out scores below.`);
                  }
                }}
                className="w-full py-2 bg-slate-950 text-white rounded-xl font-bold hover:bg-slate-850"
              >
                {isRtl ? "فتح كشف رصد الدرجات" : "Initialize Grading Sheet"}
              </button>
            </div>
          </div>

          {/* List of current exams & grading form */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Exam selector */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
              <h3 className="text-xs font-black text-slate-900 uppercase mb-3">{isRtl ? "الامتحانات النشطة المسجلة" : "Active Exams Registry"}</h3>
              <div className="flex flex-wrap gap-2">
                {examsList.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3">{isRtl ? "لا توجد امتحانات مضافة حتى الآن." : "No exams compiled yet. Use the sidebar left to launch."}</p>
                ) : (
                  examsList.map((exam) => (
                    <button
                      key={exam}
                      onClick={() => handleLoadExamSheet(exam)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        activeGradeExam === exam 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                          : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      {exam}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Score inputs */}
            {activeGradeExam && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-xs">
                <div className="p-4 border-b border-gray-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <h3 className="font-bold text-slate-900">{isRtl ? "رصد درجات اختبار: " : "Grading scores: "}<span className="text-emerald-600 font-extrabold">{activeGradeExam}</span></h3>
                  <span className="text-[10px] text-gray-400 font-mono">{isRtl ? "الدرجة القصوى: " : "Max Marks: "}{examTotalInput}</span>
                </div>

                {/* Search and Filters for Student, Year and Group */}
                <div className="p-3 bg-slate-100/60 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                  {/* Student Search Box */}
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-slate-500 block mb-1 font-bold text-[10px]">
                      {isRtl ? "🔍 البحث عن طالب (الاسم، الهاتف، الكود)" : "🔍 Search Student (Name, Phone, Code)"}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={isRtl ? "ابحث باسم الطالب، رقم الهاتف..." : "Search student name, phone..."}
                        value={gradeStudentSearch}
                        onChange={(e) => setGradeStudentSearch(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 bg-white font-medium text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                      {gradeStudentSearch && (
                        <button
                          type="button"
                          onClick={() => setGradeStudentSearch('')}
                          className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-700 font-bold text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <div>
                      <label className="text-slate-500 block mb-1 font-bold text-[10px]">{isRtl ? "السنة الدراسية" : "Filter Year"}</label>
                      <select
                        value={gradeYearFilter}
                        onChange={(e) => {
                          setGradeYearFilter(e.target.value);
                          setGradeGroupFilter('all');
                        }}
                        className="border rounded-lg px-2.5 py-1.5 bg-white font-bold text-xs"
                      >
                        <option value="all">{isRtl ? "جميع السنوات" : "All Years"}</option>
                        {years.map(y => (
                          <option key={y.id} value={y.id}>{y.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1 font-bold text-[10px]">{isRtl ? "المجموعة المدرسية" : "Filter Group"}</label>
                      <select
                        value={gradeGroupFilter}
                        onChange={(e) => setGradeGroupFilter(e.target.value)}
                        className="border rounded-lg px-2.5 py-1.5 bg-white font-bold text-xs"
                      >
                        <option value="all">{isRtl ? "جميع المجموعات" : "All Groups"}</option>
                        {groupsForGradeYear.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.gender === 'male' ? '👦' : '👧'} {g.name || (isRtl ? `مجموعة ${g.groupNumber}` : `Group ${g.groupNumber}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Counter bar */}
                <div className="px-4 py-2 bg-slate-50 text-[11px] text-slate-600 flex justify-between items-center border-b border-gray-100 font-bold">
                  <span>
                    {isRtl ? `عدد الطلاب المعروضين: ${filteredStudentsForGrading.length}` : `Showing ${filteredStudentsForGrading.length} student(s)`}
                  </span>
                  {gradeStudentSearch && (
                    <button
                      onClick={() => setGradeStudentSearch('')}
                      className="text-blue-600 hover:underline text-[10px]"
                    >
                      {isRtl ? "إلغاء فلتر البحث ✕" : "Clear search filter ✕"}
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 p-4 space-y-2">
                  {filteredStudentsForGrading.length === 0 ? (
                    <p className="text-center text-slate-400 py-6 italic">
                      {gradeStudentSearch
                        ? (isRtl ? "لا يوجد طالب يطابق نتيجة البحث." : "No student matching search criteria.")
                        : (isRtl ? "لا يوجد طلاب ينطبق عليهم هذا الفلتر." : "No students match this year/group filter.")}
                    </p>
                  ) : (
                    filteredStudentsForGrading.map((student) => {
                      const studentGrp = groups.find(g => g.id === student.groupId);
                      const studentYr = years.find(y => y.id === student.academicYear);
                      return (
                        <div key={student.id} className="flex justify-between items-center py-2 hover:bg-slate-50/80 px-2 rounded-lg transition-all">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-extrabold text-slate-900 block">{student.name}</span>
                              {studentYr && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                                  {studentYr.name}
                                </span>
                              )}
                              {studentGrp && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                  {studentGrp.name || (isRtl ? `مجموعة ${studentGrp.groupNumber}` : `Group ${studentGrp.groupNumber}`)}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono">Phone: {student.phone}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              placeholder="Score"
                              value={studentGradesState[student.phone] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setStudentGradesState((prev) => ({
                                  ...prev,
                                  [student.phone]: val
                                }));
                              }}
                              className="border rounded-xl px-3 py-1.5 w-24 text-center font-bold bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                            />
                            <span className="text-slate-400 font-mono">/ {examTotalInput}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-slate-50/50 flex justify-end">
                  <button
                    onClick={handleSaveExamScores}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
                  >
                    {loading === 'save_exam_scores' ? (isRtl ? "جاري الحفظ..." : "Saving Scorecard...") : (isRtl ? "حفظ ونشر الدرجات" : "Publish Scores")}
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    );
  };

  // ==========================================
  // TAB 6: VIDEO MANAGEMENT (Bunny Stream)
  // ==========================================
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoType | null>(null);

  // Video Fields
  const [vidTitle, setVidTitle] = useState('');
  const [vidDesc, setVidDesc] = useState('');
  const [vidCfId, setVidCfId] = useState('');
  const [vidThumb, setVidThumb] = useState('');
  const [vidDuration, setVidDuration] = useState('');
  const [vidYearId, setVidYearId] = useState('');
  const [vidCategory, setVidCategory] = useState('');
  const [vidOrder, setVidOrder] = useState('1');
  const [vidVisibility, setVidVisibility] = useState<'public' | 'hidden'>('public');
  const [vidSigned, setVidSigned] = useState(true);

  // Signed URL previewer
  const [signedPreviewUrl, setSignedPreviewUrl] = useState('');
  const [signingProgress, setSigningProgress] = useState(false);

  const openVideoModal = (video?: VideoType) => {
    if (video) {
      setEditingVideo(video);
      setVidTitle(video.title);
      setVidDesc(video.description);
      setVidCfId(video.cloudflareId);
      setVidThumb(video.thumbnailUrl);
      setVidDuration(video.duration);
      setVidYearId(video.academicYear);
      setVidCategory(video.category);
      setVidOrder(video.displayOrder.toString());
      setVidVisibility(video.visibility);
      setVidSigned(video.signedUrl);
    } else {
      setEditingVideo(null);
      setVidTitle('');
      setVidDesc('');
      setVidCfId('');
      setVidThumb('');
      setVidDuration('auto');
      setVidYearId(years[0]?.id || '');
      setVidCategory('Mathematics');
      setVidOrder('1');
      setVidVisibility('public');
      setVidSigned(true);
    }
    setSignedPreviewUrl('');
    setVideoModalOpen(true);
  };

  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vidTitle || !vidCfId || !vidYearId) {
      triggerAlert('error', 'Title, Bunny Video ID, and Academic Year are required.');
      return;
    }

    setLoading('video');
    const videoId = editingVideo ? editingVideo.id : `vid_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const payload: VideoType = {
        id: videoId,
        title: vidTitle,
        description: vidDesc,
        cloudflareId: vidCfId,
        thumbnailUrl: vidThumb || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600",
        duration: vidDuration,
        academicYear: vidYearId,
        category: vidCategory,
        displayOrder: parseInt(vidOrder),
        visibility: vidVisibility,
        signedUrl: vidSigned
      };

      await setDoc(doc(db, "videos", videoId), payload);
      triggerAlert('success', `Lecture video published successfully.`);
      setVideoModalOpen(false);
    } catch (err: any) {
      triggerAlert('error', "Failed to publish video: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteVideo = (id: string, title: string) => {
    setConfirmModal({
      isOpen: true,
      title: isRtl ? "حذف المحاضرة" : "Delete Lecture Video",
      message: `${t.videoConfirmDelete}\n(${title})`,
      confirmBtnText: isRtl ? "حذف نهائي" : "Delete Video",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "videos", id));
          triggerAlert('success', isRtl ? "تم حذف المحاضرة بنجاح." : "Video deleted successfully.");
        } catch (err: any) {
          triggerAlert('error', "Deletion error: " + err.message);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Securely generate signed URL from Express server
  const generateSignedURL = async (videoId: string) => {
    setSigningProgress(true);
    setSignedPreviewUrl('');
    try {
      const res = await fetch(getApiUrl("/api/bunny/sign"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId })
      });
      const data = await res.json();
      if (data.success) {
        setSignedPreviewUrl(data.signedPlaybackUrl);
        triggerAlert('success', "Bunny Stream play token secured successfully.");
      } else {
        triggerAlert('error', "Bunny Stream server failed to issue play token.");
      }
    } catch (err: any) {
      triggerAlert('error', "Connection issue signing playback URL.");
    } finally {
      setSigningProgress(false);
    }
  };

  const renderVideos = () => {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Bunny Stream Management</h2>
            <p className="text-xs text-slate-500 mt-1">Configure signed stream DRM parameters and upload assets pointers.</p>
          </div>
          <button
            onClick={() => openVideoModal()}
            className="flex items-center space-x-1 py-2 px-4 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Publish Lecture</span>
          </button>
        </div>

        {/* Videos Table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="p-4">Video details</th>
                  <th className="p-4">Intake cohort</th>
                  <th className="p-4">Bunny Video ID</th>
                  <th className="p-4">DRM Type</th>
                  <th className="p-4">Visibility</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {videos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400 italic">No videos uploaded yet.</td>
                  </tr>
                ) : (
                  videos.map((vid) => (
                    <tr key={vid.id} className="hover:bg-slate-50/50">
                      <td className="p-4 flex items-center space-x-3 space-x-reverse">
                        <div 
                          onClick={() => setWatchingVideo(vid)}
                          className="relative w-16 h-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 flex-shrink-0 cursor-pointer group shadow-xs"
                          title={isRtl ? "انقر لمشاهدة المحاضرة" : "Click to watch lecture"}
                        >
                          <img 
                            src={vid.thumbnailUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600"} 
                            className="w-full h-full object-cover group-hover:scale-105 group-hover:opacity-75 transition-all duration-200" 
                            alt="Thumb"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 flex items-center justify-center transition-colors">
                            <div className="w-6 h-6 rounded-full bg-indigo-600 group-hover:bg-indigo-500 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                              <Play className="h-3 w-3 fill-current ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <div>
                          <span 
                            onClick={() => setWatchingVideo(vid)}
                            className="font-extrabold text-slate-900 hover:text-indigo-600 block cursor-pointer transition-colors"
                            title={isRtl ? "انقر للمشاهدة" : "Click to watch"}
                          >
                            {vid.title}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{t.playlistLabel}: {vid.category} • {isRtl ? "المدة" : "Duration"}: {vid.duration === 'auto' ? (isRtl ? "تلقائي" : "Auto") : vid.duration}</span>
                        </div>
                      </td>
                      <td className="p-4 font-bold text-slate-700">
                        {years.find(y => y.id === vid.academicYear)?.name || `Year ${vid.academicYear}`}
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-600">{vid.cloudflareId}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                          vid.signedUrl ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-slate-500'
                        }`}>
                          {vid.signedUrl ? 'SECURED DRM (SIGNED)' : 'PUBLIC ID'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                          vid.visibility === 'public' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {vid.visibility.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2 space-x-reverse">
                        <button
                          onClick={() => setWatchingVideo(vid)}
                          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                          title={isRtl ? "مشاهدة الفيديو" : "Watch Lecture"}
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>{isRtl ? "مشاهدة" : "Watch"}</span>
                        </button>
                        <button
                          onClick={() => generateSignedURL(vid.cloudflareId)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold text-slate-700"
                        >
                          Sign Player URL
                        </button>
                        <button
                          onClick={() => openVideoModal(vid)}
                          className="p-1 text-slate-500 hover:text-slate-900"
                        >
                          <Edit2 className="h-4 w-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDeleteVideo(vid.id, vid.title)}
                          className="p-1 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Secure Signed Playback token previewer */}
        {signedPreviewUrl && (
          <div className="bg-slate-950 text-white p-5 rounded-2xl border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center text-emerald-400 font-bold">
              <span>[SECURE SHA256 DRM KEY ISSUED]</span>
              <button onClick={() => setSignedPreviewUrl('')} className="text-white hover:text-red-400">Close</button>
            </div>
            <div className="text-slate-400 text-[11px] leading-relaxed">
              This url contains the cryptographically signed JWT authorized by our Express backend service. 
              The private Bunny Stream security key is never exposed to client storage.
            </div>
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 select-all break-all text-[11px] font-bold text-slate-300">
              {signedPreviewUrl}
            </div>
          </div>
        )}

        {/* Modal: Publish Video */}
        {videoModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 text-xs">
              <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider mb-4">
                {editingVideo ? `Edit Video Configuration` : "Publish Educational Video Pointer"}
              </h3>
              <form onSubmit={handleSaveVideo} className="space-y-4">
                <div>
                  <label className="block text-slate-500 mb-1">Video Title</label>
                  <input
                    type="text"
                    required
                    value={vidTitle}
                    onChange={(e) => setVidTitle(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900"
                    placeholder="Enter lecture title"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={vidDesc}
                    onChange={(e) => setVidDesc(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2.5"
                    placeholder="Brief syllabus description"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Bunny Video ID (or library_id/video_id)</label>
                  <input
                    type="text"
                    required
                    value={vidCfId}
                    onChange={(e) => setVidCfId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2.5 font-mono text-xs"
                    placeholder="e.g. video_id or library_id/video_id"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">Thumbnail URL</label>
                    <input
                      type="text"
                      value={vidThumb}
                      onChange={(e) => setVidThumb(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-2.5"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">{t.playlistLabel}</label>
                    <input
                      type="text"
                      required
                      value={vidCategory}
                      onChange={(e) => setVidCategory(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-2.5"
                      placeholder={t.playlistPlaceholder}
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {["ادب الجزء الاول", "قواعد الاستفهام", "النفي", "التعجب"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setVidCategory(preset)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold text-slate-700 cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">Target Cohort</label>
                    <select
                      value={vidYearId}
                      onChange={(e) => setVidYearId(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-2.5 bg-white font-bold"
                    >
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>{y.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Visibility</label>
                    <select
                      value={vidVisibility}
                      onChange={(e: any) => setVidVisibility(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-2.5 bg-white font-bold"
                    >
                      <option value="public">Public</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">DRM Token</label>
                    <select
                      value={vidSigned ? 'true' : 'false'}
                      onChange={(e) => setVidSigned(e.target.value === 'true')}
                      className="w-full border border-gray-200 rounded-xl p-2.5 bg-white font-bold"
                    >
                      <option value="true">Signed DRM</option>
                      <option value="false">Public ID</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setVideoModalOpen(false)}
                    className="px-4 py-2 border rounded-xl hover:bg-gray-50 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-950 text-white rounded-xl hover:bg-slate-850 font-bold"
                  >
                    {loading === 'video' ? "Publishing..." : "Publish Video"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  };

  // ==========================================
  // TAB 7: ADMINISTRATIVE ACCOUNTS
  // ==========================================
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [admName, setAdmName] = useState('');
  const [admPhone, setAdmPhone] = useState('');
  const [admPassword, setAdmPassword] = useState('');
  const [admPerms, setAdmPerms] = useState<string[]>(["manage_students"]);
  const [admIsSuperAdmin, setAdmIsSuperAdmin] = useState(false);

  const togglePermission = (perm: string) => {
    setAdmPerms((prev) => 
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admName || !admPhone || !admPassword) return;

    setLoading('admin');
    try {
      const payload: AdminUser = {
        id: admPhone,
        name: admName,
        phone: admPhone,
        password: admPassword,
        permissions: admPerms,
        isSuperAdmin: admIsSuperAdmin
      };

      await setDoc(doc(db, "admins", admPhone), payload);
      triggerAlert('success', `Coordinator admin account '${admName}' successfully registered.`);
      setAdminModalOpen(false);
      setAdmName('');
      setAdmPhone('');
      setAdmPassword('');
      setAdmIsSuperAdmin(false);
    } catch (err: any) {
      triggerAlert('error', "Failed to create administrator: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleToggleSuperAdmin = async (id: string, isSuper: boolean) => {
    if (id === phone) {
      triggerAlert('error', "Critical security alert: Cannot change your own Super Admin tier.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: isRtl ? "تعديل رتبة المشرف" : "Modify Admin Security Tier",
      message: isSuper
        ? (isRtl ? `هل أنت متأكد من ترقية المشرف ليكون "مدير نظام أول"؟ سيمنحه هذا صلاحيات كاملة.` : `Are you sure you want to grant SUPER ADMIN tier to this coordinator account?`)
        : (isRtl ? `هل تريد سحب رتبة "مدير نظام أول" وإرجاع الحساب إلى مشرف عادي؟` : `Are you sure you want to revoke SUPER ADMIN status and return this account to a standard staff coordinator?`),
      confirmBtnText: isRtl ? "تحديث الرتبة" : "Confirm Tier Change",
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "admins", id), {
            isSuperAdmin: isSuper
          });
          triggerAlert('success', isRtl ? "تم تحديث رتبة المشرف بنجاح." : "Admin security tier updated successfully.");
        } catch (err: any) {
          triggerAlert('error', "Update error: " + err.message);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await setDoc(doc(db, "config", "communication"), {
        phone: supportPhone,
        whatsapp: supportWhatsapp,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      triggerAlert('success', isRtl ? "تم حفظ أرقام التواصل والدعم بنجاح." : "Support contact numbers saved successfully.");
    } catch (err: any) {
      triggerAlert('error', "Failed to save configuration: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeleteAdmin = (id: string, name: string) => {
    if (id === phone) {
      triggerAlert('error', "Critical security alert: Cannot delete your own administrative session.");
      return;
    }
    const adminToDelete = admins.find(a => a.id === id);
    if (adminToDelete?.isSuperAdmin) {
      triggerAlert('error', "Critical security alert: Super Admin roles cannot be modified.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: isRtl ? "إلغاء صلاحيات المشرف" : "Revoke Coordinator Rights",
      message: `${t.adminConfirmDelete}\n(${name})`,
      confirmBtnText: isRtl ? "إلغاء الصلاحيات" : "Revoke Rights",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "admins", id));
          triggerAlert('success', isRtl ? `تم إلغاء صلاحيات المشرف '${name}' بنجاح.` : `Administrator credentials revoked for '${name}'`);
        } catch (err: any) {
          triggerAlert('error', "Database error: " + err.message);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const renderAdmins = () => {
    return (
      <div className="space-y-6">
        {/* Help & Communication Numbers Section */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900">
            <HelpCircle className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              {isRtl ? "أرقام الدعم والتواصل والمساعدة" : "Help & Communication Numbers"}
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            {isRtl ? "تعديل أرقام الهواتف والواتساب التي تظهر للطلاب وأولياء الأمور في قسم المساعدة والتواصل." : "Configure help hotline and WhatsApp numbers visible to students and parents."}
          </p>
          <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                {isRtl ? "رقم هاتف المساعدة والدعم" : "Help Desk Phone Number"}
              </label>
              <input
                type="text"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                placeholder="0500000000"
                className="w-full border border-gray-200 rounded-xl p-2.5 font-mono focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                {isRtl ? "رقم الواتساب للتواصل" : "WhatsApp Communication Number"}
              </label>
              <input
                type="text"
                value={supportWhatsapp}
                onChange={(e) => setSupportWhatsapp(e.target.value)}
                placeholder="+966500000000"
                className="w-full border border-gray-200 rounded-xl p-2.5 font-mono focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={savingConfig}
                className="w-full md:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold transition-all shadow-sm disabled:opacity-50"
              >
                {savingConfig ? (isRtl ? "جاري الحفظ..." : "Saving Numbers...") : (isRtl ? "حفظ أرقام التواصل" : "Save Support Numbers")}
              </button>
            </div>
          </form>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
              {isRtl ? "إدارة صلاحيات المشرفين" : "Administrative Privileges"}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isRtl ? "إدارة حسابات المشرفين، منح أو سحب رتبة مدير نظام أول (Super Admin)، وتحديد الصلاحيات." : "Manage platform coordinators, grant super admin roles, or set permissions."}
            </p>
          </div>
          <button
            onClick={() => setAdminModalOpen(true)}
            className="flex items-center space-x-1 py-2 px-4 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? "إضافة مشرف جديد" : "Grant Admin Rights"}</span>
          </button>
        </div>

        {/* Admins list table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100 text-slate-500 font-bold uppercase tracking-wider">
                <th className="p-4">Staff Name</th>
                <th className="p-4">Contact Phone</th>
                <th className="p-4">Assigned Permissions</th>
                <th className="p-4">Security Tier</th>
                <th className="p-4 text-right">Revoke Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
              {admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-slate-50/50">
                  <td className="p-4 font-extrabold text-slate-900">{admin.name}</td>
                  <td className="p-4 font-mono">{admin.phone}</td>
                  <td className="p-4 flex flex-wrap gap-1">
                    {admin.permissions.map((p) => (
                      <span key={p} className="px-1.5 py-0.5 bg-slate-100 text-[10px] text-slate-600 rounded font-mono font-bold">
                        {p}
                      </span>
                    ))}
                  </td>
                  <td className="p-4 font-bold text-slate-800">
                    {admin.isSuperAdmin ? (
                      <button
                        type="button"
                        disabled={admin.id === phone}
                        onClick={() => handleToggleSuperAdmin(admin.id, false)}
                        className="text-red-600 font-black flex items-center space-x-1 hover:bg-red-50 px-2 py-1.5 rounded-lg border border-red-100 transition-colors cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed"
                        title={admin.id === phone ? "Your active super admin session" : "Click to demote to Staff Coordinator"}
                      >
                        <ShieldAlert className="h-3.5 w-3.5 inline text-red-500" />
                        <span>SUPER ADMIN</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleSuperAdmin(admin.id, true)}
                        className="text-slate-600 font-semibold hover:bg-slate-100 hover:text-slate-900 px-2 py-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                        title="Click to promote to Super Admin"
                      >
                        <span>Staff Coordinator</span>
                      </button>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      disabled={admin.isSuperAdmin || admin.id === phone}
                      onClick={() => handleDeleteAdmin(admin.id, admin.name)}
                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold disabled:opacity-30"
                    >
                      Revoke Rights
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal: Add Admin */}
        {adminModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 text-xs">
              <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider mb-4">
                Register Administrator Credentials
              </h3>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div>
                  <label className="block text-slate-500 mb-1">Coordinator Name</label>
                  <input
                    type="text"
                    required
                    value={admName}
                    onChange={(e) => setAdmName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900"
                    placeholder="Enter coordinator full name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">Phone Number (Login ID)</label>
                    <input
                      type="text"
                      required
                      value={admPhone}
                      onChange={(e) => setAdmPhone(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-2.5 font-mono"
                      placeholder="e.g. 055555555"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Set Password</label>
                    <input
                      type="text"
                      required
                      value={admPassword}
                      onChange={(e) => setAdmPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-2.5 font-mono"
                      placeholder="StaffPassword123"
                    />
                  </div>
                </div>

                <div className="bg-red-50/50 border border-red-100 rounded-xl p-3 space-y-2">
                  <label className="flex items-start space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="mt-0.5 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                      checked={admIsSuperAdmin}
                      onChange={(e) => setAdmIsSuperAdmin(e.target.checked)}
                    />
                    <div className="text-[11px]">
                      <span className="font-extrabold text-red-700 block">Grant Super Admin Privileges</span>
                      <span className="text-slate-500 leading-normal">Gives full administrative access to all modules, system configurations, and staff accounts.</span>
                    </div>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block text-slate-500 font-bold">Assigned Roles and Permissions</label>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
                    <label className="flex items-center space-x-2 p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
                      <input 
                        type="checkbox" 
                        checked={admPerms.includes("manage_students")}
                        onChange={() => togglePermission("manage_students")}
                      />
                      <span>Manage Students</span>
                    </label>
                    <label className="flex items-center space-x-2 p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
                      <input 
                        type="checkbox" 
                        checked={admPerms.includes("manage_videos")}
                        onChange={() => togglePermission("manage_videos")}
                      />
                      <span>Manage Videos</span>
                    </label>
                    <label className="flex items-center space-x-2 p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
                      <input 
                        type="checkbox" 
                        checked={admPerms.includes("manage_exams")}
                        onChange={() => togglePermission("manage_exams")}
                      />
                      <span>Manage Exams</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setAdminModalOpen(false)}
                    className="px-4 py-2 border rounded-xl hover:bg-gray-50 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-950 text-white rounded-xl hover:bg-slate-850 font-bold"
                  >
                    {loading === 'admin' ? "Granting..." : "Authorize Admin Rights"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  };

  const renderSettings = () => {
    return (
      <div className="space-y-6">
        <h2 className="text-sm font-black uppercase text-slate-800 tracking-wider">
          {isRtl ? "إعدادات المشرف الأكاديمي" : "Administrator Settings"}
        </h2>

        {/* Theme Toggle Card */}
        <ThemeToggleCard lang={lang} theme={theme} onThemeChange={handleThemeChange} />

        {/* Platform Language */}
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
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">
                {isRtl ? `تم التطوير بواسطة: ${developerInfo.name}` : `Developed by: ${developerInfo.name}`}
              </h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {isRtl ? "تواصل مباشر مع المطور لطلب التحديثات البرمجية أو الاستفسارات التقنية." : "Contact the core developer directly for licensing, code updates, or custom feature requests."}
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs font-bold">
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

            {/* Edit details button: ONLY visible/functional for super admins */}
            {extra?.isSuperAdmin && (
              <button
                onClick={openEditDeveloperModal}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>⚙️</span>
                <span>{isRtl ? "تعديل معلومات المطور" : "Edit Developer Details"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Sign Out */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-black text-gray-900">{isRtl ? "تسجيل الخروج" : "Sign Out"}</h3>
            <p className="text-xs text-slate-500 mt-1">{isRtl ? "قم بتسجيل الخروج بأمان من الحساب الإداري" : "Safely end your session and sign out of your admin account"}</p>
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
        <div className="text-center text-[10px] text-gray-400 space-y-1 pt-2">
          <div className="flex justify-center space-x-3 space-x-reverse">
            <button 
              type="button" 
              onClick={() => onOpenLegal?.('privacy')} 
              className="hover:underline hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              {isRtl ? "سياسة الخصوصية" : "Privacy Policy"}
            </button>
            <span>•</span>
            <button 
              type="button" 
              onClick={() => onOpenLegal?.('terms')} 
              className="hover:underline hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              {isRtl ? "شروط الخدمة" : "Terms of Service"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans transition-all duration-300"
      dir={getLanguageDirection(lang)}
    >
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-950 text-white flex flex-col justify-between p-6 phone-header-safe md:sticky md:top-0 md:h-screen z-30">
        
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-white text-slate-950 p-2 rounded-xl">
              <ShieldAlert className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight block leading-none">{t.adminPortal}</span>
              <span className="text-[10px] text-slate-400 block mt-2 font-semibold">{name}</span>
            </div>
          </div>

          <nav className="space-y-1 text-xs font-bold text-slate-300">
            <button
              onClick={() => handleTabChange('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'dashboard' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>{t.tabDashboard}</span>
            </button>

            <button
              onClick={() => handleTabChange('studentsInfo')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'studentsInfo' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <GraduationCap className="h-4 w-4 text-amber-400" />
              <span>{t.tabStudentsInfo}</span>
            </button>

            <button
              onClick={() => handleTabChange('students')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'students' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>{t.tabStudents}</span>
            </button>

            <button
              onClick={() => handleTabChange('years')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'years' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span>{t.tabYears}</span>
            </button>

            <button
              onClick={() => handleTabChange('attendance')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'attendance' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span>{t.tabAttendance}</span>
            </button>

            <button
              onClick={() => handleTabChange('grades')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'grades' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <Award className="h-4 w-4" />
              <span>{t.tabGrades}</span>
            </button>

            <button
              onClick={() => handleTabChange('videos')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'videos' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <Video className="h-4 w-4" />
              <span>{t.tabVideos}</span>
            </button>

            <button
              onClick={() => handleTabChange('admins')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'admins' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <Sliders className="h-4 w-4 text-emerald-400" />
              <span>{t.tabAdmins}</span>
            </button>

            <button
              onClick={() => handleTabChange('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'settings' ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-900'
              }`}
            >
              <Settings className="h-4 w-4 text-amber-400" />
              <span>{isRtl ? "الإعدادات" : "Settings"}</span>
            </button>
          </nav>
        </div>

        <div className="space-y-4">
          {/* Sidebar Language switcher */}
          <div className="bg-slate-900 p-1 rounded-xl flex items-center text-xs justify-center gap-1">
            <button
              onClick={() => handleLanguageToggle("ar")}
              className={`px-3 py-1 font-bold rounded-lg transition-all text-[10px] cursor-pointer ${
                lang === "ar" ? "bg-white text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              عربي
            </button>
            <button
              onClick={() => handleLanguageToggle("en")}
              className={`px-3 py-1 font-bold rounded-lg transition-all text-[10px] cursor-pointer ${
                lang === "en" ? "bg-white text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              EN
            </button>
          </div>

          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-2 py-2.5 px-3 text-xs font-bold text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-900 transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>{t.signOut}</span>
          </button>
        </div>

      </aside>

      {/* Main Panel Content Area */}
      <main className="flex-grow p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 pb-24 md:pb-8">
        
        {/* Top Mini Header with Language Switcher */}
        <div className="flex justify-between items-center bg-white border border-gray-150 p-4 rounded-2xl shadow-sm">
          <div className="text-xs text-slate-500 font-bold">
            {isRtl ? `أهلاً بك، المشرف الأكاديمي ${name}` : `Welcome back, coordinator ${name}`}
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-gray-200 rounded-xl p-0.5">
            <Globe className="h-3.5 w-3.5 text-gray-400 mx-1.5" />
            <button
              onClick={() => handleLanguageToggle("ar")}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                lang === "ar" ? "bg-slate-900 text-white shadow" : "text-gray-500 hover:text-slate-900"
              }`}
            >
              العربية (Default)
            </button>
            <button
              onClick={() => handleLanguageToggle("en")}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                lang === "en" ? "bg-slate-900 text-white shadow" : "text-gray-500 hover:text-slate-900"
              }`}
            >
              English
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'studentsInfo' && (
          <StudentsInfoTab
            lang={lang}
            isRtl={isRtl}
            students={students}
            years={years}
            groups={groups}
            attendance={attendance}
            grades={grades}
            triggerAlert={triggerAlert}
            onOpenAddStudentModal={() => openStudentModal()}
            onOpenImportModal={(group) => {
              if (group) {
                handleOpenImportGroup(group);
              } else {
                handleOpenGeneralImport();
              }
            }}
            onOpenExportModal={(group) => {
              if (group) {
                handleOpenExportGroup(group);
              } else {
                handleOpenGeneralExport();
              }
            }}
          />
        )}
        {activeTab === 'students' && renderStudents()}
        {activeTab === 'years' && renderYears()}
        {activeTab === 'attendance' && renderAttendance()}
        {activeTab === 'grades' && renderGrades()}
        {activeTab === 'videos' && renderVideos()}
        {activeTab === 'admins' && renderAdmins()}
        {activeTab === 'settings' && renderSettings()}

        {/* Modal: Custom Confirmation (Bypasses window.confirm for cross-origin iframe compliance) */}
        {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  {confirmModal.title}
                </h3>
              </div>
              
              <p className="text-slate-600 leading-relaxed font-semibold whitespace-pre-line">
                {confirmModal.message}
              </p>

              <div className="flex justify-end gap-2 pt-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmModal.onConfirm();
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors shadow-sm cursor-pointer"
                >
                  {confirmModal.confirmBtnText}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit Developer Info (Gated by Password) */}
        {showDevModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-150 space-y-5 text-xs">
              
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900">
                  <Sliders className="h-4 w-4" />
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    {isRtl ? "تعديل معلومات مطور التطبيق" : "Modify Developer Credits"}
                  </h3>
                </div>
                <button 
                  onClick={() => setShowDevModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {devError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl font-bold">
                  {devError}
                </div>
              )}

              {/* Step 1: Password Verification */}
              {!isDevPasswordVerified ? (
                <form onSubmit={handleVerifyDevPassword} className="space-y-4">
                  <p className="text-slate-500 leading-relaxed font-semibold">
                    {isRtl 
                      ? "لحماية حقوق الملكية والتحقق البرمجي، يرجى كتابة كلمة مرور حماية معلومات المطور للمتابعة:" 
                      : "To safeguard copyright credits and verify authority, please enter the developer control password to continue:"}
                  </p>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      {isRtl ? "كلمة مرور المطور" : "Developer Password"}
                    </label>
                    <input 
                      type="password"
                      required
                      placeholder="••••••••"
                      value={devPassword}
                      onChange={(e) => setDevPassword(e.target.value)}
                      className="block w-full py-2.5 px-3 bg-white text-slate-950 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1 font-bold">
                    <button
                      type="button"
                      onClick={() => setShowDevModal(false)}
                      className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
                    >
                      {isRtl ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                      {isRtl ? "تحقق ومتابعة" : "Verify & Continue"}
                    </button>
                  </div>
                </form>
              ) : (
                /* Step 2: Edit Form fields */
                <form onSubmit={handleSaveDeveloperInfo} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      {isRtl ? "اسم المطور" : "Developer Name"}
                    </label>
                    <input 
                      type="text"
                      required
                      value={devNameEdit}
                      onChange={(e) => setDevNameEdit(e.target.value)}
                      className="block w-full py-2.5 px-3 bg-white text-slate-950 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      {isRtl ? "رقم الهاتف للاتصال" : "Call Phone Number"}
                    </label>
                    <input 
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      value={devPhoneEdit}
                      onChange={(e) => setDevPhoneEdit(e.target.value.replace(/\D/g, ''))}
                      className="block w-full py-2.5 px-3 bg-white text-slate-950 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      {isRtl ? "رقم الواتساب" : "WhatsApp Number"}
                    </label>
                    <input 
                      type="text"
                      required
                      value={devWhatsappEdit}
                      onChange={(e) => setDevWhatsappEdit(e.target.value)}
                      className="block w-full py-2.5 px-3 bg-white text-slate-950 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      {isRtl ? "معرف انستغرام (Instagram)" : "Instagram Username"}
                    </label>
                    <input 
                      type="text"
                      required
                      value={devInstaEdit}
                      onChange={(e) => setDevInstaEdit(e.target.value)}
                      className="block w-full py-2.5 px-3 bg-white text-slate-950 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      {isRtl ? "معرف تلغرام (Telegram)" : "Telegram Username"}
                    </label>
                    <input 
                      type="text"
                      required
                      value={devTeleEdit}
                      onChange={(e) => setDevTeleEdit(e.target.value)}
                      className="block w-full py-2.5 px-3 bg-white text-slate-950 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 font-bold">
                    <button
                      type="button"
                      onClick={() => setShowDevModal(false)}
                      className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
                    >
                      {isRtl ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      disabled={devSaving}
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {devSaving ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ التعديلات" : "Save Changes")}
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        )}

        {/* Modal: Edit Group Name & Schedule */}
        {selectedGroupToSchedule && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-150 space-y-5 text-xs">
              
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Calendar className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    {isRtl ? "تعديل مسمى وجدول مواعيد المجموعة" : "Edit Group Settings & Schedule"}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedGroupToSchedule(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveGroupSchedule} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                    {isRtl ? "اسم/تسمية المجموعة" : "Group Label (Custom)"}
                  </label>
                  <input 
                    type="text"
                    placeholder={isRtl ? "مثال: مجموعة 1 - الإثنين والأربعاء" : "e.g. Group 1 - Mon/Wed"}
                    value={groupLabelEdit}
                    onChange={(e) => setGroupLabelEdit(e.target.value)}
                    className="block w-full py-2.5 px-3 bg-white text-slate-950 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-600 focus:outline-none font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    {isRtl ? "جدول مواعيد المحاضرات (أيام الأسبوع السبعة)" : "Weekly Schedule (All 7 Days)"}
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {SEVEN_DAYS.map((day) => {
                      const value = groupScheduleEdit[day.key] || "";
                      const isChecked = day.key in groupScheduleEdit;
                      return (
                        <div key={day.key} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between gap-3">
                          <label className="flex items-center space-x-2 space-x-reverse cursor-pointer shrink-0">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setGroupScheduleEdit(prev => ({ ...prev, [day.key]: "" }));
                                } else {
                                  const updated = { ...groupScheduleEdit };
                                  delete updated[day.key];
                                  setGroupScheduleEdit(updated);
                                }
                              }}
                              className="rounded text-purple-600 focus:ring-purple-600 h-4 w-4"
                            />
                            <span className="font-extrabold text-slate-800 text-[11px]">{isRtl ? day.ar : day.en}</span>
                          </label>
                          {isChecked ? (
                            <input 
                              type="text"
                              placeholder={isRtl ? "مثال: 6:00 ص - 7:30 ص (اختياري)" : "e.g. 6:00 AM - 7:30 AM (Optional)"}
                              value={value}
                              onChange={(e) => {
                                setGroupScheduleEdit(prev => ({ ...prev, [day.key]: e.target.value }));
                              }}
                              className="w-40 text-xs p-1.5 border rounded-lg focus:ring-1 focus:ring-purple-600 font-mono font-bold text-slate-900 bg-white"
                            />
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">{isRtl ? "غير محدد" : "No Class"}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupToSchedule(null)}
                    className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
                  >
                    {isRtl ? "إلغاء" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl transition-colors shadow-sm cursor-pointer"
                  >
                    {loading === "saving_schedule" ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ جدول المواعيد" : "Save Schedule")}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

        {/* Modal: Student JSON Import & Export */}
        <StudentImportExportModal
          isOpen={importExportModal.isOpen}
          onClose={() => setImportExportModal(prev => ({ ...prev, isOpen: false }))}
          initialMode={importExportModal.initialMode}
          targetGroup={importExportModal.targetGroup}
          targetYear={importExportModal.targetYear}
          students={students}
          years={years}
          groups={groups}
          lang={lang}
          isRtl={isRtl}
          triggerAlert={triggerAlert}
        />

        {/* Modal: Admin Video Player */}
        <AnimatePresence>
          {watchingVideo && (
            <AdminVideoPlayerModal
              video={watchingVideo}
              onClose={() => setWatchingVideo(null)}
              academicYears={years}
              lang={lang}
              isRtl={isRtl}
              triggerAlert={triggerAlert}
            />
          )}
        </AnimatePresence>

        {/* Modal: Parent Accounts Audit & Issue Diagnostics */}
        <ParentAccountsAuditModal
          isOpen={showParentAuditModal}
          onClose={() => setShowParentAuditModal(false)}
          students={students}
          years={years}
          groups={groups}
          lang={lang}
          isRtl={isRtl}
          onEditStudent={(st) => openStudentModal(st)}
        />

      </main>

    </div>
  );
}
