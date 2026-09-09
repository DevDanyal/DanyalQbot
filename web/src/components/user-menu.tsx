"use client";

import { useRouter } from "next/navigation";
import { useMe } from "@/lib/client-auth";

export function UserMenu() {
  const router = useRouter();
  const { me } = useMe();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const initials = me?.user?.name?.slice(0, 2).toUpperCase() ?? "?";
  const isAdmin = me?.role === "admin";

  return (
    <div className="flex items-center gap-2">
      {isAdmin ? (
        <button
          onClick={() => router.push("/admin")}
          className="rounded-lg border border-amber/30 px-2.5 py-1.5 text-[11px] font-semibold text-amber hover:bg-amber/10"
        >
          Admin
        </button>
      ) : null}
      <div
        className="flex items-center gap-2 rounded-full border border-white/[.08] bg-white/[.03] px-2.5 py-1 text-[11px] text-soft"
        title={me?.user?.userId}
      >
        <span className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-sky/30 to-mint/30 text-[10px] font-bold text-foreground">
          {initials}
        </span>
        <span className="max-w-[90px] truncate">{me?.user?.name ?? "…"}</span>
      </div>
      <button
        onClick={logout}
        className="rounded-lg border border-white/[.08] px-2 py-1.5 text-[11px] font-semibold text-soft hover:text-coral"
      >
        Log out
      </button>
    </div>
  );
}
