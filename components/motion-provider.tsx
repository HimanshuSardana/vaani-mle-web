"use client";

import { MotionConfig } from "motion/react";

/** `reducedMotion="user"` keeps Motion's opacity work and drops its transforms
 *  for anyone who has asked the OS for less movement. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
