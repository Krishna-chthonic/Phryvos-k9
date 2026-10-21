"use client";

import * as React from "react";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-[20px] w-[20px] text-[10px]",
  md: "h-[24px] w-[24px] text-[11px]",
  lg: "h-[32px] w-[32px] text-[12px]",
};

export function Avatar({
  className = "",
  src,
  alt = "",
  name = "User",
  size = "md",
  ...props
}: AvatarProps) {
  const [imgError, setImgError] = React.useState(false);
  const initial = (name.trim()[0] || "U").toUpperCase();

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden bg-[var(--bg-3)] border border-[var(--border-subtle)] font-medium text-[var(--fg-1)] select-none shrink-0 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={alt || name}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
