/**
 * Backend origin, server side only (never sent to the browser). The browser always calls its own origin
 * (/api/v1/*), which next.config.ts rewrites to this address (K18).
 */
export const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:8080").replace(/\/+$/, "");
