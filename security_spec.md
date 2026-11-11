# Security Specification & Test Suite (`security_spec.md`)

## 1. Data Invariants

- **Invariant 1 (Admin Isolation)**: Admin credentials and privileges stored in `/admins/{adminId}` can ONLY be read or modified by authenticated users who exist in `/admins/{adminId}`. Self-creation or public enumeration of admin accounts is strictly forbidden.
- **Invariant 2 (Student Ownership & PII Protection)**: Student profiles in `/students/{studentId}` contain sensitive data (phone, parentPhone, password hash). Students can only read their own profile document (`request.auth.uid == studentId`). Non-admin users cannot list all students or modify student records.
- **Invariant 3 (Grade & Attendance Integrity)**: Grades (`/grades/{gradeId}`) and Attendance (`/attendance/{attendanceId}`) records are read-only for students/parents associated with that `studentPhone` and writeable ONLY by authenticated admins. Students/parents can never create, alter, or delete grades or attendance records.
- **Invariant 4 (Bookmark Ownership)**: Bookmarks (`/bookmarks/{bookmarkId}`) created by a student must have `studentPhone == request.auth.uid` or belong to the authenticated student ID. Users can only list, get, create, update, or delete their OWN bookmarks.
- **Invariant 5 (Video & Course Material Protection)**: Videos (`/videos/{videoId}`), Academic Years (`/years/{yearId}`), and Groups (`/groups/{groupId}`) can be read by authenticated users, but can ONLY be created, updated, or deleted by authenticated admins.
- **Invariant 6 (Notification Logging)**: Notifications (`/notifications/{notificationId}`) are writeable ONLY by admins. Authenticated users can read notifications targeted to them or broadcasted to 'all'.
- **Invariant 7 (Immutable & Schema Integrity)**: All writes must pass strict schema type, size, and pattern checks. System and immutable fields (`createdAt`, `studentPhone`, `id`) cannot be tampered with.

---

## 2. The "Dirty Dozen" Threat Payloads

Below are 12 hostile payloads designed to break identity, authorization, integrity, and privacy boundaries.

### Payload 1: Unauthenticated Admin Creation (Privilege Escalation)
- **Target Path**: `POST /admins/hacker_admin_1337`
- **Auth**: `null` (Unauthenticated)
- **Payload**: `{"id": "hacker_admin_1337", "name": "Evil Admin", "phone": "0000000000", "password": "hashed_pass", "isSuperAdmin": true}`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 2: Student Elevating Status to Admin
- **Target Path**: `POST /admins/student_phone_123`
- **Auth**: `uid: "student_phone_123"` (Role: Student)
- **Payload**: `{"id": "student_phone_123", "name": "Student Exploit", "phone": "01000000000", "password": "pass", "isSuperAdmin": true}`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 3: Student Tampering with Grades (Score Inflation)
- **Target Path**: `PATCH /grades/grade_math_01`
- **Auth**: `uid: "01011112222"` (Student)
- **Payload**: `{"score": 100, "totalMarks": 100}`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 4: Student Forging Attendance Record
- **Target Path**: `POST /attendance/01011112222_2026-07-29`
- **Auth**: `uid: "01011112222"` (Student)
- **Payload**: `{"id": "01011112222_2026-07-29", "studentPhone": "01011112222", "studentName": "Alex", "date": "2026-07-29", "status": "present"}`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 5: Unauthorized Student Reading Another Student's Profile (PII Leak)
- **Target Path**: `GET /students/01099998888`
- **Auth**: `uid: "01011112222"` (Student A trying to read Student B's data)
- **Payload**: `N/A`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 6: Mass Collection Enumeration / Scraping Students (Denial of Wallet / Data Harvesting)
- **Target Path**: `LIST /students`
- **Auth**: `uid: "01011112222"` (Student)
- **Payload**: `N/A`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 7: Deleting Educational Videos (Resource Destruction)
- **Target Path**: `DELETE /videos/video_physics_01`
- **Auth**: `uid: "01011112222"` (Student)
- **Payload**: `N/A`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 8: Creating Malicious Bookmark for Another User (Identity Spoofing)
- **Target Path**: `POST /bookmarks/bm_evil_99`
- **Auth**: `uid: "01011112222"` (Student A)
- **Payload**: `{"id": "bm_evil_99", "studentPhone": "01099998888", "videoId": "vid1", "timestamp": 120, "note": "Hacked"}`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 9: Oversized Payload Injection / Denial of Wallet (1MB String in Note)
- **Target Path**: `POST /bookmarks/bm_valid_1`
- **Auth**: `uid: "01011112222"` (Student A)
- **Payload**: `{"id": "bm_valid_1", "studentPhone": "01011112222", "videoId": "vid1", "timestamp": 120, "note": "<1MB JUNK STRING...>"}`
- **Expected Result**: `PERMISSION_DENIED` (Fails size validation `<= 1000`)

### Payload 10: Modifying System Notifications
- **Target Path**: `POST /notifications/fake_notif_1`
- **Auth**: `uid: "01011112222"` (Student)
- **Payload**: `{"id": "fake_notif_1", "title": "Class Cancelled", "body": "No class today", "target": "all", "sentAt": "2026-07-29T10:00:00Z"}`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 11: Modifying Academic Year Structure
- **Target Path**: `PATCH /years/year_2025`
- **Auth**: `uid: "01011112222"` (Student)
- **Payload**: `{"name": "Hacked Year"}`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 12: Unauthenticated Read of Admin Directory
- **Target Path**: `LIST /admins`
- **Auth**: `null` (Unauthenticated)
- **Payload**: `N/A`
- **Expected Result**: `PERMISSION_DENIED`

---

## 3. Test Suite Implementation (`firestore.rules.test.ts`)

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'almarfa-security-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Dirty Dozen Security Rules Verification', () => {
  it('Payload 1: Reject unauthenticated admin creation', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.collection('admins').doc('hacker_admin_1337').set({
      id: 'hacker_admin_1337',
      name: 'Evil Admin',
      phone: '0000000000',
      password: 'hashed_pass',
    }));
  });

  it('Payload 2: Reject student self-promoting to admin', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('admins').doc('01011112222').set({
      id: '01011112222',
      name: 'Student Exploit',
      phone: '01011112222',
      password: 'pass',
      isSuperAdmin: true,
    }));
  });

  it('Payload 3: Reject student modifying grades', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('grades').doc('grade_math_01').update({
      score: 100,
    }));
  });

  it('Payload 4: Reject student forging attendance record', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('attendance').doc('01011112222_2026-07-29').set({
      id: '01011112222_2026-07-29',
      studentPhone: '01011112222',
      studentName: 'Alex',
      date: '2026-07-29',
      status: 'present',
    }));
  });

  it('Payload 5: Reject student reading another student profile', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('students').doc('01099998888').get());
  });

  it('Payload 6: Reject student listing all students collection', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('students').get());
  });

  it('Payload 7: Reject student deleting videos', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('videos').doc('video_physics_01').delete());
  });

  it('Payload 8: Reject student spoofing bookmark studentPhone', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('bookmarks').doc('bm_evil_99').set({
      id: 'bm_evil_99',
      studentPhone: '01099998888',
      videoId: 'vid1',
      timestamp: 120,
    }));
  });

  it('Payload 9: Reject oversized string payload in bookmark', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    const junkString = 'A'.repeat(5000);
    await assertFails(studentDb.collection('bookmarks').doc('bm_valid_1').set({
      id: 'bm_valid_1',
      studentPhone: '01011112222',
      videoId: 'vid1',
      timestamp: 120,
      note: junkString,
    }));
  });

  it('Payload 10: Reject student pushing notifications', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('notifications').doc('fake_notif_1').set({
      id: 'fake_notif_1',
      title: 'Class Cancelled',
      body: 'No class today',
      target: 'all',
      sentAt: '2026-07-29T10:00:00Z',
    }));
  });

  it('Payload 11: Reject student updating academic year', async () => {
    const studentDb = testEnv.authenticatedContext('01011112222').firestore();
    await assertFails(studentDb.collection('years').doc('year_2025').update({
      name: 'Hacked Year',
    }));
  });

  it('Payload 12: Reject unauthenticated listing of admins', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.collection('admins').get());
  });
});
