"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle dark mode"
      className={cn(
        "text-muted-foreground hover:bg-accent group-data-[collapsible=icon]:hidden",
        className,
      )}
      onClick={() => {
        const dark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", dark);
        localStorage.setItem("theme", dark ? "dark" : "light");
      }}
    >
      <span className="relative size-4">
        <Moon
          className="absolute inset-0 size-4 transition-[transform,opacity] duration-150 ease-out dark:scale-90 dark:opacity-0"
          strokeWidth={1.7}
        />
        <Sun
          className="absolute inset-0 size-4 -rotate-90 scale-90 opacity-0 transition-[transform,opacity] duration-150 ease-out dark:rotate-0 dark:scale-100 dark:opacity-100"
          strokeWidth={1.7}
        />
      </span>
    </Button>
  );
}
