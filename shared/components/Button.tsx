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
  const baseClasses = 'font-medium rounded-xl transition-all duration-200 focus:outline-none inline-flex items-center justify-center';

  const variantClasses = {
    primary: 'bg-[#0a84ff] text-white hover:brightness-110 active:scale-[0.98]',
    secondary: 'bg-white/[0.06] border border-white/[0.08] text-white/90 hover:bg-white/[0.10] hover:border-white/[0.12]',
    ghost: 'bg-transparent text-white/60 hover:text-white/90 hover:bg-white/[0.04]',
    outline: 'border border-white/[0.08] text-white/80 hover:bg-white/[0.04] hover:border-white/[0.12]',
  };

  const sizeClasses = {
    sm: 'h-10 px-5 text-sm',
    md: 'h-12 px-8 text-base',
    lg: 'h-14 px-10 text-lg',
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

