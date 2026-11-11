// Shared types for Student Learning Platform

export interface AcademicYear {
  id: string; // e.g. "2025", "2026"
  name: string; // e.g. "Class of 2025"
}

export interface Group {
  id: string; // e.g. "grp_2025_1_male"
  academicYear: string; // ID of AcademicYear
  groupNumber: string; // e.g. "1", "2", "3"
  gender: 'male' | 'female'; // 'male' or 'female'
  name?: string; // Optional custom name e.g. "Group 1 - Mon/Wed"
  schedule?: {
    [day: string]: string; // day key e.g. 'saturday' -> time e.g. "6:00 AM - 7:30 AM"
  };
}

export interface Student {
  id: string; // matches studentPhone
  name: string;
  phone: string;
  parentPhone: string;
  academicYear: string; // ID of AcademicYear
  groupId?: string; // ID of Group
  gender?: 'male' | 'female'; // Male or Female
  password: string; // Automatically generated student password
  parentPassword?: string; // Automatically generated parent password (different from student password)
  studentCode?: string; // Optional student identification code
  enabled: boolean;
  notes: string;
  createdDate: string;
  updatedDate: string;
}

export interface AttendanceRecord {
  id: string; // e.g. "0100000000_2026-06-30"
  studentPhone: string;
  studentName: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'late';
}

export interface GradeRecord {
  id: string; // unique UUID
  examName: string;
  examDate: string; // YYYY-MM-DD
  totalMarks: number;
  studentPhone: string;
  studentName: string;
  score: number; // actual score obtained
}

export interface Video {
  id: string; // uuid
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: string; // e.g. "12:34"
  academicYear: string; // AcademicYear ID
  category: string; // e.g. "Math", "Physics"
  displayOrder: number;
  visibility: 'public' | 'hidden';
  cloudflareId: string; // Cloudflare Stream ID
  signedUrl: boolean;
  downloadUrl?: string; // Optional direct MP4 / offline download link
}

export interface AdminUser {
  id: string; // matches phone
  name: string;
  phone: string;
  password: string;
  permissions: string[]; // e.g. ["super_admin", "manage_students", "manage_videos"]
  isSuperAdmin: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  target: string; // "all", "year_2025", "student_0100...", "parent_0100..."
  sentAt: string;
}
