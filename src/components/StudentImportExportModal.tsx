import React, { useState, useRef } from "react";
import { 
  X, Upload, Download, FileText, CheckCircle2, AlertCircle, 
  Users, Layers, Sparkles, RefreshCw, AlertTriangle, Key, Phone, User
} from "lucide-react";
import { db } from "../firebase";
import { doc, writeBatch } from "firebase/firestore";
import { AcademicYear, Group, Student } from "../types";
import { Language } from "../lib/translations";

export interface StudentImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'import' | 'export';
  targetGroup?: Group | null;
  targetYear?: AcademicYear | null;
  students: Student[];
  years: AcademicYear[];
  groups: Group[];
  lang: Language;
  isRtl: boolean;
  onSuccess?: () => void;
  triggerAlert: (type: 'success' | 'error', text: string) => void;
}

interface ParsedStudentItem {
  name: string;
  phone: string;
  parentPhone: string;
  gender: 'male' | 'female';
  academicYear: string;
  groupId: string;
  password: string;
  parentPassword: string;
  studentCode?: string;
  notes?: string;
  enabled: boolean;
  isValid: boolean;
  errorMessage?: string;
  isExisting: boolean;
}

export const generatePassword = (): string => {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const downloadJsonFile = (data: any, filename: string) => {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function StudentImportExportModal({
  isOpen,
  onClose,
  initialMode = 'import',
  targetGroup,
  targetYear,
  students,
  years,
  groups,
  lang,
  isRtl,
  onSuccess,
  triggerAlert
}: StudentImportExportModalProps) {
  const [activeMode, setActiveMode] = useState<'import' | 'export'>(initialMode);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedStudents, setParsedStudents] = useState<ParsedStudentItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Group / Year override for general import
  const [overrideYearId, setOverrideYearId] = useState<string>(() => {
    return targetGroup?.academicYear || targetYear?.id || years[0]?.id || "";
  });
  const [overrideGroupId, setOverrideGroupId] = useState<string>(() => {
    return targetGroup?.id || "";
  });

  // Export State
  const [exportYearFilter, setExportYearFilter] = useState<string>(() => {
    return targetGroup?.academicYear || targetYear?.id || "all";
  });
  const [exportGroupFilter, setExportGroupFilter] = useState<string>(() => {
    return targetGroup?.id || "all";
  });
  const [exportGenderFilter, setExportGenderFilter] = useState<'all' | 'male' | 'female'>(() => {
    return targetGroup?.gender || "all";
  });

  // Sync mode when initialMode changes or modal opens
  React.useEffect(() => {
    setActiveMode(initialMode);
    if (targetGroup) {
      setOverrideYearId(targetGroup.academicYear);
      setOverrideGroupId(targetGroup.id);
      setExportYearFilter(targetGroup.academicYear);
      setExportGroupFilter(targetGroup.id);
      setExportGenderFilter(targetGroup.gender);
    } else if (targetYear) {
      setOverrideYearId(targetYear.id);
      setExportYearFilter(targetYear.id);
    }
  }, [initialMode, targetGroup, targetYear]);

  if (!isOpen) return null;

  // Active target group display details
  const currentTargetGroup = targetGroup || groups.find(g => g.id === overrideGroupId);
  const currentTargetYear = targetYear || years.find(y => y.id === (currentTargetGroup?.academicYear || overrideYearId));

  // --- PARSE JSON FILE ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setSelectedFile(file);
    setParseError(null);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let rawData: any;
        try {
          rawData = JSON.parse(text);
        } catch (err: any) {
          throw new Error(isRtl ? "الملف ليس بصيغة JSON صحيحة. يرجى التأكد من صياغة الملف." : "Invalid JSON syntax. Please check file formatting.");
        }

        // Handle array, or { students: [...] }, or { data: [...] }
        let items: any[] = [];
        if (Array.isArray(rawData)) {
          items = rawData;
        } else if (rawData && typeof rawData === 'object') {
          if (Array.isArray(rawData.students)) {
            items = rawData.students;
          } else if (Array.isArray(rawData.data)) {
            items = rawData.data;
          } else if (rawData.name && (rawData.phone || rawData.studentPhone)) {
            // single student object
            items = [rawData];
          } else {
            throw new Error(isRtl ? "لم يتم العثور على مصفوفة بيانات طلاب في ملف JSON." : "No student array found in the JSON file.");
          }
        }

        if (items.length === 0) {
          throw new Error(isRtl ? "ملف JSON فارغ ولا يحتوي على سجلات طلاب." : "The JSON file contains 0 student records.");
        }

        // Map and validate students
        const existingPhones = new Set(students.map(s => s.phone.trim()));
        const seenInFile = new Set<string>();

        const parsed: ParsedStudentItem[] = items.map((item: any, index: number) => {
          // Flexible key names
          const name = String(item.name || item.studentName || item["الاسم"] || item["اسم الطالب"] || "").trim();
          let phone = String(
            item.phone ?? 
            item.studentPhone ?? 
            item.number ?? 
            item.studentNumber ?? 
            item.mobile ?? 
            item.id ?? 
            item["الهاتف"] ?? 
            item["رقم الهاتف"] ?? 
            item["رقم الطالب"] ?? 
            item["الرقم"] ?? 
            item["رقم"] ?? 
            ""
          ).trim();
          // Remove spaces, dashes
          phone = phone.replace(/[\s-]/g, "");

          let parentPhone = String(
            item.parentPhone ?? 
            item.guardianPhone ?? 
            item.parentNumber ?? 
            item["هاتف ولي الأمر"] ?? 
            item["رقم ولي الأمر"] ?? 
            item["ولي الأمر"] ?? 
            ""
          ).trim();
          parentPhone = parentPhone.replace(/[\s-]/g, "");
          if (!parentPhone) {
            parentPhone = phone; // Fallback to student phone if not provided
          }

          // Gender resolution:
          // 1. If targetGroup specified -> group's gender
          // 2. If item specifies gender -> parse it
          // 3. Fallback to male
          let gender: 'male' | 'female' = 'male';
          if (currentTargetGroup) {
            gender = currentTargetGroup.gender;
          } else if (item.gender === 'female' || item.gender === 'girl' || item["الجنس"] === 'بنات' || item["الجنس"] === 'أنثى' || item["النوع"] === 'بنات') {
            gender = 'female';
          } else if (item.gender === 'male' || item.gender === 'boy' || item["الجنس"] === 'بنين' || item["الجنس"] === 'ذكر' || item["النوع"] === 'بنين') {
            gender = 'male';
          }

          // Academic Year resolution
          const academicYear = currentTargetGroup?.academicYear || overrideYearId || String(item.academicYear || item["السنة الدراسية"] || years[0]?.id || "");

          // Group resolution
          const groupId = currentTargetGroup?.id || overrideGroupId || String(item.groupId || item.group || item["المجموعة"] || "");

          // Passwords: keep if provided, otherwise generate
          const password = String(item.password || item["كلمة المرور"] || "").trim() || generatePassword();
          const parentPassword = String(item.parentPassword || item["كلمة مرور ولي الأمر"] || "").trim() || generatePassword();

          const studentCode = item.studentCode || item["كود الطالب"] ? String(item.studentCode || item["كود الطالب"]).trim() : undefined;
          const notes = String(item.notes || item["ملاحظات"] || "").trim();
          const enabled = item.enabled !== false && item["مفعل"] !== false;

          // Validation
          let isValid = true;
          let errorMessage: string | undefined;

          if (!name) {
            isValid = false;
            errorMessage = isRtl ? "اسم الطالب مفقود" : "Student name is missing";
          } else if (!phone || phone.length === 0) {
            isValid = false;
            errorMessage = isRtl ? "رقم الطالب مفقود" : "Student number is missing";
          } else if (seenInFile.has(phone)) {
            isValid = false;
            errorMessage = isRtl ? "رقم الطالب مكرر داخل هذا الملف" : "Duplicate student number inside file";
          }

          if (phone) {
            seenInFile.add(phone);
          }

          const isExisting = existingPhones.has(phone);

          return {
            name,
            phone,
            parentPhone,
            gender,
            academicYear,
            groupId,
            password,
            parentPassword,
            studentCode,
            notes,
            enabled,
            isValid,
            errorMessage,
            isExisting
          };
        });

        setParsedStudents(parsed);
      } catch (err: any) {
        setParseError(err.message || (isRtl ? "حدث خطأ أثناء قراءة الملف." : "Error reading file."));
        setParsedStudents([]);
      } finally {
        setIsParsing(false);
      }
    };

    reader.onerror = () => {
      setParseError(isRtl ? "فشل فتح وقراءة الملف." : "Failed to read file.");
      setIsParsing(false);
      setParsedStudents([]);
    };

    reader.readAsText(file);
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Download Sample Template
  const handleDownloadTemplate = () => {
    const targetGroupName = currentTargetGroup?.name || (currentTargetGroup ? `Group ${currentTargetGroup.groupNumber}` : undefined);
    const sample = [
      {
        name: "أحمد محمود علي",
        phone: "01012345678",
        parentPhone: "01098765432",
        gender: currentTargetGroup?.gender || "male",
        academicYear: currentTargetGroup?.academicYear || years[0]?.id || "2025",
        groupId: currentTargetGroup?.id || "",
        groupName: targetGroupName,
        password: "",
        parentPassword: "",
        studentCode: "STD-101",
        notes: "طالب جديد",
        enabled: true
      },
      {
        name: "عمر خالد حسن",
        phone: "01023456789",
        parentPhone: "01087654321",
        gender: currentTargetGroup?.gender || "male",
        academicYear: currentTargetGroup?.academicYear || years[0]?.id || "2025",
        groupId: currentTargetGroup?.id || "",
        groupName: targetGroupName,
        password: "",
        parentPassword: "",
        studentCode: "STD-102",
        notes: "",
        enabled: true
      }
    ];

    const filename = currentTargetGroup 
      ? `students_template_group_${currentTargetGroup.groupNumber}_${currentTargetGroup.gender}.json`
      : `students_import_template.json`;

    downloadJsonFile(sample, filename);
    triggerAlert('success', isRtl ? "تم تحميل ملف النموذج بنجاح" : "Sample template downloaded successfully");
  };

  // --- SAVE IMPORTED STUDENTS TO FIRESTORE ---
  const handleSaveImportedStudents = async () => {
    const validStudents = parsedStudents.filter(s => s.isValid);
    if (validStudents.length === 0) {
      triggerAlert('error', isRtl ? "لا توجد سجلات صالحة للإضافة." : "No valid student records to import.");
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const studentsToSave: Student[] = validStudents.map(p => {
        return {
          id: p.phone,
          name: p.name,
          phone: p.phone,
          parentPhone: p.parentPhone,
          academicYear: currentTargetGroup?.academicYear || overrideYearId || p.academicYear || years[0]?.id || "",
          groupId: currentTargetGroup?.id || overrideGroupId || p.groupId || "",
          gender: currentTargetGroup?.gender || p.gender || 'male',
          password: p.password,
          parentPassword: p.parentPassword,
          studentCode: p.studentCode || "",
          enabled: p.enabled,
          notes: p.notes || "",
          createdDate: now,
          updatedDate: now
        };
      });

      // Commit in chunks of 400 (Firestore limit is 500)
      const CHUNK_SIZE = 400;
      for (let i = 0; i < studentsToSave.length; i += CHUNK_SIZE) {
        const chunk = studentsToSave.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const student of chunk) {
          const studentRef = doc(db, "students", student.id);
          batch.set(studentRef, student, { merge: true });
        }
        await batch.commit();
      }

      const groupDesc = currentTargetGroup 
        ? ` (${currentTargetGroup.name || (isRtl ? `مجموعة ${currentTargetGroup.groupNumber}` : `Group ${currentTargetGroup.groupNumber}`)})`
        : '';

      triggerAlert(
        'success',
        isRtl 
          ? `تم استيراد وإضافة ${studentsToSave.length} طالب بنجاح${groupDesc}.` 
          : `Successfully imported ${studentsToSave.length} students${groupDesc}.`
      );

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      console.error("Import error:", err);
      triggerAlert('error', isRtl ? `فشل الاستيراد: ${err.message}` : `Import failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // --- EXPORT STUDENTS ---
  const handlePerformExport = () => {
    let filtered = [...students];

    if (exportYearFilter !== 'all') {
      filtered = filtered.filter(s => s.academicYear === exportYearFilter);
    }

    if (exportGroupFilter !== 'all') {
      filtered = filtered.filter(s => s.groupId === exportGroupFilter);
    }

    if (exportGenderFilter !== 'all') {
      filtered = filtered.filter(s => (s.gender || 'male') === exportGenderFilter);
    }

    if (filtered.length === 0) {
      triggerAlert('error', isRtl ? "لا يوجد طلاب مطابقون لمعايير التصدير المحددة." : "No students match the chosen export criteria.");
      return;
    }

    const matchedGroup = groups.find(g => g.id === exportGroupFilter);
    const matchedYear = years.find(y => y.id === exportYearFilter);

    const exportPayload = {
      exportMetadata: {
        application: "منصة المعرفة ALmarfa Platform",
        exportType: matchedGroup ? "group_roster" : "students_roster",
        exportedAt: new Date().toISOString(),
        totalCount: filtered.length,
        filterYear: matchedYear ? { id: matchedYear.id, name: matchedYear.name } : exportYearFilter,
        filterGroup: matchedGroup ? { id: matchedGroup.id, number: matchedGroup.groupNumber, name: matchedGroup.name, gender: matchedGroup.gender } : exportGroupFilter,
        filterGender: exportGenderFilter
      },
      students: filtered.map(s => {
        const studentGroup = groups.find(g => g.id === s.groupId);
        const studentYear = years.find(y => y.id === s.academicYear);
        return {
          name: s.name,
          phone: s.phone,
          parentPhone: s.parentPhone,
          gender: s.gender || 'male',
          academicYearId: s.academicYear,
          academicYearName: studentYear?.name || s.academicYear,
          groupId: s.groupId || "",
          groupNumber: studentGroup?.groupNumber || "",
          groupName: studentGroup?.name || "",
          password: s.password,
          parentPassword: s.parentPassword || s.password,
          studentCode: s.studentCode || "",
          notes: s.notes || "",
          enabled: s.enabled !== false,
          createdDate: s.createdDate,
          updatedDate: s.updatedDate
        };
      })
    };

    let filename = `students_export_${new Date().toISOString().slice(0, 10)}.json`;
    if (matchedGroup) {
      filename = `students_group_${matchedGroup.groupNumber}_${matchedGroup.gender}_${new Date().toISOString().slice(0, 10)}.json`;
    } else if (matchedYear) {
      filename = `students_year_${matchedYear.id}_${new Date().toISOString().slice(0, 10)}.json`;
    }

    downloadJsonFile(exportPayload, filename);
    triggerAlert('success', isRtl ? `تم استخراج وتصدير ${filtered.length} طالب بنجاح.` : `Exported ${filtered.length} students successfully.`);
    onClose();
  };

  const validCount = parsedStudents.filter(s => s.isValid).length;
  const invalidCount = parsedStudents.filter(s => !s.isValid).length;
  const existingCount = parsedStudents.filter(s => s.isValid && s.isExisting).length;
  const newCount = parsedStudents.filter(s => s.isValid && !s.isExisting).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5 space-x-reverse">
            <div className={`p-2.5 rounded-2xl ${activeMode === 'import' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
              {activeMode === 'import' ? <Upload className="h-5 w-5" /> : <Download className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>
                  {activeMode === 'import'
                    ? (currentTargetGroup 
                        ? (isRtl ? `إدراج ملف طلاب: ${currentTargetGroup.name || `مجموعة ${currentTargetGroup.groupNumber}`}` : `Import Students: ${currentTargetGroup.name || `Group ${currentTargetGroup.groupNumber}`}`)
                        : (isRtl ? "استيراد بيانات الطلاب من ملف JSON" : "Import Students from JSON File"))
                    : (currentTargetGroup
                        ? (isRtl ? `استخراج ملف طلاب: ${currentTargetGroup.name || `مجموعة ${currentTargetGroup.groupNumber}`}` : `Export Students: ${currentTargetGroup.name || `Group ${currentTargetGroup.groupNumber}`}`)
                        : (isRtl ? "تصدير بيانات الطلاب إلى ملف JSON" : "Export Students to JSON File"))}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isRtl 
                  ? "إدارة سريعة ومتقدمة لملفات بيانات الطلاب بصيغة JSON من لوحة التحكم فقط"
                  : "Administrative student data extraction and bulk JSON insertion."}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (only if not opened for a direct group action) */}
        <div className="px-5 pt-3 border-b border-gray-100 flex items-center justify-between bg-white">
          <div className="flex space-x-2 space-x-reverse">
            <button
              onClick={() => setActiveMode('import')}
              className={`pb-2.5 px-3 text-xs font-black border-b-2 transition-all flex items-center space-x-1.5 space-x-reverse ${
                activeMode === 'import'
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{isRtl ? "إدراج واستيراد ملف (JSON)" : "Insert & Import File"}</span>
            </button>
            <button
              onClick={() => setActiveMode('export')}
              className={`pb-2.5 px-3 text-xs font-black border-b-2 transition-all flex items-center space-x-1.5 space-x-reverse ${
                activeMode === 'export'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isRtl ? "استخراج وتصدير ملف (JSON)" : "Extract & Export File"}</span>
            </button>
          </div>

          {/* Target Group Badge if active */}
          {currentTargetGroup && (
            <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-purple-50 text-purple-800 border border-purple-200">
              <Layers className="h-3.5 w-3.5 text-purple-600" />
              <span>
                {isRtl ? "المجموعة المحددة:" : "Target Group:"} {currentTargetGroup.name || (isRtl ? `مجموعة ${currentTargetGroup.groupNumber}` : `Group ${currentTargetGroup.groupNumber}`)}
              </span>
              <span>•</span>
              <span>{currentTargetGroup.gender === 'female' ? '👧 إناث' : '👦 ذكور'}</span>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          
          {/* ===================== IMPORT MODE ===================== */}
          {activeMode === 'import' && (
            <div className="space-y-4">
              
              {/* Group context notice */}
              {currentTargetGroup ? (
                <div className="bg-purple-50/80 border border-purple-200 p-3.5 rounded-2xl flex items-start gap-2.5 text-purple-900">
                  <Sparkles className="h-4 w-4 text-purple-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-[12px]">
                      {isRtl 
                        ? `سيتم إدراج جميع الطلاب في هذا الملف مباشرة إلى "${currentTargetGroup.name || `المجموعة ${currentTargetGroup.groupNumber}`}"`
                        : `All students in this file will be enrolled into "${currentTargetGroup.name || `Group ${currentTargetGroup.groupNumber}`}".`}
                    </span>
                    <span className="text-[11px] text-purple-700 block mt-0.5">
                      {isRtl
                        ? `السنة الدراسية: ${currentTargetYear?.name || currentTargetGroup.academicYear} | الجنس: ${currentTargetGroup.gender === 'female' ? 'بنات' : 'بنين'}. إذا لم يتضمن الملف كلمة مرور فسيتم توليدها آلياً.`
                        : `Session: ${currentTargetYear?.name || currentTargetGroup.academicYear} | Gender: ${currentTargetGroup.gender}. Auto-generated passwords will be assigned if omitted.`}
                    </span>
                  </div>
                </div>
              ) : (
                /* Year & Group destination dropdowns for general import */
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-600 font-bold block mb-1 text-[11px]">
                      {isRtl ? "السنة الدراسية الافتراضية للطلاب المستوردين" : "Default Academic Year for Incoming Students"}
                    </label>
                    <select
                      value={overrideYearId}
                      onChange={(e) => setOverrideYearId(e.target.value)}
                      className="w-full border rounded-xl p-2 font-bold bg-white text-xs focus:ring-2 focus:ring-purple-600"
                    >
                      {years.map(y => (
                        <option key={y.id} value={y.id}>{y.name} ({y.id})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-600 font-bold block mb-1 text-[11px]">
                      {isRtl ? "المجموعة المدرسية المستهدفة (اختياري)" : "Target School Group (Optional)"}
                    </label>
                    <select
                      value={overrideGroupId}
                      onChange={(e) => setOverrideGroupId(e.target.value)}
                      className="w-full border rounded-xl p-2 font-bold bg-white text-xs focus:ring-2 focus:ring-purple-600"
                    >
                      <option value="">{isRtl ? "-- حسب الموجود بالملف أو بدون مجموعة --" : "-- As in file or No Group --"}</option>
                      {groups.filter(g => !overrideYearId || g.academicYear === overrideYearId).map(g => (
                        <option key={g.id} value={g.id}>
                          {g.gender === 'female' ? '👧' : '👦'} {g.name || (isRtl ? `مجموعة ${g.groupNumber}` : `Group ${g.groupNumber}`)} ({years.find(y => y.id === g.academicYear)?.name || g.academicYear})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Drag and drop upload zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragOver 
                    ? 'border-purple-600 bg-purple-50/70 scale-[1.01]' 
                    : selectedFile 
                      ? 'border-emerald-400 bg-emerald-50/40 hover:bg-emerald-50/70' 
                      : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className={`p-3 rounded-full ${selectedFile ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {selectedFile ? <CheckCircle2 className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
                  </div>
                  <div>
                    <span className="font-extrabold text-sm text-slate-800 block">
                      {selectedFile ? selectedFile.name : (isRtl ? "انقر لاختيار ملف JSON أو اسحبه وأفلته هنا" : "Click to select a JSON file or drag & drop here")}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">
                      {selectedFile 
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB` 
                        : (isRtl ? "الملفات المدعومة: .json (مصفوفة من بيانات الطلاب)" : "Supported: .json (Array of student records)")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Template Download & Help row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>{isRtl ? "تحميل نموذج ملف JSON جاهز للتعبئة" : "Download Sample JSON Template"}</span>
                </button>

                <span className="text-[11px] text-slate-400">
                  {isRtl ? "الحقول المطلوبة: الاسم والهاتف" : "Required fields: name, phone"}
                </span>
              </div>

              {/* Parsing spinner or error */}
              {isParsing && (
                <div className="flex items-center justify-center gap-2 p-4 text-purple-700 font-bold">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>{isRtl ? "جاري قراءة وفحص ملف الطلاب..." : "Parsing and validating student file..."}</span>
                </div>
              )}

              {parseError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="font-bold">{parseError}</span>
                </div>
              )}

              {/* Parsed Students Summary & Preview */}
              {parsedStudents.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900 text-xs">
                        {isRtl ? `إجمالي الطلاب بالملف: ${parsedStudents.length}` : `Total Students: ${parsedStudents.length}`}
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                        ✓ {validCount} {isRtl ? "صالح" : "Valid"}
                      </span>
                      {newCount > 0 && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                          + {newCount} {isRtl ? "جديد" : "New"}
                        </span>
                      )}
                      {existingCount > 0 && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                          ↻ {existingCount} {isRtl ? "تحديث" : "Update"}
                        </span>
                      )}
                      {invalidCount > 0 && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-bold text-[10px]">
                          ✕ {invalidCount} {isRtl ? "غير صالح" : "Invalid"}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setParsedStudents([]);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-[11px] text-slate-500 hover:text-red-600 font-bold"
                    >
                      {isRtl ? "مسح وإعادة الاختيار" : "Clear File"}
                    </button>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-50 sticky top-0 border-b border-gray-200 text-slate-500 font-bold uppercase">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">{isRtl ? "الاسم" : "Name"}</th>
                          <th className="p-2.5">{isRtl ? "الهاتف" : "Phone"}</th>
                          <th className="p-2.5">{isRtl ? "هاتف ولي الأمر" : "Parent Phone"}</th>
                          <th className="p-2.5">{isRtl ? "كلمة المرور" : "Password"}</th>
                          <th className="p-2.5">{isRtl ? "الحالة" : "Status"}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parsedStudents.map((s, idx) => (
                          <tr key={idx} className={!s.isValid ? "bg-red-50/50" : s.isExisting ? "bg-amber-50/30" : "hover:bg-slate-50"}>
                            <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-slate-800">{s.name || <span className="text-red-500 italic">--</span>}</td>
                            <td className="p-2.5 font-mono text-slate-700">{s.phone || <span className="text-red-500 italic">--</span>}</td>
                            <td className="p-2.5 font-mono text-slate-500">{s.parentPhone || s.phone}</td>
                            <td className="p-2.5 font-mono font-bold text-blue-900 bg-blue-50/40">{s.password}</td>
                            <td className="p-2.5">
                              {!s.isValid ? (
                                <span className="text-red-600 font-bold" title={s.errorMessage}>
                                  ✕ {s.errorMessage}
                                </span>
                              ) : s.isExisting ? (
                                <span className="text-amber-700 font-bold">↻ {isRtl ? "تحديث حساب موجود" : "Update Existing"}</span>
                              ) : (
                                <span className="text-emerald-700 font-bold">✓ {isRtl ? "حساب جديد" : "New Student"}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ===================== EXPORT MODE ===================== */}
          {activeMode === 'export' && (
            <div className="space-y-4">
              
              {/* Export Filters */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <span className="font-extrabold text-slate-800 block text-xs">
                  {isRtl ? "تحديد نطاق تصدير الطلاب:" : "Select Export Scope:"}
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Academic Year Filter */}
                  <div>
                    <label className="text-slate-500 block mb-1 font-bold text-[11px]">
                      {isRtl ? "السنة الدراسية" : "Academic Year"}
                    </label>
                    <select
                      value={exportYearFilter}
                      onChange={(e) => setExportYearFilter(e.target.value)}
                      className="w-full border rounded-xl p-2 font-bold bg-white text-xs"
                    >
                      <option value="all">{isRtl ? "جميع السنوات الدراسية" : "All Academic Years"}</option>
                      {years.map(y => (
                        <option key={y.id} value={y.id}>{y.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Group Filter */}
                  <div>
                    <label className="text-slate-500 block mb-1 font-bold text-[11px]">
                      {isRtl ? "المجموعة المدرسية" : "School Group"}
                    </label>
                    <select
                      value={exportGroupFilter}
                      onChange={(e) => setExportGroupFilter(e.target.value)}
                      className="w-full border rounded-xl p-2 font-bold bg-white text-xs"
                    >
                      <option value="all">{isRtl ? "جميع المجموعات" : "All Groups"}</option>
                      {groups
                        .filter(g => exportYearFilter === 'all' || g.academicYear === exportYearFilter)
                        .map(g => (
                          <option key={g.id} value={g.id}>
                            {g.gender === 'female' ? '👧' : '👦'} {g.name || (isRtl ? `مجموعة ${g.groupNumber}` : `Group ${g.groupNumber}`)}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Gender Filter */}
                  <div>
                    <label className="text-slate-500 block mb-1 font-bold text-[11px]">
                      {isRtl ? "النوع / الجنس" : "Gender"}
                    </label>
                    <select
                      value={exportGenderFilter}
                      onChange={(e) => setExportGenderFilter(e.target.value as any)}
                      className="w-full border rounded-xl p-2 font-bold bg-white text-xs"
                    >
                      <option value="all">{isRtl ? "الكل (بنين وبنات)" : "All (Boys & Girls)"}</option>
                      <option value="male">👦 {isRtl ? "بنين فقط" : "Boys Only"}</option>
                      <option value="female">👧 {isRtl ? "بنات فقط" : "Girls Only"}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Export Preview Summary Card */}
              {(() => {
                let matching = [...students];
                if (exportYearFilter !== 'all') matching = matching.filter(s => s.academicYear === exportYearFilter);
                if (exportGroupFilter !== 'all') matching = matching.filter(s => s.groupId === exportGroupFilter);
                if (exportGenderFilter !== 'all') matching = matching.filter(s => (s.gender || 'male') === exportGenderFilter);

                const boysCount = matching.filter(s => (s.gender || 'male') === 'male').length;
                const girlsCount = matching.filter(s => s.gender === 'female').length;

                return (
                  <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-900 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs">
                        {isRtl ? "جاهز للتصدير كملف JSON:" : "Ready for JSON Export:"}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-600 text-white">
                        {matching.length} {isRtl ? "طالب وطالبة" : "Students"}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px] text-blue-800 font-medium">
                      <span>👦 {boysCount} {isRtl ? "بنين" : "Boys"}</span>
                      <span>•</span>
                      <span>👧 {girlsCount} {isRtl ? "بنات" : "Girls"}</span>
                      {exportGroupFilter !== 'all' && (
                        <>
                          <span>•</span>
                          <span className="font-bold">🏷️ {groups.find(g => g.id === exportGroupFilter)?.name || (isRtl ? `مجموعة ${groups.find(g => g.id === exportGroupFilter)?.groupNumber}` : `Group ${groups.find(g => g.id === exportGroupFilter)?.groupNumber}`)}</span>
                        </>
                      )}
                    </div>

                    <p className="text-[11px] text-blue-700/90 pt-1">
                      {isRtl 
                        ? "يتضمن الملف المستخرج كافة بيانات الطالب، أرقام الهاتف، كلمات المرور الخاصة بالطالب وولي الأمر، والمجموعة المحددة."
                        : "The exported JSON contains student names, contact numbers, secure login passwords, group assignments, and status flags."}
                    </p>
                  </div>
                );
              })()}

            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="py-2.5 px-4 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            {isRtl ? "إلغاء" : "Cancel"}
          </button>

          {activeMode === 'import' ? (
            <button
              type="button"
              onClick={handleSaveImportedStudents}
              disabled={validCount === 0 || isSaving}
              className="py-2.5 px-5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>{isRtl ? "جاري الحفظ في قاعدة البيانات..." : "Saving to Database..."}</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>
                    {currentTargetGroup 
                      ? (isRtl ? `تأكيد إضافة (${validCount}) طالب للمجموعة` : `Confirm Import (${validCount}) to Group`)
                      : (isRtl ? `تأكيد استيراد (${validCount}) طالب` : `Confirm Import (${validCount}) Students`)}
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePerformExport}
              className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{isRtl ? "تحميل واستخراج ملف JSON" : "Download & Extract JSON"}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
