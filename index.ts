/**
 * Claude Code extension entry point.
 *
 * Loaded by Pi's extension system. Registers the Claude Code provider,
 * wires it to Pi for streaming, and adds lifecycle hooks for install-time
 * auth verification.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { wireProvidersToPI, runPluginOnboarding } from "@thereaperjay/gsd-provider-api";
import { claudeCodeProviderInfo } from "./info.ts";

// ─── Phase 1: CLI Install Hook ──────────────────────────────────────────────

export default async function activate(pi: ExtensionAPI): Promise<void> {
  await import("./info.ts");

  pi.registerAfterInstall(async (ctx) => {
    const result = claudeCodeProviderInfo.onboarding!.check();
    if (!result.ok) {
      ctx.warn(result.instruction);
      return;
    }
    ctx.log(`Claude CLI authenticated${result.email ? ` as ${result.email}` : ""}.`);
  });

  // ─── Phase 2: Session Start ─────────────────────────────────────────────
  await wireProvidersToPI(pi);
  await runPluginOnboarding(claudeCodeProviderInfo);
}
