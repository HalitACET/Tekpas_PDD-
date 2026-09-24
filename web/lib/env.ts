/** Backend API base, e.g. http://localhost:8080/api/v1 (see .env.example). */
export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

/** Backend origin without the /api/v1 prefix; actuator lives here. */
export const backendOrigin = new URL(apiUrl).origin;
