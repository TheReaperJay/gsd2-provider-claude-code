/**
 * Claude Code extension entry point.
 *
 * Loaded by Pi's extension system. Registers the Claude Code provider,
 * wires lifecycle hooks and providers to Pi.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { removeProviderInfo, wireLifecycleHooks, wireProvidersToPI } from "@thereaperjay/gsd-provider-api";

export default async function(pi: ExtensionAPI): Promise<void> {
  // Registry is process-global (Symbol.for). On /reload, stale provider entries
  // from previous versions can remain and break onboarding state writes.
  removeProviderInfo("claude-code");
  removeProviderInfo("claude-code-reaper");

  await import("./info.ts");
  wireLifecycleHooks(pi);
  await wireProvidersToPI(pi);
}
