import { config } from "../config/env.js";

/**
 * Official support account helpers.
 *
 * The support account is an ordinary user document — it just happens to be the
 * one the company owns. Rather than adding a role field to every user, the
 * special behaviour is keyed off a single configured ID so it can differ per
 * environment and be switched off entirely by leaving SUPPORT_USER_ID unset.
 *
 * Always compare through these helpers instead of inlining the ID, so the
 * "support is disabled" case stays consistent everywhere.
 */

export const SUPPORT_USER_ID = config.support.userId;

/** True when `id` is the configured support account. */
export const isSupportUser = (id) =>
  !!SUPPORT_USER_ID && !!id && String(id) === SUPPORT_USER_ID;

/** True when either side of a pair is the support account. */
export const involvesSupport = (a, b) => isSupportUser(a) || isSupportUser(b);
