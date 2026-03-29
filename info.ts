/**
 * Claude Code provider — static metadata and info registration.
 *
 * Declares the provider's id, displayName, auth mechanism, models, and
 * createStream factory. Self-registers via registerProviderInfo() as a
 * side effect of import — discoverLocalProviders() triggers the import.
 */

import { registerProviderInfo } from "@thereaperjay/gsd-provider-api";
import type {
  GsdProviderInfo,
  GsdModel,
  GsdStreamContext,
  GsdProviderDeps,
  GsdEvent,
  GsdToolResultPayload,
} from "@thereaperjay/gsd-provider-api";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { SdkActivityWriter } from "./activity-writer.ts";
import { createMcpServerFromRegistry } from "./mcp-tools.ts";

// ─── Auth check ───────────────────────────────────────────────────────────────

function checkClaudeCodeCli(
  spawnFn: typeof spawnSync = spawnSync,
): { ok: true; email?: string } | { ok: false; reason: string; instruction: string } {
  const versionResult = spawnFn("claude", ["--version"], { encoding: "utf-8" });
  if (versionResult.error || versionResult.status !== 0) {
    return {
      ok: false,
      reason: "not-found",
      instruction: "Install Claude Code CLI: https://docs.anthropic.com/en/docs/claude-code",
    };
  }

  const authResult = spawnFn("claude", ["auth", "status", "--json"], { encoding: "utf-8" });
  if (authResult.error || authResult.status !== 0) {
    return {
      ok: false,
      reason: "not-authenticated",
      instruction: "Run 'claude auth login' in your terminal",
    };
  }

  let loggedIn = false;
  let email: string | undefined;
  try {
    const parsed = JSON.parse(authResult.stdout);
    loggedIn = parsed.loggedIn === true;
    email = typeof parsed.email === "string" ? parsed.email : undefined;
  } catch { /* not authenticated */ }

  if (!loggedIn) {
    return {
      ok: false,
      reason: "not-authenticated",
      instruction: "Run 'claude auth login' in your terminal",
    };
  }

  return email ? { ok: true, email } : { ok: true };
}

let cachedClaudePath: string | null = null;

function getClaudePath(spawnFn: typeof spawnSync = spawnSync): string {
  if (cachedClaudePath) return cachedClaudePath;
  try {
    const whichResult = spawnFn("which", ["claude"], { encoding: "utf-8" });
    if (whichResult.status === 0 && typeof whichResult.stdout === "string") {
      const resolved = whichResult.stdout.trim();
      if (resolved) {
        cachedClaudePath = resolved;
        return cachedClaudePath;
      }
    }
  } catch {
    // fall through to PATH resolution
  }
  cachedClaudePath = "claude";
  return cachedClaudePath;
}

// ─── SDK model aliases ────────────────────────────────────────────────────────

const SDK_MODEL_ALIASES: Record<string, string> = {
  // New namespace
  "claude-code-reaper:opus-4-6": "opus",
  "claude-code-reaper:sonnet-4-6": "sonnet",
  "claude-code-reaper:haiku-4-5": "haiku",
  // Backward compatibility for existing saved model ids
  "claude-code:opus-4-6": "opus",
  "claude-code:sonnet-4-6": "sonnet",
  "claude-code:haiku-4-5": "haiku",
};

// ─── Tool detail extraction ───────────────────────────────────────────────────

function extractToolDetail(toolName: string, toolInput: unknown): string | undefined {
  const input = toolInput as Record<string, unknown> | null | undefined;
  switch (toolName) {
    case "Write":
    case "Edit":
    case "Read":
      return typeof input?.file_path === "string" ? input.file_path
           : typeof input?.path === "string" ? input.path
           : undefined;
    case "Bash":
      if (typeof input?.command === "string") {
        return input.command.slice(0, 60);
      }
      return undefined;
    case "Grep":
      return typeof input?.pattern === "string" ? input.pattern : undefined;
    default:
      return undefined;
  }
}

function safeToolInputJson(toolInput: unknown): string {
  if (!toolInput || typeof toolInput !== "object") return "{}";
  try {
    return JSON.stringify(toolInput);
  } catch {
    return "{}";
  }
}

function normalizeToolResultPayload(content: unknown, isError: boolean): GsdToolResultPayload {
  if (typeof content === "string") {
    return { content: [{ type: "text", text: content }], isError };
  }

  if (!Array.isArray(content)) {
    return { content: [], isError };
  }

  const normalized = content.map((part) => {
    if (part && typeof part === "object") {
      const block = part as Record<string, unknown>;
      const type = typeof block.type === "string" ? block.type : "text";
      const text = typeof block.text === "string" ? block.text : undefined;
      const data = typeof block.data === "string" ? block.data : undefined;
      const mimeType = typeof block.mimeType === "string" ? block.mimeType : undefined;
      return { ...block, type, text, data, mimeType };
    }
    return { type: "text", text: String(part ?? "") };
  });

  return { content: normalized, isError };
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    const item = block as Record<string, unknown> | null | undefined;
    if (!item) continue;
    if (item.type === "text" && typeof item.text === "string" && item.text.trim().length > 0) {
      parts.push(item.text.trim());
    }
  }
  return parts.join("\n").trim();
}

function buildPromptFromHistory(context: GsdStreamContext): string {
  const messages = Array.isArray(context.messages) ? context.messages : [];
  if (messages.length === 0) return context.userPrompt;

  const transcript: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    const text = extractMessageText(msg.content);
    if (!text) continue;
    const speaker = msg.role === "user" ? "User" : "Assistant";
    transcript.push(`${speaker}:\n${text}`);
  }

  if (transcript.length === 0) return context.userPrompt;

  return [
    "Continue this conversation and respond to the final User message.",
    "",
    transcript.join("\n\n"),
  ].join("\n");
}

// ─── Event queue ──────────────────────────────────────────────────────────────

type EventQueueResolver = (value: IteratorResult<GsdEvent>) => void;

interface EventQueue {
  events: GsdEvent[];
  resolver: EventQueueResolver | null;
  done: boolean;
  push(event: GsdEvent): void;
  finish(): void;
  next(): Promise<IteratorResult<GsdEvent>>;
}

function createEventQueue(): EventQueue {
  const q: EventQueue = {
    events: [],
    resolver: null,
    done: false,
    push(event: GsdEvent) {
      if (q.resolver) {
        const resolve = q.resolver;
        q.resolver = null;
        resolve({ value: event, done: false });
      } else {
        q.events.push(event);
      }
    },
    finish() {
      q.done = true;
      if (q.resolver) {
        const resolve = q.resolver;
        q.resolver = null;
        resolve({ value: undefined as unknown as GsdEvent, done: true });
      }
    },
    next(): Promise<IteratorResult<GsdEvent>> {
      if (q.events.length > 0) {
        return Promise.resolve({ value: q.events.shift()!, done: false });
      }
      if (q.done) {
        return Promise.resolve({ value: undefined as unknown as GsdEvent, done: true });
      }
      return new Promise<IteratorResult<GsdEvent>>(resolve => {
        q.resolver = resolve;
      });
    },
  };
  return q;
}

// ─── Hook bridge types ────────────────────────────────────────────────────────

interface HookResult {
  continue?: false;
  stopReason?: string;
}

interface StopHookInput {
  stop_hook_active: boolean;
  [key: string]: unknown;
}

// ─── Activity dir resolution ──────────────────────────────────────────────────

function resolveActivityDir(basePath: string): string {
  // Walk up from basePath looking for .gsd/ directory
  let dir = basePath;
  while (dir !== "/") {
    const candidate = join(dir, ".gsd", "activity");
    if (existsSync(join(dir, ".gsd"))) return candidate;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: create in basePath
  return join(basePath, ".gsd", "activity");
}

// ─── createStream implementation ──────────────────────────────────────────────

function claudeCodeCreateStream(
  context: GsdStreamContext,
  deps: GsdProviderDeps,
): AsyncIterable<GsdEvent> {
  const queue = createEventQueue();

  (async () => {
    const sdkAlias = SDK_MODEL_ALIASES[context.modelId] ?? "sonnet";
    const { unitType, unitId } = deps.getUnitInfo();
    const basePath = deps.getBasePath();
    const supervisorConfig = context.supervisorConfig;

    const softTimeoutMs = (supervisorConfig.soft_timeout_minutes ?? 0) * 60 * 1000;
    const idleTimeoutMs = (supervisorConfig.idle_timeout_minutes ?? 0) * 60 * 1000;
    const hardTimeoutMs = (supervisorConfig.hard_timeout_minutes ?? 0) * 60 * 1000;

    const activityDir = resolveActivityDir(basePath);
    const activityWriter = new SdkActivityWriter(activityDir, unitType, unitId);

    let lastActivityAt = Date.now();

    let wrapupWarningHandle: ReturnType<typeof setTimeout> | null = null;
    let idleWatchdogHandle: ReturnType<typeof setInterval> | null = null;
    let hardTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

    function clearSupervisionTimers(): void {
      if (wrapupWarningHandle !== null) { clearTimeout(wrapupWarningHandle); wrapupWarningHandle = null; }
      if (idleWatchdogHandle !== null) { clearInterval(idleWatchdogHandle); idleWatchdogHandle = null; }
      if (hardTimeoutHandle !== null) { clearTimeout(hardTimeoutHandle); hardTimeoutHandle = null; }
    }

    let queryObj: (AsyncIterable<unknown> & { interrupt?: () => Promise<void>; close?: () => void }) | null = null;
    const abortController = new AbortController();
    let detachAbortListener: (() => void) | null = null;

    function isAbortLikeError(err: unknown): boolean {
      const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
      return text.toLowerCase().includes("abort");
    }

    function safeInterrupt(): void {
      if (!queryObj?.interrupt) return;
      try {
        const interruptResult = queryObj.interrupt();
        void interruptResult.catch((err: unknown) => {
          if (isAbortLikeError(err)) return;
          console.warn(`[claude-code-reaper] interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      } catch (err) {
        if (isAbortLikeError(err)) return;
        console.warn(`[claude-code-reaper] interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (context.signal) {
      if (context.signal.aborted) {
        abortController.abort();
      } else {
        const onAbort = () => {
          safeInterrupt();
          abortController.abort();
        };
        context.signal.addEventListener("abort", onAbort, { once: true });
        detachAbortListener = () => context.signal?.removeEventListener("abort", onAbort);
      }
    }

    try {
      const hookBridge = {
        PreToolUse: [{
          hooks: [async (rawInput: unknown): Promise<HookResult> => {
            const input = rawInput as { hook_event_name: string; tool_name: string; tool_input: unknown; tool_use_id: string };
            if (input.hook_event_name !== "PreToolUse") return {};
            lastActivityAt = Date.now();
            deps.onToolStart(input.tool_use_id);
            const detail = extractToolDetail(input.tool_name, input.tool_input);
            queue.push({ type: "tool_call_start", toolCallId: input.tool_use_id, toolName: input.tool_name, detail });
            queue.push({ type: "tool_call_delta", toolCallId: input.tool_use_id, delta: safeToolInputJson(input.tool_input) });

            if (input.tool_name === "Write" || input.tool_name === "Edit") {
              const toolInput = input.tool_input as Record<string, unknown> | null | undefined;
              const filePath = (typeof toolInput?.file_path === "string" ? toolInput.file_path : undefined)
                ?? (typeof toolInput?.path === "string" ? toolInput.path : undefined) ?? "";
              const result = deps.shouldBlockContextWrite(input.tool_name.toLowerCase(), filePath, deps.getMilestoneId(), deps.isDepthVerified());
              if (result.block) return { continue: false, stopReason: result.reason };
            }
            return {};
          }],
        }],
        PostToolUse: [{
          hooks: [async (rawInput: unknown): Promise<HookResult> => {
            const input = rawInput as { hook_event_name: string; tool_use_id: string };
            if (input.hook_event_name !== "PostToolUse") return {};
            lastActivityAt = Date.now();
            deps.onToolEnd(input.tool_use_id);
            queue.push({ type: "tool_call_end", toolCallId: input.tool_use_id });
            return {};
          }],
        }],
        PostToolUseFailure: [{
          hooks: [async (rawInput: unknown): Promise<HookResult> => {
            const input = rawInput as { hook_event_name: string; tool_use_id: string };
            if (input.hook_event_name !== "PostToolUseFailure") return {};
            lastActivityAt = Date.now();
            deps.onToolEnd(input.tool_use_id);
            queue.push({ type: "tool_call_end", toolCallId: input.tool_use_id });
            return {};
          }],
        }],
      };

      const mcpServer = await createMcpServerFromRegistry(context.tools);

      const stopHookHandler = async (rawInput: unknown): Promise<HookResult> => {
        const input = rawInput as StopHookInput;
        if (!input.stop_hook_active) return {};
        if (!deps.getIsUnitDone()) return { continue: false };
        return {};
      };

      const queryOptions = {
        pathToClaudeCodeExecutable: getClaudePath(),
        model: sdkAlias,
        systemPrompt: context.systemPrompt,
        cwd: basePath,
        abortController,
        mcpServers: mcpServer ? { "gsd-tools": mcpServer } : undefined,
        hooks: { ...hookBridge, Stop: [{ hooks: [stopHookHandler] }] },
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        persistSession: false,
        includePartialMessages: true,
      };

      if (softTimeoutMs > 0) {
        wrapupWarningHandle = setTimeout(() => {
          wrapupWarningHandle = null;
          safeInterrupt();
        }, softTimeoutMs);
      }

      if (idleTimeoutMs > 0) {
        idleWatchdogHandle = setInterval(() => {
          if (Date.now() - lastActivityAt < idleTimeoutMs) return;
          safeInterrupt();
          lastActivityAt = Date.now();
        }, 15000);
      }

      if (hardTimeoutMs > 0) {
        hardTimeoutHandle = setTimeout(() => {
          hardTimeoutHandle = null;
          queryObj?.close?.();
        }, hardTimeoutMs);
      }

      const prompt = buildPromptFromHistory(context);

      queryObj = query({
        prompt,
        options: queryOptions as unknown as Record<string, unknown>,
      });

      let completionEmitted = false;
      let lastTextDelta = "";
      let lastThinkingDelta = "";

      for await (const msg of queryObj) {
        const sdkMsg = msg as Record<string, unknown>;
        const parentToolUseId = sdkMsg["parent_tool_use_id"];
        const isTopLevel = parentToolUseId === null || parentToolUseId === undefined;

        if (sdkMsg["type"] === "stream_event") {
          if (!isTopLevel) continue;
          const event = sdkMsg["event"] as Record<string, unknown> | undefined;
          if (!event) continue;
          const eventType = event["type"] as string;

          if (eventType === "content_block_start") {
            const contentBlock = event["content_block"] as Record<string, unknown> | undefined;
            if (contentBlock?.["type"] === "thinking") {
              queue.push({ type: "thinking_delta", thinking: "" });
            }
          } else if (eventType === "content_block_delta") {
            const delta = event["delta"] as Record<string, unknown> | undefined;
            if (delta?.["type"] === "text_delta") {
              const chunk = String(delta["text"] ?? "");
              if (chunk.length > 0 && chunk !== lastTextDelta) {
                queue.push({ type: "text_delta", text: chunk });
              }
              lastTextDelta = chunk;
            } else if (delta?.["type"] === "thinking_delta") {
              const chunk = String(delta["thinking"] ?? "");
              if (chunk.length > 0 && chunk !== lastThinkingDelta) {
                queue.push({ type: "thinking_delta", thinking: chunk.endsWith("\n") ? chunk : `${chunk}\n` });
              }
              lastThinkingDelta = chunk;
            }
          }
        } else if (sdkMsg["type"] === "assistant") {
          if (!isTopLevel) continue;
          activityWriter.processAssistantMessage(sdkMsg);
        } else if (sdkMsg["type"] === "user") {
          if (!isTopLevel) continue;
          const innerMsg = sdkMsg["message"] as Record<string, unknown> | undefined;
          const content = innerMsg?.["content"];
          if (Array.isArray(content)) {
            for (const block of content as Record<string, unknown>[]) {
              if (block["type"] === "tool_result") {
                const toolUseId = String(block["tool_use_id"] ?? "");
                const isError = block["is_error"] === true;
                activityWriter.processToolResult(
                  toolUseId,
                  block["content"] ?? [],
                  isError,
                );
                queue.push({
                  type: "tool_result",
                  toolCallId: toolUseId,
                  toolName: typeof block["tool_name"] === "string" ? String(block["tool_name"]) : "Claude Tool",
                  result: normalizeToolResultPayload(block["content"], isError),
                });
              }
            }
          }
        } else if (sdkMsg["type"] === "result") {
          if (completionEmitted) continue;
          completionEmitted = true;
          activityWriter.processResultMessage(sdkMsg);
          const usage = sdkMsg["usage"] as Record<string, unknown> | undefined;
          const inputTokens = typeof usage?.["input_tokens"] === "number" ? usage["input_tokens"] : 0;
          const outputTokens = typeof usage?.["output_tokens"] === "number" ? usage["output_tokens"] : 0;
          const isError = sdkMsg["is_error"] === true;

          if (isError) {
            const errors = sdkMsg["errors"];
            queue.push({ type: "error", message: Array.isArray(errors) ? errors.join("; ") : String(errors ?? "SDK error"), category: "unknown" });
          } else {
            const subtype = String(sdkMsg["subtype"] ?? "");
            queue.push({
              type: "completion",
              usage: { inputTokens: inputTokens as number, outputTokens: outputTokens as number },
              stopReason: subtype === "success" || subtype === "" ? "stop" : subtype,
            });
          }
        }
      }
    } catch (err) {
      if (isAbortLikeError(err)) {
        queue.push({
          type: "completion",
          usage: { inputTokens: 0, outputTokens: 0 },
          stopReason: "cancel",
        });
      } else {
        queue.push({ type: "error", message: err instanceof Error ? err.message : String(err), category: "unknown" });
      }
    } finally {
      if (detachAbortListener) detachAbortListener();
      clearSupervisionTimers();
      activityWriter.flush();
      queryObj = null;
      queue.finish();
    }
  })();

  return {
    [Symbol.asyncIterator]() {
      return { next: () => queue.next() };
    },
  };
}

// ─── Models ───────────────────────────────────────────────────────────────────

const claudeCodeModels: GsdModel[] = [
  { id: "claude-code-reaper:opus-4-6", displayName: "Opus 4.6 (Claude Code)", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-code-reaper:sonnet-4-6", displayName: "Sonnet 4.6 (Claude Code)", reasoning: true, contextWindow: 200000, maxTokens: 16000 },
  { id: "claude-code-reaper:haiku-4-5", displayName: "Haiku 4.5 (Claude Code)", reasoning: false, contextWindow: 200000, maxTokens: 8096 },
];

// ─── Provider info ────────────────────────────────────────────────────────────

export const claudeCodeProviderInfo: GsdProviderInfo = {
  id: "claude-code-reaper",
  pluginDir: dirname(fileURLToPath(import.meta.url)),
  displayName: "Claude Code (Subscription)",
  authMode: "externalCli",
  onboarding: {
    kind: "externalCli",
    hint: "requires claude CLI installed and logged in",
    check: checkClaudeCodeCli,
  },
  isReady: () => {
    const result = checkClaudeCodeCli();
    return result.ok;
  },
  afterInstall: (ctx) => {
    const result = checkClaudeCodeCli();
    if (!result.ok) {
      ctx.warn(result.instruction);
      return;
    }
    ctx.log(`Claude CLI authenticated${result.email ? ` as ${result.email}` : ""}`);
  },
  models: claudeCodeModels,
  createStream: claudeCodeCreateStream,
};

registerProviderInfo(claudeCodeProviderInfo);
