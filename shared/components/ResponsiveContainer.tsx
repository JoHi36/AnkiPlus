import React from 'react';

export interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '7xl';
  padding?: boolean;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  className = '',
  maxWidth = '7xl',
  padding = true,
}) => {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '7xl': 'max-w-7xl',
  };
  
  const paddingClass = padding ? 'px-4 sm:px-6 md:px-8' : '';
  const classes = `mx-auto ${maxWidthClasses[maxWidth]} ${paddingClass} ${className}`;
  
  return <div className={classes}>{children}</div>;
};


