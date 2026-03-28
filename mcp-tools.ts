/**
 * Generic MCP server factory — reads tools from the shared registry.
 *
 * Zero GSD knowledge. This module only knows about the SDK's MCP API
 * and the provider-api tool registry interface.
 */

import { getGsdTools } from "@thereaperjay/gsd-provider-api";

function normalizeMcpResult(raw: unknown): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const content = obj.content;
    if (Array.isArray(content)) {
      const normalized = content.map((part) => {
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (p.type === "text" && typeof p.text === "string") {
            return { type: "text" as const, text: p.text };
          }
        }
        return { type: "text" as const, text: String(part ?? "") };
      });
      return { content: normalized, isError: obj.isError === true };
    }
  }
  return {
    content: [{ type: "text", text: typeof raw === "string" ? raw : JSON.stringify(raw) }],
  };
}

export async function createMcpServerFromRegistry() {
  const { createSdkMcpServer, tool } = await import("@anthropic-ai/claude-agent-sdk");
  const gsdTools = getGsdTools();

  if (gsdTools.length === 0) return undefined;

  return createSdkMcpServer({
    name: "gsd-tools",
    version: "1.0.0",
    tools: gsdTools.map((t) =>
      tool(
        t.name,
        t.description,
        t.schema as any,
        async (args: Record<string, unknown>, extra: unknown) => {
          try {
            const execute = t.execute as (toolArgs: Record<string, unknown>, toolExtra?: unknown) => Promise<unknown>;
            const raw = await execute(args, extra);
            return normalizeMcpResult(raw);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: message }], isError: true };
          }
        },
      ),
    ),
  });
}
