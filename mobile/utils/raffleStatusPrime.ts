/**
 * One-shot hand-off of a GET /raffle/status payload from the raffle landing
 * page to the status page. The landing page has just fetched it to decide to
 * forward an entrant there; without this the status page fetched the same
 * thing again behind a second spinner. Read once, then cleared — the status
 * page still refreshes quietly on focus.
 */
let primed: unknown = null;

export function primeRaffleStatus(data: unknown) {
  primed = data;
}

export function takePrimedRaffleStatus<T = any>(): T | null {
  const data = primed as T | null;
  primed = null;
  return data;
}
