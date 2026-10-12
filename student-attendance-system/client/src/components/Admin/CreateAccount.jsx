import React, { useState, useEffect } from "react";
import { X, Users, BookOpen, ShieldCheck, Mail, User, BookMarked, ChevronDown, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import api from "../../services/api";
import toast from "react-hot-toast";

/**
 * CreateAccount modal
 *
 * Props:
 *   onClose        - fn() to close the modal
 *   onSuccess      - fn(accountData) called after successful creation
 *   initiatorRole  - "admin" | "teacher"
 *                    admin: may choose Student or Teacher
 *                    teacher: Student is fixed, cannot be changed
 */

const ROLES = {
    student: {
        key: "student",
        label: "Student account",
        description: "Views personal attendance records.",
        icon: Users,
        color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
    },
    teacher: {
        key: "teacher",
        label: "Teacher account",
        description: "Manages students and marks attendance.",
        icon: BookOpen,
        color: "border-blue-500/40 bg-blue-500/10 text-blue-400"
    }
};

const CreateAccount = ({ onClose, onSuccess, initiatorRole = "admin" }) => {
    const isAdmin   = initiatorRole === "admin";
    const [selectedRole, setSelectedRole] = useState(isAdmin ? "student" : "student");
    // Teachers always create student accounts ? locked
    const lockedRole = isAdmin ? null : "student";

    const [studentList, setStudentList]     = useState([]);
    const [studentSearch, setStudentSearch] = useState("");
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [showDropdown, setShowDropdown]   = useState(false);
    const [studentsLoading, setStudentsLoading] = useState(false);

    const [teacherForm, setTeacherForm] = useState({ name: "", email: "", subject: "" });

    const [loading, setLoading]   = useState(false);
    const [result, setResult]     = useState(null);  // { role, email, name, activationToken }

    const activeRole = lockedRole || selectedRole;
    const roleMeta   = ROLES[activeRole];
    const RoleIcon   = roleMeta.icon;

    // Fetch students when student role active
    useEffect(() => {
        if (activeRole !== "student") return;
        setStudentsLoading(true);
        api.get("/students")
            .then(r => {
                if (r.data.success) setStudentList(r.data.students || []);
            })
            .catch(() => toast.error("Could not load student list"))
            .finally(() => setStudentsLoading(false));
    }, [activeRole]);

    const filteredStudents = studentList.filter(s => {
        const q = studentSearch.toLowerCase();
        return (
            s.name?.toLowerCase().includes(q) ||
            s.studentId?.toLowerCase().includes(q) ||
            s.email?.toLowerCase().includes(q)
        );
    });

    const handleCreate = async () => {
        setLoading(true);
        try {
            let res;
            if (activeRole === "student") {
                if (!selectedStudent) {
                    toast.error("Select a student record first");
                    setLoading(false);
                    return;
                }
                const endpoint = isAdmin ? "/admin/onboard-student" : "/teacher/onboard-student";
                res = await api.post(endpoint, { studentProfileId: selectedStudent._id });
            } else {
                // Teacher ? admin only
                if (!teacherForm.name.trim() || !teacherForm.email.trim()) {
                    toast.error("Name and email are required");
                    setLoading(false);
                    return;
                }
                res = await api.post("/admin/onboard-teacher", {
                    name: teacherForm.name.trim(),
                    email: teacherForm.email.trim(),
                    subject: teacherForm.subject.trim()
                });
            }

            if (res.data.success) {
                const activationToken = res.data._devOnly_activationToken || null;
                setResult({
                    role: res.data.account.role,
                    email: res.data.account?.email || (activeRole === "student" ? selectedStudent?.email : teacherForm.email),
                    name: res.data.account?.name || (activeRole === "student" ? selectedStudent?.name : teacherForm.name),
                    activationToken
                });
                if (onSuccess) onSuccess(res.data.account);
            } else {
                toast.error(res.data.message || "Creation failed");
            }
        } catch (e) {
            toast.error(e.response?.data?.message || "Creation failed");
        } finally {
            setLoading(false);
        }
    };

    const copyToken = () => {
        if (result?.activationToken) {
            navigator.clipboard.writeText(
                window.location.origin + "/activate?token=" + result.activationToken
            );
            toast.success("Activation link copied");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                    <h2 className="text-lg font-semibold text-white">Create account</h2>
                    <button onClick={onClose} id="create-account-close"
                        className="text-zinc-500 hover:text-zinc-200 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {!result && (
                        <>
                            {/* ?? Role selection ??????????????????????????????? */}
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                                    Account role
                                </label>

                                {/* Teacher: fixed badge, not editable */}
                                {!isAdmin && (
                                    <div className={`flex items-center gap-3 rounded-xl border p-4 ${roleMeta.color}`}>
                                        <RoleIcon className="h-5 w-5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-semibold">Student account</p>
                                            <p className="text-xs opacity-80">Teachers create Student accounts only.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Admin: clickable role cards */}
                                {isAdmin && (
                                    <div className="grid grid-cols-2 gap-3">
                                        {Object.values(ROLES).map(r => {
                                            const Icon = r.icon;
                                            const selected = selectedRole === r.key;
                                            return (
                                                <button
                                                    key={r.key}
                                                    id={`role-select-${r.key}`}
                                                    type="button"
                                                    onClick={() => { setSelectedRole(r.key); setSelectedStudent(null); setStudentSearch(""); setTeacherForm({ name: "", email: "", subject: "" }); }}
                                                    disabled={loading}
                                                    className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                                                        selected
                                                            ? r.color
                                                            : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
                                                    }`}
                                                >
                                                    <Icon className="h-5 w-5" />
                                                    <div>
                                                        <p className="text-sm font-semibold text-inherit">
                                                            {r.key.charAt(0).toUpperCase() + r.key.slice(1)}
                                                        </p>
                                                        <p className="text-xs opacity-70 mt-0.5 leading-snug">{r.description}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Admin-only: administrator note */}
                                {isAdmin && (
                                    <div className="mt-3 flex items-start gap-2 text-xs text-zinc-500">
                                        <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-purple-500/60" />
                                        <span>
                                            Administrator accounts are created through controlled administrator setup (CLI tool).
                                            They cannot be created here.
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* ?? Student fields ??????????????????????????????? */}
                            {activeRole === "student" && (
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                                        Link to student record
                                    </label>
                                    {studentsLoading ? (
                                        <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
                                            <div className="h-4 w-4 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                                            Loading students?
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <div
                                                id="student-picker"
                                                className="input-field cursor-pointer flex items-center justify-between"
                                                onClick={() => setShowDropdown(d => !d)}
                                            >
                                                {selectedStudent ? (
                                                    <div>
                                                        <span className="text-zinc-100 text-sm">{selectedStudent.name}</span>
                                                        <span className="text-zinc-500 text-xs ml-2">{selectedStudent.studentId} ? {selectedStudent.email || "no email"}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-zinc-500 text-sm">Search student by name or ID?</span>
                                                )}
                                                <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                                            </div>

                                            {showDropdown && (
                                                <div className="absolute z-10 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                                                    <div className="p-2 border-b border-zinc-800">
                                                        <input
                                                            autoFocus
                                                            id="student-search"
                                                            type="text"
                                                            value={studentSearch}
                                                            onChange={e => setStudentSearch(e.target.value)}
                                                            placeholder="Type name, ID or email?"
                                                            className="w-full bg-zinc-800 text-sm text-zinc-100 rounded-lg px-3 py-2 outline-none border border-zinc-700 focus:border-zinc-500"
                                                        />
                                                    </div>
                                                    <div className="max-h-48 overflow-y-auto">
                                                        {filteredStudents.length === 0 ? (
                                                            <p className="text-zinc-500 text-sm text-center py-4">No students found</p>
                                                        ) : filteredStudents.map(s => (
                                                            <button
                                                                key={s._id}
                                                                type="button"
                                                                onClick={() => { setSelectedStudent(s); setShowDropdown(false); setStudentSearch(""); }}
                                                                className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0"
                                                            >
                                                                <span className="text-zinc-200">{s.name}</span>
                                                                <span className="text-zinc-500 ml-2 text-xs">{s.studentId}</span>
                                                                {s.email && <span className="text-zinc-600 ml-1 text-xs">? {s.email}</span>}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {selectedStudent && !selectedStudent.email && (
                                        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300">
                                            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                            This student has no email address. Add one to the student record before creating an account.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ?? Teacher fields (admin only) ??????????????????? */}
                            {activeRole === "teacher" && isAdmin && (
                                <div className="space-y-4">
                                    <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                        Teacher details
                                    </label>
                                    <div>
                                        <label className="block text-sm text-zinc-300 mb-1.5">Full name <span className="text-red-400">*</span></label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                            <input
                                                id="teacher-name"
                                                type="text"
                                                value={teacherForm.name}
                                                onChange={e => setTeacherForm({ ...teacherForm, name: e.target.value })}
                                                placeholder="e.g. Dr. Ravi Kumar"
                                                className="input-field pl-10"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-300 mb-1.5">Email address <span className="text-red-400">*</span></label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                            <input
                                                id="teacher-email"
                                                type="email"
                                                value={teacherForm.email}
                                                onChange={e => setTeacherForm({ ...teacherForm, email: e.target.value })}
                                                placeholder="teacher@college.edu"
                                                className="input-field pl-10"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-300 mb-1.5">Subject <span className="text-zinc-500">(optional)</span></label>
                                        <div className="relative">
                                            <BookMarked className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                            <input
                                                id="teacher-subject"
                                                type="text"
                                                value={teacherForm.subject}
                                                onChange={e => setTeacherForm({ ...teacherForm, subject: e.target.value })}
                                                placeholder="e.g. Computer Science"
                                                className="input-field pl-10"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ?? Role confirmation preview ????????????????????? */}
                            <div className="flex items-center gap-2 rounded-xl bg-zinc-800/60 border border-zinc-700/50 px-4 py-3 text-sm">
                                <span className="text-zinc-400">Creating:</span>
                                <span className={`font-semibold ${
                                    activeRole === "student" ? "text-emerald-400"
                                    : activeRole === "teacher" ? "text-blue-400"
                                    : "text-purple-400"
                                }`}>
                                    {roleMeta.label}
                                </span>
                            </div>
                        </>
                    )}

                    {/* ?? Result ????????????????????????????????????????? */}
                    {result && (
                        <div className="space-y-4">
                            <div className="flex justify-center">
                                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                            </div>
                            <div className="text-center">
                                <p className="text-white font-semibold text-lg">
                                    {result.role.charAt(0).toUpperCase() + result.role.slice(1)} account created
                                </p>
                                <p className="text-zinc-400 text-sm mt-1">
                                    An account has been set up for <span className="text-zinc-200">{result.name}</span>
                                </p>
                            </div>

                            <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Name</span>
                                    <span className="text-zinc-200">{result.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Email</span>
                                    <span className="text-zinc-200">{result.email}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Role</span>
                                    <span className={`font-medium ${
                                        result.role === "student" ? "text-emerald-400"
                                        : result.role === "teacher" ? "text-blue-400"
                                        : "text-purple-400"
                                    }`}>
                                        {result.role.charAt(0).toUpperCase() + result.role.slice(1)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Status</span>
                                    <span className="text-amber-400">Pending activation</span>
                                </div>
                            </div>

                            {result.activationToken ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-zinc-400 font-medium">Activation link (share with account holder):</p>
                                    <div className="flex gap-2">
                                        <code className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-emerald-300 truncate">
                                            Activation link ready to copy
                                        </code>
                                        <button
                                            id="copy-activation-link"
                                            onClick={copyToken}
                                            className="flex items-center gap-1 px-3 py-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors flex-shrink-0"
                                        >
                                            <Copy className="h-3 w-3" /> Copy
                                        </button>
                                    </div>
                                    <p className="text-xs text-zinc-600">DEV mode: token visible because ENABLE_DEV_ACTIVATION=true. Remove in production.</p>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                                    Activation token not returned (production mode). Configure email delivery or set ENABLE_DEV_ACTIVATION=true to obtain the link.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-zinc-800">
                    {!result ? (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 btn-secondary py-2.5 text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                id="create-account-submit"
                                type="button"
                                onClick={handleCreate}
                                disabled={loading || (activeRole === "student" && !selectedStudent)}
                                className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading
                                    ? <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    : <>Create {roleMeta.label}</>
                                }
                            </button>
                        </>
                    ) : (
                        <button
                            id="create-account-done"
                            type="button"
                            onClick={onClose}
                            className="w-full btn-primary py-2.5 text-sm"
                        >
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreateAccount;
