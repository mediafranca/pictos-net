import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'ghost' | 'outline';
    size?: 'default' | 'sm' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className = '', variant = 'default', size = 'default', ...props }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

        const variants = {
            default: 'bg-slate-900 text-white hover:bg-slate-800',
            ghost: 'hover:bg-slate-100 hover:text-slate-900',
            outline: 'border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900'
        };

        const sizes = {
            default: 'h-10 px-4 py-2',
            sm: 'h-8 px-3 text-sm',
            lg: 'h-11 px-8'
        };

        return (
            <button
                ref={ref}
                className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
                {...props}
            />
        );
    }
);

Button.displayName = 'Button';
