import { useCallback, useState } from "react";
import { extractErrorMessage } from "./api";

/**
 * Shared submit-state helper — every auth/master form needs the same
 * loading + error handling around an API call. Write it once here, not
 * per page.
 */
export function useAsyncAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>
) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args) => {
      setError(null);
      setSubmitting(true);
      try {
        const result = await action(...args);
        return result;
      } catch (err) {
        setError(extractErrorMessage(err));
        return undefined;
      } finally {
        setSubmitting(false);
      }
    },
    [action]
  );

  return { run, submitting, error, setError };
}