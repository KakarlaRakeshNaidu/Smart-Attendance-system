import React from 'react';
import { Link } from 'react-router-dom';

const Register = () => (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
        <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <h1 className="text-xl font-semibold text-white">Account creation</h1>
            <p className="mt-4 text-zinc-300">Contact your teacher or administrator for a Student account. Teacher accounts are created by an administrator.</p>
            <p className="mt-3 text-sm text-zinc-400">Use your activation link to set your password, then sign in with your assigned role.</p>
            <Link to="/login" className="btn-primary mt-6 inline-block">Back to login</Link>
        </div>
    </div>
);
export default Register;
