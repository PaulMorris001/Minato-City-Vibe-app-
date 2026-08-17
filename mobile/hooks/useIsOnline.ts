import { useEffect, useState } from "react";

import { isOnline, onReachabilityChange } from "@/utils/reachability";

/**
 * Whether the app currently has a usable connection.
 *
 * Reads the single reachability module rather than adding a fifth context —
 * that module already owns the OS network listener and the launch health
 * probe, and subscribing is what it was built for.
 */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => {
    // Re-read through isOnline() rather than trusting the emitted value: the
    // callback carries the reachability state, and "online" also depends on
    // the device's own network flag.
    const unsubscribe = onReachabilityChange(() => setOnline(isOnline()));
    setOnline(isOnline());
    return unsubscribe;
  }, []);

  return online;
}
