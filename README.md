# Smart Attendance System

A modern, AI-powered attendance management system featuring **face recognition** technology. Built with React, Node.js, and Python — run the entire project with a **single command**.

---

## Quick Start

```bash
# 1. Install all dependencies (Node.js + Python)
npm run setup

# 2. Start everything with one command
npm run dev
```

Three services start automatically:

| Service | URL | Label |
|---------|-----|-------|
| 🐍 Face Recognition API | http://localhost:5001 | PYTHON |
| 🟢 Node.js API | http://localhost:5000 | SERVER |
| ⚡ React Frontend | http://localhost:5173 | CLIENT |

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 14.0.0 | For server and client |
| Python | ≥ 3.8 | For face recognition API |
| MongoDB | Atlas or local | Connection string in `.env` |
| Webcam | — | Required for live face recognition |

---

## Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd smart-attendance
```

### 2. Install all dependencies at once
```bash
npm run setup
```
This installs Node.js packages for root, server, and client, then runs `pip install` for Python.

### 3. Configure environment variables

Edit `student-attendance-system/server/.env`:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/attendance_system
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
FACE_API_URL=http://localhost:5001/api
```

Edit `student-attendance-system/client/.env`:
```env
VITE_API_URL=http://localhost:5000/api
VITE_API_BASE_URL=http://localhost:5000
```

### 4. Run the project
```bash
npm run dev
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all 3 services (Python + Node + React) |
| `npm run setup` | Install all dependencies (Node + Python) |
| `npm run install:all` | Install Node.js dependencies only |
| `npm run install:python` | Install Python dependencies only |

---

## Project Structure

```
smart-attendance/
│
├── package.json                          ← Root orchestrator (run all commands here)
├── README.md
├── .gitignore
│
└── student-attendance-system/
    │
    ├── client/                           ── React + Vite Frontend ──────────────────
    │   ├── index.html
    │   ├── vite.config.js
    │   ├── package.json
    │   ├── .env                          ← VITE_API_URL, VITE_API_BASE_URL
    │   └── src/
    │       ├── App.jsx                   ← Routes & layout
    │       ├── index.jsx                 ← React entry point
    │       ├── index.css                 ← Global styles & design tokens
    │       │
    │       ├── components/
    │       │   ├── Auth/
    │       │   │   ├── Login.jsx         ← Teacher login form
    │       │   │   ├── Register.jsx      ← Teacher registration
    │       │   │   └── ChangePassword.jsx
    │       │   │
    │       │   ├── Dashboard/
    │       │   │   └── Dashboard.jsx     ← Stats overview
    │       │   │
    │       │   ├── Students/
    │       │   │   ├── StudentList.jsx   ← All students grid
    │       │   │   ├── AddStudent.jsx    ← Add student + face capture
    │       │   │   └── StudentCard.jsx   ← Student card + face register
    │       │   │
    │       │   ├── Attendance/
    │       │   │   ├── FaceAttendance.jsx     ← Face recognition camera
    │       │   │   ├── TakeAttendance.jsx     ← Manual attendance
    │       │   │   ├── AttendanceList.jsx     ← Today's records
    │       │   │   └── DownloadAttendance.jsx ← CSV export
    │       │   │
    │       │   ├── Profile/
    │       │   │   ├── TeacherProfile.jsx ← View profile
    │       │   │   ├── EditProfile.jsx    ← Edit name, subject, bio
    │       │   │   └── PhotoUpload.jsx    ← Upload profile photo
    │       │   │
    │       │   └── common/
    │       │       ├── Navbar.jsx         ← Navigation bar
    │       │       ├── Loader.jsx         ← Loading spinner
    │       │       └── PrivateRoute.jsx   ← Auth guard
    │       │
    │       ├── context/
    │       │   └── AuthContext.jsx        ← Auth state & JWT management
    │       │
    │       ├── services/                  ← API call functions
    │       │   ├── api.js                 ← Axios instance + interceptors
    │       │   ├── authService.js
    │       │   ├── studentService.js
    │       │   ├── attendanceService.js
    │       │   └── teacherService.js
    │       │
    │       └── utils/
    │           └── (helpers)
    │
    └── server/                           ── Node.js Backend + Python API ──────────
        ├── package.json
        ├── .env                          ← PORT, MONGODB_URI, JWT_SECRET, FACE_API_URL
        ├── .env.example
        │
        ├── uploads/                      ← Profile photos (served as static files)
        │   ├── teachers/
        │   │   └── {TeacherName}/        ← e.g. uploads/teachers/Sam/photo.jpg
        │   └── students/
        │       └── {StudentId}/          ← e.g. uploads/students/STU001/photo.jpg
        │
        ├── python/                       ── Face Recognition Service (port 5001) ──
        │   ├── api_server.py             ← Flask REST API
        │   ├── requirements.txt          ← Python dependencies
        │   └── models/
        │       └── insightface_model.py  ← InsightFace model loader
        │
        └── src/
            ├── app.js                    ← Express app setup & static serving
            │
            ├── config/
            │   └── db.js                 ← MongoDB connection
            │
            ├── models/                   ── MongoDB Schemas ──────────────────────
            │   ├── Teacher.js            ← name, email, password, subject, profilePhoto
            │   ├── Student.js            ← studentId, name, faceEmbedding, profilePhoto
            │   └── Attendance.js         ← teacherId, date, records[]
            │
            ├── controllers/              ── Route Handlers ───────────────────────
            │   ├── authController.js     ← register, login
            │   ├── teacherController.js  ← getProfile, updateProfile, uploadPhoto
            │   ├── studentController.js  ← CRUD, registerFace, updatePhoto
            │   └── attendanceController.js ← take, face, download CSV
            │
            ├── routes/                   ── API Routes ───────────────────────────
            │   ├── authRoutes.js         ← POST /api/auth/register|login
            │   ├── teacherRoutes.js      ← GET/PUT /api/teacher/profile
            │   ├── studentRoutes.js      ← CRUD /api/students
            │   └── attendanceRoutes.js   ← /api/attendance/*
            │
            ├── middleware/
            │   ├── authMiddleware.js     ← JWT verification (protect)
            │   ├── uploadMiddleware.js   ← Multer (named folder routing)
            │   └── errorHandler.js       ← Global error handler
            │
            ├── services/
            │   ├── faceRecognitionService.js ← Axios calls to Python API
            │   ├── csvService.js             ← CSV generation
            │   ├── jwtService.js             ← Token helpers
            │   └── uploadService.js          ← Legacy (unused)
            │
            └── utils/
                ├── helpers.js            ← Hash, token, file utils
                └── validators.js         ← Input validation
```

---

## Face Recognition Model

### Model: InsightFace `buffalo_l`

The system uses **InsightFace** (`buffalo_l` pack) — a state-of-the-art deep learning face analysis framework that runs entirely locally with no cloud dependency.

#### Sub-models in `buffalo_l`

| Model File | Task | Input Size |
|------------|------|-----------|
| `det_10g.onnx` | Face Detection | Dynamic (640×640 default) |
| `w600k_r50.onnx` | Face Recognition (ResNet-50) | 112×112 |

#### Embedding & Matching

| Property | Value |
|----------|-------|
| **Embedding dimension** | 512-dimensional float vector |
| **Similarity metric** | Cosine similarity |
| **Recognition threshold** | `0.5` (configurable) |
| **Batch method** | Vectorized matrix multiplication (NumPy BLAS) |
| **Detection size** | 640 × 640 px |
| **Hardware** | Auto GPU (CUDA) → fallback to CPU |

#### How Recognition Works

```
Webcam frame (base64)
        │
        ▼
┌─────────────────────┐
│  det_10g.onnx       │  ← Detect face bounding boxes
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  w600k_r50.onnx     │  ← Extract 512-dim embedding vector
└─────────┬───────────┘
          │
          ▼
  Cosine Similarity vs all registered students
  (parallelized: one matrix multiply for N students × M faces)
          │
          ▼
  Best match score > 0.5  →  Student identified ✅
  Best match score ≤ 0.5  →  Unknown face ❌
```

#### Enrollment Flow
1. Student added to MongoDB via Node.js API
2. Face image sent to Python `/api/add-student`
3. InsightFace extracts 512-dim embedding
4. Embedding saved to `Student.faceEmbedding[]` in MongoDB

#### Recognition Flow (Single Face)
1. Camera captures frame → base64 encoded
2. Node.js `POST /api/attendance/face` → Python `/api/recognize`
3. InsightFace detects & embeds the face
4. Vectorized cosine similarity against all enrolled students
5. Best match above threshold → attendance marked in MongoDB

#### Recognition Flow (Multiple Faces)
1. Full classroom photo → base64 encoded
2. Python `/api/recognize-multiple` detects all faces simultaneously
3. All face embeddings stacked into matrix `(N_faces × 512)`
4. All student embeddings stacked into matrix `(N_students × 512)`
5. Single matrix multiply gives all `N_faces × N_students` similarities at once
6. Each face matched to highest-scoring student above threshold

#### Python Dependencies

```txt
numpy          ← Vectorized embedding math
opencv-python  ← Image decode & preprocessing (cv2)
torch          ← PyTorch backend for ONNX model inference
insightface    ← buffalo_l model pack (detection + recognition)
onnxruntime    ← Runs the .onnx sub-models
flask          ← REST API server
flask-cors     ← Cross-origin support for Node.js requests
pymongo        ← MongoDB driver
python-dotenv  ← Auto-loads server/.env at startup
```

---

## Key Features

### 🎯 Face Recognition (AI-Powered)
- **InsightFace** `buffalo_l` model — same technology used in production-grade systems
- Real-time webcam capture with live preview
- Single-student attendance OR full classroom batch recognition
- Vectorized similarity for fast recognition regardless of student count

### 📋 Attendance Management
- Manual tab — checkbox-based marking for all students
- Face recognition tab — camera-based auto-marking
- Today's Attendance tab — view/review current session
- CSV Download — export by date for reporting

### 👤 User Management
- Teacher registration & JWT authentication
- Editable teacher profile (name, subject, bio, photo)
- Student profiles with face registration and named photo folders

### 📁 Profile Photo Storage
- Teacher photos → `uploads/teachers/{name}/`
- Student photos → `uploads/students/{studentId}/`
- Served as static files at `http://localhost:5000/uploads/...`

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, React Router, Axios |
| **Styling** | Vanilla CSS with custom design tokens (teal palette) |
| **Backend API** | Node.js, Express.js, JWT Auth, Multer |
| **Face Recognition** | Python 3.8+, Flask, InsightFace (`buffalo_l`), OpenCV, ONNX Runtime |
| **Database** | MongoDB Atlas with Mongoose ODM |
| **Orchestration** | `concurrently` — all 3 services via single `npm run dev` |

---

## API Reference

### Authentication (`/api/auth`)
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | `{name, email, password}` | Register a teacher |
| POST | `/api/auth/login` | `{email, password}` | Login → returns JWT |

### Teacher (`/api/teacher`) — 🔒 requires JWT
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/teacher/profile` | Get current teacher profile |
| PUT | `/api/teacher/profile` | Update name, subject, description |
| POST | `/api/teacher/profile/photo` | Upload profile photo (multipart) |
| PUT | `/api/teacher/change-password` | Change password |

### Students (`/api/students`) — 🔒 requires JWT
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/students` | Get all students |
| POST | `/api/students` | Add student (+ optional face) |
| GET | `/api/students/:id` | Get single student |
| PUT | `/api/students/:id` | Update student details |
| DELETE | `/api/students/:id` | Delete student |
| POST | `/api/students/:id/register-face` | Register/update face embedding |
| PUT | `/api/students/:id/profile-photo` | Update profile photo |
| GET | `/api/students/download/csv` | Export student list CSV |

### Attendance (`/api/attendance`) — 🔒 requires JWT
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/attendance` | Manual attendance (records array) |
| GET | `/api/attendance` | Get all attendance records |
| GET | `/api/attendance/today` | Get today's attendance |
| GET | `/api/attendance/date/:date` | Get attendance by date |
| POST | `/api/attendance/face` | Face recognition (single face) |
| POST | `/api/attendance/face-multiple` | Face recognition (classroom) |
| GET | `/api/attendance/face-status` | Check face API connectivity |
| DELETE | `/api/attendance/today` | Reset today's attendance |
| GET | `/api/attendance/download/today` | Download today CSV |
| GET | `/api/attendance/download/:date` | Download date CSV |

### Face Recognition API (Python, port 5001)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Quick status check (no DB ping) |
| GET | `/api/health/full` | Full check incl. DB + face count |
| POST | `/api/add-student` | Extract & save face embedding |
| POST | `/api/remove-student` | Clear face embedding |
| POST | `/api/recognize` | Recognize single face |
| POST | `/api/recognize-multiple` | Recognize all faces in image |
| POST | `/api/get-embedding` | Extract embedding (no save) |
| GET | `/api/registered-count` | Count students with faces |

---

## Environment Variables

### Server (`server/.env`)
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Node.js server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `localhost:27017` |
| `JWT_SECRET` | JWT signing secret | — |
| `JWT_EXPIRES_IN` | JWT token lifespan | `7d` |
| `FACE_API_URL` | Python face API base URL | `http://localhost:5001/api` |

### Client (`client/.env`)
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Node.js API base URL | `http://localhost:5000/api` |
| `VITE_API_BASE_URL` | Node.js origin (for photo URLs) | `http://localhost:5000` |

---

## License

MIT License