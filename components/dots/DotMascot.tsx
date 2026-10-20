"use client";

import React from "react";

export type DotCharacter = "blue" | "mint" | "orange" | "purple";
export type DotState = "idle" | "working" | "paused" | "complete" | "needs-input";

interface DotMascotProps {
  character?: DotCharacter;
  state?: DotState;
  size?: "small" | "medium" | "hero" | "call";
  className?: string;
  name?: string;
}

export function DotMascot({
  character = "blue",
  state = "idle",
  size = "medium",
  className = "",
  name = "Dot",
}: DotMascotProps) {
  const sizeClasses = {
    small: "w-8 h-8",
    medium: "w-14 h-14",
    hero: "w-40 h-40",
    call: "w-44 h-44",
  }[size];

  const stateClasses = {
    idle: "",
    working: "animate-[bounce_2s_infinite_ease-in-out]",
    paused: "opacity-60 saturate-50",
    complete: "rotate-[-3deg] transition-transform",
    "needs-input": "rotate-[6deg] transition-transform",
  }[state];

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 select-none ${sizeClasses} ${className}`}
      title={`${name} is ${state}`}
    >
      <img
        src={`/dots/${character}.png`}
        alt={`${name} (${character})`}
        className={`w-full h-full object-contain drop-shadow-sm transition-all duration-300 ${stateClasses}`}
        draggable={false}
      />
    </div>
  );
}
