"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";

interface PageLoaderProps {
  loading: boolean;
  children: React.ReactNode;
}

/**
 * Wraps page content with an Ashoka Chakra loader overlay.
 * The children are mounted but invisible while loading,
 * so data fetching & layout still happens in the background.
 */
export function PageLoader({ loading, children }: PageLoaderProps) {
  return (
    <div className="relative min-h-[60vh]">
      {/* Content — always rendered, hidden while loading so data fetches run */}
      <div className={`transition-opacity duration-500 ${loading ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        {children}
      </div>

      {/* Overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-transparent">
          <AshokaChakraSpinner className="h-14 w-14 text-[#0051c3]" />
          <p className="text-sm text-gray-400 font-mono animate-pulse">Loading...</p>
        </div>
      )}
    </div>
  );
}
