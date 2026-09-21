import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and the first hydration pass, true after.
 * For UI that depends on browser-only state (the signed-in user lives in
 * localStorage) — rendering it before hydration would make the client's first
 * render differ from the server's HTML.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
