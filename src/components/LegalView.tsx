import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  ShieldCheck, FileText, X, Globe, ArrowRight, ArrowLeft, 
  CheckCircle2, Lock, Smartphone, Video, Users, Award, 
  HelpCircle, ExternalLink, ShieldAlert, Cpu, Phone, MessageSquare
} from "lucide-react";
import { Language, getLanguageDirection } from "../lib/translations";
import { useBackHandler } from "../lib/useBackHandler";

interface LegalViewProps {
  initialTab?: 'privacy' | 'terms';
  onClose: () => void;
  developerInfo?: {
    name: string;
    phone: string;
    whatsapp: string;
    insta: string;
    tele: string;
  };
}

export default function LegalView({ initialTab = 'privacy', onClose, developerInfo }: LegalViewProps) {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("platform_lang");
    return (saved === "en" || saved === "ar") ? saved : "ar";
  });

  const isRtl = lang === "ar";

  useBackHandler({
    activeTab,
    homeTab: 'privacy',
    onGoHome: onClose,
    hasOpenModal: true,
    onCloseModal: onClose
  });

  const handleLanguageToggle = (selectedLang: Language) => {
    setLang(selectedLang);
    localStorage.setItem("platform_lang", selectedLang);
  };

  const dev = developerInfo || {
    name: "Taha Tariq",
    phone: "+9647739607361",
    whatsapp: "+9647832715181",
    insta: "bz7_b",
    tele: "bz7_b"
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col justify-between overflow-hidden font-sans text-slate-900 selection:bg-indigo-500 selection:text-white"
      dir={getLanguageDirection(lang)}
    >
      {/* Top Fixed Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-3 sm:px-6 sm:py-4 shadow-sm z-20 shrink-0 phone-header-safe">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="bg-slate-950 text-white p-2 sm:p-2.5 rounded-2xl shadow-sm shrink-0">
              {activeTab === 'privacy' ? <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400" /> : <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />}
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight">
                {isRtl ? "أكاديمية المعرفة التعليمية" : "Educational Portal"}
              </h1>
              <p className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">
                {activeTab === 'privacy' 
                  ? (isRtl ? "ميثاق وسياسة الخصوصية الرسمية" : "Official Privacy Policy Charter") 
                  : (isRtl ? "شروط وأحكام اتفاقية الخدمة" : "Terms & SLA Service Agreement")}
              </p>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center">
              <button
                onClick={() => handleLanguageToggle("ar")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  lang === "ar" ? "bg-slate-950 text-white shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                }`}
              >
                عربي
              </button>
              <button
                onClick={() => handleLanguageToggle("en")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  lang === "en" ? "bg-slate-950 text-white shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                }`}
              >
                EN
              </button>
            </div>

            {/* Exit / Close Button */}
            <button
              onClick={onClose}
              className="bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/80 text-red-600 dark:text-red-300 px-3 py-1.5 rounded-xl font-black text-xs transition-all border border-red-200 dark:border-red-800 flex items-center gap-1.5 cursor-pointer active:scale-95"
              title={isRtl ? "إغلاق والعودة" : "Exit"}
            >
              <X className="h-4 w-4" />
              <span>{isRtl ? "خروج" : "Exit"}</span>
            </button>
          </div>

        </div>

        {/* Tab Switcher Bar */}
        <div className="max-w-5xl mx-auto mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 flex justify-center sm:justify-start">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl flex gap-1 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'privacy' 
                  ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm border border-gray-200 dark:border-slate-700' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950'
              }`}
            >
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>{isRtl ? "سياسة الخصوصية" : "Privacy Policy"}</span>
            </button>
            
            <button
              onClick={() => setActiveTab('terms')}
              className={`flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'terms' 
                  ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm border border-gray-200 dark:border-slate-700' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950'
              }`}
            >
              <FileText className="h-4 w-4 text-indigo-500" />
              <span>{isRtl ? "شروط الخدمة" : "Terms of Service"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Content Box */}
      <main className="flex-grow overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Privacy Policy Tab Content */}
          {activeTab === 'privacy' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Header Banner */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-extrabold">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{isRtl ? "وثيقة رسمية ومعتمدة" : "Verified Privacy Charter"}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white tracking-tight">
                  {isRtl ? "سياسة الخصوصية وحماية البيانات" : "Privacy Policy & Data Security Charter"}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  {isRtl 
                    ? "تلتزم منصة المعرفة التعليمية بأعلى معايير الأمان والشفافية لحماية بيانات الطلاب وأولياء الأمور والكادر التعليمي. توضح هذه الوثيقة بدقة الشفافية التامة حول كيفية جمع المعلومات، معالجتها، وحفظها داخل النظام."
                    : "The Educational Portal is committed to maintaining the highest security and transparency standards to protect the personal data of students, parents, and academic staff. This privacy policy details how information is collected, processed, and stored."}
                </p>
                <div className="pt-2 text-[11px] font-mono font-bold text-slate-400">
                  {isRtl ? "تاريخ آخر تحديث: 30 تموز 2026" : "Last Updated: July 30, 2026"}
                </div>
              </div>

              {/* Section 1: Information Collected */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="bg-indigo-50 dark:bg-indigo-950/60 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">
                    {isRtl ? "1. البيانات التي يتم جمعها في المنصة" : "1. Personal & System Information We Collect"}
                  </h3>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isRtl 
                    ? "لتوفير تجربة تعليمية مخصصة ومتابعة أكاديمية دقيقة، تقوم المنصة بتخزين البيانات التالية في قاعدة بيانات هجينة مشفرة (Firebase Firestore) وتخزين كاش محلي على جهازك:"
                    : "To deliver personalized learning and accurate academic tracking, the portal processes and stores the following records securely:"}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-1">
                    <h4 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{isRtl ? "بيانات الحساب والهوية" : "Account Identity Records"}</span>
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                      {isRtl ? "رقم هاتف الطالب، رقم هاتف ولي الأمر، اسم الطالب الثلاثي، والصف/الدفعة الدراسية المسجل بها." : "Student phone number, parent phone number, student full name, and registered academic cohort year."}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-1">
                    <h4 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{isRtl ? "السجل الأكاديمي والتقييمات" : "Academic & Attendance History"}</span>
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                      {isRtl ? "كشوف الحضور والغياب للمحاضرات (حاضر/متأخر/غائب)، درجات الاختبارات الدورية، وملاحظات المنسقين الأكاديميين." : "Attendance logs, periodic exam scores, report cards, and coordinator administrative notes."}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-1">
                    <h4 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{isRtl ? "تقدم ومشاهدة الفيديو" : "Video Streaming Metrics"}</span>
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                      {isRtl ? "حفظ التوقيت الذي توقفت عنده في المحاضرات، ونسبة إكمال مشاهدة الدروس لضمان استئناف المشاهدة بسلاسة." : "Playback progress timestamps and completion metrics for seamless video continuation."}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-1">
                    <h4 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{isRtl ? "التنزيلات والتخزين المحلي" : "In-App Offline Caching"}</span>
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                      {isRtl ? "تخزين الدروس المحملة في ذاكرة التطبيق المعزولة للتشغيل أوفلاين، مع حساب المساحة التخزينية المتاحة بالهاتف." : "Encrypted offline lecture files cached safely inside app storage, and phone storage usage estimates."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2: Video Streaming & Offline Privacy */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="bg-emerald-50 dark:bg-emerald-950/60 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                    <Video className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">
                    {isRtl ? "2. خصوصية البث والتنزيل دون اتصال (Cloudflare)" : "2. Video Streaming & In-App Caching Privacy"}
                  </h3>
                </div>

                <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p>
                    {isRtl 
                      ? "يتم تقديم جميع المحاضرات المصورة عبر خوادم Cloudflare Stream المشفرة. للحفاظ على الملكية الفكرية وخصوصية المحتوى التعليمي:"
                      : "Educational video content is served through Cloudflare Stream infrastructure. To protect intellectual property:"}
                  </p>
                  <ul className="list-disc list-inside space-y-2 font-medium text-xs pr-2">
                    <li>
                      {isRtl ? "تنزيل الفيديوهات أوفلاين يتم حفظه بشكل معزول ومحمي داخل ذاكرة التطبيق فقط ولا يتوفر في استوديو الهاتف الخارجي." : "In-app downloaded videos are stored in a sandboxed cache inside the application sandbox and cannot be exported to external photo galleries."}
                    </li>
                    <li>
                      {isRtl ? "توليد مفاتيح تشغيل زمنية مؤقتة (Signed Tokens) لمنع مشاركة روابط البث خارج التطبيق." : "Temporary signed tokens are generated server-side for video requests to prevent unauthorized URL leaks."}
                    </li>
                    <li>
                      {isRtl ? "يمكن للمستخدم حذف المحاضرات المحملة أوفلاين في أي وقت من قائمة الإعدادات لتحرير مساحة تخزين الهاتف." : "Users can delete downloaded lectures at any time from the app Settings tab to free up device storage."}
                    </li>
                  </ul>
                </div>
              </div>

              {/* Section 3: Parent Account & Access Security */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="bg-purple-50 dark:bg-purple-950/60 p-2 rounded-xl text-purple-600 dark:text-purple-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">
                    {isRtl ? "3. خصوصية ولي الأمر ومحرك الأمان" : "3. Parent Monitoring & Rate-Limiting Protection"}
                  </h3>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isRtl 
                    ? "تتيح المنصة بوابات دخول خاصة لأولياء الأمور عبر رقم هاتف الوالد. يتم تطبيق سياسات الحماية التالية لحماية الحسابات من أي دخول غير مصرح به:"
                    : "The portal provides dedicated parent monitoring access via the primary parent phone number with strict safety rules:"}
                </p>

                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-extrabold text-slate-900 dark:text-white">
                    <Lock className="h-4 w-4 text-amber-500" />
                    <span>{isRtl ? "حظر المحاولات المتكررة (Rate Limiting)" : "Brute-Force Protection"}</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    {isRtl 
                      ? "عند ادخال كلمة مرور خاطئة أكثر من 5 مرات متتالية، يتم قفل محاولات الدخول تلقائياً لمدة 60 ثانية لحماية حساب الطالب وولي الأمر."
                      : "After 5 failed login attempts, authentication is locked for 60 seconds to protect student and parent accounts."}
                  </p>
                </div>
              </div>

              {/* Section 4: Data Non-Disclosure */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="bg-blue-50 dark:bg-blue-950/60 p-2 rounded-xl text-blue-600 dark:text-blue-400">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">
                    {isRtl ? "4. عدم مشاركة البيانات مع أي طرف ثالث" : "4. Zero Third-Party Data Sharing"}
                  </h3>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isRtl 
                    ? "نحن نضمن بشكل قاطع عدم بيع، تأجير، أو مشاركة أي بيانات شخصية أو رقم هاتف أو نتائج دراسية خاصة بالطلاب أو أولياء الأمور مع أي أطراف إعلانية أو تجارية خارجية. تُستخدم البيانات حصراً للأغراض التعليمية والإدارية الخاصة بالمنصة."
                    : "We strictly guarantee that no personal information, phone numbers, or academic report cards are sold, rented, or disclosed to third-party advertisers. All data is utilized strictly for educational administration within the platform."}
                </p>
              </div>

              {/* Contact Developer Banner */}
              <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    {isRtl ? "دعم خصوصية منصة المعرفة" : "Privacy & System Support"}
                  </span>
                  <Cpu className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-extrabold text-base">
                    {isRtl ? `تطوير وإشراف المطور: ${dev.name}` : `Platform Developer: ${dev.name}`}
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {isRtl 
                      ? "لأي استفسارات بخصوص سياسة الخصوصية أو طلب تحديث البيانات الخاصة بحسابك، يمكنك التواصل المباشر عبر قنوات الدعم المتاحة." 
                      : "For privacy questions or profile data review, contact technical support directly via official channels."}
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-900">
                  <a 
                    href={`https://wa.me/${dev.whatsapp.replace(/[^0-9]/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 rounded-xl flex items-center gap-1.5 transition-all"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>WhatsApp ({dev.whatsapp})</span>
                  </a>
                </div>
              </div>

            </motion.div>
          )}

          {/* Terms of Service Tab Content */}
          {activeTab === 'terms' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Header Banner */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 rounded-full text-xs font-extrabold">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{isRtl ? "اتفاقية الاستخدام المعتمدة" : "Standard Educational SLA"}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white tracking-tight">
                  {isRtl ? "شروط وقواعد خدمة منصة المعرفة" : "Terms of Service & User Guidelines"}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  {isRtl 
                    ? "يُعد دخولك واستخدامك لمنصة المعرفة التعليمية إقراراً وموافقة كامليْن على الالتزام بكافة الشروط والقواعد المحددة أدناه. تُنظم هذه الاتفاقية الحقوق والواجبات بين المستخدم (طالب / ولي أمر) والإدارة الأكاديمية."
                    : "By logging into and utilizing the Educational Portal, users acknowledge and accept these Terms of Service. This agreement governs user rights, educational usage, and account rules."}
                </p>
                <div className="pt-2 text-[11px] font-mono font-bold text-slate-400">
                  {isRtl ? "سارية المفعول لجميع الدفعات والمجموعات" : "Applicable for all student cohorts"}
                </div>
              </div>

              {/* Section 1: User Roles */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="bg-indigo-50 dark:bg-indigo-950/60 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">
                    {isRtl ? "1. أنواع الحسابات والصلاحيات" : "1. Account Types & Authorization Levels"}
                  </h3>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-1">
                    <h4 className="font-extrabold text-slate-900 dark:text-white">
                      {isRtl ? "حساب الطالب (Student Account)" : "Student Account Permissions"}
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                      {isRtl 
                        ? "يُمنح الطالب حق الوصول لمشاهدة وتنزيل محاضرات الدفعة الدراسية المسجل بها، ومتابعة سجله الأكاديمي الشخصي لجدول الحضور والدرجات."
                        : "Grants access to watch educational video lectures for the assigned academic cohort, download lessons for offline study, and view personal attendance/grades."}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-1">
                    <h4 className="font-extrabold text-slate-900 dark:text-white">
                      {isRtl ? "حساب ولي الأمر (Parent Account)" : "Parent Account Permissions"}
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                      {isRtl 
                        ? "يُمنح الوالد صلاحية قراءة ومتابعة حصرية لكشوف حضور وغياب الطالب، درجات الاختبارات، والملاحظات المسجلة من قبل منسق المنصة."
                        : "Grants read-only monitoring access to view student attendance history, exam score cards, and coordinator notes."}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-1">
                    <h4 className="font-extrabold text-slate-900 dark:text-white">
                      {isRtl ? "حساب المشرف والإدارة (Admin Portal)" : "Administrator Portal Permissions"}
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                      {isRtl 
                        ? "صلاحيات شاملة لإدارة السنوات الدراسية، المجموعات، الحسابات، رفع المحاضرات، تسجيل درجات الاختبارات وكشوف الحضور."
                        : "Full administration rights to manage cohorts, student records, attendance sheets, exam marks, and lecture video uploads."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2: Intellectual Property */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="bg-red-50 dark:bg-red-950/60 p-2 rounded-xl text-red-600 dark:text-red-400">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">
                    {isRtl ? "2. حقوق الملكية الفكرية وحظر التسجيل" : "2. Intellectual Property & Recording Prohibition"}
                  </h3>
                </div>

                <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p className="font-medium">
                    {isRtl 
                      ? "جميع الفيديوهات التعليمية، الملخصات، كشوف الاختبارات، والأسئلة المتاحة في المنصة هي ملكية فكرية محمية قانوناً للمؤسسة التعليمية وللكادر التدريسي."
                      : "All video lectures, educational notes, exam materials, and system graphics are protected intellectual property."}
                  </p>

                  <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-4 rounded-2xl space-y-2 text-xs text-red-800 dark:text-red-300">
                    <div className="font-black flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      <span>{isRtl ? "الإجراءات المحظورة قطعيًا:" : "Strictly Prohibited Actions:"}</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 font-bold text-[11px]">
                      <li>{isRtl ? "يُمنع منعاً باتاً تصوير الشاشة أو التسجيل الخارجي للمحاضرات بأي وسيلة كانت." : "Screen recording or capturing video lectures via third-party tools is strictly prohibited."}</li>
                      <li>{isRtl ? "يحظر مشاركة تفاصيل الدخول أو كلمات المرور الخاصة بالحساب مع أي أفراد آخرين." : "Sharing user account passwords or phone credentials with unverified individuals is not allowed."}</li>
                      <li>{isRtl ? "يُحظر تسريب أو إعادة رفع الفيديوهات المحملة أوفلاين خارج تطبيق المنصة." : "Re-uploading or distributing cached offline video files outside the portal is prohibited."}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Section 3: Deactivation & Suspensions */}
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="bg-amber-50 dark:bg-amber-950/60 p-2 rounded-xl text-amber-600 dark:text-amber-400">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">
                    {isRtl ? "3. تعطيل الحسابات وتصحيح البيانات" : "3. Account Deactivation & Administrative Corrections"}
                  </h3>
                </div>

                <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p>
                    {isRtl 
                      ? "تحتفظ إدارة المنصة بحق تعطيل أو إيقاف أي حساب طالب عند صدور قرار إداري أو عدم تسديد المستحقات أو مخالفة السلوك التعليمي. عند تعطيل حساب الطالب:"
                      : "The administration reserves the right to suspend or deactivate student accounts for policy non-compliance:"}
                  </p>
                  <ul className="list-disc list-inside space-y-1 font-medium text-xs pr-2">
                    <li>{isRtl ? "يتوقف حساب الطالب وحساب ولي الأمر المرتبط به فوراً عن الوصول للبث أوفلاين وأونلاين." : "Both student and associated parent accounts will be blocked from accessing streaming lectures and grades."}</li>
                    <li>{isRtl ? "تعديل درجات الاختبارات أو كشوف الحضور والغياب يتطلب حصرية مراجعة الإدارة في مقر المؤسسة." : "Corrections to recorded exam marks or attendance logs must be addressed directly with administration desk."}</li>
                  </ul>
                </div>
              </div>

              {/* Section 4: Contact & SLA */}
              <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    {isRtl ? "المساعدة وتطبيق الشروط" : "Help Desk & SLA Enquiries"}
                  </span>
                  <HelpCircle className="h-5 w-5 text-indigo-400" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  {isRtl 
                    ? "إذا كانت لديك استفسارات حول شروط الخدمة أو تود تقديم طلب تعديل بيانات، يسعدنا التواصل معك من خلال قنوات الدعم المباشرة."
                    : "For inquiries regarding service terms or account assistance, reach out directly to technical support."}
                </p>
                <div className="pt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-900">
                  <a 
                    href={`https://wa.me/${dev.whatsapp.replace(/[^0-9]/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-4 py-2 bg-indigo-400 hover:bg-indigo-300 rounded-xl flex items-center gap-1.5 transition-all"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>WhatsApp Support ({dev.whatsapp})</span>
                  </a>
                </div>
              </div>

            </motion.div>
          )}

        </div>
      </main>

      {/* Bottom Sticky Action Bar */}
      <footer className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 p-4 z-20 shrink-0 phone-bottom-safe">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-bold">
            <span>{isRtl ? "الانتقال إلى الصفحات الأخرى:" : "Switch view:"}</span>
            <button
              onClick={() => setActiveTab(activeTab === 'privacy' ? 'terms' : 'privacy')}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-extrabold flex items-center gap-1 cursor-pointer"
            >
              <span>
                {activeTab === 'privacy' 
                  ? (isRtl ? "انتقل إلى شروط الخدمة 📜" : "Switch to Terms of Service 📜") 
                  : (isRtl ? "انتقل إلى سياسة الخصوصية 🔒" : "Switch to Privacy Policy 🔒")}
              </span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 bg-slate-950 dark:bg-slate-100 dark:text-slate-950 text-white font-black rounded-xl hover:bg-slate-850 transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
          >
            <span>{isRtl ? "العودة للتطبيق (خروج)" : "Return to App (Exit)"}</span>
          </button>

        </div>
      </footer>

    </div>
  );
}
