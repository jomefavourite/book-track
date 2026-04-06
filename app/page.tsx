"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import LandingPageContent from "./landing-page-content";

export default function Home() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && user) {
      router.replace("/dashboard");
    }
  }, [isLoaded, user, router]);

  if (isLoaded && user) {
    return null; // Will redirect
  }

  return <LandingPageContent />;
}
