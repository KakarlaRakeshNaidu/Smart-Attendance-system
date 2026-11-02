import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
export function PageHeader({ title, description, eyebrow, actions, children }) {
    return (
        <header className="page-heading">
            <div>
                {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
                <h1>{title}</h1>
                {description && <p>{description}</p>}
                {children}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
    );
}
export function FormField({
    label,
    type = 'text',
    value,
    onChange,
    placeholder,
    required,
    disabled,
    hint,
    ...props
}) {
    const id = useId();
    return (
        <div className="form-field">
            <label htmlFor={id}>
                {typeof label === 'string'
                    ? label
                          .split(' ')
                          .map((word, index) =>
                              index && !/^[A-Z0-9/]+$/.test(word) ? word.toLowerCase() : word
                          )
                          .join(' ')
                    : label}
                {required && (
                    <span className="ml-1 text-zinc-500" aria-hidden="true">
                        *
                    </span>
                )}
            </label>
            <input
                {...props}
                id={id}
                type={type}
                value={value ?? ''}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                className="input-field"
                aria-describedby={hint ? id + '-hint' : undefined}
            />
            {hint && (
                <p id={id + '-hint'} className="field-hint">
                    {hint}
                </p>
            )}
        </div>
    );
}
export function Dialog({ title, onClose, children, maxWidth }) {
    const id = useId(),
        panel = useRef(null),
        close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const previous = document.activeElement,
            overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const node = panel.current;
        const selector =
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
        (node.querySelector(selector) || node).focus();
        const key = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close.current();
            }
            if (event.key === 'Tab') {
                const items = [...node.querySelectorAll(selector)].filter((el) => el.getClientRects().length);
                if (!items.length) {
                    event.preventDefault();
                    node.focus();
                    return;
                }
                const first = items[0],
                    last = items.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', key);
        return () => {
            document.body.style.overflow = overflow;
            document.removeEventListener('keydown', key);
            if (previous?.isConnected) previous.focus();
        };
    }, []);
    return (
        <div
            className="dialog-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={panel}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={id}
                className={'dialog-panel ' + (maxWidth || '')}
            >
                <header className="dialog-header">
                    <h2 id={id}>{title}</h2>
                    <button type="button" onClick={onClose} className="icon-button" aria-label="Close dialog">
                        <X size={18} />
                    </button>
                </header>
                <div className="dialog-body">{children}</div>
            </section>
        </div>
    );
}
export function Metric({ label, value, detail, to }) {
    const content = (
        <>
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="stat-value mt-3">{value ?? '—'}</p>
            {detail && <p className="field-hint mt-2">{detail}</p>}
        </>
    );
    return to ? (
        <a href={to} className="card block hover:border-zinc-600">
            {content}
        </a>
    ) : (
        <div className="card">{content}</div>
    );
}
