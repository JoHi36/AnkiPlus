import React from 'react';
import { motion } from 'framer-motion';

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
  const baseClasses = 'font-medium rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-anki-bg inline-flex items-center justify-center';
  
  const variantClasses = {
    primary: 'bg-white text-neutral-950 hover:bg-neutral-200 hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)]',
    secondary: 'bg-white/10 border border-white/10 text-white hover:bg-white/20 hover:border-white/20 backdrop-blur-sm',
    ghost: 'bg-white/5 text-white hover:bg-white/10',
    outline: 'border border-white/10 text-white hover:bg-white/10 hover:border-white/20',
  };
  
  const sizeClasses = {
    sm: 'h-10 px-5 text-sm min-h-[44px]',
    md: 'h-14 px-10 text-lg min-h-[44px]',
    lg: 'h-16 px-12 text-xl min-h-[44px]',
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
    <motion.button
      ref={ref}
      className={classes}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      {...props}
    >
      {children}
    </motion.button>
  );
});

Button.displayName = 'Button';

