/**
 * Base URL for the backend API.
 *
 * Every call site used to hardcode http://localhost:4000, which meant the app
 * only ever worked on the machine it was built on.
 *
 * NEXT_PUBLIC_* values are inlined by Next.js at build time, so this is fixed
 * when the image is built, not when it is served. Three modes:
 *
 *   unset                          -> http://localhost:4000   (local dev)
 *   ""                             -> "" (same origin)        (behind nginx,
 *                                    where /api is proxied to the backend)
 *   https://api.example.com        -> absolute cross-origin
 *
 * The empty-string case must not fall through to the localhost default, hence
 * the explicit undefined check rather than `||`.
 */
const configured = process.env.NEXT_PUBLIC_API_BASE_URL;

export const API_BASE: string =
  configured === undefined ? "http://localhost:4000" : configured.replace(/\/+$/, "");
