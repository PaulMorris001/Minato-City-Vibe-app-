import { useEffect, useState } from "react";
import { BASE_URL } from "@/constants/constants";

export interface EventCategoryOption {
  name: string;
  emoji?: string;
}

/**
 * The event category list — admin-managed (see the Event Categories page in
 * the admin dashboard), so a new category shows up without an app release.
 * Backed by GET /events/categories (event.controller.js's getEventCategories).
 *
 * Unlike useGuideTopics there is no bundled fallback: categories are optional
 * on an event, so while loading (or offline) the picker and the filter row
 * simply don't render rather than offering names the server might reject.
 */
export function useEventCategories() {
  const [categories, setCategories] = useState<EventCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/events/categories`);
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.categories)) {
          setCategories(
            data.categories.map((c: EventCategoryOption) => ({ name: c.name, emoji: c.emoji }))
          );
        }
      } catch {
        // Leave the list empty — the filter row hides itself.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, loading };
}
