import { FormField as Field, Dialog as Modal } from '../common/Interface';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { Plus, Pencil, Archive, X, Loader2 } from 'lucide-react';

const emptyForm = {
    name: '',
    code: '',
    department: '',
    program: '',
    year: '',
    semester: '',
    academicSession: ''
};

const ClassManagement = () => {
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    const fetchClasses = async () => {
        setLoading(true);
        try {
            const r = await api.get('/admin/classes');
            if (r.data.success) setClasses(r.data.classes);
        } catch {
            setErr('Failed to load');
        }
        setLoading(false);
    };
    useEffect(() => {
        fetchClasses();
    }, []);

    const setF = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
    const openCreate = () => {
        setForm(emptyForm);
        setModal('create');
        setErr('');
        setMsg('');
    };
    const openEdit = (c) => {
        setSelected(c);
        setForm({
            name: c.name,
            code: c.code,
            department: c.department || '',
            program: c.program || '',
            year: c.year || '',
            semester: c.semester || '',
            academicSession: c.academicSession || ''
        });
        setModal('edit');
        setErr('');
        setMsg('');
    };
    const close = () => {
        setModal(null);
        setSelected(null);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setErr('');
        try {
            const r = await api.post('/admin/classes', form);
            if (r.data.success) {
                setMsg('Class created');
                fetchClasses();
                setTimeout(close, 1200);
            } else setErr(r.data.message);
        } catch (ex) {
            setErr(ex.response?.data?.message || 'Error');
        }
        setSubmitting(false);
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setErr('');
        try {
            const classId = selected.id || selected._id;
            const r = await api.put(`/admin/classes/${classId}`, form);
            if (r.data.success) {
                setMsg('Updated!');
                fetchClasses();
                setTimeout(close, 1200);
            } else setErr(r.data.message);
        } catch (ex) {
            setErr(ex.response?.data?.message || 'Error');
        }
        setSubmitting(false);
    };

    const handleArchive = async (c) => {
        if (!window.confirm(`Archive class "${c.name}"?`)) return;
        try {
            const classId = c.id || c._id;
            await api.put(`/admin/classes/${classId}`, { status: 'archived' });
            fetchClasses();
        } catch {
            setErr('Archive failed');
        }
    };

    const renderClassForm = ({ onSubmit, btnLabel }) => (
        <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <Field
                    label="Class Name"
                    value={form.name}
                    onChange={setF('name')}
                    required
                    placeholder="CS-A 2024"
                />
                <Field
                    label="Code (unique)"
                    value={form.code}
                    onChange={setF('code')}
                    required
                    placeholder="CS-A-24"
                />
            </div>
            <Field
                label="Department"
                value={form.department}
                onChange={setF('department')}
                placeholder="Computer Science"
            />
            <Field label="Program" value={form.program} onChange={setF('program')} placeholder="B.Tech" />
            <div className="grid grid-cols-2 gap-3">
                <Field label="Year" value={form.year} onChange={setF('year')} placeholder="2nd Year" />
                <Field
                    label="Semester"
                    value={form.semester}
                    onChange={setF('semester')}
                    placeholder="4th Semester"
                />
            </div>
            <Field
                label="Academic Session"
                value={form.academicSession}
                onChange={setF('academicSession')}
                placeholder="2024-25"
            />
            {err && <p className="text-sm text-red-400">{err}</p>}
            {msg && <p className="text-sm text-emerald-400">{msg}</p>}
            <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-white py-2 text-sm font-medium text-black disabled:opacity-50"
            >
                {submitting ? 'Saving…' : btnLabel}
            </button>
        </form>
    );

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-title font-medium text-white">Classes & batches</h1>
                    <p className="text-sm text-zinc-400">{classes.length} class(es)</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100"
                >
                    <Plus className="h-4 w-4" /> New class
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {loading ? (
                    <div className="col-span-full flex justify-center py-12">
                        <Loader2 className="h-7 w-7 animate-spin text-zinc-400" />
                    </div>
                ) : classes.length === 0 ? (
                    <p className="col-span-full py-8 text-center text-zinc-500">
                        No classes yet. Create one to get started.
                    </p>
                ) : (
                    classes.map((c) => (
                        <div
                            key={c.id || c._id}
                            className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="font-medium text-white">{c.name}</p>
                                    <p className="text-xs font-mono text-zinc-400">{c.code}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        aria-label="Edit"
                                        onClick={() => openEdit(c)}
                                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                        aria-label="Archive class"
                                        onClick={() => handleArchive(c)}
                                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-red-400"
                                    >
                                        <Archive className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {c.department && (
                                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                        {c.department}
                                    </span>
                                )}
                                {c.program && (
                                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                        {c.program}
                                    </span>
                                )}
                                {c.year && (
                                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                        {c.year}
                                    </span>
                                )}
                                {c.semester && (
                                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                        {c.semester}
                                    </span>
                                )}
                                {c.academicSession && (
                                    <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                                        {c.academicSession}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {modal === 'create' && (
                <Modal title="New class" onClose={close}>
                    {renderClassForm({ onSubmit: handleCreate, btnLabel: 'Create Class' })}
                </Modal>
            )}
            {modal === 'edit' && (
                <Modal title="Edit class" onClose={close}>
                    {renderClassForm({ onSubmit: handleEdit, btnLabel: 'Save Changes' })}
                </Modal>
            )}
        </div>
    );
};

export default ClassManagement;
