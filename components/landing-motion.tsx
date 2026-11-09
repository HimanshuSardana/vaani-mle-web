"use client";

import { useEffect } from "react";

/** Reveals anything marked .rv as it scrolls into view, once. */
export function LandingMotion() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>(".rv"));
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (calm || !("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return null;
}
