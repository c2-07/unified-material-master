import React from "react";

export function AshokaChakraSpinner({ className = "h-8 w-8 text-[#000080]" }: { className?: string }) {
  return (
    <svg 
      className={`animate-spin ${className}`} 
      viewBox="0 0 100 100" 
      fill="none" 
      stroke="currentColor" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="45" strokeWidth="4" />
      <circle cx="50" cy="50" r="8" fill="currentColor" />
      {Array.from({ length: 24 }).map((_, i) => (
        <line 
          key={i}
          x1="50" 
          y1="50" 
          x2={+(50 + 45 * Math.cos((i * 15 * Math.PI) / 180)).toFixed(4)} 
          y2={+(50 + 45 * Math.sin((i * 15 * Math.PI) / 180)).toFixed(4)} 
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}
