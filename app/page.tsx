"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? "/dashboard/membership/parking" : "/login");
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center" suppressHydrationWarning>
      <div className="pk-spinner" suppressHydrationWarning />
    </div>
  );
}
