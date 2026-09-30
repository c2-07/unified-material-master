/**
 * Base URL for the backend API.
 *
 * Previously every call site hardcoded http://localhost:4000, which meant the
 * frontend only ever worked on the machine it was built on. Set
 * NEXT_PUBLIC_API_BASE_URL at build time to point the app at a real backend.
 *
 * NEXT_PUBLIC_* values are inlined by Next.js at build time, which is what we
 * want: these are client components and there is no server runtime to read
 * process.env from.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
