import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    GraduationCap,
    Menu,
    X,
    ArrowRight,
    Check,
    Minus,
    Clock,
    Scan,
    ClipboardCheck,
    BarChart3,
    BookOpen,
    ShieldCheck,
    Camera,
    FileText,
    Users,
    ChevronRight
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { useAuth } from '../../context/authContextState';
const navigation = [
    ['overview', 'Overview'],
    ['features', 'Features'],
    ['howitworks', 'How it works'],
    ['technology', 'Technology'],
    ['security', 'Security']
];
const chart = [
    { day: 'Mon', attended: 40 },
    { day: 'Tue', attended: 43 },
    { day: 'Wed', attended: 38 },
    { day: 'Thu', attended: 45 },
    { day: 'Fri', attended: 43 }
];
const roster = [
    ['CSE-001', 'Aditya Sharma', 'Present'],
    ['CSE-002', 'Priya Mehta', 'Present'],
    ['CSE-003', 'Rahul Verma', 'Absent'],
    ['CSE-004', 'Sneha Patel', 'Present'],
    ['CSE-005', 'Karan Singh', 'Late']
];
function ProductPreview() {
    return (
        <div className="register-preview">
            <div className="preview-bar">
                <span className="flex items-center gap-2">
                    <ClipboardCheck size={16} />
                    Attendance register
                </span>
                <span className="eyebrow">Illustrative data</span>
            </div>
            <div className="preview-content">
                <div className="flex items-start justify-between gap-4">
                    <div className="register-context">
                        <p className="eyebrow">CSE · Year 3 · Section A</p>
                        <h2 className="mt-1">Database fundamentals</h2>
                        <p className="text-xs text-zinc-400 mt-2">Morning lecture · Course roster</p>
                    </div>
                    <span className="text-xs text-emerald-400">Finalised</span>
                </div>
                <div className="preview-stats">
                    {[
                        ['Students', '48'],
                        ['Present', '41'],
                        ['Late', '2'],
                        ['Absent', '5']
                    ].map(([label, value]) => (
                        <div key={label}>
                            <p className="text-xs text-zinc-400">{label}</p>
                            <p className="text-2xl font-medium tabular-nums mt-1">{value}</p>
                        </div>
                    ))}
                </div>
                <div className="preview-chart">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm">Weekly attendance</p>
                        <p className="font-mono text-xs text-primary">43 of 48 attended</p>
                    </div>
                    <div className="h-36 sm:h-44">
                        <ResponsiveContainer
                            initialDimension={{ width: 640, height: 280 }}
                            minWidth={0}
                            width="100%"
                            height="100%"
                        >
                            <AreaChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -30 }}>
                                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                                <YAxis
                                    domain={[0, 48]}
                                    ticks={[0, 24, 48]}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--chart-tooltip-bg)',
                                        border: '1px solid var(--chart-tooltip-border)',
                                        borderRadius: 8,
                                        color: 'var(--chart-tooltip-text)',
                                        fontSize: 12
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="attended"
                                    name="Present or late"
                                    stroke="var(--chart)"
                                    fill="var(--chart)"
                                    strokeWidth={2}
                                    fillOpacity={0.08}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="preview-roster">
                    {roster.map(([roll, name, status]) => (
                        <div className="preview-student" key={roll}>
                            <span className="font-mono text-xs text-zinc-400">{roll}</span>
                            <span className="text-sm truncate">{name}</span>
                            <span className={'preview-status ' + status.toLowerCase()}>
                                {status === 'Present' ? (
                                    <Check size={14} />
                                ) : status === 'Late' ? (
                                    <Clock size={14} />
                                ) : (
                                    <Minus size={14} />
                                )}
                                <span>{status}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
function SectionHeading({ label, title, children }) {
    return (
        <header className="landing-section-heading">
            <p className="eyebrow">{label}</p>
            <h2>{title}</h2>
            {children && <p>{children}</p>}
        </header>
    );
}
export default function LandingPage() {
    const { isAuthenticated, role } = useAuth(),
        [open, setOpen] = useState(false),
        drawer = useRef(null);
    const home =
        role === 'admin' ? '/admin/dashboard' : role === 'student' ? '/student/dashboard' : '/dashboard';
    const destination = isAuthenticated ? home : '/login';
    const scroll = (id) => {
        setOpen(false);
        document.getElementById(id)?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth'
        });
    };
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement,
            overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        drawer.current?.querySelector('button')?.focus();
        const key = (e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Tab') {
                const items = [...drawer.current.querySelectorAll('button,a')],
                    first = items[0],
                    last = items.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', key);
        return () => {
            document.body.style.overflow = overflow;
            document.removeEventListener('keydown', key);
            previous?.focus();
        };
    }, [open]);
    return (
        <div className="landing-page">
            <header className="landing-nav">
                <Link to="/" className="landing-brand" aria-label="Smart Attendance System home">
                    <GraduationCap size={24} />
                    <span>
                        Smart Attendance
                        <span className="hidden xl:inline text-zinc-400 font-normal"> System</span>
                    </span>
                </Link>
                <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-6">
                    {navigation.map(([id, label]) => (
                        <button key={id} onClick={() => scroll(id)}>
                            {label}
                        </button>
                    ))}
                </nav>
                <div className="flex items-center gap-4">
                    <Link to={destination} className="landing-login">
                        {isAuthenticated ? 'Workspace' : 'Sign in'}
                        <ArrowRight size={16} />
                    </Link>
                    <button
                        className="icon-button lg:hidden"
                        onClick={() => setOpen(true)}
                        aria-label="Open navigation menu"
                        aria-expanded={open}
                    >
                        <Menu size={20} />
                    </button>
                </div>
            </header>
            {open && (
                <div className="fixed inset-0 z-50">
                    <button
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setOpen(false)}
                        aria-label="Close navigation overlay"
                    />
                    <aside
                        ref={drawer}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Site navigation"
                        className="landing-drawer"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-base font-medium">Smart Attendance</span>
                            <button
                                className="icon-button"
                                onClick={() => setOpen(false)}
                                aria-label="Close navigation menu"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <nav className="flex flex-col gap-2 mt-8">
                            {navigation.map(([id, label]) => (
                                <button
                                    key={id}
                                    className="sidebar-link justify-between"
                                    onClick={() => scroll(id)}
                                >
                                    {label}
                                    <ChevronRight size={16} />
                                </button>
                            ))}
                        </nav>
                        <div className="mt-auto border-t border-zinc-800 pt-6">
                            <p className="text-sm text-zinc-400 mb-4">
                                Your campus account connects you to the right workspace
                            </p>
                            <Link to={destination} className="btn-primary w-full">
                                {isAuthenticated ? 'Open workspace' : 'Sign in to your account'}
                                <ArrowRight size={16} />
                            </Link>
                        </div>
                    </aside>
                </div>
            )}
            <main>
                <section id="hero" className="landing-hero">
                    <div className="hero-copy">
                        <p className="eyebrow register-context">The classroom, on record</p>
                        <h1>
                            Every lecture.
                            <br />
                            Every student.
                            <br />
                            <span className="text-primary">Accounted for.</span>
                        </h1>
                        <p className="hero-description">
                            Record attendance, review the roster, and keep each class in view. One place for
                            your students, teaching staff, and campus administration.
                        </p>
                        <div className="flex flex-wrap gap-3 mt-8">
                            <Link id="hero-cta-login" to={destination} className="btn-primary">
                                {isAuthenticated ? 'Open your workspace' : 'Sign in to your campus'}
                                <ArrowRight size={16} />
                            </Link>
                            <button onClick={() => scroll('features')} className="btn-secondary">
                                Explore the system
                            </button>
                        </div>
                        <p className="hero-footnote">
                            Face recognition, photo upload, and manual marking
                            <br />
                            Access is managed by your institution
                        </p>
                    </div>
                    <div className="hero-product">
                        <ProductPreview />
                    </div>
                </section>
                <section id="overview" className="landing-overview">
                    {[
                        ['Three workspaces', 'Students, teachers, administrators'],
                        ['One lecture record', 'Roster, marks, corrections, reports'],
                        ['Your attendance minimum', 'Configured for each academic term']
                    ].map(([title, description]) => (
                        <div key={title}>
                            <h2>{title}</h2>
                            <p>{description}</p>
                        </div>
                    ))}
                </section>
                <section id="features" className="landing-section">
                    <SectionHeading
                        label="The working day"
                        title="From the first roll call to the semester report"
                    >
                        The same attendance record connects the classroom to the people who need it
                    </SectionHeading>
                    <div className="feature-grid">
                        {[
                            {
                                icon: Scan,
                                title: 'Recognise the class',
                                text: 'Use live video or classroom photos to match faces against the authorised roster. Switch to manual marking whenever you need.',
                                items: [
                                    'Live camera, single or multiple faces',
                                    'Classroom photo uploads',
                                    'Manual present, late, or absent marks'
                                ]
                            },
                            {
                                icon: ClipboardCheck,
                                title: 'Keep a reliable register',
                                text: 'Review marks before finalising each lecture. Keep a record of changes and export attendance for the dates you need.',
                                items: [
                                    'Separate sessions for each lecture',
                                    'Correction requests and review history',
                                    'Daily and date-range CSV exports'
                                ]
                            },
                            {
                                icon: BarChart3,
                                title: 'See the academic picture',
                                text: 'Follow attendance by course and term, review monthly trends, and understand where attendance needs attention.',
                                items: [
                                    'Course and semester summaries',
                                    'Configurable attendance minimums',
                                    'Notifications and recovery guidance'
                                ]
                            }
                        ].map((item) => (
                            <article className="feature-item" key={item.title}>
                                <item.icon size={20} className="text-zinc-400" />
                                <h3>{item.title}</h3>
                                <p>{item.text}</p>
                                <ul>
                                    {item.items.map((label) => (
                                        <li key={label}>
                                            <Check size={14} />
                                            {label}
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))}
                    </div>
                    <div className="role-grid">
                        {[
                            [
                                'Administrator',
                                'Manage the institution',
                                [
                                    'Student and teacher accounts',
                                    'Academic batches and access',
                                    'Institution-wide attendance and analytics',
                                    'Administrative audit logs'
                                ]
                            ],
                            [
                                'Teacher',
                                'Run the classroom',
                                [
                                    'Assigned classes and student rosters',
                                    'Face, photo, and manual attendance',
                                    'Lecture history and CSV reports',
                                    'Correction review'
                                ]
                            ],
                            [
                                'Student',
                                'Understand your attendance',
                                [
                                    'Personal course attendance',
                                    'Subject and semester summaries',
                                    'Absence history and attendance targets',
                                    'Correction requests'
                                ]
                            ]
                        ].map(([role, title, items]) => (
                            <article className="role-card" key={role}>
                                <p className="eyebrow">{role} workspace</p>
                                <h3>{title}</h3>
                                <ul>
                                    {items.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </article>
                        ))}
                    </div>
                </section>
                <section id="howitworks" className="landing-section landing-process">
                    <SectionHeading
                        label="In practice"
                        title="A familiar classroom routine, with less administration"
                    />
                    <ol className="process-list">
                        {[
                            [
                                'Enrol the students',
                                'Add academic profiles, course enrolments, and face registrations.'
                            ],
                            ['Capture the class', 'Start the camera or upload a classroom photo.'],
                            [
                                'Match the roster',
                                'Compare face embeddings only within the authorised class or batch.'
                            ],
                            [
                                'Review and finalise',
                                'Complete the marks and finalise the session when attendance is ready.'
                            ],
                            [
                                'Read the result',
                                'Students review their attendance; staff follow the class and term.'
                            ]
                        ].map(([title, text], i) => (
                            <li key={title}>
                                <span className="process-number">0{i + 1}</span>
                                <div>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
                <section id="technology" className="landing-section">
                    <SectionHeading
                        label="Behind the register"
                        title="Recognition that starts with the right roster"
                    >
                        Face recognition supports the attendance process. The teacher stays in control of the
                        final record.
                    </SectionHeading>
                    <div className="technology-grid">
                        {[
                            [
                                'InsightFace buffalo_l',
                                'Face detection and recognition use the configured remote InsightFace model.'
                            ],
                            [
                                'Detection and alignment',
                                'RetinaFace / SCRFD detection and facial landmarks prepare each face for recognition.'
                            ],
                            [
                                '512-dimensional embeddings',
                                'Each registered face is represented by a numeric vector, matched with cosine similarity.'
                            ],
                            [
                                'A separate face service',
                                'Python and Flask connect to the model; Express checks roles and rosters before saving to MongoDB.'
                            ]
                        ].map(([title, text]) => (
                            <article key={title}>
                                <h3>{title}</h3>
                                <p>{text}</p>
                            </article>
                        ))}
                    </div>
                    <div className="technology-stack">
                        <p className="eyebrow">Application stack</p>
                        <p>
                            React 18 · Vite · Tailwind CSS · Node.js · Express · MongoDB · Mongoose · Python ·
                            Flask · InsightFace · ONNX Runtime · JWT · Recharts · Lucide · React Router ·
                            Docker · Axios
                        </p>
                    </div>
                </section>
                <section id="security" className="landing-section">
                    <SectionHeading
                        label="Access and accountability"
                        title="The right records, for the right people"
                    />
                    <div className="architecture-strip">
                        {[
                            ['01', 'Your workspace', 'Student, teacher, or administrator'],
                            ['02', 'Express API', 'Authenticated, role-scoped requests'],
                            ['03', 'MongoDB register', 'Accounts, rosters, attendance, audit history'],
                            ['04', 'Face service', 'Authorised candidates and embedding matches']
                        ].map(([n, title, detail]) => (
                            <div key={n}>
                                <span className="eyebrow">{n}</span>
                                <h3>{title}</h3>
                                <p>{detail}</p>
                            </div>
                        ))}
                    </div>
                    <div className="security-grid">
                        {[
                            [
                                'Authenticated access',
                                'Protected routes verify the account token before processing a request.'
                            ],
                            [
                                'Role and roster boundaries',
                                'Students access their own records. Teachers work within their assigned classes and batches.'
                            ],
                            [
                                'Recorded changes',
                                'Attendance corrections preserve marking details and append an audit record.'
                            ],
                            [
                                'Institution-managed accounts',
                                'Public self-registration is disabled. Administration provisions campus access.'
                            ]
                        ].map(([title, text]) => (
                            <article key={title}>
                                <ShieldCheck size={18} className="text-zinc-400" />
                                <div>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
                <section className="landing-cta">
                    <div>
                        <p className="eyebrow">Smart Attendance System</p>
                        <h2>The next class starts here</h2>
                        <p>Use your institutional account to open your workspace</p>
                    </div>
                    <Link id="cta-login-portal" to={destination} className="btn-primary">
                        {isAuthenticated ? 'Open workspace' : 'Sign in'}
                        <ArrowRight size={16} />
                    </Link>
                </section>
            </main>
            <footer className="landing-footer">
                <div>
                    <Link to="/" className="landing-brand">
                        <GraduationCap size={20} />
                        Smart Attendance System
                    </Link>
                    <p>Classroom attendance, from roll call to report</p>
                </div>
                <nav aria-label="Footer navigation">
                    {navigation.map(([id, label]) => (
                        <button key={id} onClick={() => scroll(id)}>
                            {label}
                        </button>
                    ))}
                    <Link to={destination}>Campus access</Link>
                </nav>
                <p className="text-xs text-zinc-400">
                    An academic project · React, Node.js, Python, and MongoDB
                </p>
            </footer>
        </div>
    );
}
