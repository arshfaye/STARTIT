"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The app lives at /app. Anything that still points at the old address (sign-in links already
 * emailed, push notifications, payment returns, bookmarks to /#tab) and the store apps go
 * straight there, keeping the query and hash.
 */
export function ForwardToApp() {
  useEffect(() => {
    const { search, hash } = window.location;
    const native = navigator.userAgent.includes("StartitApp");
    const authOrTab = hash.length > 1 || /[?&](code|billing|error_description)=/.test(search);
    if (native || authOrTab) window.location.replace(`/app${search}${hash}`);
  }, []);
  return null;
}

/** "Try the demo", or "Open your workspace" for someone who already has one in this browser. */
export function StartButton({ className, label = "Try the demo" }: { className?: string; label?: string }) {
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    try {
      setReturning(!!localStorage.getItem("startit:session") || Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")));
    } catch {}
  }, []);
  return (
    <a href="/app" className={className}>
      {returning ? "Open your workspace" : label} <ArrowRight className="h-4 w-4" />
    </a>
  );
}
