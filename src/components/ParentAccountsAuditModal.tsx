import React, { useState, useMemo } from 'react';
import { Student, AcademicYear, Group } from '../types';
import { 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  X, 
  Edit3, 
  Phone, 
  Key, 
  Search, 
  UserCheck, 
  ShieldAlert, 
  Copy, 
  Check, 
  HelpCircle,
  ExternalLink,
  Info
} from 'lucide-react';

export interface ParentAccountsAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  years: AcademicYear[];
  groups: Group[];
  lang: 'ar' | 'en';
  isRtl: boolean;
  onEditStudent: (student: Student) => void;
}

export interface StudentIssue {
  student: Student;
  issueTypes: ('missing_parent_phone' | 'same_phone' | 'invalid_format' | 'missing_parent_pass')[];
  descriptions: string[];
}

export interface SiblingGroup {
  parentPhone: string;
  students: Student[];
}

export default function ParentAccountsAuditModal({
  isOpen,
  onClose,
  students,
  years,
  groups,
  lang,
  isRtl,
  onEditStudent,
}: ParentAccountsAuditModalProps) {
  const [activeTab, setActiveTab] = useState<'issues' | 'siblings' | 'all'>('issues');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Maps for titles
  const yearMap = useMemo(() => new Map(years.map(y => [y.id, y.name])), [years]);
  const groupMap = useMemo(() => new Map(groups.map(g => [g.id, g.name || `${isRtl ? 'مجموعة' : 'Group'} ${g.groupNumber}`])), [groups, isRtl]);

  // Analyze all issues
  const { studentIssues, siblingGroups, uniqueParentPhones, parentCount } = useMemo(() => {
    const issuesList: StudentIssue[] = [];
    const phoneToStudents = new Map<string, Student[]>();
    const uniqueParents = new Set<string>();

    students.forEach(student => {
      const parentPhoneTrimmed = (student.parentPhone || '').trim();
      const studentPhoneTrimmed = (student.phone || '').trim();
      const issueTypes: StudentIssue['issueTypes'] = [];
      const descriptions: string[] = [];

      // 1. Missing or empty parent phone
      if (!parentPhoneTrimmed) {
        issueTypes.push('missing_parent_phone');
        descriptions.push(isRtl ? 'رقم هاتف ولي الأمر غير مسجل (فارغ)' : 'Parent phone is missing / empty');
      } else {
        uniqueParents.add(parentPhoneTrimmed);

        // Group by parent phone to find siblings
        const existing = phoneToStudents.get(parentPhoneTrimmed) || [];
        existing.push(student);
        phoneToStudents.set(parentPhoneTrimmed, existing);

        // 2. Parent phone identical to student phone
        if (studentPhoneTrimmed && parentPhoneTrimmed === studentPhoneTrimmed) {
          issueTypes.push('same_phone');
          descriptions.push(isRtl ? 'رقم ولي الأمر مطابق تماماً لرقم هاتف الطالب' : 'Parent phone is identical to student phone');
        }

        // 3. Invalid phone format (letters, symbols, or fewer than 8 digits)
        const digitsOnly = parentPhoneTrimmed.replace(/\D/g, '');
        if (digitsOnly.length < 8 || /[a-zA-Z]/.test(parentPhoneTrimmed)) {
          issueTypes.push('invalid_format');
          descriptions.push(isRtl ? 'تنسيق رقم الهاتف غير سليم (أقل من 8 أرقام أو يحتوي أحرف)' : 'Invalid phone format (too short or contains non-digits)');
        }
      }

      // 4. Missing parent password
      const parentPassTrimmed = (student.parentPassword || '').trim();
      if (!parentPassTrimmed) {
        issueTypes.push('missing_parent_pass');
        descriptions.push(isRtl ? 'كلمة مرور ولي الأمر غير محددة' : 'Parent password is not configured');
      }

      if (issueTypes.length > 0) {
        issuesList.push({
          student,
          issueTypes,
          descriptions
        });
      }
    });

    // Find siblings (parent phones shared by 2 or more students)
    const siblings: SiblingGroup[] = [];
    phoneToStudents.forEach((studentsWithPhone, phone) => {
      if (studentsWithPhone.length > 1) {
        siblings.push({
          parentPhone: phone,
          students: studentsWithPhone
        });
      }
    });

    // Sort siblings by number of students descending
    siblings.sort((a, b) => b.students.length - a.students.length);

    return {
      studentIssues: issuesList,
      siblingGroups: siblings,
      uniqueParentPhones: uniqueParents,
      parentCount: uniqueParents.size
    };
  }, [students, isRtl]);

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedPhone(text);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Filtered issues by search query
  const filteredIssues = useMemo(() => {
    if (!searchQuery.trim()) return studentIssues;
    const q = searchQuery.toLowerCase();
    return studentIssues.filter(({ student, descriptions }) => 
      student.name.toLowerCase().includes(q) ||
      student.phone.includes(q) ||
      (student.parentPhone && student.parentPhone.includes(q)) ||
      descriptions.some(d => d.toLowerCase().includes(q))
    );
  }, [studentIssues, searchQuery]);

  // Filtered sibling groups by search query
  const filteredSiblings = useMemo(() => {
    if (!searchQuery.trim()) return siblingGroups;
    const q = searchQuery.toLowerCase();
    return siblingGroups.filter(g => 
      g.parentPhone.includes(q) ||
      g.students.some(s => s.name.toLowerCase().includes(q) || s.phone.includes(q))
    );
  }, [siblingGroups, searchQuery]);

  if (!isOpen) return null;

  const totalDiscrepancy = Math.max(0, students.length - parentCount);

  return (
    <div className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] shadow-2xl border border-gray-150 flex flex-col overflow-hidden text-xs my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-800 via-emerald-900 to-teal-950 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center text-emerald-200 border border-white/20 shadow-inner">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">
                  {isRtl ? "فحص وتدقيق حسابات أولياء الأمور" : "Parent Accounts Audit & Discrepancy Breakdown"}
                </h2>
                {studentIssues.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400/20 text-amber-200 border border-amber-300/30 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{studentIssues.length} {isRtl ? "حالة بحاجة لمراجعة" : "issues found"}</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    <span>{isRtl ? "جميع البيانات سليمة" : "All records healthy"}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-200/90 mt-0.5">
                {isRtl 
                  ? "توضيح سبب اختلاف عدد حسابات أولياء الأمور عن عدد الطلاب، وفحص الحسابات غير المكتملة"
                  : "Explains why parent account count is less than students, with full diagnostics of issue accounts"}
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Diagnostic Explanation Banner */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {isRtl ? "إجمالي الطلاب المسجلين" : "Registered Students"}
              </span>
              <span className="text-xl font-black text-slate-900 mt-0.5 block">{students.length}</span>
              <span className="text-[10px] text-slate-400">{isRtl ? "طالب مسجل في النظام" : "Total enrolled"}</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                {isRtl ? "حسابات أولياء الأمور الفعلية" : "Unique Parent Accounts"}
              </span>
              <span className="text-xl font-black text-emerald-700 mt-0.5 block">{parentCount}</span>
              <span className="text-[10px] text-emerald-600/80">{isRtl ? "أرقام هواتف فريدة" : "Distinct phone numbers"}</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-blue-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                {isRtl ? "عائلات بها إخوة مشتركون" : "Shared Sibling Families"}
              </span>
              <span className="text-xl font-black text-blue-700 mt-0.5 block">{siblingGroups.length}</span>
              <span className="text-[10px] text-blue-600/80">{isRtl ? "أولياء أمور لأكثر من طالب" : "Parents with 2+ students"}</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
                {isRtl ? "سجلات بها ملاحظات/مشاكل" : "Records with Issues"}
              </span>
              <span className="text-xl font-black text-amber-700 mt-0.5 block">{studentIssues.length}</span>
              <span className="text-[10px] text-amber-600/80">{isRtl ? "تحتاج تدقيق أو تعديل" : "Needs admin attention"}</span>
            </div>
          </div>

          {/* Context Alert / Explanation */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] leading-relaxed flex items-start gap-2.5">
            <Info className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block mb-0.5">
                {isRtl ? "لماذا عدد أولياء الأمور أقل من عدد الطلاب؟" : "Why is the Parent count less than the Student count?"}
              </strong>
              {isRtl ? (
                <span>
                  نظام المنصة يربط أولياء الأمور بأرقام هواتفهم كاسم مستخدم فريد. عندما يسجل أخ وأخته بنفس هاتف والدهم، يُحسب الأب كـ <strong>حساب ولي أمر واحد</strong> بدلاً من اثنين، حيث يستطيع من خلاله إدارة كافة أبنائه في شاشة واحدة. الفرق الحالي هو ({totalDiscrepancy})، وهو ناتج إما عن اشتراك الإخوة أو وجود أرقام هواتف مفقودة في السجلات الموضحة أدناه.
                </span>
              ) : (
                <span>
                  The system tracks parent accounts by unique phone numbers. When siblings share the same parent phone number, they link to <strong>1 single parent account</strong> so the parent can toggle and view all their enrolled children. The difference of ({totalDiscrepancy}) is due to siblings sharing numbers or missing parent entries listed below.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs and Search */}
        <div className="px-5 py-3 border-b border-gray-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('issues')}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'issues'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{isRtl ? "الحسابات التي بها مشاكل" : "Accounts with Issues"}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${activeTab === 'issues' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-800'}`}>
                {studentIssues.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('siblings')}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'siblings'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>{isRtl ? "الإخوة المشتركون في نفس الرقم" : "Siblings Sharing Phone"}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${activeTab === 'siblings' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-800'}`}>
                {siblingGroups.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'all'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>{isRtl ? "كافة أولياء الأمور السليمين" : "All Healthy Parents"}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${activeTab === 'all' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-800'}`}>
                {parentCount}
              </span>
            </button>
          </div>

          {/* Search input */}
          <div className="relative w-full sm:w-64">
            <Search className={`h-3.5 w-3.5 absolute top-2.5 text-slate-400 ${isRtl ? 'right-2.5' : 'left-2.5'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? "بحث بالاسم أو الهاتف..." : "Search by name or phone..."}
              className={`w-full py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all ${
                isRtl ? 'pr-8 pl-3' : 'pl-8 pr-3'
              }`}
            />
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* ================= TAB 1: ISSUES ================= */}
          {activeTab === 'issues' && (
            <div className="space-y-3">
              {filteredIssues.length === 0 ? (
                <div className="p-8 text-center bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-black text-emerald-900">
                    {isRtl ? "لا توجد مشاكل في بيانات أولياء الأمور!" : "No Parent Account Issues Detected!"}
                  </h3>
                  <p className="text-xs text-emerald-700 max-w-md mx-auto leading-relaxed">
                    {isRtl 
                      ? "كافة الطلاب يمتلكون أرقام هواتف وكلمات مرور صالحة لأولياء أمورهم. النقصان في العدد الإجمالي ناتج بالكامل وبشكل طبيعي عن اشتراك الإخوة في نفس رقم ولي الأمر."
                      : "All students have valid parent phone numbers and credentials. The lower count is entirely due to siblings sharing the same parent contact."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
                    <span>{isRtl ? `تم رصد ${filteredIssues.length} طالب بحاجة لمراجعة بيانات ولي الأمر:` : `Found ${filteredIssues.length} students with parent account issues:`}</span>
                    <span className="text-[11px] text-amber-700 font-bold">{isRtl ? "انقر على زر 'تعديل' لإصلاح أي حساب مباشرة" : "Click 'Edit' to fix any account directly"}</span>
                  </div>

                  <div className="space-y-2.5">
                    {filteredIssues.map(({ student, descriptions, issueTypes }) => {
                      const yearName = yearMap.get(student.academicYear) || (isRtl ? 'غير محدد' : 'Unassigned');
                      const groupName = groupMap.get(student.groupId || '') || (isRtl ? 'غير محدد' : 'Unassigned');

                      return (
                        <div 
                          key={student.id} 
                          className="p-3.5 bg-white rounded-2xl border border-amber-200/90 hover:border-amber-400 hover:shadow-xs transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-slate-900 text-xs">
                                {student.name}
                              </span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {yearName} - {groupName}
                              </span>
                              {!student.enabled && (
                                <span className="px-2 py-0.2 rounded-md text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                                  {isRtl ? "معطل" : "Deactivated"}
                                </span>
                              )}
                            </div>

                            {/* Issue Flags */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {descriptions.map((desc, idx) => (
                                <span 
                                  key={idx}
                                  className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-bold text-[10px] flex items-center gap-1"
                                >
                                  <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                  <span>{desc}</span>
                                </span>
                              ))}
                            </div>

                            {/* Phone and Pass Details */}
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 pt-0.5 font-mono">
                              <span className="flex items-center gap-1">
                                <span className="font-sans text-slate-400">{isRtl ? "هاتف الطالب:" : "Student Phone:"}</span>
                                <span className="font-bold text-slate-800">{student.phone || (isRtl ? "مفقود" : "Missing")}</span>
                              </span>

                              <span className="flex items-center gap-1">
                                <span className="font-sans text-slate-400">{isRtl ? "هاتف ولي الأمر:" : "Parent Phone:"}</span>
                                <span className={`font-bold ${!student.parentPhone ? 'text-red-600 bg-red-50 px-1 rounded' : 'text-slate-800'}`}>
                                  {student.parentPhone || (isRtl ? "غير مسجل ❌" : "Not Registered ❌")}
                                </span>
                              </span>

                              <span className="flex items-center gap-1">
                                <span className="font-sans text-slate-400">{isRtl ? "كلمة مرور ولي الأمر:" : "Parent Pass:"}</span>
                                <span className={`font-bold ${!student.parentPassword ? 'text-amber-600' : 'text-slate-800'}`}>
                                  {student.parentPassword || student.password || (isRtl ? "غير محددة" : "None")}
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onEditStudent(student);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              title={isRtl ? "تعديل بيانات الطالب وإصلاح رقم ولي الأمر" : "Edit student and fix parent contact"}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>{isRtl ? "تعديل وإصلاح" : "Edit & Fix"}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ================= TAB 2: SIBLINGS (SHARED NUMBERS) ================= */}
          {activeTab === 'siblings' && (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-950 text-xs leading-relaxed flex items-start gap-2">
                <Users className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-0.5">
                    {isRtl ? "أولياء الأمور الذين لديهم أكثر من طالب مسجل (الإخوة):" : "Parents with multiple enrolled children (Siblings):"}
                  </span>
                  {isRtl 
                    ? "كل مجموعة أدناه تشترك في نفس رقم هاتف ولي الأمر. لذلك يظهر ولي الأمر مرة واحدة فقط في إحصائيات النظام حتى لو كان لديه 2 أو 3 أو أكثر من الأبناء."
                    : "Each card below represents siblings enrolled under the same parent phone number. This explains why unique parent count is lower than total students."}
                </div>
              </div>

              {filteredSiblings.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500">
                  {isRtl ? "لا توجد أرقام أولياء أمور مشتركة مسجلة حالياً." : "No shared parent numbers found."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredSiblings.map((group, idx) => (
                    <div 
                      key={group.parentPhone || idx}
                      className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all space-y-2.5"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-blue-600" />
                          <span className="font-mono font-black text-slate-900 text-xs">{group.parentPhone}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(group.parentPhone)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
                            title={isRtl ? "نسخ الرقم" : "Copy phone"}
                          >
                            {copiedPhone === group.parentPhone ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                          {group.students.length} {isRtl ? "طلاب (إخوة)" : "enrolled siblings"}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {isRtl ? "الأبناء المرتبطون بهذا الحساب:" : "Enrolled Children under this account:"}
                        </span>
                        {group.students.map(st => {
                          const yearName = yearMap.get(st.academicYear) || (isRtl ? 'غير محدد' : 'Unassigned');
                          const groupName = groupMap.get(st.groupId || '') || (isRtl ? 'غير محدد' : 'Unassigned');

                          return (
                            <div 
                              key={st.id}
                              className="p-2 bg-slate-50 rounded-xl flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-bold text-slate-800 block">{st.name}</span>
                                <span className="text-[10px] text-slate-400">{yearName} | {groupName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onEditStudent(st);
                                }}
                                className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5"
                              >
                                <span>{isRtl ? "تعديل" : "Edit"}</span>
                                <Edit3 className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: ALL HEALTHY PARENT ACCOUNTS ================= */}
          {activeTab === 'all' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
                <span>{isRtl ? `إجمالي حسابات أولياء الأمور الفريدة: ${parentCount}` : `Total Unique Parent Accounts: ${parentCount}`}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {Array.from(uniqueParentPhones).map(phone => {
                  const linkedStudents = students.filter(s => (s.parentPhone || '').trim() === phone);
                  return (
                    <div 
                      key={phone}
                      className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1.5 hover:border-emerald-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{phone}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {linkedStudents.length} {isRtl ? "طالب" : "child"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {linkedStudents.map(s => s.name).join('، ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            {isRtl 
              ? "ملاحظة: يمكنك دائماً فتح أي حساب طالب وتعديل رقم ولي الأمر أو توليد كلمة مرور جديدة له."
              : "Note: You can open any student record to update the parent phone number or reset credentials."}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs cursor-pointer transition-all"
          >
            {isRtl ? "إغلاق النافذة" : "Close Window"}
          </button>
        </div>

      </div>
    </div>
  );
}
