import React, { useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/** Phase 9 — account menu: profile, settings, real auth state, logout. No secrets. */
export const AccountMenu: React.FC<{ collapsed?: boolean; onOpenSettings?: () => void }> = ({
  collapsed,
  onOpenSettings,
}) => {
  const { status, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const initials =
    user?.displayName
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || (status === "signed-in" ? "OB" : "?");

  const subtitle =
    status === "signed-in"
      ? (user?.email ?? "Signed in")
      : status === "loading"
        ? "Checking session…"
        : status === "unconfigured" || !isDesktopApp()
          ? "Local only"
          : "Not signed in";

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${user?.displayName ?? subtitle}`}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60"
        >
          <Avatar className="h-8 w-8 shrink-0">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {user?.displayName ?? "Openbentt"}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-60 p-1.5">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <User size={14} className="text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.displayName ?? "Local session"}</p>
            <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {onOpenSettings && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <Settings size={14} /> Account & settings
          </Button>
        )}
        {status === "signed-in" && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs text-destructive hover:text-destructive"
            disabled={signingOut}
            onClick={handleSignOut}
          >
            <LogOut size={14} /> {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};
