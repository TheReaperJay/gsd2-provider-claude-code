import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { wireProvidersToPI, runPluginOnboarding } from "@thereaperjay/gsd-provider-api";
import { claudeCodeProviderInfo } from "./info.ts";

export default async function activate(pi: ExtensionAPI): Promise<void> {
  await import("./info.ts");

  pi.registerAfterInstall(async (ctx) => {
    const result = claudeCodeProviderInfo.onboarding!.check();
    if (!result.ok) {
      ctx.warn(result.instruction);
      return;
    }
    ctx.log(`Claude CLI authenticated${result.email ? ` as ${result.email}` : ""}.`);

    await runPluginOnboarding(claudeCodeProviderInfo);
  });

  await wireProvidersToPI(pi);
}
