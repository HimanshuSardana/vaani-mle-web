"use client";

import { ChevronDown } from "lucide-react";
import { ChatLink, useSlideTo } from "@/components/transition-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

/** One primary action with the two ways in: Google, or straight in as a guest. */
export function OpenChatMenu({ googleEnabled }: { googleEnabled: boolean }) {
  const slideTo = useSlideTo();
  const { data } = authClient.useSession();
  const firstName = data?.user.name?.split(" ")[0];

  if (!googleEnabled) {
    return (
      <ChatLink
        className="ml-1 inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97]"
        href="/chat"
      >
        Open chat
      </ChatLink>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97]"
          />
        }
      >
        Open chat
        <ChevronDown className="size-3 opacity-60" strokeWidth={2.2} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {data ? (
          <DropdownMenuItem className="py-1.5 text-[13px]" onClick={() => slideTo("/chat")}>
            Continue as {firstName ?? "yourself"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="py-1.5 text-[13px]"
            onClick={() =>
              authClient.signIn.social({ provider: "google", callbackURL: "/chat" })
            }
          >
            Sign in with Google
          </DropdownMenuItem>
        )}

        <DropdownMenuItem className="py-1.5 text-[13px]" onClick={() => slideTo("/chat")}>
          Guest mode
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
