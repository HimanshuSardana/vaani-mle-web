"use client";

import { Brain, Ellipsis, Search, SquarePen } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { useState } from "react";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  Sidebar as SidebarShell,
} from "@/components/ui/sidebar";
import { AuthButton } from "@/components/auth-button";
import { Mark } from "@/components/mark";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useChat } from "@/components/chat-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { groupChats } from "@/lib/chat";

const nav = [{ label: "New chat", icon: SquarePen }];

export function Sidebar({ googleEnabled }: { googleEnabled: boolean }) {
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const { data: session } = authClient.useSession();
  const name = session?.user.name ?? "Guest User";
  const initials = name
    .split("\s")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const {
    chats,
    activeChat,
    dayStart,
    loaded,
    memoriesOpen,
    openChat,
    openMemories,
    startNewChat,
    togglePin,
    deleteChat,
    setSearchOpen,
  } = useChat();
  const groups = groupChats(chats, dayStart);

  return (
    <SidebarShell variant="inset" collapsible="icon">
      <SidebarHeader className="h-9 flex-row items-center gap-2 pr-1.5 pl-4 py-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
        <Link href="/" className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <Mark className="size-3.5 shrink-0 text-foreground group-data-[collapsible=icon]:hidden" />
        <span className="sidebar-fade sidebar-fade-inline text-[12.5px] leading-none font-semibold tracking-tight text-foreground">
            recall
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Search messages"
          onClick={() => setSearchOpen(true)}
          className="sidebar-fade sidebar-fade-inline ml-auto size-7 text-muted-foreground hover:bg-accent"
        >
          <Search strokeWidth={1.7} />
        </Button>
        <SidebarTrigger className="size-7 text-muted-foreground hover:bg-accent" />
      </SidebarHeader>

      <SidebarContent className="px-1 [mask-image:linear-gradient(to_bottom,black,black_calc(100%-28px),transparent)] group-data-[collapsible=icon]:px-0">
        <SidebarGroup className="p-1 group-data-[collapsible=icon]:p-0">
          <SidebarMenu>
            {nav.map(({ label, icon: Icon }) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  className="h-7 gap-2 px-2 text-[12px] font-normal text-foreground/80 group-data-[collapsible=icon]:mx-auto"
                  tooltip={label}
                  onClick={label === "New chat" ? startNewChat : undefined}
                >
                  <Icon className="text-muted-foreground" strokeWidth={1.7} />
                  {label}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={memoriesOpen}
                className="h-7 gap-2 px-2 text-[12px] font-normal text-foreground/80 data-active:font-normal data-active:text-foreground"
                tooltip="Memories"
                onClick={openMemories}
              >
                <Brain className="text-muted-foreground" strokeWidth={1.7} />
                Memories
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <div className="sidebar-fade pb-8">
          {loaded && groups.length === 0 && (
            <p className="px-3 pt-6 text-[11.5px] leading-relaxed text-muted-foreground">
              No chats yet. Ask something and it will show up here.
            </p>
          )}
          {groups.map(({ label, chats: items }) => (
            <SidebarGroup key={label} className="p-1">
              <SidebarGroupLabel className="h-6 px-2 text-[10.5px] font-semibold text-foreground">
                {label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {items.map((chat) => (
                  <motion.li
                    key={chat.id}
                    data-reveal-host
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ type: "spring", duration: 0.32, bounce: 0.14 }}
                    className="relative"
                  >
                    <SidebarMenuButton
                      isActive={chat.id === activeChat?.id}
                      className="h-6.5 gap-2 pr-7 pl-2 text-[12px] font-normal text-muted-foreground data-active:font-normal data-active:text-foreground"
                      onClick={() => openChat(chat.id)}
                    >
                      <span className="truncate">{chat.title}</span>
                    </SidebarMenuButton>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            type="button"
                            aria-label={`Actions for ${chat.title}`}
                            data-reveal
                            className="absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground/70 opacity-0 transition-[opacity,color] duration-150 hover:text-foreground"
                          />

                        }
                      >
                        <Ellipsis className="size-3.5" strokeWidth={2} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="bottom" className="w-auto min-w-40">
                        <DropdownMenuItem className="text-[13px]" onClick={() => togglePin(chat.id)}>
                          {chat.pinned ? "Unpin chat" : "Pin chat"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          className="text-[13px]"
                          onClick={() => setPendingDelete({ id: chat.id, title: chat.title })}
                        >
                          Delete chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.li>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </div>
      </SidebarContent>

      <SidebarFooter className="flex-row items-center gap-2 px-3 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Avatar size="sm" className="size-5 shrink-0">
          <AvatarFallback className="bg-primary text-[9px] font-medium text-primary-foreground">
            {initials || "GU"}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
          <p className="truncate text-[12px] font-medium text-foreground">{name}</p>
          {googleEnabled && (
            <AuthButton
              className="text-left text-[11px] text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline"
              signedOutLabel="Log In"
              signedInLabel="Sign out"
            />
          )}
        </div>
        <ThemeToggle className="ml-auto" />
      </SidebarFooter>
      <SidebarRail />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-relaxed">
              “{pendingDelete?.title}” and its messages will be removed. The agent will not be able
              to look this conversation up again. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm" className="text-[12.5px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              className="bg-destructive text-[12.5px] text-white hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteChat(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarShell>
  );
}
