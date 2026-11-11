import React, { useState } from "react";
import { 
  GraduationCap, Users, Calendar, Award, Plus, Search, Edit2, Trash2, Key, 
  Check, X, AlertTriangle, RefreshCw, Eye, EyeOff, Copy, Phone, FileText,
  Sliders, UserPlus, CheckCircle, ShieldCheck, ChevronDown, ChevronUp, Sparkles,
  MessageSquare, Upload, Download
} from "lucide-react";
import { db } from "../firebase";
import { 
  doc, setDoc, updateDoc, deleteDoc, writeBatch 
} from "firebase/firestore";
import { 
  AcademicYear, Group, Student, AttendanceRecord, GradeRecord 
} from "../types";
import { Language, matchesSearchQuery } from "../lib/translations";
import WhatsAppSenderModal from "./WhatsAppSenderModal";

interface StudentsInfoTabProps {
  lang: Language;
  isRtl: boolean;
  students: Student[];
  years: AcademicYear[];
  groups: Group[];
  attendance: AttendanceRecord[];
  grades: GradeRecord[];
  triggerAlert: (type: 'success' | 'error', text: string) => void;
  onOpenAddStudentModal: () => void;
  onOpenImportModal?: (group?: Group | null) => void;
  onOpenExportModal?: (group?: Group | null) => void;
}

export default function StudentsInfoTab({
  lang,
  isRtl,
  students,
  years,
  groups,
  attendance,
  grades,
  triggerAlert,
  onOpenAddStudentModal,
  onOpenImportModal,
  onOpenExportModal
}: StudentsInfoTabProps) {
  // Top filter navigation states
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<'all' | 'male' | 'female'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Password visibility states map (phone -> boolean)
  const [studentPassVisible, setStudentPassVisible] = useState<{ [phone: string]: boolean }>({});
  const [parentPassVisible, setParentPassVisible] = useState<{ [phone: string]: boolean }>({});

  // Card expansion state
  const [expandedCards, setExpandedCards] = useState<{ [phone: string]: boolean }>({});

  // Inline note editing state
  const [editingNotePhone, setEditingNotePhone] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState<string>('');

  // Single Student Quick Attendance Modal
  const [singleAttModal, setSingleAttModal] = useState<{
    isOpen: boolean;
    student: Student | null;
    date: string;
    status: 'present' | 'absent' | 'late';
  }>({
    isOpen: false,
    student: null,
    date: new Date().toISOString().substring(0, 10),
    status: 'present'
  });

  // Single Student Quick Grade Modal
  const [singleGradeModal, setSingleGradeModal] = useState<{
    isOpen: boolean;
    student: Student | null;
    examName: string;
    examDate: string;
    score: string;
    totalMarks: string;
  }>({
    isOpen: false,
    student: null,
    examName: '',
    examDate: new Date().toISOString().substring(0, 10),
    score: '',
    totalMarks: '100'
  });

  // Edit Existing Attendance Record Modal
  const [editAttModal, setEditAttModal] = useState<{
    isOpen: boolean;
    recordId: string;
    studentName: string;
    studentPhone: string;
    date: string;
    status: 'present' | 'absent' | 'late';
  }>({
    isOpen: false,
    recordId: '',
    studentName: '',
    studentPhone: '',
    date: new Date().toISOString().substring(0, 10),
    status: 'present'
  });

  // Edit Existing Grade Record Modal
  const [editGradeModal, setEditGradeModal] = useState<{
    isOpen: boolean;
    gradeId: string;
    studentName: string;
    studentPhone: string;
    examName: string;
    examDate: string;
    score: string;
    totalMarks: string;
  }>({
    isOpen: false,
    gradeId: '',
    studentName: '',
    studentPhone: '',
    examName: '',
    examDate: new Date().toISOString().substring(0, 10),
    score: '',
    totalMarks: '100'
  });

  // WhatsApp Messaging Modal State
  const [whatsAppModal, setWhatsAppModal] = useState<{
    isOpen: boolean;
    selectedGroup: string;
    selectedYear: string;
    singleStudent: Student | null;
    initialTemplateType?: 'last_week' | 'full_report' | 'absence_alert' | 'latest_exam' | 'credentials' | 'custom';
    initialRecipientTarget?: 'parent' | 'student' | 'both';
  }>({
    isOpen: false,
    selectedGroup: 'all',
    selectedYear: 'all',
    singleStudent: null,
    initialTemplateType: 'last_week',
    initialRecipientTarget: 'parent'
  });

  // Single Student Full Edit Modal
  const [editStudentModal, setEditStudentModal] = useState<{
    isOpen: boolean;
    student: Student | null;
    name: string;
    phone: string;
    parentPhone: string;
    academicYear: string;
    groupId: string;
    gender: 'male' | 'female';
    password: string;
    parentPassword: string;
    notes: string;
    enabled: boolean;
  }>({
    isOpen: false,
    student: null,
    name: '',
    phone: '',
    parentPhone: '',
    academicYear: '',
    groupId: '',
    gender: 'male',
    password: '',
    parentPassword: '',
    notes: '',
    enabled: true
  });

  // Whole Group Batch Attendance Modal
  const [groupAttModal, setGroupAttModal] = useState<{
    isOpen: boolean;
    date: string;
    records: { [phone: string]: 'present' | 'absent' | 'late' };
  }>({
    isOpen: false,
    date: new Date().toISOString().substring(0, 10),
    records: {}
  });

  // Whole Group Batch Grade Modal
  const [groupGradeModal, setGroupGradeModal] = useState<{
    isOpen: boolean;
    examName: string;
    examDate: string;
    totalMarks: string;
    scores: { [phone: string]: string };
  }>({
    isOpen: false,
    examName: '',
    examDate: new Date().toISOString().substring(0, 10),
    totalMarks: '100',
    scores: {}
  });

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    onConfirm: () => {}
  });

  const [savingAction, setSavingAction] = useState<string | null>(null);

  // Available groups for the selected year
  const availableGroups = groups.filter((g) => {
    if (selectedYear === 'all') return true;
    return g.academicYear === selectedYear;
  });

  // Filtered students based on top tabs (Years, Groups, Gender, Search)
  const filteredStudents = students.filter((s) => {
    const matchesYear = selectedYear === 'all' || s.academicYear === selectedYear;
    const matchesGroup = selectedGroup === 'all' || s.groupId === selectedGroup;
    const matchesGender = selectedGender === 'all' || (s.gender || 'male') === selectedGender;
    const matchesSearch = matchesSearchQuery(searchQuery, s.name, s.phone, s.parentPhone, s.notes, s.studentCode || '');
    return matchesYear && matchesGroup && matchesGender && matchesSearch;
  });

  // Calculate statistics for the current active filter
  const activeYearObj = years.find((y) => y.id === selectedYear);
  const activeGroupObj = groups.find((g) => g.id === selectedGroup);

  const totalFilteredCount = filteredStudents.length;
  const boysCount = filteredStudents.filter((s) => (s.gender || 'male') === 'male').length;
  const girlsCount = filteredStudents.filter((s) => s.gender === 'female').length;

  // Calculate student-specific metrics
  const getStudentStats = (student: Student) => {
    const studentAtt = attendance.filter((a) => a.studentPhone === student.phone);
    const presentCount = studentAtt.filter((a) => a.status === 'present').length;
    const lateCount = studentAtt.filter((a) => a.status === 'late').length;
    const absentCount = studentAtt.filter((a) => a.status === 'absent').length;
    const totalAtt = studentAtt.length;
    const attRate = totalAtt > 0 ? Math.round(((presentCount + lateCount * 0.5) / totalAtt) * 100) : 100;

    const studentGrades = grades.filter((g) => g.studentPhone === student.phone);
    const totalScorePct = studentGrades.length > 0
      ? Math.round(studentGrades.reduce((sum, g) => sum + (g.totalMarks > 0 ? (g.score / g.totalMarks) * 100 : 0), 0) / studentGrades.length)
      : null;

    return {
      studentAtt,
      presentCount,
      lateCount,
      absentCount,
      totalAtt,
      attRate,
      studentGrades,
      totalScorePct
    };
  };

  // Group-wide metrics
  const groupAttRecords = attendance.filter((a) => filteredStudents.some((s) => s.phone === a.studentPhone));
  const groupPresentCount = groupAttRecords.filter((a) => a.status === 'present').length;
  const groupLateCount = groupAttRecords.filter((a) => a.status === 'late').length;
  const groupTotalAtt = groupAttRecords.length;
  const groupAvgAttRate = groupTotalAtt > 0 ? Math.round(((groupPresentCount + groupLateCount * 0.5) / groupTotalAtt) * 100) : 100;

  const groupGradeRecords = grades.filter((g) => filteredStudents.some((s) => s.phone === g.studentPhone));
  const groupAvgScore = groupGradeRecords.length > 0
    ? Math.round(groupGradeRecords.reduce((sum, g) => sum + (g.totalMarks > 0 ? (g.score / g.totalMarks) * 100 : 0), 0) / groupGradeRecords.length)
    : null;

  // Toggle card expansion
  const toggleCard = (phone: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [phone]: !prev[phone]
    }));
  };

  const expandAll = () => {
    const map: { [phone: string]: boolean } = {};
    filteredStudents.forEach(s => { map[s.phone] = true; });
    setExpandedCards(map);
  };

  const collapseAll = () => {
    setExpandedCards({});
  };

  const allExpanded = filteredStudents.length > 0 && filteredStudents.every(s => expandedCards[s.phone]);

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    triggerAlert('success', isRtl ? `تم نسخ ${label}: ${text}` : `Copied ${label}: ${text}`);
  };

  // Generate random password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Open single student edit modal
  const openEditStudent = (student: Student) => {
    setEditStudentModal({
      isOpen: true,
      student,
      name: student.name,
      phone: student.phone,
      parentPhone: student.parentPhone,
      academicYear: student.academicYear,
      groupId: student.groupId || '',
      gender: student.gender || 'male',
      password: student.password,
      parentPassword: student.parentPassword || generateRandomPassword(),
      notes: student.notes || '',
      enabled: student.enabled
    });
  };

  // Save single student edit
  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudentModal.student) return;
    setSavingAction('edit_student');
    try {
      await updateDoc(doc(db, "students", editStudentModal.student.id), {
        name: editStudentModal.name.trim(),
        parentPhone: editStudentModal.parentPhone.trim(),
        academicYear: editStudentModal.academicYear,
        groupId: editStudentModal.groupId || '',
        gender: editStudentModal.gender,
        password: editStudentModal.password.trim(),
        parentPassword: editStudentModal.parentPassword.trim(),
        notes: editStudentModal.notes.trim(),
        enabled: editStudentModal.enabled,
        updatedDate: new Date().toISOString()
      });
      triggerAlert('success', isRtl ? `تم حفظ تعديلات الطالب ${editStudentModal.name} بنجاح` : `Updated ${editStudentModal.name} successfully`);
      setEditStudentModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      triggerAlert('error', "Failed to update student: " + err.message);
    } finally {
      setSavingAction(null);
    }
  };

  // Save inline note
  const handleSaveInlineNote = async (student: Student) => {
    try {
      await updateDoc(doc(db, "students", student.id), {
        notes: tempNoteText.trim(),
        updatedDate: new Date().toISOString()
      });
      triggerAlert('success', isRtl ? "تم تحديث ملاحظات المشرف بنجاح" : "Notes updated successfully");
      setEditingNotePhone(null);
    } catch (err: any) {
      triggerAlert('error', "Failed to update notes: " + err.message);
    }
  };

  // Toggle student enabled status
  const handleToggleStudentStatus = async (student: Student) => {
    const newStatus = !student.enabled;
    try {
      await updateDoc(doc(db, "students", student.id), {
        enabled: newStatus,
        updatedDate: new Date().toISOString()
      });
      triggerAlert('success', newStatus 
        ? (isRtl ? `تم تفعيل حساب الطالب ${student.name}` : `Account enabled for ${student.name}`)
        : (isRtl ? `تم إيقاف حساب الطالب ${student.name}` : `Account disabled for ${student.name}`)
      );
    } catch (err: any) {
      triggerAlert('error', "Status update failed: " + err.message);
    }
  };

  // Save Single Student Attendance
  const handleSaveSingleAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const { student, date, status } = singleAttModal;
    if (!student || !date) return;
    setSavingAction('single_att');
    const attId = `${student.phone}_${date}`;
    try {
      await setDoc(doc(db, "attendance", attId), {
        id: attId,
        studentPhone: student.phone,
        studentName: student.name,
        date,
        status
      });
      triggerAlert('success', isRtl 
        ? `تم رصد حضور الطالب ${student.name} (${status === 'present' ? 'حاضر' : status === 'late' ? 'متأخر' : 'غائب'}) بتاريخ ${date}` 
        : `Attendance marked ${status} for ${student.name} on ${date}`
      );
      setSingleAttModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      triggerAlert('error', "Failed to save attendance: " + err.message);
    } finally {
      setSavingAction(null);
    }
  };

  // Open Edit Single Attendance Record
  const openEditAttendance = (att: AttendanceRecord, studentName: string) => {
    setEditAttModal({
      isOpen: true,
      recordId: att.id,
      studentName,
      studentPhone: att.studentPhone,
      date: att.date,
      status: att.status
    });
  };

  // Save Edit Attendance
  const handleSaveEditAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAttModal.recordId || !editAttModal.date) return;
    setSavingAction('edit_att');
    try {
      await updateDoc(doc(db, "attendance", editAttModal.recordId), {
        date: editAttModal.date,
        status: editAttModal.status
      });
      triggerAlert('success', isRtl 
        ? `تم تحديث سجل حضور الطالب ${editAttModal.studentName} بنجاح` 
        : `Attendance updated for ${editAttModal.studentName}`
      );
      setEditAttModal(prev => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      triggerAlert('error', "Failed to update attendance: " + err.message);
    } finally {
      setSavingAction(null);
    }
  };

  // Delete Attendance Record
  const handleDeleteAttendance = (recordId: string, studentName: string, date: string) => {
    setConfirmModal({
      isOpen: true,
      title: isRtl ? "حذف سجل الحضور" : "Delete Attendance Record",
      message: isRtl ? `هل تريد حذف تسجيل حضور ${studentName} ليوم ${date}؟` : `Delete attendance log for ${studentName} on ${date}?`,
      confirmText: isRtl ? "حذف السجل" : "Delete Record",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "attendance", recordId));
          triggerAlert('success', isRtl ? "تم حذف سجل الحضور بنجاح" : "Attendance record deleted");
        } catch (err: any) {
          triggerAlert('error', "Failed to delete attendance: " + err.message);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Save Single Student Grade
  const handleSaveSingleGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const { student, examName, examDate, score, totalMarks } = singleGradeModal;
    if (!student || !examName.trim() || !score || !totalMarks) return;
    setSavingAction('single_grade');
    const gradeId = `g_${Math.random().toString(36).substring(2, 9)}`;
    try {
      await setDoc(doc(db, "grades", gradeId), {
        id: gradeId,
        examName: examName.trim(),
        examDate,
        totalMarks: parseFloat(totalMarks),
        studentPhone: student.phone,
        studentName: student.name,
        score: parseFloat(score)
      });
      triggerAlert('success', isRtl 
        ? `تم رصد نتيجة اختبار (${examName}) للطالب ${student.name} بنجاح: ${score}/${totalMarks}` 
        : `Grade recorded for ${student.name}: ${score}/${totalMarks}`
      );
      setSingleGradeModal((prev) => ({ ...prev, isOpen: false, examName: '', score: '' }));
    } catch (err: any) {
      triggerAlert('error', "Failed to save grade: " + err.message);
    } finally {
      setSavingAction(null);
    }
  };

  // Open Edit Single Grade Record
  const openEditGrade = (grade: GradeRecord, studentName: string) => {
    setEditGradeModal({
      isOpen: true,
      gradeId: grade.id,
      studentName,
      studentPhone: grade.studentPhone,
      examName: grade.examName,
      examDate: grade.examDate,
      score: grade.score.toString(),
      totalMarks: grade.totalMarks.toString()
    });
  };

  // Save Edit Grade
  const handleSaveEditGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const { gradeId, examName, examDate, score, totalMarks, studentName } = editGradeModal;
    if (!gradeId || !examName.trim() || !score || !totalMarks) return;
    setSavingAction('edit_grade');
    try {
      await updateDoc(doc(db, "grades", gradeId), {
        examName: examName.trim(),
        examDate,
        score: parseFloat(score),
        totalMarks: parseFloat(totalMarks)
      });
      triggerAlert('success', isRtl 
        ? `تم تعديل نتيجة اختبار (${examName}) للطالب ${studentName} بنجاح: ${score}/${totalMarks}` 
        : `Grade updated for ${studentName}: ${score}/${totalMarks}`
      );
      setEditGradeModal(prev => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      triggerAlert('error', "Failed to update grade: " + err.message);
    } finally {
      setSavingAction(null);
    }
  };

  // Delete Grade Record
  const handleDeleteGrade = (gradeId: string, examName: string, studentName: string) => {
    setConfirmModal({
      isOpen: true,
      title: isRtl ? "حذف نتيجة الاختبار" : "Delete Exam Record",
      message: isRtl ? `هل تريد حذف كشف درجات (${examName}) للطالب ${studentName}؟` : `Delete exam score (${examName}) for ${studentName}?`,
      confirmText: isRtl ? "حذف الدرجة" : "Delete Grade",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "grades", gradeId));
          triggerAlert('success', isRtl ? "تم حذف نتيجة الاختبار بنجاح" : "Exam record deleted");
        } catch (err: any) {
          triggerAlert('error', "Failed to delete grade: " + err.message);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Delete Student Entire Account
  const handleDeleteStudent = (student: Student) => {
    setConfirmModal({
      isOpen: true,
      title: isRtl ? "حذف حساب الطالب نهائياً" : "Delete Student Account",
      message: isRtl 
        ? `هل أنت متأكد من حذف حساب الطالب '${student.name}' (${student.phone}) نهائياً من المنصة؟`
        : `Permanently delete student account '${student.name}' (${student.phone})?`,
      confirmText: isRtl ? "حذف نهائي" : "Delete Permanently",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "students", student.id));
          triggerAlert('success', isRtl ? `تم حذف حساب الطالب ${student.name} بنجاح` : `Student ${student.name} deleted successfully`);
        } catch (err: any) {
          triggerAlert('error', "Deletion failed: " + err.message);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Open Whole Group Batch Attendance Modal
  const openGroupAttendanceModal = () => {
    const initialMap: { [phone: string]: 'present' | 'absent' | 'late' } = {};
    filteredStudents.forEach((s) => {
      // check if student already has a record for today
      const today = new Date().toISOString().substring(0, 10);
      const existing = attendance.find((a) => a.studentPhone === s.phone && a.date === today);
      initialMap[s.phone] = existing ? existing.status : 'present';
    });
    setGroupAttModal({
      isOpen: true,
      date: new Date().toISOString().substring(0, 10),
      records: initialMap
    });
  };

  // Save Whole Group Batch Attendance
  const handleSaveGroupAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const { date, records } = groupAttModal;
    setSavingAction('group_att');
    try {
      const batch = writeBatch(db);
      const phones = Object.keys(records);
      for (const phone of phones) {
        const student = filteredStudents.find((s) => s.phone === phone);
        if (!student) continue;
        const attId = `${phone}_${date}`;
        batch.set(doc(db, "attendance", attId), {
          id: attId,
          studentPhone: phone,
          studentName: student.name,
          date,
          status: records[phone]
        });
      }
      await batch.commit();
      triggerAlert('success', isRtl 
        ? `تم رصد حضور وغياب المجموعة (${phones.length} طالب/طالبة) ليوم ${date} بنجاح` 
        : `Bulk attendance saved for ${phones.length} students on ${date}`
      );
      setGroupAttModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      triggerAlert('error', "Failed to save group attendance: " + err.message);
    } finally {
      setSavingAction(null);
    }
  };

  // Open Whole Group Batch Grades Modal
  const openGroupGradeModal = () => {
    const initialScores: { [phone: string]: string } = {};
    filteredStudents.forEach((s) => {
      initialScores[s.phone] = '';
    });
    setGroupGradeModal({
      isOpen: true,
      examName: '',
      examDate: new Date().toISOString().substring(0, 10),
      totalMarks: '100',
      scores: initialScores
    });
  };

  // Save Whole Group Batch Grades
  const handleSaveGroupGrades = async (e: React.FormEvent) => {
    e.preventDefault();
    const { examName, examDate, totalMarks, scores } = groupGradeModal;
    if (!examName.trim() || !totalMarks) return;
    setSavingAction('group_grade');
    try {
      const batch = writeBatch(db);
      let count = 0;
      for (const phone of Object.keys(scores)) {
        const val = scores[phone];
        if (val === '' || isNaN(parseFloat(val))) continue;
        const student = filteredStudents.find((s) => s.phone === phone);
        if (!student) continue;

        // Check if record exists for this student & exam
        const existing = grades.find((g) => g.examName === examName.trim() && g.studentPhone === phone);
        const gradeId = existing ? existing.id : `g_${Math.random().toString(36).substring(2, 9)}`;

        batch.set(doc(db, "grades", gradeId), {
          id: gradeId,
          examName: examName.trim(),
          examDate,
          totalMarks: parseFloat(totalMarks),
          studentPhone: phone,
          studentName: student.name,
          score: parseFloat(val)
        });
        count++;
      }
      await batch.commit();
      triggerAlert('success', isRtl 
        ? `تم رصد درجات اختبار (${examName}) لـ ${count} طالب/طالبة بنجاح` 
        : `Grades recorded for ${count} students in ${examName}`
      );
      setGroupGradeModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      triggerAlert('error', "Failed to save group grades: " + err.message);
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-150 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xs">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <span>{isRtl ? "معلومات وبيانات الطلاب الشاملة" : "Students Comprehensive Info"}</span>
              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                {totalFilteredCount} {isRtl ? "طالب" : "Students"}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isRtl 
                ? "متابعة وتعديل بيانات الطلاب، الحضور والغياب، كشوف الدرجات، كلمات المرور والملاحظات لطالب واحد أو لمجموعة كاملة." 
                : "Manage and edit student profiles, attendance, grades, passwords, and notes individually or for whole groups."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setWhatsAppModal({
              isOpen: true,
              selectedGroup: selectedGroup,
              selectedYear: selectedYear,
              singleStudent: null,
              initialTemplateType: 'last_week',
              initialRecipientTarget: 'parent'
            })}
            disabled={students.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title={isRtl ? "إرسال تقارير ورسائل واتساب للطلاب وأولياء الأمور" : "Send WhatsApp Reports"}
          >
            <MessageSquare className="h-4 w-4" />
            <span>{isRtl ? "إرسال رسائل واتساب" : "Send WhatsApp"}</span>
          </button>

          <button
            onClick={() => setWhatsAppModal({
              isOpen: true,
              selectedGroup: selectedGroup,
              selectedYear: selectedYear,
              singleStudent: null,
              initialTemplateType: 'credentials',
              initialRecipientTarget: 'parent'
            })}
            disabled={students.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-3.5 bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title={isRtl ? "إرسال بيانات وتسجيل الدخول عبر واتساب للطلاب أو أولياء الأمور" : "Send Login Credentials via WhatsApp"}
          >
            <Key className="h-4 w-4 text-indigo-600" />
            <span>{isRtl ? "إرسال بيانات الدخول" : "Send Logins"}</span>
          </button>

          <button
            onClick={openGroupAttendanceModal}
            disabled={totalFilteredCount === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-3.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Calendar className="h-4 w-4" />
            <span>{isRtl ? "تحضير المجموعة" : "Group Attendance"}</span>
          </button>

          <button
            onClick={openGroupGradeModal}
            disabled={totalFilteredCount === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-3.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Award className="h-4 w-4" />
            <span>{isRtl ? "رصد اختبار للمجموعة" : "Group Grades"}</span>
          </button>

          <button
            onClick={() => onOpenImportModal?.(selectedGroup !== 'all' ? groups.find(g => g.id === selectedGroup) : null)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-3.5 bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            title={isRtl ? "إدراج واستيراد بيانات الطلاب من ملف JSON" : "Insert and Import Students from JSON"}
          >
            <Upload className="h-4 w-4 text-purple-600" />
            <span>
              {selectedGroup !== 'all' 
                ? (isRtl ? "إدراج ملف للمجموعة" : "Import to Group")
                : (isRtl ? "استيراد ملف طلاب" : "Import JSON")}
            </span>
          </button>

          <button
            onClick={() => onOpenExportModal?.(selectedGroup !== 'all' ? groups.find(g => g.id === selectedGroup) : null)}
            disabled={totalFilteredCount === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-3.5 bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title={isRtl ? "تصدير واستخراج بيانات الطلاب إلى ملف JSON" : "Extract and Export Students to JSON"}
          >
            <Download className="h-4 w-4 text-blue-600" />
            <span>
              {selectedGroup !== 'all' 
                ? (isRtl ? "استخراج ملف المجموعة" : "Export Group")
                : (isRtl ? "تصدير ملف طلاب" : "Export JSON")}
            </span>
          </button>

          <button
            onClick={onOpenAddStudentModal}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-4 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-850 transition-all shadow-xs cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>{isRtl ? "إضافة طالب جديد" : "Add Student"}</span>
          </button>
        </div>
      </div>

      {/* Top Filter Controls: Small Tabs for Years & Small Tabs for Groups */}
      <div className="space-y-3.5 bg-white p-5 rounded-2xl border border-gray-150 shadow-xs">
        
        {/* Row 1: Academic Years Small Tabs (Above) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-black text-slate-500 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <span>📅</span>
              <span>{isRtl ? "السنوات والدفعات الدراسية:" : "Academic Years:"}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => {
                setSelectedYear('all');
                setSelectedGroup('all');
              }}
              className={`px-3.5 py-1.5 text-xs font-extrabold transition-all rounded-xl cursor-pointer shrink-0 flex items-center gap-1.5 ${
                selectedYear === 'all' 
                  ? 'bg-slate-950 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
              }`}
            >
              <span>{isRtl ? "جميع السنوات" : "All Years"}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                selectedYear === 'all' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'
              }`}>
                {students.length}
              </span>
            </button>

            {years.map((year) => {
              const count = students.filter((s) => s.academicYear === year.id).length;
              return (
                <button
                  key={year.id}
                  onClick={() => {
                    setSelectedYear(year.id);
                    setSelectedGroup('all');
                  }}
                  className={`px-3.5 py-1.5 text-xs font-extrabold transition-all rounded-xl cursor-pointer shrink-0 flex items-center gap-1.5 ${
                    selectedYear === year.id 
                      ? 'bg-slate-950 text-white shadow-sm' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                  }`}
                >
                  <span>{year.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                    selectedYear === year.id ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Small Groups Tabs (Directly under Years) */}
        <div className="space-y-1.5 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs font-black text-slate-500 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <span>👥</span>
              <span>{isRtl ? "المجموعات التابعة (Groups):" : "Groups:"}</span>
            </span>

            {selectedGroup !== 'all' && (
              <div className="flex items-center gap-1.5 ms-auto shrink-0 lowercase font-normal">
                <button
                  onClick={() => onOpenImportModal?.(groups.find(g => g.id === selectedGroup))}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 transition-colors cursor-pointer"
                  title={isRtl ? "إدراج ملف طلاب للمجموعة المحددة" : "Insert students file for this group"}
                >
                  <Upload className="h-3 w-3 text-purple-600" />
                  <span>{isRtl ? "إدراج ملف للمجموعة" : "Insert File"}</span>
                </button>
                <button
                  onClick={() => onOpenExportModal?.(groups.find(g => g.id === selectedGroup))}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-colors cursor-pointer"
                  title={isRtl ? "استخراج ملف طلاب المجموعة المحددة" : "Export students file for this group"}
                >
                  <Download className="h-3 w-3 text-blue-600" />
                  <span>{isRtl ? "استخراج ملف طلاب" : "Export File"}</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setSelectedGroup('all')}
              className={`px-3 py-1.5 text-xs font-bold transition-all rounded-xl cursor-pointer shrink-0 flex items-center gap-1.5 ${
                selectedGroup === 'all' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'bg-blue-50/70 text-blue-800 hover:bg-blue-100 border border-blue-100'
              }`}
            >
              <span>{isRtl ? "جميع المجموعات" : "All Groups"}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                selectedGroup === 'all' ? 'bg-blue-700 text-white' : 'bg-blue-200 text-blue-900'
              }`}>
                {students.filter(s => selectedYear === 'all' || s.academicYear === selectedYear).length}
              </span>
            </button>

            {availableGroups.map((group) => {
              const count = students.filter((s) => s.groupId === group.id).length;
              const isMale = group.gender === 'male';
              const label = group.name || (isRtl ? `مجموعة ${group.groupNumber}` : `Group ${group.groupNumber}`);

              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`px-3 py-1.5 text-xs font-bold transition-all rounded-xl cursor-pointer shrink-0 flex items-center gap-1.5 ${
                    selectedGroup === group.id 
                      ? (isMale ? 'bg-blue-600 text-white shadow-xs' : 'bg-pink-600 text-white shadow-xs') 
                      : (isMale 
                          ? 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200/60' 
                          : 'bg-pink-50 text-pink-800 hover:bg-pink-100 border border-pink-200/60')
                  }`}
                >
                  <span>{isMale ? '👦' : '👧'}</span>
                  <span>{label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                    selectedGroup === group.id 
                      ? 'bg-black/20 text-white' 
                      : (isMale ? 'bg-blue-200 text-blue-900' : 'bg-pink-200 text-pink-900')
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}

            {availableGroups.length === 0 && (
              <span className="text-xs text-slate-400 italic py-1">
                {isRtl ? "لا توجد مجموعات مسجلة لهذه السنة." : "No groups configured for this year."}
              </span>
            )}
          </div>
        </div>

        {/* Row 3: Gender Filter and Live Search */}
        <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedGender('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                selectedGender === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isRtl ? `الكل (${totalFilteredCount})` : `All (${totalFilteredCount})`}
            </button>
            <button
              onClick={() => setSelectedGender('male')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedGender === 'male' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <span>👦</span>
              <span>{isRtl ? `بنين (${boysCount})` : `Boys (${boysCount})`}</span>
            </button>
            <button
              onClick={() => setSelectedGender('female')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedGender === 'female' ? 'bg-pink-600 text-white shadow-xs' : 'bg-pink-50 text-pink-700 hover:bg-pink-100'
              }`}
            >
              <span>👧</span>
              <span>{isRtl ? `بنات (${girlsCount})` : `Girls (${girlsCount})`}</span>
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className={`absolute top-2.5 h-4 w-4 text-gray-400 pointer-events-none ${isRtl ? "right-3" : "left-3"}`} />
            <input
              type="text"
              name="studentsInfoSearch"
              dir="auto"
              autoCapitalize="none"
              placeholder={isRtl ? "بحث باسم الطالب، الهاتف، الكود، الملاحظات..." : "Search name, phone, code, notes..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white ${
                isRtl ? "pr-9 pl-3 text-right" : "pl-9 pr-3 text-left"
              }`}
            />
          </div>
        </div>

      </div>

      {/* Active Group / Selection Summary Bar */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-xl text-amber-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-extrabold text-slate-200">
              {activeYearObj ? activeYearObj.name : (isRtl ? "كل السنوات" : "All Years")}
              {" • "}
              {activeGroupObj ? (activeGroupObj.name || `${isRtl ? "مجموعة" : "Group"} ${activeGroupObj.groupNumber}`) : (isRtl ? "كل المجموعات" : "All Groups")}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {isRtl ? `إجمالي الطلاب المعروضين: ${totalFilteredCount} طالب (انقر على اسم الطالب لعرض بياناته)` : `Displaying: ${totalFilteredCount} students (click student name to view details)`}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            disabled={totalFilteredCount === 0}
            className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs disabled:opacity-50"
          >
            {allExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>{allExpanded ? (isRtl ? "طي كل البطاقات" : "Collapse All") : (isRtl ? "عرض تفاصيل الكل" : "Expand All")}</span>
          </button>

          <div className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-blue-300" />
            <span>{isRtl ? "حضور المجموعة:" : "Group Att:"}</span>
            <span className="text-emerald-400 font-mono font-black">{groupAvgAttRate}%</span>
          </div>

          {groupAvgScore !== null && (
            <div className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5 text-amber-300" />
              <span>{isRtl ? "درجات المجموعة:" : "Group Grades:"}</span>
              <span className="text-amber-400 font-mono font-black">{groupAvgScore}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Students Cards Grid */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-150 space-y-3">
          <GraduationCap className="h-12 w-12 text-gray-300 mx-auto" />
          <h3 className="text-sm font-extrabold text-gray-800">
            {isRtl ? "لا يوجد طلاب مطابقون لمعايير البحث أو التصفية" : "No students found matching selected filters"}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isRtl ? "يرجى تغيير السنة الدراسية أو المجموعة أو تجربة كلمة بحث أخرى." : "Try selecting a different year, group, or clearing your search keywords."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredStudents.map((student) => {
            const isFemale = student.gender === 'female';
            const stats = getStudentStats(student);
            const isExpanded = expandedCards[student.phone] || false;
            const studentGroup = groups.find((g) => g.id === student.groupId);
            const studentYear = years.find((y) => y.id === student.academicYear);
            const isStudentPassVisible = studentPassVisible[student.phone] || false;
            const isParentPassVisible = parentPassVisible[student.phone] || false;

            return (
              <div 
                key={student.id}
                className={`bg-white rounded-2xl border transition-all duration-200 shadow-xs overflow-hidden ${
                  student.enabled ? 'border-gray-200 hover:border-slate-300 hover:shadow-sm' : 'border-red-200 bg-red-50/20'
                }`}
              >
                
                {/* Main Clickable Header: Always shows student name */}
                <div 
                  onClick={() => toggleCard(student.phone)}
                  className={`p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer select-none transition-all ${
                    isExpanded 
                      ? 'border-b border-gray-100 bg-slate-50/70' 
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center shrink-0 shadow-xs ${
                      isFemale ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {isFemale ? '👧' : '👦'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900 tracking-tight hover:text-blue-600 transition-colors">
                          {student.name}
                        </h3>
                        
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isFemale ? 'bg-pink-50 text-pink-700 border border-pink-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {isFemale ? (isRtl ? "طالبة" : "Female") : (isRtl ? "طالب" : "Male")}
                        </span>

                        {studentYear && (
                          <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {studentYear.name}
                          </span>
                        )}

                        {studentGroup && (
                          <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            {studentGroup.name || `${isRtl ? "مجموعة" : "Group"} ${studentGroup.groupNumber}`}
                          </span>
                        )}

                        {!student.enabled && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                            {isRtl ? "معطل" : "Disabled"}
                          </span>
                        )}
                      </div>

                      {!isExpanded && (
                        <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-2">
                          <span>{isRtl ? "انقر على اسم الطالب لعرض كافة المعلومات، الدرجات، الحضور وكلمات المرور" : "Click student name to view complete info, grades, attendance & passwords"}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Side Toggle Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isExpanded 
                        ? 'bg-slate-900 text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}>
                      <span>{isExpanded ? (isRtl ? "إخفاء التفاصيل" : "Hide Info") : (isRtl ? "عرض البيانات" : "View Details")}</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details Section: ONLY displayed when isExpanded is true */}
                {isExpanded && (
                  <div className="divide-y divide-gray-100 animate-in fade-in duration-150">
                    
                    {/* Top sub-row: Contact Numbers & Quick Action Buttons */}
                    <div className="p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white">
                      
                      {/* Contact numbers */}
                      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
                        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                          <span className="text-slate-400">📱 {isRtl ? "طالب:" : "Student:"}</span>
                          <span className="font-mono font-bold text-slate-800">{student.phone}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(student.phone, isRtl ? "هاتف الطالب" : "Student Phone"); }}
                            title={isRtl ? "نسخ الرقم" : "Copy Phone"}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md cursor-pointer"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <a
                            href={`tel:${student.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md"
                            title={isRtl ? "اتصال بالطالب" : "Call Student"}
                          >
                            <Phone className="h-3 w-3" />
                          </a>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWhatsAppModal({
                                isOpen: true,
                                selectedGroup: student.groupId,
                                selectedYear: student.academicYear,
                                singleStudent: student
                              });
                            }}
                            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer"
                            title={isRtl ? "إرسال رسالة واتساب للطالب" : "WhatsApp Student"}
                          >
                            <MessageSquare className="h-3 w-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                          <span className="text-slate-400">👨‍👦 {isRtl ? "ولي الأمر:" : "Parent:"}</span>
                          <span className="font-mono font-bold text-slate-800">{student.parentPhone}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(student.parentPhone, isRtl ? "هاتف ولي الأمر" : "Parent Phone"); }}
                            title={isRtl ? "نسخ الرقم" : "Copy Phone"}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md cursor-pointer"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <a
                            href={`tel:${student.parentPhone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md"
                            title={isRtl ? "اتصال بولي الأمر" : "Call Parent"}
                          >
                            <Phone className="h-3 w-3" />
                          </a>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWhatsAppModal({
                                isOpen: true,
                                selectedGroup: student.groupId,
                                selectedYear: student.academicYear,
                                singleStudent: student
                              });
                            }}
                            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer"
                            title={isRtl ? "إرسال رسالة واتساب لولي الأمر" : "WhatsApp Parent"}
                          >
                            <MessageSquare className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Actions & Quick Buttons */}
                      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWhatsAppModal({
                              isOpen: true,
                              selectedGroup: student.groupId,
                              selectedYear: student.academicYear,
                              singleStudent: student,
                              initialTemplateType: 'last_week',
                              initialRecipientTarget: 'parent'
                            });
                          }}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          title={isRtl ? "إرسال تقرير واتساب لهذا الطالب" : "Send WhatsApp Report"}
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{isRtl ? "واتساب" : "WhatsApp"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWhatsAppModal({
                              isOpen: true,
                              selectedGroup: student.groupId,
                              selectedYear: student.academicYear,
                              singleStudent: student,
                              initialTemplateType: 'credentials',
                              initialRecipientTarget: 'parent'
                            });
                          }}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          title={isRtl ? "إرسال بيانات الدخول وكلمة المرور لهذا الطالب عبر واتساب" : "Send Login Credentials"}
                        >
                          <Key className="h-3.5 w-3.5 text-indigo-600" />
                          <span>{isRtl ? "بيانات الدخول" : "Login Info"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSingleAttModal({
                              isOpen: true,
                              student,
                              date: new Date().toISOString().substring(0, 10),
                              status: 'present'
                            });
                          }}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{isRtl ? "رصد حضور" : "Add Attendance"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSingleGradeModal({
                              isOpen: true,
                              student,
                              examName: '',
                              examDate: new Date().toISOString().substring(0, 10),
                              score: '',
                              totalMarks: '100'
                            });
                          }}
                          className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{isRtl ? "رصد درجة" : "Add Grade"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEditStudent(student); }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>{isRtl ? "تعديل شامل" : "Edit All"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleStudentStatus(student); }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            student.enabled 
                              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          <span>{student.enabled ? (isRtl ? "تعطيل الحساب" : "Disable") : (isRtl ? "تفعيل الحساب" : "Enable")}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteStudent(student); }}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                          title={isRtl ? "حذف حساب الطالب" : "Delete Student"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                    </div>

                    {/* Passwords & Supervisor Notes */}
                    <div className="p-5 bg-slate-50/60 grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      {/* Student Password */}
                      <div className="bg-white p-3.5 rounded-xl border border-gray-150 shadow-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-500 flex items-center gap-1">
                            <Key className="h-3 w-3 text-blue-500" />
                            <span>{isRtl ? "كلمة مرور الطالب:" : "Student Password:"}</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStudentPassVisible(prev => ({ ...prev, [student.phone]: !prev[student.phone] }));
                            }}
                            className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                          >
                            {isStudentPassVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-black text-xs text-slate-900 tracking-wider">
                            {isStudentPassVisible ? student.password : "••••••••"}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWhatsAppModal({
                                  isOpen: true,
                                  selectedGroup: student.groupId,
                                  selectedYear: student.academicYear,
                                  singleStudent: student,
                                  initialTemplateType: 'credentials',
                                  initialRecipientTarget: 'student'
                                });
                              }}
                              className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md cursor-pointer flex items-center gap-1 border border-blue-200"
                              title={isRtl ? "إرسال كلمة المرور للطالب عبر واتساب" : "Send Password to Student"}
                            >
                              <MessageSquare className="h-2.5 w-2.5 text-blue-600" />
                              <span>{isRtl ? "إرسال" : "Send"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(student.password, isRtl ? "كلمة مرور الطالب" : "Student Password"); }}
                              className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer flex items-center gap-1"
                            >
                              <Copy className="h-2.5 w-2.5" />
                              <span>{isRtl ? "نسخ" : "Copy"}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Parent Password */}
                      <div className="bg-white p-3.5 rounded-xl border border-gray-150 shadow-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-500 flex items-center gap-1">
                            <Key className="h-3 w-3 text-emerald-500" />
                            <span>{isRtl ? "كلمة مرور ولي الأمر:" : "Parent Password:"}</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setParentPassVisible(prev => ({ ...prev, [student.phone]: !prev[student.phone] }));
                            }}
                            className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                          >
                            {isParentPassVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-black text-xs text-slate-900 tracking-wider">
                            {isParentPassVisible ? (student.parentPassword || student.password) : "••••••••"}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWhatsAppModal({
                                  isOpen: true,
                                  selectedGroup: student.groupId,
                                  selectedYear: student.academicYear,
                                  singleStudent: student,
                                  initialTemplateType: 'credentials',
                                  initialRecipientTarget: 'parent'
                                });
                              }}
                              className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md cursor-pointer flex items-center gap-1 border border-emerald-200"
                              title={isRtl ? "إرسال كلمة المرور لولي الأمر عبر واتساب" : "Send Password to Parent"}
                            >
                              <MessageSquare className="h-2.5 w-2.5 text-emerald-600" />
                              <span>{isRtl ? "إرسال" : "Send"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(student.parentPassword || student.password, isRtl ? "كلمة مرور ولي الأمر" : "Parent Password"); }}
                              className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer flex items-center gap-1"
                            >
                              <Copy className="h-2.5 w-2.5" />
                              <span>{isRtl ? "نسخ" : "Copy"}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Notes & Supervisor Remarks */}
                      <div className="bg-white p-3.5 rounded-xl border border-gray-150 shadow-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-500 flex items-center gap-1">
                            <FileText className="h-3 w-3 text-amber-500" />
                            <span>{isRtl ? "ملاحظات وتوجيهات المشرف:" : "Supervisor Notes:"}</span>
                          </span>
                          {editingNotePhone !== student.phone && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingNotePhone(student.phone);
                                setTempNoteText(student.notes || '');
                              }}
                              className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              <Edit2 className="h-2.5 w-2.5" />
                              <span>{isRtl ? "تعديل" : "Edit"}</span>
                            </button>
                          )}
                        </div>

                        {editingNotePhone === student.phone ? (
                          <div className="space-y-2">
                            <textarea
                              rows={2}
                              value={tempNoteText}
                              onChange={(e) => setTempNoteText(e.target.value)}
                              placeholder={isRtl ? "اكتب ملاحظة المشرف الأكاديمي..." : "Enter notes here..."}
                              className="w-full text-xs p-1.5 border rounded-lg focus:ring-1 focus:ring-slate-900 bg-white"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingNotePhone(null); }}
                                className="px-2 py-0.5 text-[10px] text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200"
                              >
                                {isRtl ? "إلغاء" : "Cancel"}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSaveInlineNote(student); }}
                                className="px-2.5 py-0.5 text-[10px] font-bold text-white bg-slate-900 rounded-md hover:bg-slate-800"
                              >
                                {isRtl ? "حفظ الملاحظة" : "Save"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-700 font-medium line-clamp-2 leading-relaxed">
                            {student.notes || <span className="text-slate-400 italic">{isRtl ? "لا توجد ملاحظات مسجلة." : "No notes recorded."}</span>}
                          </p>
                        )}
                      </div>

                    </div>

                    {/* Attendance & Grades Overview */}
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white">
                      
                      {/* Attendance Summary */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                            <Calendar className="h-4 w-4 text-blue-600" />
                            <span>{isRtl ? "سجل الحضور والغياب" : "Attendance Record"}</span>
                          </div>
                          <span className="text-xs font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                            {stats.attRate}% {isRtl ? "حضور" : "Rate"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800">
                            {isRtl ? `حاضر: ${stats.presentCount}` : `Present: ${stats.presentCount}`}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">
                            {isRtl ? `متأخر: ${stats.lateCount}` : `Late: ${stats.lateCount}`}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-800">
                            {isRtl ? `غائب: ${stats.absentCount}` : `Absent: ${stats.absentCount}`}
                          </span>
                          <span className="text-slate-400 text-[11px] font-medium mr-auto ml-auto">
                            ({isRtl ? `إجمالي: ${stats.totalAtt} حصة` : `Total: ${stats.totalAtt}`})
                          </span>
                        </div>

                        {/* Recent 4 attendance badges */}
                        {stats.studentAtt.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {stats.studentAtt.slice(0, 4).map((att) => (
                              <div 
                                key={att.id} 
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                                  att.status === 'present' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                    : att.status === 'late' 
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                      : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                              >
                                <span>{att.date}</span>
                                <span>•</span>
                                <span>{att.status === 'present' ? (isRtl ? 'حاضر' : 'P') : att.status === 'late' ? (isRtl ? 'متأخر' : 'L') : (isRtl ? 'غائب' : 'A')}</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openEditAttendance(att, student.name); }}
                                  className="text-blue-500 hover:text-blue-700 ml-1 p-0.5 rounded hover:bg-white/60 cursor-pointer"
                                  title={isRtl ? "تعديل الحضور" : "Edit Attendance"}
                                >
                                  <Edit2 className="h-2.5 w-2.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteAttendance(att.id, student.name, att.date); }}
                                  className="text-red-400 hover:text-red-700 p-0.5 rounded hover:bg-white/60 cursor-pointer"
                                  title={isRtl ? "حذف هذا السجل" : "Delete Log"}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Grades & Exams Summary */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                            <Award className="h-4 w-4 text-amber-600" />
                            <span>{isRtl ? "كشوف نتائج الاختبارات" : "Exam Scorecards"}</span>
                          </div>
                          {stats.totalScorePct !== null ? (
                            <span className="text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                              {isRtl ? `المتوسط: ${stats.totalScorePct}%` : `Average: ${stats.totalScorePct}%`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              {isRtl ? "لا توجد اختبارات مسجلة" : "No exams logged"}
                            </span>
                          )}
                        </div>

                        {/* Recent 3 Exam badges */}
                        {stats.studentGrades.length > 0 ? (
                          <div className="space-y-1.5">
                            {stats.studentGrades.slice(0, 3).map((g) => {
                              const pct = g.totalMarks > 0 ? Math.round((g.score / g.totalMarks) * 100) : 0;
                              return (
                                <div key={g.id} className="bg-white p-2 rounded-lg border border-gray-150 flex items-center justify-between text-xs font-bold">
                                  <div>
                                    <span className="text-slate-900">{g.examName}</span>
                                    <span className="text-[10px] text-slate-400 block font-normal">{g.examDate}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                      {g.score} / {g.totalMarks} ({pct}%)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); openEditGrade(g, student.name); }}
                                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded-md transition-colors cursor-pointer"
                                      title={isRtl ? "تعديل الدرجة" : "Edit Grade"}
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteGrade(g.id, g.examName, student.name); }}
                                      className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-md transition-colors cursor-pointer"
                                      title={isRtl ? "حذف الدرجة" : "Delete Grade"}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic py-2">
                            {isRtl ? "انقر على '+ رصد درجة' لإضافة أول اختبار لهذا الطالب." : "Click '+ Add Grade' to record the first exam score."}
                          </p>
                        )}
                      </div>

                    </div>

                    {/* Complete History Logs */}
                    <div className="p-5 bg-slate-100/40 space-y-4">
                      
                      {/* All attendance records */}
                      <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-blue-600" />
                            <span>{isRtl ? "كافة سجلات الحضور والغياب" : "Complete Attendance History"}</span>
                          </h4>
                        </div>

                        {stats.studentAtt.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">{isRtl ? "لا توجد سجلات حضور مسجلة." : "No attendance recorded yet."}</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                            {stats.studentAtt.map((att) => (
                              <div key={att.id} className="p-2 bg-slate-50 rounded-lg border border-slate-150 flex items-center justify-between text-xs">
                                <div>
                                  <span className="font-bold text-slate-800 block">{att.date}</span>
                                  <span className={`text-[10px] font-extrabold ${
                                    att.status === 'present' ? 'text-emerald-700' : att.status === 'late' ? 'text-amber-700' : 'text-red-700'
                                  }`}>
                                    {att.status === 'present' ? (isRtl ? 'حاضر' : 'Present') : att.status === 'late' ? (isRtl ? 'متأخر' : 'Late') : (isRtl ? 'غائب' : 'Absent')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openEditAttendance(att, student.name); }}
                                    className="text-blue-500 hover:text-blue-700 hover:bg-blue-100 p-1 rounded transition-colors cursor-pointer"
                                    title={isRtl ? "تعديل الحضور" : "Edit Attendance"}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteAttendance(att.id, student.name, att.date); }}
                                    className="text-red-400 hover:text-red-600 hover:bg-red-100 p-1 rounded transition-colors cursor-pointer"
                                    title={isRtl ? "حذف الحضور" : "Delete Attendance"}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* All grades scorecards */}
                      <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Award className="h-3.5 w-3.5 text-amber-600" />
                            <span>{isRtl ? "كافة كشوف نتائج الاختبارات" : "Complete Exam Scorecards"}</span>
                          </h4>
                        </div>

                        {stats.studentGrades.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">{isRtl ? "لا توجد نتائج اختبارات مسجلة." : "No exam scores recorded yet."}</p>
                        ) : (
                          <div className="divide-y divide-gray-100 border border-gray-150 rounded-xl overflow-hidden text-xs">
                            {stats.studentGrades.map((g) => {
                              const pct = g.totalMarks > 0 ? Math.round((g.score / g.totalMarks) * 100) : 0;
                              return (
                                <div key={g.id} className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between">
                                  <div>
                                    <span className="font-extrabold text-slate-900 block">{g.examName}</span>
                                    <span className="text-[10px] text-slate-400">{g.examDate}</span>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    <span className="font-mono font-bold text-slate-800">
                                      {g.score} / {g.totalMarks} ({pct}%)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); openEditGrade(g, student.name); }}
                                      className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                      title={isRtl ? "تعديل الدرجة" : "Edit Grade"}
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteGrade(g.id, g.examName, student.name); }}
                                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                      title={isRtl ? "حذف الدرجة" : "Delete Grade"}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
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

              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Single Student Quick Add Attendance */}
      {singleAttModal.isOpen && singleAttModal.student && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span>{isRtl ? `رصد حضور: ${singleAttModal.student.name}` : `Log Attendance: ${singleAttModal.student.name}`}</span>
              </div>
              <button 
                onClick={() => setSingleAttModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSingleAttendance} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "تاريخ الحضور / اليوم" : "Attendance Date"}
                </label>
                <input
                  type="date"
                  required
                  value={singleAttModal.date}
                  onChange={(e) => setSingleAttModal(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "حالة الحضور" : "Attendance Status"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSingleAttModal(prev => ({ ...prev, status: 'present' }))}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      singleAttModal.status === 'present' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {isRtl ? "حاضر" : "Present"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSingleAttModal(prev => ({ ...prev, status: 'late' }))}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      singleAttModal.status === 'late' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {isRtl ? "متأخر" : "Late"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSingleAttModal(prev => ({ ...prev, status: 'absent' }))}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      singleAttModal.status === 'absent' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-800 hover:bg-red-100'
                    }`}
                  >
                    {isRtl ? "غائب" : "Absent"}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 font-bold">
                <button
                  type="button"
                  onClick={() => setSingleAttModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-gray-700"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={savingAction === 'single_att'}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingAction === 'single_att' ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ الحضور" : "Save Attendance")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Single Student Quick Add Grade */}
      {singleGradeModal.isOpen && singleGradeModal.student && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Award className="h-4 w-4 text-amber-600" />
                <span>{isRtl ? `رصد اختبار: ${singleGradeModal.student.name}` : `Log Grade: ${singleGradeModal.student.name}`}</span>
              </div>
              <button 
                onClick={() => setSingleGradeModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSingleGrade} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "اسم / موضوع الاختبار" : "Exam / Quiz Title"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? "مثال: امتحان الشهر الأول - قواعد" : "e.g. Monthly Exam 1"}
                  value={singleGradeModal.examName}
                  onChange={(e) => setSingleGradeModal(prev => ({ ...prev, examName: e.target.value }))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "تاريخ الاختبار" : "Exam Date"}
                  </label>
                  <input
                    type="date"
                    required
                    value={singleGradeModal.examDate}
                    onChange={(e) => setSingleGradeModal(prev => ({ ...prev, examDate: e.target.value }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "الدرجة الكلية (العظمى)" : "Total Max Marks"}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={singleGradeModal.totalMarks}
                    onChange={(e) => setSingleGradeModal(prev => ({ ...prev, totalMarks: e.target.value }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "درجة الطالب المحصلة" : "Obtained Score"}
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  placeholder="e.g. 95"
                  value={singleGradeModal.score}
                  onChange={(e) => setSingleGradeModal(prev => ({ ...prev, score: e.target.value }))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-base focus:ring-2 focus:ring-amber-500 font-black text-amber-900 bg-amber-50/50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 font-bold">
                <button
                  type="button"
                  onClick={() => setSingleGradeModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-gray-700"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={savingAction === 'single_grade'}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingAction === 'single_grade' ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ الدرجة" : "Save Grade")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Full Edit Single Student Info */}
      {editStudentModal.isOpen && editStudentModal.student && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Edit2 className="h-4 w-4 text-purple-600" />
                <span>{isRtl ? "تعديل بيانات الطالب الشاملة" : "Edit Student Information"}</span>
              </div>
              <button 
                onClick={() => setEditStudentModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudentEdit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "اسم الطالب كاملاً" : "Student Full Name"}
                </label>
                <input
                  type="text"
                  required
                  value={editStudentModal.name}
                  onChange={(e) => setEditStudentModal(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "رقم هاتف الطالب (لتسجيل الدخول)" : "Student Phone (Login)"}
                  </label>
                  <input
                    type="tel"
                    required
                    readOnly
                    value={editStudentModal.phone}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs bg-slate-100 text-slate-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "رقم هاتف ولي الأمر (لتسجيل دخول الوالد)" : "Parent Phone (Login)"}
                  </label>
                  <input
                    type="tel"
                    required
                    value={editStudentModal.parentPhone}
                    onChange={(e) => setEditStudentModal(prev => ({ ...prev, parentPhone: e.target.value.replace(/\D/g, '') }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs font-bold focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "السنة الدراسية" : "Academic Year"}
                  </label>
                  <select
                    value={editStudentModal.academicYear}
                    onChange={(e) => setEditStudentModal(prev => ({ ...prev, academicYear: e.target.value }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-slate-900 bg-white"
                  >
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "المجموعة" : "Group"}
                  </label>
                  <select
                    value={editStudentModal.groupId}
                    onChange={(e) => setEditStudentModal(prev => ({ ...prev, groupId: e.target.value }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-slate-900 bg-white"
                  >
                    <option value="">{isRtl ? "-- بدون مجموعة --" : "-- No Group --"}</option>
                    {groups.filter(g => g.academicYear === editStudentModal.academicYear).map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name || `${isRtl ? "مجموعة" : "Group"} ${g.groupNumber} (${g.gender === 'male' ? (isRtl ? 'بنين' : 'Male') : (isRtl ? 'بنات' : 'Female')})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "الجنس" : "Gender"}
                  </label>
                  <select
                    value={editStudentModal.gender}
                    onChange={(e) => setEditStudentModal(prev => ({ ...prev, gender: e.target.value as 'male' | 'female' }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-slate-900 bg-white"
                  >
                    <option value="male">{isRtl ? "👦 ذكر / طالب" : "👦 Male"}</option>
                    <option value="female">{isRtl ? "👧 أنثى / طالبة" : "👧 Female"}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {isRtl ? "كلمة مرور الطالب" : "Student Password"}
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditStudentModal(prev => ({ ...prev, password: generateRandomPassword() }))}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      {isRtl ? "توليد جديد" : "Generate"}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={editStudentModal.password}
                    onChange={(e) => setEditStudentModal(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs font-bold focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {isRtl ? "كلمة مرور ولي الأمر" : "Parent Password"}
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditStudentModal(prev => ({ ...prev, parentPassword: generateRandomPassword() }))}
                      className="text-[10px] text-emerald-600 font-bold hover:underline"
                    >
                      {isRtl ? "توليد جديد" : "Generate"}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={editStudentModal.parentPassword}
                    onChange={(e) => setEditStudentModal(prev => ({ ...prev, parentPassword: e.target.value }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs font-bold focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "ملاحظات المشرف الأكاديمي" : "Supervisor Notes"}
                </label>
                <textarea
                  rows={3}
                  value={editStudentModal.notes}
                  onChange={(e) => setEditStudentModal(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={isRtl ? "اكتب أية ملاحظات دراسية أو تربوية هنا..." : "Add supervisor remarks here..."}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-gray-150">
                <label className="font-bold text-slate-800 text-xs">
                  {isRtl ? "حالة تفعيل حساب الطالب بالمنصة" : "Student Account Enabled Status"}
                </label>
                <input
                  type="checkbox"
                  checked={editStudentModal.enabled}
                  onChange={(e) => setEditStudentModal(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 font-bold">
                <button
                  type="button"
                  onClick={() => setEditStudentModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={savingAction === 'edit_student'}
                  className="px-5 py-2 bg-slate-950 hover:bg-slate-850 text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingAction === 'edit_student' ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ التعديلات" : "Save Changes")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Whole Group Batch Attendance Modal */}
      {groupAttModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span>
                  {isRtl ? `رصد حضور وغياب المجموعة (${filteredStudents.length} طالب)` : `Group Attendance Log (${filteredStudents.length} Students)`}
                </span>
              </div>
              <button 
                onClick={() => setGroupAttModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroupAttendance} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-gray-150">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">{isRtl ? "تاريخ اليوم:" : "Attendance Date:"}</span>
                  <input
                    type="date"
                    required
                    value={groupAttModal.date}
                    onChange={(e) => setGroupAttModal(prev => ({ ...prev, date: e.target.value }))}
                    className="py-1.5 px-3 border border-gray-200 rounded-lg font-mono text-xs font-bold bg-white"
                  />
                </div>

                {/* Batch Preset Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const updated: { [phone: string]: 'present' | 'absent' | 'late' } = {};
                      filteredStudents.forEach(s => updated[s.phone] = 'present');
                      setGroupAttModal(prev => ({ ...prev, records: updated }));
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg"
                  >
                    {isRtl ? "الكل حاضر" : "All Present"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated: { [phone: string]: 'present' | 'absent' | 'late' } = {};
                      filteredStudents.forEach(s => updated[s.phone] = 'absent');
                      setGroupAttModal(prev => ({ ...prev, records: updated }));
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold bg-red-100 text-red-800 hover:bg-red-200 rounded-lg"
                  >
                    {isRtl ? "الكل غائب" : "All Absent"}
                  </button>
                </div>
              </div>

              {/* Students List in Group */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {filteredStudents.map((s, idx) => {
                  const currentStatus = groupAttModal.records[s.phone] || 'present';
                  return (
                    <div key={s.id} className="p-3 flex items-center justify-between hover:bg-slate-50 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[11px] w-6">{idx + 1}.</span>
                        <div>
                          <span className="font-extrabold text-slate-900 block">{s.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{s.phone}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setGroupAttModal(prev => ({
                            ...prev,
                            records: { ...prev.records, [s.phone]: 'present' }
                          }))}
                          className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                            currentStatus === 'present' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isRtl ? "حاضر" : "Present"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setGroupAttModal(prev => ({
                            ...prev,
                            records: { ...prev.records, [s.phone]: 'late' }
                          }))}
                          className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                            currentStatus === 'late' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isRtl ? "متأخر" : "Late"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setGroupAttModal(prev => ({
                            ...prev,
                            records: { ...prev.records, [s.phone]: 'absent' }
                          }))}
                          className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                            currentStatus === 'absent' ? 'bg-red-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isRtl ? "غائب" : "Absent"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 font-bold">
                <button
                  type="button"
                  onClick={() => setGroupAttModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-gray-700"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={savingAction === 'group_att'}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingAction === 'group_att' ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ كشف المجموعة" : "Save Group Attendance")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Whole Group Batch Grades / Exam Modal */}
      {groupGradeModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Award className="h-4 w-4 text-amber-600" />
                <span>
                  {isRtl ? `رصد كشف درجات اختبار للمجموعة (${filteredStudents.length} طالب)` : `Group Exam Scorecard Entry (${filteredStudents.length} Students)`}
                </span>
              </div>
              <button 
                onClick={() => setGroupGradeModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroupGrades} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-gray-150">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "اسم / موضوع الاختبار" : "Exam Title"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isRtl ? "مثال: امتحان الشهر الأول" : "e.g. Exam 1"}
                    value={groupGradeModal.examName}
                    onChange={(e) => setGroupGradeModal(prev => ({ ...prev, examName: e.target.value }))}
                    className="w-full py-2 px-3 border border-gray-200 rounded-lg text-xs font-bold bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "تاريخ الاختبار" : "Exam Date"}
                  </label>
                  <input
                    type="date"
                    required
                    value={groupGradeModal.examDate}
                    onChange={(e) => setGroupGradeModal(prev => ({ ...prev, examDate: e.target.value }))}
                    className="w-full py-2 px-3 border border-gray-200 rounded-lg font-mono text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "الدرجة الكلية (العظمى)" : "Total Max Marks"}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={groupGradeModal.totalMarks}
                    onChange={(e) => setGroupGradeModal(prev => ({ ...prev, totalMarks: e.target.value }))}
                    className="w-full py-2 px-3 border border-gray-200 rounded-lg font-mono text-xs font-bold bg-white"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>{isRtl ? "اكتب درجة كل طالب في الخانة المجاورة:" : "Enter score for each student:"}</span>
                <button
                  type="button"
                  onClick={() => {
                    const full: { [phone: string]: string } = {};
                    filteredStudents.forEach(s => full[s.phone] = groupGradeModal.totalMarks);
                    setGroupGradeModal(prev => ({ ...prev, scores: full }));
                  }}
                  className="text-amber-700 font-bold hover:underline"
                >
                  {isRtl ? "ملء الدرجة الكاملة للجميع" : "Fill full marks for all"}
                </button>
              </div>

              {/* Students Score Inputs Table */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {filteredStudents.map((s, idx) => {
                  const scoreVal = groupGradeModal.scores[s.phone] || '';
                  return (
                    <div key={s.id} className="p-3 flex items-center justify-between hover:bg-slate-50 gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[11px] w-6">{idx + 1}.</span>
                        <div>
                          <span className="font-extrabold text-slate-900 block">{s.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{s.phone}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          placeholder="0"
                          value={scoreVal}
                          onChange={(e) => setGroupGradeModal(prev => ({
                            ...prev,
                            scores: { ...prev.scores, [s.phone]: e.target.value }
                          }))}
                          className="w-24 py-1.5 px-3 border border-gray-200 rounded-lg font-mono text-xs font-bold text-center focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                        <span className="text-slate-400 text-xs font-bold font-mono">/ {groupGradeModal.totalMarks}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 font-bold">
                <button
                  type="button"
                  onClick={() => setGroupGradeModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-gray-700"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={savingAction === 'group_grade'}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingAction === 'group_grade' ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ درجات المجموعة" : "Save Group Scores")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Existing Attendance Record */}
      {editAttModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span>{isRtl ? `تعديل سجل الحضور: ${editAttModal.studentName}` : `Edit Attendance: ${editAttModal.studentName}`}</span>
              </div>
              <button 
                onClick={() => setEditAttModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAttendance} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "تاريخ الحضور / اليوم" : "Attendance Date"}
                </label>
                <input
                  type="date"
                  required
                  value={editAttModal.date}
                  onChange={(e) => setEditAttModal(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-600 font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "حالة الحضور" : "Attendance Status"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditAttModal(prev => ({ ...prev, status: 'present' }))}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      editAttModal.status === 'present' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {isRtl ? "حاضر" : "Present"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditAttModal(prev => ({ ...prev, status: 'late' }))}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      editAttModal.status === 'late' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {isRtl ? "متأخر" : "Late"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditAttModal(prev => ({ ...prev, status: 'absent' }))}
                    className={`py-2 px-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      editAttModal.status === 'absent' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-800 hover:bg-red-100'
                    }`}
                  >
                    {isRtl ? "غائب" : "Absent"}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 font-bold">
                <button
                  type="button"
                  onClick={() => setEditAttModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={savingAction === 'edit_att'}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingAction === 'edit_att' ? (isRtl ? "جاري التحديث..." : "Updating...") : (isRtl ? "حفظ التعديل" : "Save Changes")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Existing Grade Record */}
      {editGradeModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Award className="h-4 w-4 text-amber-600" />
                <span>{isRtl ? `تعديل نتيجة اختبار: ${editGradeModal.studentName}` : `Edit Grade: ${editGradeModal.studentName}`}</span>
              </div>
              <button 
                onClick={() => setEditGradeModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditGrade} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "اسم / موضوع الاختبار" : "Exam Title"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? "مثال: امتحان الشهر الأول" : "e.g. Monthly Exam 1"}
                  value={editGradeModal.examName}
                  onChange={(e) => setEditGradeModal(prev => ({ ...prev, examName: e.target.value }))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "تاريخ الاختبار" : "Exam Date"}
                  </label>
                  <input
                    type="date"
                    required
                    value={editGradeModal.examDate}
                    onChange={(e) => setEditGradeModal(prev => ({ ...prev, examDate: e.target.value }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    {isRtl ? "الدرجة الكلية (العظمى)" : "Total Max Marks"}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={editGradeModal.totalMarks}
                    onChange={(e) => setEditGradeModal(prev => ({ ...prev, totalMarks: e.target.value }))}
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  {isRtl ? "درجة الطالب المحصلة" : "Obtained Score"}
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  placeholder="0"
                  value={editGradeModal.score}
                  onChange={(e) => setEditGradeModal(prev => ({ ...prev, score: e.target.value }))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl font-mono text-base focus:ring-2 focus:ring-amber-500 font-black text-amber-900 bg-amber-50/50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 font-bold">
                <button
                  type="button"
                  onClick={() => setEditGradeModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={savingAction === 'edit_grade'}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingAction === 'edit_grade' ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ التعديلات" : "Save Changes")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-150 space-y-4 text-xs">
            <div className="flex items-center gap-2.5 text-red-600 font-extrabold text-sm">
              <AlertTriangle className="h-5 w-5" />
              <span>{confirmModal.title}</span>
            </div>
            <p className="text-slate-600 leading-relaxed font-semibold whitespace-pre-line">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2 pt-2 font-bold">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 cursor-pointer"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => confirmModal.onConfirm()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Sender Modal */}
      <WhatsAppSenderModal
        isOpen={whatsAppModal.isOpen}
        onClose={() => setWhatsAppModal(prev => ({ ...prev, isOpen: false }))}
        lang={lang}
        isRtl={isRtl}
        students={students}
        years={years}
        groups={groups}
        attendance={attendance}
        grades={grades}
        initialSelectedGroup={whatsAppModal.selectedGroup}
        initialSelectedYear={whatsAppModal.selectedYear}
        initialSingleStudent={whatsAppModal.singleStudent}
        initialTemplateType={whatsAppModal.initialTemplateType}
        initialRecipientTarget={whatsAppModal.initialRecipientTarget}
        triggerAlert={triggerAlert}
      />

    </div>
  );
}
