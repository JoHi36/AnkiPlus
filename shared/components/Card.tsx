import React from 'react';
import { motion } from 'framer-motion';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glass?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
  glass = true,
}) => {
  const baseClasses = 'rounded-2xl border border-base-content/10 p-4 md:p-6 lg:p-8';
  const glassClasses = glass ? 'bg-[var(--ds-bg-deep)] backdrop-blur-sm' : 'bg-[var(--ds-bg-deep)]';
  const hoverClasses = hover ? 'hover:border-base-content/20 hover:bg-[var(--ds-bg-canvas)] transition-all duration-300' : '';

  const classes = `${baseClasses} ${glassClasses} ${hoverClasses} ${className}`;

  return (
    <motion.div
      className={classes}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  );
};
