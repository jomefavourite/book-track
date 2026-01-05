"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LandingRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-lg text-muted-foreground">Redirecting...</div>
    </div>
  );
}
