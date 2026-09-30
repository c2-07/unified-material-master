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
  const alreadyVisited = typeof window !== "undefined" && sessionStorage.getItem(storageKey) === "1";
  const [loading, setLoading] = useState(!alreadyVisited);

  useEffect(() => {
    if (alreadyVisited) return;
    const timer = setTimeout(() => {
      setLoading(false);
      sessionStorage.setItem(storageKey, "1");
    }, ms);
    return () => clearTimeout(timer);
  }, []);

  return loading;
}
