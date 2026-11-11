import { initializeApp } from "firebase/app";
import { 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  getDocFromServer
} from "firebase/firestore";
import { hashPassword } from "./lib/security";

// Core Firebase Configuration loaded securely from environment variables
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
};

// Initialize App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with modern persistent multi-tab cache configuration
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  import.meta.env.VITE_FIRESTORE_DATABASE_ID || "(default)"
);

// Standard Firestore Error Handling Helper (Firebase Skill Mandate)
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: false,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection on Startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'years', 'connection_test'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("[FIREBASE] Connection test: Client is offline.");
    }
  }
}
testConnection();

/**
 * Bootstrap Firestore database with clean, secure initial data
 */
export async function bootstrapDatabase() {
  try {
    const yearsCol = collection(db, "years");
    const snapshot = await getDocs(yearsCol);

    // If years collection is empty, bootstrap the entire DB
    if (snapshot.empty) {
      console.log("[FIREBASE] DB is empty. Bootstrapping mock dataset...");

      // 1. Create Academic Years
      const mockYears = [
        { id: "2025", name: "العام الدراسي 2025" },
        { id: "2026", name: "العام الدراسي 2026" },
        { id: "2027", name: "العام الدراسي 2027" }
      ];
      for (const yr of mockYears) {
        await setDoc(doc(db, "years", yr.id), yr);
      }

      // Helper for bootstrap random passwords
      const generateSecurePass = () => Math.random().toString(36).slice(-8).toUpperCase();

      // 2. Create Administrators with Hashed Passwords
      const superAdminPassHash = await hashPassword(import.meta.env.VITE_INITIAL_ADMIN_PASSWORD || "Admin@" + generateSecurePass());
      const staffAdminPassHash = await hashPassword("Staff@" + generateSecurePass());

      const mockAdmins = [
        {
          id: "0500000000",
          name: "Super Admin",
          phone: "0500000000",
          password: superAdminPassHash,
          permissions: ["super_admin", "manage_students", "manage_videos", "manage_exams"],
          isSuperAdmin: true
        },
        {
          id: "0555555555",
          name: "Academic Coordinator",
          phone: "0555555555",
          password: staffAdminPassHash,
          permissions: ["manage_students", "manage_videos"],
          isSuperAdmin: false
        }
      ];
      for (const adm of mockAdmins) {
        await setDoc(doc(db, "admins", adm.id), adm);
      }

      // 3. Create Students with Hashed Passwords
      const std1Pass = await hashPassword(generateSecurePass());
      const std2Pass = await hashPassword(generateSecurePass());
      const std3Pass = await hashPassword(generateSecurePass());

      const mockStudents = [
        {
          id: "0100100100",
          name: "Ahmad Ali",
          phone: "0100100100",
          parentPhone: "0900900900",
          academicYear: "2025",
          gender: "male",
          password: std1Pass,
          parentPassword: await hashPassword(generateSecurePass()),
          enabled: true,
          notes: "Excellent commitment in physics lectures. Extremely polite and highly analytical.",
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString()
        },
        {
          id: "0200200200",
          name: "Sarah Smith",
          phone: "0200200200",
          parentPhone: "0800800800",
          academicYear: "2026",
          gender: "female",
          password: std2Pass,
          parentPassword: await hashPassword(generateSecurePass()),
          enabled: true,
          notes: "Creative assignments worker. Requires slight prompt support in daily math tasks.",
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString()
        },
        {
          id: "0300300300",
          name: "John Doe",
          phone: "0300300300",
          parentPhone: "0700700700",
          academicYear: "2025",
          gender: "male",
          password: std3Pass,
          parentPassword: await hashPassword(generateSecurePass()),
          enabled: false,
          notes: "Study leave. Contact parent before re-activation.",
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString()
        }
      ];
      for (const std of mockStudents) {
        await setDoc(doc(db, "students", std.id), std);
      }

      // 4. Create Attendance Logs
      const mockAttendance = [
        { id: "0100100100_2026-06-25", studentPhone: "0100100100", studentName: "Ahmad Ali", date: "2026-06-25", status: "present" },
        { id: "0100100100_2026-06-26", studentPhone: "0100100100", studentName: "Ahmad Ali", date: "2026-06-26", status: "present" },
        { id: "0100100100_2026-06-27", studentPhone: "0100100100", studentName: "Ahmad Ali", date: "2026-06-27", status: "late" },
        { id: "0100100100_2026-06-28", studentPhone: "0100100100", studentName: "Ahmad Ali", date: "2026-06-28", status: "present" },
        { id: "0100100100_2026-06-29", studentPhone: "0100100100", studentName: "Ahmad Ali", date: "2026-06-29", status: "absent" },
        { id: "0200200200_2026-06-26", studentPhone: "0200200200", studentName: "Sarah Smith", date: "2026-06-26", status: "present" },
        { id: "0200200200_2026-06-27", studentPhone: "0200200200", studentName: "Sarah Smith", date: "2026-06-27", status: "present" },
        { id: "0200200200_2026-06-28", studentPhone: "0200200200", studentName: "Sarah Smith", date: "2026-06-28", status: "present" },
        { id: "0200200200_2026-06-29", studentPhone: "0200200200", studentName: "Sarah Smith", date: "2026-06-29", status: "present" }
      ];
      for (const att of mockAttendance) {
        await setDoc(doc(db, "attendance", att.id), att);
      }

      // 5. Create Grade Papers
      const mockGrades = [
        { id: "g1", examName: "Physics Terminal Exam", examDate: "2026-06-20", totalMarks: 100, studentPhone: "0100100100", studentName: "Ahmad Ali", score: 94 },
        { id: "g2", examName: "Math Monthly Quiz", examDate: "2026-06-22", totalMarks: 50, studentPhone: "0100100100", studentName: "Ahmad Ali", score: 48 },
        { id: "g3", examName: "Physics Terminal Exam", examDate: "2026-06-20", totalMarks: 100, studentPhone: "0200200200", studentName: "Sarah Smith", score: 81 },
        { id: "g4", examName: "Math Monthly Quiz", examDate: "2026-06-22", totalMarks: 50, studentPhone: "0200200200", studentName: "Sarah Smith", score: 45 }
      ];
      for (const grd of mockGrades) {
        await setDoc(doc(db, "grades", grd.id), grd);
      }

      // 6. Create Videos (with mock Cloudflare IDs)
      const mockVideos = [
        {
          id: "v1",
          title: "قواعد الاستفهام - الدرس الأول",
          description: "شرح مفصل لأدوات الاستفهام واستخداماتها المختلفة مع الأمثلة التطبيقية والوزارية.",
          thumbnailUrl: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=60",
          duration: "18:42",
          academicYear: "2025",
          category: "قواعد الاستفهام",
          displayOrder: 1,
          visibility: "public",
          cloudflareId: "cf_calc_intro_981273",
          signedUrl: true
        },
        {
          id: "v2",
          title: "أسلوب النفي وأدواته بالتفصيل",
          description: "التعرف على أدوات النفي العاملة وغير العاملة وتأثيرها الإعرابي والمعنوي في الجمل العربية.",
          thumbnailUrl: "https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=600&auto=format&fit=crop&q=60",
          duration: "24:15",
          academicYear: "2025",
          category: "النفي",
          displayOrder: 2,
          visibility: "public",
          cloudflareId: "cf_momentum_28104",
          signedUrl: true
        },
        {
          id: "v3",
          title: "أسلوب التعجب: صيغه وأحكامه القياسية والسماعية",
          description: "شرح صيغ التعجب القياسية والسماعية وطريقة صياغتها وشروطها الإعرابية مع حل تمرينات متنوعة.",
          thumbnailUrl: "https://images.unsplash.com/photo-1532187863486-abf9d39d66e8?w=600&auto=format&fit=crop&q=60",
          duration: "15:30",
          academicYear: "2026",
          category: "التعجب",
          displayOrder: 1,
          visibility: "public",
          cloudflareId: "cf_covalent_7294",
          signedUrl: true
        },
        {
          id: "v4",
          title: "أدب الجزء الأول: مقدمة في العصر الجاهلي ومصادره",
          description: "دراسة شاملة لخصائص الشعر الجاهلي وأشهر الشعراء والمعلقات السبع وتأثيرها في تاريخ الأدب العربي.",
          thumbnailUrl: "https://images.unsplash.com/photo-1530026405186-ed1ea0ac7a63?w=600&auto=format&fit=crop&q=60",
          duration: "21:08",
          academicYear: "2025",
          category: "ادب الجزء الاول",
          displayOrder: 1,
          visibility: "public",
          cloudflareId: "cf_mitosis_4429",
          signedUrl: true
        }
      ];
      for (const vid of mockVideos) {
        await setDoc(doc(db, "videos", vid.id), vid);
      }

      // 7. Create Notifications
      const mockNotifications = [
        {
          id: "n1",
          title: "Interactive Video Modules Active",
          body: "Hello students! New physics and mathematics interactive tutorials have been signed and uploaded. Check the Videos tab.",
          target: "all",
          sentAt: new Date(Date.now() - 3600000 * 24).toISOString()
        },
        {
          id: "n2",
          title: "Math Quiz - Solutions Published",
          body: "Review the answers sheet shared in classroom notes. Contact administrative instructors with any feedback.",
          target: "year_2025",
          sentAt: new Date(Date.now() - 3600000 * 48).toISOString()
        }
      ];
      for (const notif of mockNotifications) {
        await setDoc(doc(db, "notifications", notif.id), notif);
      }

      console.log("[FIREBASE] Mock dataset bootstrap finished successfully!");
    } else {
      console.log("[FIREBASE] Database already has data. Skipping bootstrap.");
    }
  } catch (err) {
    console.error("[FIREBASE] Error during bootstrap operations:", err);
  }
}
