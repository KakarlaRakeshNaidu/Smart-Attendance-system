import React from 'react';
export default function Card({ className = '', children, ...props }) {
    return (
        <div {...props} className={'card ' + className}>
            {children}
        </div>
    );
}
