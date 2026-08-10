import { useEffect, useState } from "react";

/**
 * Debounce a rapidly-changing value (typically search text).
 *
 * Replaces the hand-rolled `setTimeout(300)` + `clearTimeout` effect that was
 * copy-pasted across every search screen in the app.
 *
 * Note this debounces the VALUE, not the request — pair it with an
 * AbortController (see services/search.service.ts) if responses can arrive out
 * of order, which debouncing alone does not prevent.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
