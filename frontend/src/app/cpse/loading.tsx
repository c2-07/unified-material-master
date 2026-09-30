import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
      <AshokaChakraSpinner className="h-12 w-12 text-[#0051c3]" />
      <p className="mt-3 text-sm text-gray-400 font-mono tracking-wide">Loading...</p>
    </div>
  );
}
