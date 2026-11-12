import type { CSSProperties } from "react";
import { AuthButton } from "@/components/auth-button";
import { ChatProvider } from "@/components/chat-provider";
import { CitationSplit } from "@/components/citation-pane";
import { CommandPalette } from "@/components/command-palette";
import { ChatSurface } from "@/components/chat-surface";
import { Sidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { googleEnabled } from "@/lib/config";

export default function Home() {
  return (
    <ChatProvider>
      <SidebarProvider
        className="h-svh overflow-hidden font-sans"
        style={{ "--sidebar-width-icon": "2rem" } as CSSProperties}
      >
        <Sidebar googleEnabled={googleEnabled} />
        {/* One inset, curved on all four sides: chat and reader are columns of
            the same light surface, not separate cards. */}
        {/* The gutter is the seam: chat and reader are each their own inset card
            on it, curved on all four sides. */}
        <SidebarInset className="relative flex flex-col overflow-hidden bg-sidebar transition-colors duration-150 md:m-0! md:ml-0! md:rounded-none! md:shadow-none!">
          {googleEnabled && (
            <AuthButton
              className="absolute top-3 right-3 z-10 inline-flex h-7 items-center rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-[color,background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97]"
              signedOutLabel="Log In"
              signedInLabel="Sign out"
            />
          )}
          <CitationSplit>
            <ChatSurface />
          </CitationSplit>
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette />
    </ChatProvider>
  );
}
