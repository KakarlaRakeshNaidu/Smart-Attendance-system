import React from 'react';

export default class ErrorBoundary extends React.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        if (this.state.failed) return (
            <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-zinc-100">
                <h1 className="text-xl font-semibold">This page could not load</h1>
                <p>Please return home and try again.</p>
                <a className="btn-primary" href="/">Return home</a>
            </div>
        );
        return this.props.children;
    }
}
