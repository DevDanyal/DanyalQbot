"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/admin-api";

export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/admin/dashboard");
    } else {
      router.replace("/admin/login");
    }
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "#0B1020" }}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
    </div>
  );
}
