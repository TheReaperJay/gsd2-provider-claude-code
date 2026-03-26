/**
 * Claude Code extension entry point.
 *
 * Loaded by Pi's extension system. Registers the Claude Code provider,
 * wires lifecycle hooks and providers to Pi.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { wireLifecycleHooks, wireProvidersToPI } from "@thereaperjay/gsd-provider-api";

export default async function(pi: ExtensionAPI): Promise<void> {
  await import("./info.ts");
  wireLifecycleHooks(pi);
  await wireProvidersToPI(pi);
}
