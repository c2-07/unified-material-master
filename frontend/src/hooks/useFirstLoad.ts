"use client";
import { useState, useEffect } from "react";

/**
 * Shows a loading state on the first visit to a page per browser session.
 * Subsequent navigations to the same key are instant.
 *
 * @param key    Unique identifier for the page (e.g. "cpse-dashboard")
 * @param ms     How long to show the loader in milliseconds (default 900)
 */
export function useFirstLoad(key: string, ms = 900) {
  const storageKey = `fl_visited_${key}`;
  // Always start as loading=true on both server and client to avoid
  // hydration mismatches. The real sessionStorage check happens in
  // useEffect which only runs on the client after hydration.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const alreadyVisited = sessionStorage.getItem(storageKey) === "1";
    if (alreadyVisited) {
      // Already seen this page — skip the animation immediately
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(false);
      sessionStorage.setItem(storageKey, "1");
    }, ms);
    return () => clearTimeout(timer);
  }, [ms, storageKey]);

  return loading;
}
