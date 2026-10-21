import { useSyncExternalStore } from "react";
import { getSessionState, type SessionState, subscribeSession } from "./session";

/** The session, re-rendering on every change (login, restore, logout, a lost session). */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSessionState, getSessionState);
}
