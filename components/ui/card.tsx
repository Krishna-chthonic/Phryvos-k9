"use client";

import * as React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", interactive = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-[var(--radius-md)] bg-[var(--bg-1)] border border-[var(--border-subtle)] p-[var(--space-4)] transition-colors duration-120 ${
          interactive ? "hover:border-[var(--border)] cursor-pointer" : ""
        } ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export function CardHeader({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col space-y-1.5 pb-3 ${className}`} {...props} />;
}

export function CardTitle({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-[var(--text-md)] font-semibold text-[var(--fg-0)] tracking-tight leading-none ${className}`}
      {...props}
    />
  );
}

export function CardDescription({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-[var(--text-sm)] text-[var(--fg-2)] leading-normal ${className}`}
      {...props}
    />
  );
}

export function CardContent({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`pt-0 ${className}`} {...props} />;
}

export function CardFooter({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex items-center pt-3 ${className}`} {...props} />;
}
