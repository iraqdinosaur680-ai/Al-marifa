import React, { useState, useMemo, useEffect, useRef } from "react";
import { 
  MessageSquare, Send, Check, X, Copy, ExternalLink, AlertTriangle, 
  Users, CheckCircle2, RotateCcw, ChevronRight, ChevronLeft, ArrowRight,
  Filter, Search, Smartphone, UserCheck, ShieldAlert, Sparkles, FileText,
  Calendar, Award, Key, Settings, Info, Play, Pause, SkipForward, CheckCheck,
  Zap, Clock
} from "lucide-react";
import { AcademicYear, Group, Student, AttendanceRecord, GradeRecord } from "../types";
import { Language, matchesSearchQuery } from "../lib/translations";

export interface WhatsAppSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  isRtl: boolean;
  students: Student[];
  years: AcademicYear[];
  groups: Group[];
  attendance: AttendanceRecord[];
  grades: GradeRecord[];
  initialSelectedGroup?: string;
  initialSelectedYear?: string;
  initialSingleStudent?: Student | null;
  initialTemplateType?: TemplateType;
  initialRecipientTarget?: RecipientTarget;
  triggerAlert: (type: 'success' | 'error', text: string) => void;
}

export type RecipientTarget = 'parent' | 'student' | 'both';
export type TemplateType = 'last_week' | 'full_report' | 'absence_alert' | 'latest_exam' | 'credentials' | 'custom';

interface RecipientItem {
  id: string; // unique ID for queue item
  studentId: string;
  studentName: string;
  recipientType: 'parent' | 'student';
  recipientLabel: string;
  rawPhone: string;
  cleanPhone: string;
  isValidPhone: boolean;
  phoneError?: string;
  groupName: string;
  yearName: string;
  message: string;
  status: 'pending' | 'sent' | 'skipped';
}

const COUNTRY_CODES = [
  { code: '964', label: 'العراق (Iraq +964)', prefix: '+964' },
  { code: '20', label: 'مصر (Egypt +20)', prefix: '+20' },
  { code: '966', label: 'السعودية (Saudi +966)', prefix: '+966' },
  { code: '962', label: 'الأردن (Jordan +962)', prefix: '+962' },
  { code: '971', label: 'الإمارات (UAE +971)', prefix: '+971' },
  { code: '965', label: 'الكويت (Kuwait +965)', prefix: '+965' },
  { code: '968', label: 'عُمان (Oman +968)', prefix: '+968' },
  { code: '974', label: 'قطر (Qatar +974)', prefix: '+974' },
  { code: '973', label: 'البحرين (Bahrain +973)', prefix: '+973' },
  { code: '963', label: 'سوريا (Syria +963)', prefix: '+963' },
  { code: '961', label: 'لبنان (Lebanon +961)', prefix: '+961' },
  { code: '212', label: 'المغرب (Morocco +212)', prefix: '+212' },
  { code: '213', label: 'الجزائر (Algeria +213)', prefix: '+213' },
  { code: '216', label: 'تونس (Tunisia +216)', prefix: '+216' },
  { code: '218', label: 'ليبيا (Libya +218)', prefix: '+218' },
  { code: '249', label: 'السودان (Sudan +249)', prefix: '+249' },
  { code: '967', label: 'اليمن (Yemen +967)', prefix: '+967' },
  { code: 'custom', label: 'رمز مخصص (Custom Code)', prefix: '+' }
];

export default function WhatsAppSenderModal({
  isOpen,
  onClose,
  lang,
  isRtl,
  students,
  years,
  groups,
  attendance,
  grades,
  initialSelectedGroup = 'all',
  initialSelectedYear = 'all',
  initialSingleStudent = null,
  initialTemplateType = 'last_week',
  initialRecipientTarget = 'parent',
  triggerAlert
}: WhatsAppSenderModalProps) {
  // Navigation / View step in modal
  const [currentStep, setCurrentStep] = useState<'configure' | 'queue'>('configure');

  // Filter criteria
  const [filterYear, setFilterYear] = useState<string>(initialSelectedYear || 'all');
  const [filterGroup, setFilterGroup] = useState<string>(initialSelectedGroup || 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Selected student IDs for batch
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(() => {
    if (initialSingleStudent) {
      return new Set([initialSingleStudent.id]);
    }
    const filtered = students.filter(s => {
      const matchYear = !initialSelectedYear || initialSelectedYear === 'all' || s.academicYear === initialSelectedYear;
      const matchGroup = !initialSelectedGroup || initialSelectedGroup === 'all' || s.groupId === initialSelectedGroup;
      return matchYear && matchGroup;
    });
    return new Set(filtered.map(s => s.id));
  });

  // Country Code config
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('964');
  const [customCountryCode, setCustomCountryCode] = useState<string>('');

  // Target recipients: Parent / Student / Both
  const [recipientTarget, setRecipientTarget] = useState<RecipientTarget>(initialRecipientTarget || 'parent');

  // Template Type & Custom Text
  const [templateType, setTemplateType] = useState<TemplateType>(initialTemplateType || 'last_week');
  const [customTemplateText, setCustomTemplateText] = useState<string>(
    isRtl
      ? `السلام عليكم ورحمة الله،\nولي أمر الطالب المحترم: {student_name}\nنحيطكم علماً بتقرير الأداء الدراسي:\n- نسبة الحضور: {att_rate}\n- حضور الأسبوع الماضي: {last_week_att}\n- نتائج الاختبارات الأخيرة: {recent_grades}\n{notes}\nمع خالص التحيات والتقدير.`
      : `Dear Parent of {student_name},\nHere is the recent academic progress update:\n- Attendance: {att_rate}\n- Last week attendance: {last_week_att}\n- Recent exam scores: {recent_grades}\n{notes}\nBest regards.`
  );

  // Queue state
  const [queue, setQueue] = useState<RecipientItem[]>([]);
  const [activeQueueIndex, setActiveQueueIndex] = useState<number>(0);
  const [queueFilter, setQueueFilter] = useState<'all' | 'pending' | 'sent' | 'issues'>('all');
  const [showTroubleshootTip, setShowTroubleshootTip] = useState<boolean>(false);

  // Sequential Send to All Runner State
  const [isRunnerActive, setIsRunnerActive] = useState<boolean>(false);
  const [isAutoPlay, setIsAutoPlay] = useState<boolean>(false);
  const [autoCountdown, setAutoCountdown] = useState<number>(3);

  // Sync state when modal is opened with new props
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('configure');
      setFilterYear(initialSelectedYear || 'all');
      setFilterGroup(initialSelectedGroup || 'all');
      setSearchQuery('');
      setTemplateType(initialTemplateType || 'last_week');
      setRecipientTarget(initialRecipientTarget || 'parent');
      setIsRunnerActive(false);
      setIsAutoPlay(false);
      setAutoCountdown(3);

      if (initialSingleStudent) {
        setSelectedStudentIds(new Set([initialSingleStudent.id]));
      } else {
        const filtered = students.filter(s => {
          const matchYear = !initialSelectedYear || initialSelectedYear === 'all' || s.academicYear === initialSelectedYear;
          const matchGroup = !initialSelectedGroup || initialSelectedGroup === 'all' || s.groupId === initialSelectedGroup;
          return matchYear && matchGroup;
        });
        setSelectedStudentIds(new Set(filtered.map(s => s.id)));
      }
    }
  }, [isOpen, initialSingleStudent, initialSelectedYear, initialSelectedGroup, initialTemplateType, initialRecipientTarget, students]);

  // Year & Group maps
  const yearMap = useMemo(() => new Map(years.map(y => [y.id, y.name])), [years]);
  const groupMap = useMemo(() => new Map(groups.map(g => [g.id, g.name || `${isRtl ? "مجموعة" : "Group"} ${g.groupNumber}`])), [groups, isRtl]);

  // Normalize phone number according to country code
  const normalizePhoneNumber = (raw: string, countryCode: string, customCode: string): { cleanPhone: string; isValid: boolean; error?: string } => {
    if (!raw || !raw.trim()) {
      return { cleanPhone: '', isValid: false, error: isRtl ? 'رقم الهاتف فارغ' : 'Phone is empty' };
    }

    // Remove all non-digits
    let digits = raw.replace(/\D/g, '');

    if (!digits) {
      return { cleanPhone: '', isValid: false, error: isRtl ? 'رقم الهاتف غير صالح' : 'Invalid digits' };
    }

    const code = countryCode === 'custom' ? customCode.replace(/\D/g, '') : countryCode;

    // Handle leading zeros or existing country code
    // If digits already start with the country code (e.g. 964780...), keep it
    if (code && digits.startsWith(code)) {
      // already has country code
    } else if (digits.startsWith('00')) {
      // international format with 00
      digits = digits.substring(2);
    } else if (digits.startsWith('0')) {
      // local format starting with 0 (e.g. 07801234567)
      // strip leading zero and prepend country code
      digits = (code || '') + digits.substring(1);
    } else {
      // no leading zero, prepend country code
      digits = (code || '') + digits;
    }

    // Validation: standard international phone should be between 9 and 15 digits
    if (digits.length < 8) {
      return { cleanPhone: digits, isValid: false, error: isRtl ? 'الرقم قصير جداً' : 'Phone is too short' };
    }

    return { cleanPhone: digits, isValid: true };
  };

  // Helper to compute student stats and text representations
  const generateStudentMessage = (
    student: Student, 
    type: TemplateType, 
    customText: string,
    target: 'parent' | 'student'
  ): string => {
    const studentAtt = attendance.filter(a => a.studentPhone === student.phone);
    const studentGrades = grades.filter(g => g.studentPhone === student.phone);

    // Total stats
    const totalAtt = studentAtt.length;
    const presentCount = studentAtt.filter(a => a.status === 'present').length;
    const lateCount = studentAtt.filter(a => a.status === 'late').length;
    const absentCount = studentAtt.filter(a => a.status === 'absent').length;
    const attRate = totalAtt > 0 ? Math.round(((presentCount + lateCount * 0.5) / totalAtt) * 100) : 100;

    // Last 7 days attendance
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysStr = sevenDaysAgo.toISOString().substring(0, 10);
    
    const lastWeekAttList = studentAtt.filter(a => a.date >= sevenDaysStr);
    let lastWeekAttText = isRtl ? "لا توجد حصص مسجلة خلال الأسبوع الماضي." : "No classes recorded in the last week.";
    
    if (lastWeekAttList.length > 0) {
      lastWeekAttText = lastWeekAttList.map(a => {
        const statusLabel = a.status === 'present' ? (isRtl ? '✅ حاضر' : '✅ Present') : a.status === 'late' ? (isRtl ? '⚠️ متأخر' : '⚠️ Late') : (isRtl ? '❌ غائب' : '❌ Absent');
        return `• ${a.date}: ${statusLabel}`;
      }).join('\n');
    }

    // Recent grades text (last 3 exams)
    let recentGradesText = isRtl ? "لا توجد درجات مسجلة حتى الآن." : "No grades recorded yet.";
    if (studentGrades.length > 0) {
      recentGradesText = studentGrades.slice(0, 4).map(g => {
        const pct = g.totalMarks > 0 ? Math.round((g.score / g.totalMarks) * 100) : 0;
        return `• ${g.examName} (${g.examDate}): ${g.score}/${g.totalMarks} (${pct}%)`;
      }).join('\n');
    }

    // Latest exam
    let latestExamText = isRtl ? "لا يوجد اختبار مسجل." : "No exam logged.";
    if (studentGrades.length > 0) {
      const g = studentGrades[0];
      const pct = g.totalMarks > 0 ? Math.round((g.score / g.totalMarks) * 100) : 0;
      latestExamText = `${g.examName} (${g.examDate}): ${g.score}/${g.totalMarks} (${pct}%)`;
    }

    // Absent list text
    const absentList = studentAtt.filter(a => a.status === 'absent');
    let absentListText = isRtl ? "سجل الحضور ممتاز، لا توجد غيابات." : "Excellent record, zero absences.";
    if (absentList.length > 0) {
      absentListText = absentList.map(a => `• ${a.date}`).join('\n');
    }

    const yearTitle = yearMap.get(student.academicYear) || (isRtl ? "غير محدد" : "Unassigned");
    const groupTitle = groupMap.get(student.groupId) || (isRtl ? "غير محدد" : "Unassigned");
    const notesText = student.notes ? `\n📝 ${isRtl ? "ملاحظة المشرف الأكاديمي:" : "Supervisor Note:"}\n${student.notes}` : '';

    const passwordVal = target === 'parent' ? (student.parentPassword || student.password) : student.password;

    switch (type) {
      case 'last_week':
        if (isRtl) {
          return `السلام عليكم ورحمة الله،
تحية طيبة إلى ${target === 'parent' ? `ولي أمر الطالب/ة: ${student.name}` : `الطالب/ة: ${student.name}`}

📊 *تقرير أداء الأسبوع الماضي:*
• المرحلة: ${yearTitle} | ${groupTitle}
• نسبة الحضور العامة: ${attRate}%
• سجل الأسبوع الماضي:
${lastWeekAttText}

📝 *نتائج الاختبارات:*
${recentGradesText}
${notesText}

مع تمنياتنا بالتوفيق والنجاح الدائم.`;
        } else {
          return `Hello,
Progress update for ${target === 'parent' ? `Parent of ${student.name}` : student.name}:

📊 *Last Week Academic Report:*
• Academic Year: ${yearTitle} | ${groupTitle}
• Overall Attendance Rate: ${attRate}%
• Last Week Attendance:
${lastWeekAttText}

📝 *Recent Exam Scores:*
${recentGradesText}
${notesText}

Best regards.`;
        }

      case 'full_report':
        if (isRtl) {
          return `السلام عليكم ورحمة الله،
تقرير أكاديمي شامل للطالب/ة: *${student.name}*
المرحلة الدراسية: ${yearTitle} - ${groupTitle}

📅 *سجل الحضور والغياب:*
• نسبة الحضور الإجمالية: ${attRate}%
• حاضر: ${presentCount} حصة | متأخر: ${lateCount} | غائب: ${absentCount}
• إجمالي الحصص: ${totalAtt}

🏆 *سجل الدرجات والاختبارات:*
${recentGradesText}
${notesText}

شاكرين تعاونكم ومتابعتكم المستمرة.`;
        } else {
          return `Comprehensive Academic Report for: *${student.name}*
Class: ${yearTitle} - ${groupTitle}

📅 *Attendance Summary:*
• Overall Rate: ${attRate}%
• Present: ${presentCount} | Late: ${lateCount} | Absent: ${absentCount}
• Total Sessions: ${totalAtt}

🏆 *Exam Scores:*
${recentGradesText}
${notesText}

Thank you for your continuous support.`;
        }

      case 'absence_alert':
        if (isRtl) {
          return `السلام عليكم ورحمة الله،
إشعار متابعة حضور وغياب - ${target === 'parent' ? `ولي أمر الطالب/ة: ${student.name}` : `الطالب/ة: ${student.name}`}

نلفت عنايتكم الكريمة إلى تسجيل حالات غياب عن الحصص المقررة:
• إجمالي عدد الغيابات: ${absentCount}
• تواريخ الغياب المسجلة:
${absentListText}

نرجو التكرم بمتابعة الأمر والحرص على عدم تكرار الغياب لضمان سير التحصيل العلمي بصورة منتظمة.
${notesText}`;
        } else {
          return `Attendance Alert - ${target === 'parent' ? `Parent of ${student.name}` : student.name}

We would like to bring your attention to recorded absences:
• Total Absences: ${absentCount}
• Recorded Absence Dates:
${absentListText}

Please ensure consistent attendance for academic success.
${notesText}`;
        }

      case 'latest_exam':
        if (isRtl) {
          return `السلام عليكم ورحمة الله،
إشعار نتيجة اختبار للطالب/ة: *${student.name}*

🎯 *نتيجة الاختبار:*
${latestExamText}
• المرحلة: ${yearTitle} (${groupTitle})
${notesText}

نتمنى دوام التوفيق والتميز.`;
        } else {
          return `Exam Result Notification for: *${student.name}*

🎯 *Exam Result:*
${latestExamText}
• Group: ${yearTitle} (${groupTitle})
${notesText}

Wishing you continued success.`;
        }

      case 'credentials':
        if (isRtl) {
          return `السلام عليكم ورحمة الله،
بيانات تسجيل الدخول إلى المنصة التعليمية للطالب/ة: *${student.name}*
المرحلة: ${yearTitle} | ${groupTitle}

🔑 *بيانات الحساب:*
• رقم هاتف الطالب: ${student.phone || 'غير مسجل'}
• كلمة مرور الطالب: ${student.password || 'غير محددة'}
• رقم هاتف ولي الأمر: ${student.parentPhone || 'غير مسجل'}
• كلمة مرور ولي الأمر: ${student.parentPassword || student.password || 'غير محددة'}
• الحساب المستهدف: ${target === 'parent' ? 'بوابة ولي الأمر 👨‍👦' : 'بوابة الطالب 🎓'}
${notesText}

يرجى الاحتفاظ بهذه البيانات لتسجيل الدخول ومتابعة الحصص والدرجات.`;
        } else {
          return `Educational Portal Login Credentials for: *${student.name}*
Class: ${yearTitle} | ${groupTitle}

🔑 *Account Login Credentials:*
• Student Phone: ${student.phone || 'N/A'}
• Student Password: ${student.password || 'N/A'}
• Parent Phone: ${student.parentPhone || 'N/A'}
• Parent Password: ${student.parentPassword || student.password || 'N/A'}
• Targeted Portal: ${target === 'parent' ? 'Parent Portal 👨‍👦' : 'Student Portal 🎓'}
${notesText}

Please use these credentials to log in and track classes and grades.`;
        }

      case 'custom':
      default:
        // Replace dynamic template placeholders
        const studentPass = student.password || '';
        const parentPass = student.parentPassword || student.password || '';
        const studentPhone = student.phone || '';
        const parentPhone = student.parentPhone || '';

        return customText
          .replace(/{student_name}/g, student.name)
          .replace(/{student_pass}/g, studentPass)
          .replace(/{student_password}/g, studentPass)
          .replace(/{parent_pass}/g, parentPass)
          .replace(/{parent_password}/g, parentPass)
          .replace(/{student_phone_number}/g, studentPhone)
          .replace(/{student_phone}/g, studentPhone)
          .replace(/{parent_phone_number}/g, parentPhone)
          .replace(/{parent_phone}/g, parentPhone)
          .replace(/{student_code}/g, student.studentCode || studentPhone)
          .replace(/{year}/g, yearTitle)
          .replace(/{group}/g, groupTitle)
          .replace(/{att_rate}/g, `${attRate}%`)
          .replace(/{last_week_att}/g, lastWeekAttText)
          .replace(/{recent_grades}/g, recentGradesText)
          .replace(/{latest_exam}/g, latestExamText)
          .replace(/{notes}/g, notesText)
          .replace(/{password}/g, passwordVal || '')
          .replace(/{login_pass}/g, passwordVal || '');
    }
  };

  // Filter students displayed in the configuration step
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchYear = filterYear === 'all' || s.academicYear === filterYear;
      const matchGroup = filterGroup === 'all' || s.groupId === filterGroup;
      const matchQuery = !searchQuery.trim() || matchesSearchQuery(s.name, searchQuery) || s.phone.includes(searchQuery) || s.parentPhone.includes(searchQuery);
      return matchYear && matchGroup && matchQuery;
    });
  }, [students, filterYear, filterGroup, searchQuery]);

  // Handle select all / deselect all
  const handleSelectAllVisible = () => {
    const next = new Set(selectedStudentIds);
    filteredStudents.forEach(s => next.add(s.id));
    setSelectedStudentIds(next);
  };

  const handleDeselectAllVisible = () => {
    const next = new Set(selectedStudentIds);
    filteredStudents.forEach(s => next.delete(s.id));
    setSelectedStudentIds(next);
  };

  const toggleStudentSelected = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedStudentIds(next);
  };

  // Helper to create recipient queue items
  const createQueueItems = (): RecipientItem[] => {
    const selectedStudents = students.filter(s => selectedStudentIds.has(s.id));
    const items: RecipientItem[] = [];

    selectedStudents.forEach(student => {
      const yearName = yearMap.get(student.academicYear) || '';
      const groupName = groupMap.get(student.groupId) || '';

      if (recipientTarget === 'parent' || recipientTarget === 'both') {
        const rawPhone = student.parentPhone || '';
        const { cleanPhone, isValid, error } = normalizePhoneNumber(rawPhone, selectedCountryCode, customCountryCode);
        const msg = generateStudentMessage(student, templateType, customTemplateText, 'parent');

        items.push({
          id: `${student.id}_parent`,
          studentId: student.id,
          studentName: student.name,
          recipientType: 'parent',
          recipientLabel: isRtl ? `ولي أمر الطالب/ة: ${student.name}` : `Parent of ${student.name}`,
          rawPhone,
          cleanPhone,
          isValidPhone: isValid,
          phoneError: error,
          groupName,
          yearName,
          message: msg,
          status: 'pending'
        });
      }

      if (recipientTarget === 'student' || recipientTarget === 'both') {
        const rawPhone = student.phone || '';
        const { cleanPhone, isValid, error } = normalizePhoneNumber(rawPhone, selectedCountryCode, customCountryCode);
        const msg = generateStudentMessage(student, templateType, customTemplateText, 'student');

        items.push({
          id: `${student.id}_student`,
          studentId: student.id,
          studentName: student.name,
          recipientType: 'student',
          recipientLabel: isRtl ? `الطالب/ة: ${student.name}` : `Student: ${student.name}`,
          rawPhone,
          cleanPhone,
          isValidPhone: isValid,
          phoneError: error,
          groupName,
          yearName,
          message: msg,
          status: 'pending'
        });
      }
    });

    return items;
  };

  // Generate Queue when moving to Step 2 (Queue)
  const handleProceedToQueue = () => {
    const selectedStudents = students.filter(s => selectedStudentIds.has(s.id));
    if (selectedStudents.length === 0) {
      triggerAlert('error', isRtl ? 'يرجى تحديد طالب واحد على الأقل للمتابعة' : 'Please select at least one student');
      return;
    }

    const items = createQueueItems();
    setQueue(items);
    setActiveQueueIndex(0);
    setCurrentStep('queue');
  };

  // Open WhatsApp via Official Deep Link
  const handleOpenWhatsApp = (item: RecipientItem, index: number) => {
    if (!item.isValidPhone || !item.cleanPhone) {
      triggerAlert('error', isRtl ? `رقم الهاتف غير صالح (${item.rawPhone})` : `Invalid phone number (${item.rawPhone})`);
      return;
    }

    const encodedText = encodeURIComponent(item.message);
    // Official WhatsApp deep link format
    const waUrl = `https://wa.me/${item.cleanPhone}?text=${encodedText}`;

    // Mark item as sent / opened in UI
    setQueue(prev => {
      const next = [...prev];
      const targetIndex = next.findIndex(q => q.id === item.id);
      if (targetIndex !== -1) {
        next[targetIndex] = { ...next[targetIndex], status: 'sent' };
      }
      return next;
    });

    // Trigger WhatsApp link
    try {
      // In Android Capacitor / Web, window.open or link dispatch opens the WhatsApp application directly
      const a = document.createElement('a');
      a.href = waUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      window.open(waUrl, '_blank');
    }

    // Automatically advance active queue index to next pending
    const nextPendingIndex = queue.findIndex((q, i) => i > index && q.status === 'pending' && q.isValidPhone);
    if (nextPendingIndex !== -1) {
      setActiveQueueIndex(nextPendingIndex);
    }
  };

  // Start "Send to All" Sequential Dispatch
  const handleStartSendToAll = (fromStep1: boolean = false) => {
    let currentQueue = queue;
    if (fromStep1 || currentStep === 'configure') {
      const selectedStudents = students.filter(s => selectedStudentIds.has(s.id));
      if (selectedStudents.length === 0) {
        triggerAlert('error', isRtl ? 'يرجى تحديد طالب واحد على الأقل للمتابعة' : 'Please select at least one student');
        return;
      }
      currentQueue = createQueueItems();
      setQueue(currentQueue);
      setCurrentStep('queue');
    }

    const firstPendingIdx = currentQueue.findIndex(q => q.status === 'pending' && q.isValidPhone);
    if (firstPendingIdx === -1) {
      triggerAlert('error', isRtl ? 'لا توجد رسائل قيد الانتظار وصالحة للإرسال' : 'No pending valid recipients in queue');
      return;
    }

    setIsRunnerActive(true);
    setActiveQueueIndex(firstPendingIdx);
    handleOpenWhatsApp(currentQueue[firstPendingIdx], firstPendingIdx);
    triggerAlert('success', isRtl ? 'بدء الإرسال للجميع بالتتابع' : 'Started Send to All sequence');
  };

  // Advance Runner to Next item
  const handleRunnerNext = () => {
    const nextIdx = queue.findIndex((q, i) => i > activeQueueIndex && q.status === 'pending' && q.isValidPhone);
    if (nextIdx !== -1) {
      setActiveQueueIndex(nextIdx);
      handleOpenWhatsApp(queue[nextIdx], nextIdx);
    } else {
      const fromStart = queue.findIndex(q => q.status === 'pending' && q.isValidPhone);
      if (fromStart !== -1) {
        setActiveQueueIndex(fromStart);
        handleOpenWhatsApp(queue[fromStart], fromStart);
      } else {
        triggerAlert('success', isRtl ? 'تم إرسال جميع الرسائل بنجاح' : 'All messages have been sent');
        setIsRunnerActive(false);
        setIsAutoPlay(false);
      }
    }
  };

  // Auto-play timer effect
  useEffect(() => {
    if (!isRunnerActive || !isAutoPlay) {
      return;
    }

    const timer = setInterval(() => {
      setAutoCountdown(prev => {
        if (prev <= 1) {
          // Trigger the next step outside updater
          setTimeout(() => {
            const nextIdx = queue.findIndex((q, i) => i > activeQueueIndex && q.status === 'pending' && q.isValidPhone);
            if (nextIdx !== -1) {
              setActiveQueueIndex(nextIdx);
              handleOpenWhatsApp(queue[nextIdx], nextIdx);
            } else {
              setIsAutoPlay(false);
              setIsRunnerActive(false);
              triggerAlert('success', isRtl ? 'تم الانتهاء من إرسال جميع رسائل القائمة' : 'Finished sending all queue messages');
            }
          }, 0);
          return 3;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isRunnerActive, isAutoPlay, activeQueueIndex, queue, isRtl]);

  // Mark all as sent helper
  const handleMarkAllAsSent = () => {
    setQueue(prev => prev.map(q => ({ ...q, status: 'sent' })));
    setIsRunnerActive(false);
    setIsAutoPlay(false);
    triggerAlert('success', isRtl ? 'تم تعليم جميع الرسائل كمُرسلة بنجاح' : 'All items marked as sent');
  };

  // Copy message text helper
  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    triggerAlert('success', isRtl ? "تم نسخ نص الرسالة إلى الحافظة" : "Message copied to clipboard");
  };

  // Update a single item's message in the queue
  const handleUpdateItemMessage = (id: string, newMsg: string) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, message: newMsg } : q));
  };

  // Mark item status
  const handleSetItemStatus = (id: string, status: 'pending' | 'sent' | 'skipped') => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, status } : q));
  };

  // Reset all statuses
  const handleResetQueueStatus = () => {
    setQueue(prev => prev.map(q => ({ ...q, status: 'pending' })));
    setActiveQueueIndex(0);
  };

  // Filtered queue items
  const filteredQueue = useMemo(() => {
    if (queueFilter === 'pending') return queue.filter(q => q.status === 'pending');
    if (queueFilter === 'sent') return queue.filter(q => q.status === 'sent');
    if (queueFilter === 'issues') return queue.filter(q => !q.isValidPhone);
    return queue;
  }, [queue, queueFilter]);

  // Summary counts
  const sentCount = queue.filter(q => q.status === 'sent').length;
  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const invalidCount = queue.filter(q => !q.isValidPhone).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[94vh] shadow-2xl border border-gray-150 flex flex-col overflow-hidden text-xs my-auto">
        
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center text-emerald-200 border border-white/20 shadow-inner">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">
                  {isRtl ? "إرسال رسائل وتقارير واتساب" : "WhatsApp Reports & Messaging"}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/20 text-emerald-200 border border-emerald-300/30">
                  {isRtl ? "الرابط الرسمي" : "Official Link"}
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/90 mt-0.5">
                {isRtl ? "إرسال تقارير الحضور والدرجات لأولياء الأمور والطلاب عبر واتساب مباشرة" : "Send attendance and grades reports to parents and students via WhatsApp"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentStep === 'queue' && (
              <button
                type="button"
                onClick={() => setCurrentStep('configure')}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer border border-white/10"
              >
                <ChevronRight className={`h-4 w-4 ${isRtl ? '' : 'rotate-180'}`} />
                <span>{isRtl ? "تعديل الإعدادات" : "Back to Settings"}</span>
              </button>
            )}

            <button 
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ================= STEP 1: CONFIGURE & SELECT ================= */}
        {currentStep === 'configure' && (
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
            
            {/* Top Bar: Country Code & Target Recipient */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              
              {/* Country Code Picker */}
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{isRtl ? "مفتاح الدولة الافتراضي لأرقام الهواتف:" : "Default Country Code:"}</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedCountryCode}
                    onChange={(e) => setSelectedCountryCode(e.target.value)}
                    className="w-full py-2 px-3 border border-gray-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>

                  {selectedCountryCode === 'custom' && (
                    <input
                      type="text"
                      placeholder={isRtl ? "اكتب رمز الدولة مثلاً 964" : "e.g. 964"}
                      value={customCountryCode}
                      onChange={(e) => setCustomCountryCode(e.target.value)}
                      className="py-2 px-3 border border-emerald-300 rounded-xl text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {isRtl ? "* يُضاف تلقائياً للأرقام المحلية مثل 0780xxxxxx لتصبح 964780xxxxxx" : "* Auto-formatted for local numbers"}
                </p>
              </div>

              {/* Recipient Target */}
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                  <span>{isRtl ? "إرسال الرسائل إلى:" : "Send Messages To:"}</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipientTarget('parent')}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer border ${
                      recipientTarget === 'parent'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-gray-200 hover:bg-slate-100'
                    }`}
                  >
                    {isRtl ? "👨‍👦 ولي الأمر" : "Parent"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecipientTarget('student')}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer border ${
                      recipientTarget === 'student'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-gray-200 hover:bg-slate-100'
                    }`}
                  >
                    {isRtl ? "🎓 الطالب" : "Student"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecipientTarget('both')}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer border ${
                      recipientTarget === 'both'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-white text-slate-700 border-gray-200 hover:bg-slate-100'
                    }`}
                  >
                    {isRtl ? "✨ كلاهما معاً" : "Both"}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {recipientTarget === 'both' 
                    ? (isRtl ? "* سيتم إنشاء رسالتين لكل طالب (رسالة للأب ورسالة للطالب)" : "* 2 messages per student")
                    : (isRtl ? "* سيتم الإرسال على الرقم المسجل المختار" : "* Sending to selected number")}
                </p>
              </div>

            </div>

            {/* Template Selector & Editor */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-amber-600" />
                  <span>{isRtl ? "نموذج الرسالة التلقائي (Template):" : "Message Template Preset:"}</span>
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  {isRtl ? "يتم ملء بيانات كل طالب تلقائياً" : "Auto-filled with student data"}
                </span>
              </div>

              {/* Template Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTemplateType('last_week')}
                  className={`p-2.5 rounded-xl font-bold text-xs text-right transition-all border flex flex-col gap-1 cursor-pointer ${
                    templateType === 'last_week' 
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-500 ring-2 ring-emerald-500/20' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-extrabold flex items-center gap-1">
                    <span>📊</span>
                    <span>{isRtl ? "تقرير الأسبوع الماضي" : "Last Week Progress"}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isRtl ? "حضور الأسبوع والدرجات الأخيرة" : "Last 7 days attendance & grades"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateType('full_report')}
                  className={`p-2.5 rounded-xl font-bold text-xs text-right transition-all border flex flex-col gap-1 cursor-pointer ${
                    templateType === 'full_report' 
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-500 ring-2 ring-emerald-500/20' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-extrabold flex items-center gap-1">
                    <span>📑</span>
                    <span>{isRtl ? "التقرير الشامل" : "Comprehensive Report"}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isRtl ? "كافة الحصص والاختبارات والملاحظات" : "Full attendance & exam history"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateType('absence_alert')}
                  className={`p-2.5 rounded-xl font-bold text-xs text-right transition-all border flex flex-col gap-1 cursor-pointer ${
                    templateType === 'absence_alert' 
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-500 ring-2 ring-emerald-500/20' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-extrabold flex items-center gap-1">
                    <span>⚠️</span>
                    <span>{isRtl ? "تنبيه الحضور والغياب" : "Absence Alert"}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isRtl ? "حصر تواريخ الغياب والتحذير" : "List of missed sessions"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateType('latest_exam')}
                  className={`p-2.5 rounded-xl font-bold text-xs text-right transition-all border flex flex-col gap-1 cursor-pointer ${
                    templateType === 'latest_exam' 
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-500 ring-2 ring-emerald-500/20' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-extrabold flex items-center gap-1">
                    <span>🎯</span>
                    <span>{isRtl ? "نتيجة آخر اختبار" : "Latest Exam Result"}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isRtl ? "درجة أحدث امتحان مع النسبة" : "Score & percentage of last test"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateType('credentials')}
                  className={`p-2.5 rounded-xl font-bold text-xs text-right transition-all border flex flex-col gap-1 cursor-pointer ${
                    templateType === 'credentials' 
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-500 ring-2 ring-emerald-500/20' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-extrabold flex items-center gap-1">
                    <span>🔑</span>
                    <span>{isRtl ? "بيانات الدخول للوحة" : "Login Credentials"}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isRtl ? "رقم الهاتف وكلمات المرور" : "Username & passwords for portal"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateType('custom')}
                  className={`p-2.5 rounded-xl font-bold text-xs text-right transition-all border flex flex-col gap-1 cursor-pointer ${
                    templateType === 'custom' 
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-500 ring-2 ring-emerald-500/20' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-extrabold flex items-center gap-1">
                    <span>✏️</span>
                    <span>{isRtl ? "رسالة مخصصة (Custom)" : "Custom Template"}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isRtl ? "صياغة رسالة حرة بمتغيرات" : "Write your own template"}
                  </span>
                </button>
              </div>

              {/* Custom Template Editor */}
              {templateType === 'custom' && (
                <div className="space-y-2.5 pt-2 border-t border-gray-100 animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-500">
                    <span className="font-extrabold text-slate-700">{isRtl ? "المتغيرات المتاحة للإدراج:" : "Available variables:"}</span>
                    {[
                      { tag: '{student_name}', label: isRtl ? 'اسم الطالب' : 'Student Name', icon: '👤', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
                      { tag: '{student_phone}', label: isRtl ? 'رقم هاتف الطالب' : 'Student Phone Number', icon: '📱', color: 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' },
                      { tag: '{student_pass}', label: isRtl ? 'كلمة مرور الطالب' : 'Student Password', icon: '🔑', color: 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' },
                      { tag: '{parent_phone}', label: isRtl ? 'رقم هاتف ولي الأمر' : 'Parent Phone Number', icon: '📞', color: 'bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100' },
                      { tag: '{parent_pass}', label: isRtl ? 'كلمة مرور ولي الأمر' : 'Parent Password', icon: '🛡️', color: 'bg-violet-50 text-violet-800 border-violet-300 hover:bg-violet-100' },
                      { tag: '{password}', label: isRtl ? 'كلمة المرور الحالية' : 'Active Password', icon: '🔒', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
                      { tag: '{year}', label: isRtl ? 'المرحلة' : 'Year', icon: '🎓', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
                      { tag: '{group}', label: isRtl ? 'المجموعة' : 'Group', icon: '👥', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
                      { tag: '{att_rate}', label: isRtl ? 'نسبة الحضور' : 'Att %', icon: '📊', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
                      { tag: '{last_week_att}', label: isRtl ? 'حضور الأسبوع' : 'Last Week Att', icon: '📅', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
                      { tag: '{recent_grades}', label: isRtl ? 'الدرجات الأخيرة' : 'Grades', icon: '📝', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
                      { tag: '{latest_exam}', label: isRtl ? 'آخر اختبار' : 'Latest Exam', icon: '🎯', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
                      { tag: '{notes}', label: isRtl ? 'ملاحظات المشرف' : 'Notes', icon: '📌', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' }
                    ].map(v => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => setCustomTemplateText(prev => prev + ' ' + v.tag)}
                        className={`px-2 py-0.5 rounded-md cursor-pointer border font-mono transition-all flex items-center gap-1 shadow-2xs ${v.color}`}
                        title={v.label}
                      >
                        {v.icon && <span className="text-[9px]">{v.icon}</span>}
                        <span>{v.tag}</span>
                      </button>
                    ))}
                  </div>

                  {/* Quick Preset Templates */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="text-[10px] font-bold text-slate-400">{isRtl ? "نماذج سريعة:" : "Quick Presets:"}</span>
                    <button
                      type="button"
                      onClick={() => setCustomTemplateText(
                        isRtl
                          ? `السلام عليكم ورحمة الله،\nبيانات تسجيل الدخول لحساب الطالب/ة: *{student_name}*\n• رقم هاتف الطالب: {student_phone}\n• كلمة مرور الطالب: {student_pass}\n• رقم هاتف ولي الأمر: {parent_phone}\n• كلمة مرور ولي الأمر: {parent_pass}\nالمرحلة: {year} | {group}\n{notes}\nنتمنى لكم دوام التفوق والنجاح.`
                          : `Hello,\nLogin credentials for: *{student_name}*\n• Student Phone: {student_phone}\n• Student Password: {student_pass}\n• Parent Phone: {parent_phone}\n• Parent Password: {parent_pass}\nClass: {year} | {group}\n{notes}\nBest regards.`
                      )}
                      className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 cursor-pointer font-bold text-[10px] transition-colors flex items-center gap-1"
                    >
                      <span>🔑</span>
                      <span>{isRtl ? "قالب بيانات الدخول (طالب + ولي أمر)" : "Credentials Template (Student & Parent)"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomTemplateText(
                        isRtl
                          ? `السلام عليكم ورحمة الله،\nتقرير متابعة الطالب/ة: *{student_name}*\n• نسبة الحضور: {att_rate}\n• حضور الأسبوع: {last_week_att}\n• درجات الاختبارات: {recent_grades}\n{notes}`
                          : `Hello,\nProgress report for: *{student_name}*\n• Attendance: {att_rate}\n• Last week: {last_week_att}\n• Recent grades: {recent_grades}\n{notes}`
                      )}
                      className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 cursor-pointer font-bold text-[10px] transition-colors flex items-center gap-1"
                    >
                      <span>📊</span>
                      <span>{isRtl ? "قالب تقرير المتابعة والدرجات" : "Academic Report Template"}</span>
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    value={customTemplateText}
                    onChange={(e) => setCustomTemplateText(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-xl text-xs font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500"
                    placeholder={isRtl ? "اكتب نص الرسالة هنا..." : "Type custom message..."}
                  />
                </div>
              )}

              {/* Sample Live Preview */}
              {filteredStudents.length > 0 && (
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-black text-slate-500">
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-emerald-600" />
                      <span>{isRtl ? `معاينة حية للرسالة (طالب نموذج: ${filteredStudents[0].name})` : `Live Sample Preview (${filteredStudents[0].name})`}</span>
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 bg-white p-3 rounded-lg border border-slate-200 max-h-32 overflow-y-auto leading-relaxed">
                    {generateStudentMessage(filteredStudents[0], templateType, customTemplateText, recipientTarget === 'student' ? 'student' : 'parent')}
                  </pre>
                </div>
              )}
            </div>

            {/* Target Students / Groups Selection */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span>{isRtl ? "تحديد الطلاب والمجموعات المستهدفة:" : "Target Students & Groups:"}</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isRtl 
                      ? `تم تحديد ${selectedStudentIds.size} من أصل ${students.length} طالب` 
                      : `Selected ${selectedStudentIds.size} of ${students.length} students`}
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="flex-1 sm:flex-initial px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-all cursor-pointer"
                  >
                    {isRtl ? "تحديد الكل" : "Select All"}
                  </button>

                  <button
                    type="button"
                    onClick={handleDeselectAllVisible}
                    className="flex-1 sm:flex-initial px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-all cursor-pointer"
                  >
                    {isRtl ? "إلغاء التحديد" : "Deselect All"}
                  </button>
                </div>
              </div>

              {/* Group & Year filter chips */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500">{isRtl ? "المرحلة:" : "Year:"}</span>
                  <select
                    value={filterYear}
                    onChange={(e) => {
                      setFilterYear(e.target.value);
                      setFilterGroup('all');
                    }}
                    className="bg-transparent text-xs font-bold text-slate-800 border-none outline-hidden cursor-pointer"
                  >
                    <option value="all">{isRtl ? "جميع المراحل" : "All Years"}</option>
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500">{isRtl ? "المجموعة:" : "Group:"}</span>
                  <select
                    value={filterGroup}
                    onChange={(e) => setFilterGroup(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 border-none outline-hidden cursor-pointer"
                  >
                    <option value="all">{isRtl ? "جميع المجموعات" : "All Groups"}</option>
                    {groups
                      .filter(g => filterYear === 'all' || g.academicYear === filterYear)
                      .map(g => (
                        <option key={g.id} value={g.id}>{g.name || `${isRtl ? "مجموعة" : "Group"} ${g.groupNumber}`}</option>
                      ))
                    }
                  </select>
                </div>

                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isRtl ? "بحث بالاسم أو الهاتف..." : "Search student..."}
                    className="w-full pr-8 pl-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Student Checklist Table */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto divide-y divide-gray-100">
                {filteredStudents.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 font-bold">
                    {isRtl ? "لا يوجد طلاب مطابقين للتصفية." : "No students match filter."}
                  </div>
                ) : (
                  filteredStudents.map(student => {
                    const isSelected = selectedStudentIds.has(student.id);
                    const yearObj = years.find(y => y.id === student.academicYear);
                    const groupObj = groups.find(g => g.id === student.groupId);

                    return (
                      <div 
                        key={student.id}
                        onClick={() => toggleStudentSelected(student.id)}
                        className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                          isSelected ? 'bg-emerald-50/70 hover:bg-emerald-100/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // handled by parent div
                            className="w-4 h-4 text-emerald-600 rounded-md border-gray-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <span className="font-extrabold text-slate-900 block truncate">{student.name}</span>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                              <span>📱 {student.phone}</span>
                              <span>•</span>
                              <span>👨‍👦 {student.parentPhone}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {yearObj && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                              {yearObj.name}
                            </span>
                          )}
                          {groupObj && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700">
                              {groupObj.name || `${isRtl ? "مجموعة" : "Group"} ${groupObj.groupNumber}`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>

            {/* Bottom Actions for Step 1 */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-slate-500 font-bold">
                {isRtl 
                  ? `الإجمالي المطلوب إرساله: ${selectedStudentIds.size * (recipientTarget === 'both' ? 2 : 1)} رسالة` 
                  : `Total queue items: ${selectedStudentIds.size * (recipientTarget === 'both' ? 2 : 1)} messages`}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-initial px-4 py-2.5 border rounded-xl hover:bg-gray-50 text-gray-700 font-bold transition-all cursor-pointer"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>

                <button
                  type="button"
                  onClick={handleProceedToQueue}
                  disabled={selectedStudentIds.size === 0}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{isRtl ? "مراجعة القائمة أولاً" : "Review Queue"}</span>
                  <ArrowRight className={`h-4 w-4 ${isRtl ? 'rotate-180' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => handleStartSendToAll(true)}
                  disabled={selectedStudentIds.size === 0}
                  className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title={isRtl ? "تجهيز القائمة وبدء الإرسال للجميع فوراً" : "Send to all selected students"}
                >
                  <Zap className="h-4 w-4" />
                  <span>{isRtl ? "إرسال للجميع (Send to All)" : "Send to All"}</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ================= STEP 2: QUEUE & DISPATCHER ================= */}
        {currentStep === 'queue' && (
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
            
            {/* Sequential Runner Active Card */}
            {isRunnerActive && (
              <div className="p-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl shadow-xl border border-emerald-500/40 space-y-3 animate-in fade-in duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-2">
                      <span>{isRtl ? "الإرسال التتابعي للجميع نشط" : "Send to All Sequence Active"}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/20">
                        {activeQueueIndex + 1} / {queue.length}
                      </span>
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAutoPlay(!isAutoPlay)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                        isAutoPlay 
                          ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black' 
                          : 'bg-white/20 hover:bg-white/30 text-white'
                      }`}
                    >
                      {isAutoPlay ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      <span>
                        {isAutoPlay 
                          ? (isRtl ? `تلقائي (${autoCountdown}ث)` : `Auto (${autoCountdown}s)`) 
                          : (isRtl ? "تشغيل الانتقال التلقائي" : "Enable Auto Next")}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsRunnerActive(false);
                        setIsAutoPlay(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all cursor-pointer"
                    >
                      {isRtl ? "إيقاف" : "Stop"}
                    </button>
                  </div>
                </div>

                {queue[activeQueueIndex] && (
                  <div className="bg-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-white/10">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-emerald-300">
                          {queue[activeQueueIndex].recipientLabel}
                        </span>
                        <span className="font-mono text-xs font-bold text-white/90">
                          +{queue[activeQueueIndex].cleanPhone}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/70 truncate max-w-lg">
                        {queue[activeQueueIndex].message.replace(/\n/g, ' ')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleRunnerNext}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-lg"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>{isRtl ? "فتح وإرسال التالي ➔" : "Send Next ➔"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Queue Progress & Summary Header */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    {isRtl ? "قائمة إرسال واتساب الجاهزة:" : "WhatsApp Dispatch Queue:"}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-200 text-slate-800">
                    {sentCount} / {queue.length} {isRtl ? "مُرسل" : "Sent"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleMarkAllAsSent}
                    className="px-2.5 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer flex items-center gap-1"
                    title={isRtl ? "تعليم جميع الرسائل في القائمة كمُرسلة" : "Mark all items as sent"}
                  >
                    <CheckCheck className="h-3 w-3 text-emerald-600" />
                    <span>{isRtl ? "تعليم الكل كمُرسل" : "Mark All Sent"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetQueueStatus}
                    className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{isRtl ? "إعادة تعيين الحالة" : "Reset Queue"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTroubleshootTip(!showTroubleshootTip)}
                    className="px-2.5 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer flex items-center gap-1"
                  >
                    <Info className="h-3 w-3" />
                    <span>{isRtl ? "تعليمات" : "Instructions"}</span>
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full transition-all duration-300"
                  style={{ width: `${queue.length > 0 ? (sentCount / queue.length) * 100 : 0}%` }}
                />
              </div>

              {/* Filter Tabs for Queue */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQueueFilter('all')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      queueFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {isRtl ? `الكل (${queue.length})` : `All (${queue.length})`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setQueueFilter('pending')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      queueFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {isRtl ? `قيد الإرسال (${pendingCount})` : `Pending (${pendingCount})`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setQueueFilter('sent')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      queueFilter === 'sent' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {isRtl ? `تم الفتح / الإرسال (${sentCount})` : `Sent (${sentCount})`}
                  </button>

                  {invalidCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setQueueFilter('issues')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        queueFilter === 'issues' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {isRtl ? `أرقام تحتاج مراجعة (${invalidCount})` : `Invalid Numbers (${invalidCount})`}
                    </button>
                  )}
                </div>

                {/* Send to all mini trigger */}
                {pendingCount > 0 && !isRunnerActive && (
                  <button
                    type="button"
                    onClick={() => handleStartSendToAll(false)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>{isRtl ? "بدء الإرسال للجميع" : "Send All"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Troubleshooting / Instructions Tip */}
            {showTroubleshootTip && (
              <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-2 animate-in fade-in duration-200">
                <div className="font-extrabold flex items-center gap-1.5 text-blue-950">
                  <Info className="h-4 w-4 text-blue-600" />
                  <span>{isRtl ? "كيفية عمل الإرسال في تطبيق أندرويد وواتساب:" : "How WhatsApp Messaging Works:"}</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-blue-800 leading-relaxed pr-2">
                  <li>
                    {isRtl 
                      ? "عند النقر على 'فتح وإرسال عبر واتساب'، يفتح التطبيق محادثة الرقم المحدد مع نص الرسالة معبأ وجاهز تلقائياً." 
                      : "Clicking 'Open in WhatsApp' opens the chat with the pre-filled message."}
                  </li>
                  <li>
                    {isRtl 
                      ? "وفقاً لسياسة الأمان الرسمية في واتساب ونظام أندرويد، يقوم المشرف فقط بالنقر على زر الإرسال الأخضر داخل واتساب للتأكيد." 
                      : "Per WhatsApp and Android policy, the user confirms and taps Send inside WhatsApp."}
                  </li>
                  <li>
                    {isRtl 
                      ? "إذا لم يكن تطبيق واتساب مثبتاً أو كان الرقم دولياً مختلفاً، يمكنك استخدام زر 'نسخ الرسالة' أو التعديل المباشر قبل الإرسال." 
                      : "If WhatsApp is not installed, you can use the Copy Message option."}
                  </li>
                </ul>
              </div>
            )}

            {/* Recipient Cards in Queue */}
            <div className="space-y-3.5">
              {filteredQueue.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 font-bold space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                  <p>{isRtl ? "لا توجد رسائل في هذا التبويب." : "No recipients in this tab."}</p>
                </div>
              ) : (
                filteredQueue.map((item, idx) => {
                  const isSent = item.status === 'sent';
                  const isSkipped = item.status === 'skipped';

                  return (
                    <div 
                      key={item.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-xs ${
                        !item.isValidPhone 
                          ? 'border-red-200 bg-red-50/30'
                          : isSent
                            ? 'border-emerald-200 bg-emerald-50/20'
                            : 'border-gray-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {/* Item Top Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                            isSent 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : !item.isValidPhone 
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-800'
                          }`}>
                            {idx + 1}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-black text-slate-900 tracking-tight">
                                {item.recipientLabel}
                              </h4>
                              
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                item.recipientType === 'parent' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {item.recipientType === 'parent' ? (isRtl ? "ولي أمر" : "Parent") : (isRtl ? "طالب" : "Student")}
                              </span>

                              {item.groupName && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                  {item.groupName}
                                </span>
                              )}
                            </div>

                            {/* Phone info with formatted status */}
                            <div className="flex items-center gap-2 text-xs mt-1">
                              <span className="text-slate-400 font-medium">📱 {isRtl ? "الرقم:" : "Phone:"}</span>
                              <span className="font-mono font-black text-slate-900 tracking-wider">
                                {item.rawPhone}
                              </span>

                              {item.isValidPhone ? (
                                <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  +{item.cleanPhone}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>{item.phoneError || (isRtl ? "رقم غير صالح" : "Invalid phone")}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {isSent && (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-200">
                              <Check className="h-3.5 w-3.5" />
                              <span>{isRtl ? "تم الفتح في واتساب" : "Opened"}</span>
                            </span>
                          )}

                          {isSkipped && (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                              {isRtl ? "تم التخطي" : "Skipped"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Editable Message Box */}
                      <div className="pt-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                          <span>{isRtl ? "نص الرسالة المجهز لهذا المستلم (يمكنك تعديلها):" : "Prepared Message (editable):"}</span>
                          <span className="text-slate-400 font-mono text-[10px]">{item.message.length} {isRtl ? "حرف" : "chars"}</span>
                        </div>

                        <textarea
                          rows={3}
                          value={item.message}
                          onChange={(e) => handleUpdateItemMessage(item.id, e.target.value)}
                          className="w-full p-2.5 bg-slate-50/70 border border-gray-200 rounded-xl text-xs font-sans leading-relaxed focus:bg-white focus:ring-2 focus:ring-emerald-500 text-slate-800"
                        />
                      </div>

                      {/* Actions for this item */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyMessage(item.message)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            <span>{isRtl ? "نسخ النص" : "Copy Text"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetItemStatus(item.id, isSent ? 'pending' : 'sent')}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                              isSent 
                                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            <span>{isSent ? (isRtl ? "إلغاء التعليم" : "Unmark Sent") : (isRtl ? "تعليم كمُرسل يدوي" : "Mark Sent")}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetItemStatus(item.id, isSkipped ? 'pending' : 'skipped')}
                            className="px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl font-bold text-xs transition-all cursor-pointer"
                          >
                            <span>{isSkipped ? (isRtl ? "استعادة" : "Restore") : (isRtl ? "تخطي" : "Skip")}</span>
                          </button>
                        </div>

                        {/* BIG GREEN WHATSAPP TRIGGER */}
                        <button
                          type="button"
                          disabled={!item.isValidPhone}
                          onClick={() => handleOpenWhatsApp(item, idx)}
                          className={`px-4 py-2 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                            !item.isValidPhone 
                              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                              : isSent
                                ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/30'
                          }`}
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{isRtl ? "فتح وإرسال عبر واتساب" : "Open in WhatsApp"}</span>
                          <ExternalLink className="h-3 w-3 opacity-70" />
                        </button>
                      </div>

                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Controls Bar for Queue */}
            <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg z-10">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setCurrentStep('configure')}
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ChevronRight className={`h-4 w-4 ${isRtl ? '' : 'rotate-180'}`} />
                  <span>{isRtl ? "النماذج" : "Templates"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleMarkAllAsSent}
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <CheckCheck className="h-4 w-4 text-blue-600" />
                  <span>{isRtl ? "تعليم الكل كمُرسل" : "Mark All Sent"}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (isRunnerActive) {
                      handleRunnerNext();
                    } else {
                      handleStartSendToAll(false);
                    }
                  }}
                  disabled={pendingCount === 0}
                  className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title={isRtl ? "إرسال الرسائل لجميع الطلاب بالتتابع" : "Send to all students sequentially"}
                >
                  <Zap className="h-4 w-4" />
                  <span>
                    {isRunnerActive 
                      ? (isRtl ? "فتح وإرسال التالي ➔" : "Send Next ➔") 
                      : (isRtl ? `إرسال للجميع (${pendingCount})` : `Send to All (${pendingCount})`)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs transition-all cursor-pointer shadow-xs"
                >
                  {isRtl ? "إنهاء وإغلاق" : "Done"}
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
