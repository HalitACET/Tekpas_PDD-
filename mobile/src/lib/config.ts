/**
 * The API's origin (docs/m8-plan.md §4): in development the computer's address on the local network (a phone cannot
 * reach "localhost"), for the demo the Render service. Set in mobile/.env as EXPO_PUBLIC_API_URL.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * The web app, where the public passports are (/01/{gtin}/10/{batch}). A scanned code opens our own page there, never
 * the address printed in the code, whatever host it names.
 */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://kozapass.vercel.app";
