# Smart Attendance System

A React, Express and Python application for course-based attendance with face recognition, Student/Teacher/Admin portals, analytics, notifications, corrections and semester reports.

## Features

### Accounts and Portals

| Role | Features |
|------|----------|
| Student | Own course enrolments, lecture history, course-wise percentages, profile/photo, password change, analytics, notifications, correction requests and personal term reports |
| Teacher | Dashboard, Student management, face registration, assigned courses, lecture attendance, profile/photo/password updates, analytics, notifications, correction review and scoped reports |
| Administrator | Profile/account counts, account search and status controls, Student/Teacher directories, account creation and activation, academic management, institution-wide attendance browsing, analytics, escalated corrections and reports |

- Shared account authentication with server-enforced roles, ownership and assignment checks.
- Student login uses college email. Authorised account creation supports Student/Teacher role selection; Teachers can create Student accounts only.
- Both Teacher and Admin can add Student profiles. Profile creation, account activation and course enrolment are separate actions.
- Expiring, one-use activation links, invitation reissue and shared password change. Public registration is disabled.

### Courses and Classes

- Academic terms, class groups, courses and course offerings.
- Teacher assignments and Student enrolments with effective dates.
- Lecture creation, scheduling, cancellation, roster selection and attendance finalisation.
- Separate attendance for multiple lectures on the same day.
- Historical rosters and archived academic records preserve past attendance.
- Campus dates and times use **Asia/Kolkata**.

### Attendance Management

Teachers select an authorised course/class and lecture on the **Attendance** page.

| Tab | Function |
|-----|----------|
| Live Video | Camera start/stop, preview, capture, Single Face and Multiple Faces recognition |
| Photo Upload | Attendance recognition from classroom photos |
| Manual | Present, absent and late marking with group controls |
| Today | Today's attendance with individual lecture context |
| Download | Single Date and Date Range CSV downloads |

- Face matching is restricted to the server-authorised session roster; repeated recognition does not duplicate attendance.
- Unmarked entries remain **Not marked** until explicit finalisation, when remaining eligible Students become absent.
- Cancelled lectures reject marking. Reset is limited to authorised, unfinalised sessions.
- Teacher dashboard includes counts, **Attendance Trend** for the last seven sessions and **Recent Attendance**.
- Student-list CSV export, Student photos, face registration and Teacher profile/photo/password functions remain available.

### Attendance Analytics

Course-wise percentages, monthly trends, Student breakdowns, below-minimum lists, filters and pagination use one shared server calculation:

```text
Attendance % = (present + late) / eligible completed, finalised sessions × 100
```

- Students see their own results; Teachers see lectures they taught; Administrators can filter institution-wide results.
- Saved historical rosters determine eligibility. Scheduled, cancelled, unfinalised and unmapped legacy records are excluded.
- Zero eligible sessions shows **No completed sessions**. Inconsistent finalised marks show **Incomplete data** instead of a percentage.
- Aggregates use combined counts, not averages of percentages. Threshold comparisons use exact counts before display rounding.
- The attendance minimum is configurable per term by Admin, initially **75%**. It is an application setting, not an examination-eligibility decision.

### Low-Attendance Notifications

- Saved, in-app notifications for eligible Student and Teacher accounts, using the term minimum and authorised analytics scope.
- Unread indicators, individual/all-read controls, status filters and pagination.
- Active, resolved and evaluation-unavailable states; recovery resolves a warning and a later drop can reactivate it.
- Duplicate prevention and durable reconciliation after relevant attendance, account, academic or minimum-setting changes.

### Attendance Corrections

- Students request correction of their own eligible finalised entry, provide a reason, track decisions and withdraw unresolved requests.
- Authorised teaching Teachers approve, reject or escalate; Admin handles escalated requests or those without an eligible Teacher reviewer.
- Pending Teacher review, Escalated to Admin, Approved, Rejected, Withdrawn and Stale states.
- Concurrency checks prevent conflicting decisions. Approved changes preserve original marking details and append an audit record.
- Corrected attendance is reflected in analytics and notification reconciliation.

### Semester Reports

- Student personal term summaries, Teacher lecture-scoped summaries and Admin Student/course/class/institution summaries.
- Term, course, class, Teacher, Student and date filters according to role permissions.
- Paginated preview and full filtered CSV export using the same calculations and access checks.
- Present/late/absent totals, eligible sessions, weighted percentages, current term minimum, scope, generation time and data-quality states.
- Unicode-safe CSV output, spreadsheet-formula protection and explicit export limits.

### Legacy Records and Themes

- **Legacy attendance** remains accessible. Admin can preview and explicitly map supported records to validated course offerings without replacing the originals.
- **Light / Dark / System** themes apply throughout the application, with saved preferences and system/cross-tab updates.
- Responsive sign-in and shared controls, readable charts/tables and accessible password visibility. Photos and camera video retain their original colours.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, React Router, Axios |
| UI and charts | Tailwind CSS 3, Lucide, React Hot Toast, Recharts |
| Backend | Node.js, Express 4, Mongoose 8, JWT, bcryptjs, Multer |
| Database | MongoDB |
| Face recognition | Python, Flask, NumPy, PyMongo, HuggingFace Gradio client |
| CSV and service startup | csv-writer, concurrently |

## Getting Started

**Requirements:** Node.js 18+, Python 3.10+, MongoDB and network access for the remote face model. Live Video also requires browser camera permission on localhost or HTTPS.

From the repository root:

```bash
npm run setup
```

Configure the environment variables below, then start all three services:

```bash
npm run dev
```

| Service | Local URL |
|---------|-----------|
| Frontend | http://localhost:5173/login |
| Express API | http://localhost:5000/api |
| Face service | http://localhost:5001/api |

The face service extracts embeddings through the remote HuggingFace model and matches them using cosine similarity with a `0.5` threshold. A face embedding is the numeric representation used for recognition. Profile-photo replacement is separate from face registration. If the remote model is unavailable, manual attendance remains usable.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection URI and database shared by Express and Python |
| `JWT_SECRET` | Private account-token signing secret |
| `JWT_EXPIRES_IN` | Token lifetime; default `7d` |
| `PORT` | Express port; default `5000` |
| `FACE_API_URL` | Face-service URL; default `http://localhost:5001/api` |
| `FRONTEND_URL` | Additional allowed frontend origin |
| `HF_TOKEN` | Remote HuggingFace authentication when required |
| `VITE_API_URL` | Frontend API URL; default `http://localhost:5000/api` |
| `VITE_API_BASE_URL` | Backend origin for photo URLs; default `http://localhost:5000` |

Set server variables before starting the services and Vite variables before starting or building the frontend. The Python service listens on port `5001`.

## Available Commands

| Command | Purpose |
|---------|---------|
| `npm run setup` | Install Node.js and Python dependencies |
| `npm run dev` | Start all three development services |
| `npm run start:client` | Start the frontend |
| `npm run start:server` | Start Express |
| `npm run start:python` | Start the face service |
| `npm run build:client` | Build the frontend |
| `npm start` | Start the services with frontend preview after building |

## Project Structure

Main application files:

```text
smart-attendance/
├── package.json                         # Setup, startup and build commands
├── package-lock.json
├── README.md
├── LICENSE
└── student-attendance-system/
    ├── client/
    │   ├── index.html
    │   ├── package.json
    │   ├── vite.config.js
    │   ├── tailwind.config.js
    │   ├── public/
    │   │   └── theme.js                  # Initial theme and preference state
    │   └── src/
    │       ├── App.jsx                   # Role-aware routes and layouts
    │       ├── index.jsx
    │       ├── index.css                 # Shared styles and theme colours
    │       ├── components/
    │       │   ├── Auth/
    │       │   │   ├── Login.jsx
    │       │   │   ├── Activate.jsx
    │       │   │   └── ChangePassword.jsx
    │       │   ├── Dashboard/
    │       │   │   └── Dashboard.jsx
    │       │   ├── Students/
    │       │   │   ├── StudentList.jsx
    │       │   │   ├── AddStudent.jsx
    │       │   │   └── StudentCard.jsx
    │       │   ├── Attendance/
    │       │   │   ├── FaceAttendance.jsx
    │       │   │   ├── PhotoUpload.jsx
    │       │   │   ├── TakeAttendance.jsx
    │       │   │   ├── AttendanceList.jsx
    │       │   │   └── DownloadAttendance.jsx
    │       │   ├── Academic/
    │       │   │   └── AcademicPages.jsx
    │       │   ├── Student/
    │       │   │   ├── StudentDashboard.jsx
    │       │   │   └── StudentPortalPages.jsx
    │       │   ├── Admin/
    │       │   │   ├── AdminDashboard.jsx
    │       │   │   ├── AdminPortalPages.jsx
    │       │   │   └── CreateAccount.jsx
    │       │   ├── Profile/
    │       │   │   ├── TeacherProfile.jsx
    │       │   │   ├── EditProfile.jsx
    │       │   │   └── PhotoUpload.jsx
    │       │   ├── Analytics/
    │       │   │   └── AttendanceAnalytics.jsx
    │       │   ├── Notifications/
    │       │   │   └── Notifications.jsx
    │       │   ├── Corrections/
    │       │   │   └── Corrections.jsx
    │       │   ├── Reports/
    │       │   │   └── SemesterReports.jsx
    │       │   └── common/               # Navigation, guards, theme and UI controls
    │       ├── context/                  # Account authentication state
    │       ├── pages/
    │       │   └── Attendance.jsx        # Original attendance tabs and session selector
    │       ├── services/                 # Shared API and feature clients
    │       └── utils/
    └── server/
        ├── package.json
        ├── scripts/
        │   └── python-service.cjs        # Python service launcher
        ├── python/
        │   ├── api_server.py             # Flask face API
        │   ├── requirements.txt
        │   └── models/
        │       └── hf_model.py           # Remote face-model integration
        └── src/
            ├── app.js                   # Express entry point
            ├── config/
            │   └── db.js
            ├── models/
            │   ├── Account.js
            │   ├── Teacher.js
            │   ├── Student.js
            │   ├── Academic.js          # Terms, classes, courses, offerings and lectures
            │   ├── Attendance.js        # Legacy attendance
            │   ├── Correction.js        # Correction requests and audit schema
            │   └── Notification.js
            ├── controllers/             # Auth, profiles, academics and attendance handlers
            ├── middleware/              # Authentication, roles, validation and uploads
            ├── routes/
            │   ├── authRoutes.js
            │   ├── teacherRoutes.js
            │   ├── teacherAdminRoutes.js
            │   ├── studentRoutes.js
            │   ├── studentPortalRoutes.js
            │   ├── adminRoutes.js
            │   ├── academicRoutes.js
            │   ├── attendanceRoutes.js
            │   ├── analyticsRoutes.js
            │   ├── notificationRoutes.js
            │   ├── correctionRoutes.js
            │   └── semesterReportRoutes.js
            ├── services/
            │   ├── academicService.js
            │   ├── studentPortalService.js
            │   ├── adminPortalService.js
            │   ├── attendanceReadService.js
            │   ├── attendanceCalculation.js
            │   ├── attendanceAnalyticsService.js
            │   ├── faceRecognitionService.js
            │   ├── notificationService.js
            │   ├── notificationReconciliation.js
            │   ├── correctionService.js
            │   ├── correctionQuery.js
            │   ├── semesterReportService.js
            │   ├── semesterReportCsv.js
            │   ├── csvService.js
            │   └── jwtService.js
            └── utils/
```

## API Overview

Protected routes enforce the authenticated Account's role and record access.

| Base path | Function |
|-----------|----------|
| `/api/auth` | Login, account activation, current user and password change |
| `/api/students` | Student profiles, face registration and Student-list CSV |
| `/api/teacher` | Teacher profile and Student onboarding |
| `/api/admin` | Accounts, directories, overview and attendance browsing |
| `/api/academic` | Structures, assignments, enrolments, lectures and session attendance |
| `/api/student-portal` | Own courses, attendance and profile |
| `/api/attendance` | Attendance methods, reads and daily/date-range CSV downloads |
| `/api/analytics` | Role-scoped analytics and term minimum settings |
| `/api/notifications` | Own notifications, unread counts and read controls |
| `/api/corrections` | Correction requests, review queues and decisions |
| `/api/reports` | Semester preview, filter options and CSV export |

## License

[MIT](LICENSE)
