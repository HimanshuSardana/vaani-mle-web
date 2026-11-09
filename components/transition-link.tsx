"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

type DocumentWithTransitions = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => unknown;
};

/** Navigates inside a view transition so the next page slides in from the
 *  right. Falls back to a plain push for reduced motion or no support. */
export function useSlideTo() {
  const router = useRouter();

  return (href: string) => {
    const doc = document as DocumentWithTransitions;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (calm || !doc.startViewTransition) {
      router.push(href);
      return;
    }

    doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          router.push(href);
          // Give React a frame or two to paint the new route before the
          // "new" snapshot is taken.
          window.setTimeout(resolve, 160);
        }),
    );
  };
}

export function ChatLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const slideTo = useSlideTo();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    slideTo(href);
  };

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
