/**
 * The API's origin (docs/m8-plan.md §4): in development the computer's address on the local network (a phone cannot
 * reach "localhost"), for the demo the Render service. Set in mobile/.env as EXPO_PUBLIC_API_URL.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";
