import { useEffect, useState } from "react";
import { BASE_URL } from "@/constants/constants";
import { GUIDE_TOPICS } from "@/libs/interfaces";

export interface GuideTopicOption {
  name: string;
  emoji?: string;
}

// Static fallback while the real list is loading, and if the fetch fails
// (offline, cold start) — better than an empty picker. Ordered the same way
// the hardcoded list always was; the server list itself always comes back
// name-sorted.
const FALLBACK: GuideTopicOption[] = GUIDE_TOPICS.map((name) => ({ name }));

/**
 * The Guide "Topic" picker's options — admin-managed (see the Guide Topics
 * page in the admin dashboard) rather than a fixed, compile-time list, so a
 * new topic is selectable immediately without an app release. Backed by
 * GET /guides/topics (guide.controller.js's getTopics).
 */
export function useGuideTopics() {
  const [topics, setTopics] = useState<GuideTopicOption[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/guides/topics`);
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.topics) && data.topics.length) {
          setTopics(data.topics.map((t: GuideTopicOption) => ({ name: t.name, emoji: t.emoji })));
        }
      } catch {
        // Fallback list already set — a guide can still be created/edited
        // offline against whichever topics were already known.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { topics, topicNames: topics.map((t) => t.name), loading };
}
