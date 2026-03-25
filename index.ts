/**
 * Claude Code extension entry point.
 *
 * Loaded by Pi's extension system. Registers the Claude Code provider,
 * wires it to Pi for streaming, and adds lifecycle hooks for install-time
 * auth verification.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { wireProvidersToPI } from "@thereaperjay/gsd-provider-api";

export default async function(pi: ExtensionAPI): Promise<void> {
  // Import triggers registerProviderInfo() side effect
  await import("./info.ts");

  // CLI installation is verified by extension-manifest.json runtime deps.
  // This hook checks authentication status — a separate concern.
  pi.registerAfterInstall(async (ctx) => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("claude", ["auth", "status", "--json"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.error || result.status !== 0) {
      ctx.warn("Claude CLI is not authenticated. Run 'claude auth login' before using this provider.");
      return;
    }
    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.loggedIn !== true) {
        ctx.warn("Claude CLI is not authenticated. Run 'claude auth login' before using this provider.");
        return;
      }
      const email = typeof parsed.email === "string" ? parsed.email : undefined;
      ctx.log(`Claude CLI authenticated${email ? ` as ${email}` : ""}`);
    } catch {
      ctx.warn("Could not verify Claude CLI auth status. Run 'claude auth login' if you encounter issues.");
    }
  });

  // Wire registered providers to Pi so models appear in model registry
  await wireProvidersToPI(pi);
}
