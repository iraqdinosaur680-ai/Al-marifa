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

