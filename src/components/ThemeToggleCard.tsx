import React from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { ThemeMode } from '../lib/theme';
import { Language } from '../lib/translations';

interface ThemeToggleCardProps {
  lang: Language;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export default function ThemeToggleCard({ lang, theme, onThemeChange }: ThemeToggleCardProps) {
  const isRtl = lang === 'ar';

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
            {isRtl ? "المظهر ووضع الرؤية" : "Theme & Appearance"}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl 
              ? "اختر مظهر التطبيق المفضل لديك أو اتركه يتزامن تلقائياً مع نظام هاتفك" 
              : "Choose your preferred theme or sync with system default preference"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        {/* System Default */}
        <button
          onClick={() => onThemeChange('system')}
          className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all text-left ${isRtl ? 'text-right flex-row-reverse' : ''} ${
            theme === 'system'
              ? 'bg-slate-900 dark:bg-indigo-950 text-white border-slate-900 dark:border-indigo-800 shadow-md ring-2 ring-indigo-500/40 font-bold'
              : 'bg-slate-50/50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border-gray-200 dark:border-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-900/60 font-semibold'
          }`}
        >
          <div className={`p-2 rounded-lg shrink-0 ${theme === 'system' ? 'bg-white/15 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-sm border border-gray-100 dark:border-slate-700'}`}>
            <Monitor className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black flex items-center justify-between">
              <span className="truncate">{isRtl ? "تلقائي (النظام)" : "System Default"}</span>
              {theme === 'system' && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-1" />}
            </div>
            <div className={`text-[10px] truncate mt-0.5 ${theme === 'system' ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
              {isRtl ? "حسب إعدادات الهاتف" : "Follows device theme"}
            </div>
          </div>
        </button>

        {/* Light Mode */}
        <button
          onClick={() => onThemeChange('light')}
          className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all text-left ${isRtl ? 'text-right flex-row-reverse' : ''} ${
            theme === 'light'
              ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md ring-2 ring-amber-400/40 font-bold'
              : 'bg-slate-50/50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border-gray-200 dark:border-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-900/60 font-semibold'
          }`}
        >
          <div className={`p-2 rounded-lg shrink-0 ${theme === 'light' ? 'bg-white/25 text-amber-950' : 'bg-white dark:bg-slate-800 text-amber-500 shadow-sm border border-gray-100 dark:border-slate-700'}`}>
            <Sun className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black flex items-center justify-between">
              <span className="truncate">{isRtl ? "الوضع الفاتح" : "Light Mode"}</span>
              {theme === 'light' && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 ml-1" />}
            </div>
            <div className={`text-[10px] truncate mt-0.5 ${theme === 'light' ? 'text-amber-900' : 'text-slate-500 dark:text-slate-400'}`}>
              {isRtl ? "مظهر مشرق وواضح" : "Bright & clean UI"}
            </div>
          </div>
        </button>

        {/* Dark Mode */}
        <button
          onClick={() => onThemeChange('dark')}
          className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all text-left ${isRtl ? 'text-right flex-row-reverse' : ''} ${
            theme === 'dark'
              ? 'bg-indigo-600 dark:bg-indigo-900 text-white border-indigo-600 dark:border-indigo-850 shadow-md ring-2 ring-indigo-500/40 font-bold'
              : 'bg-slate-50/50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border-gray-200 dark:border-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-900/60 font-semibold'
          }`}
        >
          <div className={`p-2 rounded-lg shrink-0 ${theme === 'dark' ? 'bg-white/15 text-indigo-200' : 'bg-white dark:bg-slate-800 text-indigo-500 shadow-sm border border-gray-100 dark:border-slate-700'}`}>
            <Moon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black flex items-center justify-between">
              <span className="truncate">{isRtl ? "الوضع الليلي" : "Dark Mode"}</span>
              {theme === 'dark' && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-1" />}
            </div>
            <div className={`text-[10px] truncate mt-0.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
              {isRtl ? "مريح للعينين في الظلام" : "Easy on the eyes"}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
