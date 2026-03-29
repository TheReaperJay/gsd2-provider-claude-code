/**
 * Generic MCP server factory — reads tools from the shared registry.
 *
 * Zero GSD knowledge. This module only knows about the SDK's MCP API
 * and the provider-api tool registry interface.
 */

import { getGsdTools } from "@thereaperjay/gsd-provider-api";
import type { GsdToolDef } from "@thereaperjay/gsd-provider-api";
import { z } from "zod";
import type { ZodRawShape, ZodTypeAny } from "zod";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isZodType(value: unknown): value is ZodTypeAny {
  return isRecord(value) && typeof (value as { parse?: unknown }).parse === "function";
}

function withDescription(schema: ZodTypeAny, source: Record<string, unknown>): ZodTypeAny {
  const description = source.description;
  if (typeof description !== "string" || description.trim().length === 0) return schema;
  return schema.describe(description);
}

function literalUnion(values: unknown[]): ZodTypeAny {
  if (values.length === 0) return z.any();
  const literals = values.map((v) => z.literal(v as never));
  if (literals.length === 1) return literals[0]!;
  return z.union(literals as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
}

function schemaToZod(schema: unknown): ZodTypeAny {
  if (isZodType(schema)) return schema;
  if (!isRecord(schema)) return z.any();

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const items = schema.anyOf.map(schemaToZod);
    if (items.length === 1) return items[0]!;
    return withDescription(z.union(items as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]), schema);
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const items = schema.oneOf.map(schemaToZod);
    if (items.length === 1) return items[0]!;
    return withDescription(z.union(items as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]), schema);
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return withDescription(literalUnion(schema.enum), schema);
  }

  if ("const" in schema) {
    return withDescription(z.literal(schema.const as never), schema);
  }

  const rawType = schema.type;
  const typeValues = Array.isArray(rawType) ? rawType : [rawType];
  const nonNullTypes = typeValues.filter((t): t is string => typeof t === "string" && t !== "null");
  const nullable = typeValues.includes("null");
  const selectedType = nonNullTypes[0];

  let output: ZodTypeAny;
  switch (selectedType) {
    case "string":
      output = z.string();
      break;
    case "integer":
      output = z.number().int();
      break;
    case "number":
      output = z.number();
      break;
    case "boolean":
      output = z.boolean();
      break;
    case "array": {
      const itemSchema = "items" in schema ? schemaToZod(schema.items) : z.any();
      output = z.array(itemSchema);
      break;
    }
    case "object": {
      const shape = schemaToZodRawShape(schema);
      output = z.object(shape);
      break;
    }
    default:
      output = z.any();
      break;
  }

  output = withDescription(output, schema);
  return nullable ? output.nullable() : output;
}

function schemaToZodRawShape(schema: unknown): ZodRawShape {
  if (!isRecord(schema)) return {};

  if (isRecord(schema.properties)) {
    const requiredSet = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((r): r is string => typeof r === "string")
        : [],
    );

    const shape: ZodRawShape = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      let propSchema = schemaToZod(value);
      if (!requiredSet.has(key)) propSchema = propSchema.optional();
      shape[key] = propSchema;
    }
    return shape;
  }

  // Already in raw-shape-like form: { field: z.string() } or { field: jsonSchema }
  const keys = Object.keys(schema);
  const reserved = new Set(["$id", "$schema", "type", "description", "title", "additionalProperties", "required", "properties"]);
  const shape: ZodRawShape = {};
  for (const key of keys) {
    if (reserved.has(key)) continue;
    const value = schema[key];
    if (value === undefined) continue;
    shape[key] = isZodType(value) ? value : schemaToZod(value);
  }
  return shape;
}

function resolveToolSet(contextTools?: readonly GsdToolDef[]): readonly GsdToolDef[] {
  const merged = new Map<string, GsdToolDef>();

  for (const tool of contextTools ?? []) {
    merged.set(tool.name, tool);
  }
  for (const tool of getGsdTools()) {
    if (!merged.has(tool.name)) merged.set(tool.name, tool);
  }

  return Array.from(merged.values());
}

export async function createMcpServerFromRegistry(contextTools?: readonly GsdToolDef[]) {
  const { createSdkMcpServer, tool } = await import("@anthropic-ai/claude-agent-sdk");
  const gsdTools = resolveToolSet(contextTools);

  if (gsdTools.length === 0) return undefined;

  return createSdkMcpServer({
    name: "gsd-tools",
    version: "1.0.0",
    tools: gsdTools.map((t) =>
      tool(
        t.name,
        t.description,
        schemaToZodRawShape(t.schema),
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
