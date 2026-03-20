import React from 'react';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'asChild'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  asChild = false,
  ...props
}, ref) => {
  const baseClasses = 'font-medium rounded-full transition-all duration-200 focus:outline-none inline-flex items-center justify-center';

  const variantClasses = {
    primary: 'bg-[var(--ds-accent)] text-base-content hover:brightness-110 active:scale-[0.98]',
    secondary: 'bg-base-content/[0.06] border border-base-content/[0.08] text-base-content/90 hover:bg-base-content/[0.10] hover:border-base-content/[0.12]',
    ghost: 'bg-transparent text-base-content/60 hover:text-base-content/90 hover:bg-base-content/[0.04]',
    outline: 'border border-base-content/[0.10] text-base-content/[0.55] hover:text-base-content/[0.80] hover:bg-base-content/[0.04] hover:border-base-content/[0.15]',
  };

  const sizeClasses = {
    sm: 'h-8 px-4 text-xs',
    md: 'h-9 px-5 text-sm',
    lg: 'h-10 px-6 text-sm',
  };

  const widthClass = fullWidth ? 'w-full sm:w-auto' : '';

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`;

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      className: `${classes} ${child.props.className || ''}`.trim(),
      ref,
    });
  }

  return (
    <button
      ref={ref}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';
