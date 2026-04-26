import React from 'react';

const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

export default function LoadingSpinner({ size = 'md', className = '' }) {
  return (
    <div
      className={`${sizes[size]} rounded-full border-gray-200 border-t-primary-600 animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
