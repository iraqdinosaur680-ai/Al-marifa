# 🎓 منصة المعرفة | Almarfa Educational Platform

[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8.svg)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.5-119eff.svg)](https://capacitorjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange.svg)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

An enterprise-grade, bilingual (Arabic RTL & English LTR) educational management ecosystem and learning portal designed for educational academies, tutoring centers, and schools. Built with **React 19**, **TypeScript**, **Tailwind CSS**, and **Express**, with native mobile application builds powered by **Capacitor 8** for Android and iOS.

---

## 🌟 Key Features

### 🎓 1. Student Portal
- **High-Definition Video Lectures**: Token-signed, secure HLS video player integrated with Bunny Stream and Cloudflare Stream CDN. Supports adaptive bitrate playback, speed controls, timestamps, and resume points.
- **Academic Progress & Grades**: Interactive scorecards and grade analytics with visual performance charts.
- **Real-Time Attendance Records**: Live tracking of presence, late arrivals, and excused/unexcused absences.
- **Offline Resilience**: Local caching via IndexedDB and Firestore multi-tab cache to view study notes even with spotty connectivity.
- **Personalized UI**: Modern dark and light mode themes with smooth animations.

### 👨‍👩‍👧 2. Parent Portal
- **Child Academic Monitoring**: Parents log in using their verified phone number to instantly view all enrolled children (with automatic sibling account linking).
- **Attendance & Grade Insights**: Detailed breakdown of daily tests, terminal examinations, and class attendance.
- **Instant WhatsApp Communication**: Direct pre-formatted academic reports and notification alerts sent to parents via WhatsApp.
- **Credential Recovery**: Secure parent password management separate from student credentials.

### 🛡️ 3. Administrative Control Center
- **Student Roster Management**: Create, edit, toggle account status, and organize students by academic year and study groups.
- **Batch CSV/Excel Import & Export**: One-click mass student onboarding with auto-generated secure credentials.
- **Video Curriculum Manager**: Upload and categorize video lectures, configure signed playback URLs, and control visibility.
- **Exam & Attendance Entry**: Fast bulk grade entry and attendance marking with search and filter capabilities.
- **Broadcast Notifications**: Dispatch announcements to entire grades or individual student groups with Firebase Cloud Messaging (FCM).
- **Security Audit Tools**: In-depth audit modal verifying parent credentials and phone number integrity.

### 📱 4. Native Mobile Applications (Android & iOS)
- Fully configured **Capacitor 8** native runtime for Android and iOS.
- Hardware back-button handling on Android devices.
- Dynamic status bar styling adapting to system dark/light themes.
- Native splash screens and edge-to-edge mobile viewport layouts.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19, TypeScript 5.8, Vite 6 |
| **Styling & Icons** | Tailwind CSS 4, Lucide React, Framer Motion |
| **Data Visualizations** | Recharts |
| **Mobile Runtime** | Capacitor 8 (`@capacitor/android`, `@capacitor/ios`, `@capacitor/status-bar`) |
| **Backend & API** | Node.js, Express, Esbuild (production SSR/API bundle) |
| **Database & Realtime** | Google Firebase Firestore with client-side offline cache |
| **Video Delivery** | Bunny Stream / Cloudflare Stream token-based HMAC-SHA256 signing |
| **Security** | Web Crypto SHA-256 password hashing, SSRF guard, Helmet security headers, Rate Limiting |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18.0.0 or higher recommended)
- `npm` (bundled with Node.js)
- For Android builds: [Android Studio](https://developer.android.com/studio) and Android SDK (API 34+)
- For iOS builds: macOS with [Xcode](https://developer.apple.com/xcode/) (15+) and CocoaPods

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/almarfa-educational-platform.git
cd almarfa-educational-platform
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the template file to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your Firebase and CDN keys:
```env
# Google Gemini AI API (Optional)
GEMINI_API_KEY="your_gemini_api_key_here"

# Server Host URL
APP_URL="http://localhost:3000"
VITE_APP_URL="http://localhost:3000"

# Firebase Web Client Configuration
VITE_FIREBASE_API_KEY="your_firebase_api_key"
VITE_FIREBASE_PROJECT_ID="your_firebase_project_id"
VITE_FIREBASE_APP_ID="your_firebase_app_id"
VITE_FIREBASE_AUTH_DOMAIN="your_firebase_project_id.firebaseapp.com"
VITE_FIREBASE_STORAGE_BUCKET="your_firebase_project_id.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="your_messaging_sender_id"
VITE_FIRESTORE_DATABASE_ID="(default)"

# Video Streaming CDN (Bunny Stream / Cloudflare Stream)
BUNNY_SECURITY_KEY="your_bunny_token_auth_key"
BUNNY_LIBRARY_ID="your_bunny_library_id"
VITE_BUNNY_SECURITY_KEY="your_bunny_token_auth_key"
VITE_BUNNY_LIBRARY_ID="your_bunny_library_id"
```

### 4. Run Development Server
```bash
npm run dev
```
The app will be available at `http://localhost:3000`.

---

## 📦 Building for Production

To build the client SPA and the backend Express bundle:
```bash
npm run build
npm start
```

---

## 📱 Mobile App Compilation (Capacitor)

### Android
1. Set up your Firebase Android configuration:
   ```bash
   cp android/app/google-services.json.example android/app/google-services.json
   ```
   Add your Android client credentials from Firebase Console.
2. Build and synchronize web assets with the native Android project:
   ```bash
   npm run cap:build:android
   ```
3. Open Android Studio to build the APK/AAB:
   ```bash
   npm run cap:open:android
   ```

### iOS
1. Build and synchronize web assets with the native iOS project:
   ```bash
   npm run cap:build:ios
   ```
2. Open Xcode:
   ```bash
   npm run cap:open:ios
   ```

---

## 🔐 Security Best Practices & Deployment Checklist

- **No Hardcoded Credentials**: All API keys, database identifiers, and token secrets are dynamically loaded from environment variables (`.env`).
- **Protected Environment Files**: `.gitignore` strictly prevents `.env`, `google-services.json`, keystores, certificates, and build artifacts from being committed.
- **SSRF Prevention**: The backend video proxy (`/api/video/proxy`) implements strict allow-lists and blocks private IP ranges (RFC 1918) and cloud metadata services.
- **Input Sanitization**: Client inputs are sanitized to protect against Cross-Site Scripting (XSS) and injection attacks.
- **Cryptographic Password Hashing**: Passwords are never stored in plain text; they are hashed with salted SHA-256 before writing to Firestore.

---

## 📤 Publishing to GitHub

Follow these steps to initialize your Git repository and push your project to GitHub:

```bash
# 1. Initialize git
git init

# 2. Add all files (the curated .gitignore will exclude all sensitive and unnecessary files)
git add .

# 3. Commit your initial clean codebase
git commit -m "feat: initial commit of Almarfa Educational Platform"

# 4. Link your remote GitHub repository
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/almarfa-educational-platform.git

# 5. Push to GitHub
git push -u origin main
```

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
