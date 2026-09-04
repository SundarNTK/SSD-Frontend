export const VISIBILITY_POS = "pos";
export const VISIBILITY_CUSTOMER_PORTAL = "customerPortal";

export const VISIBILITY_OPTIONS = [
  { value: VISIBILITY_POS, label: "POS Visibility" },
  { value: VISIBILITY_CUSTOMER_PORTAL, label: "Customer Portal Visibility" },
];

export const DEFAULT_VISIBILITY = [VISIBILITY_POS, VISIBILITY_CUSTOMER_PORTAL];

/** Missing flags (older records) count as visible. */
export function flagsToVisibility(pos: boolean | undefined, portal: boolean | undefined): string[] {
  const values: string[] = [];
  if (pos !== false) values.push(VISIBILITY_POS);
  if (portal !== false) values.push(VISIBILITY_CUSTOMER_PORTAL);
  return values;
}

export function visibilityToFlags(values: string[]) {
  return {
    pos: values.includes(VISIBILITY_POS),
    portal: values.includes(VISIBILITY_CUSTOMER_PORTAL),
  };
}
