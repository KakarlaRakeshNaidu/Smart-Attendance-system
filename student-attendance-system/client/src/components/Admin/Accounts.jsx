import React, { useState } from 'react';
import { AccountTable } from './AdminPortalPages';
import CreateAccount from './CreateAccount';
export default function Accounts() {
    const [creating, setCreating] = useState(false),
        [revision, setRevision] = useState(0);
    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-title">Accounts & activation</h1>
                    <p className="text-subtext">
                        Manage login access and issue account activation invitations.
                    </p>
                </div>
                <button className="btn-primary" onClick={() => setCreating(true)}>
                    Create account
                </button>
            </div>
            <AccountTable refresh={revision} onChanged={() => setRevision((v) => v + 1)} />
            {creating && (
                <CreateAccount
                    initiatorRole="admin"
                    onClose={() => setCreating(false)}
                    onSuccess={() => setRevision((v) => v + 1)}
                />
            )}
        </div>
    );
}
