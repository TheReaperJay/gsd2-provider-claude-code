```
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗     ██████╗ ██████╗ ██████╗ ███████╗    ██╗  ██╗     ██████╗ ███████╗██████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝    ╚██╗██╔╝    ██╔════╝ ██╔════╝██╔══██╗
██║     ██║     ███████║██║   ██║██║  ██║█████╗      ██║     ██║   ██║██║  ██║█████╗       ╚███╔╝     ██║  ███╗███████╗██║  ██║
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝      ██║     ██║   ██║██║  ██║██╔══╝       ██╔██╗     ██║   ██║╚════██║██║  ██║
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗    ╚██████╗╚██████╔╝██████╔╝███████╗    ██╔╝ ██╗    ╚██████╔╝███████║██████╔╝
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝    ╚═╝  ╚═╝     ╚═════╝ ╚══════╝╚═════╝

              ██╗ █████╗ ██╗   ██╗    ████████╗██╗  ██╗███████╗    ██████╗ ███████╗ █████╗ ██████╗ ███████╗██████╗
              ██║██╔══██╗╚██╗ ██╔╝    ╚══██╔══╝██║  ██║██╔════╝    ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗
              ██║███████║ ╚████╔╝        ██║   ███████║█████╗      ██████╔╝█████╗  ███████║██████╔╝█████╗  ██████╔╝
         ██   ██║██╔══██║  ╚██╔╝         ██║   ██╔══██║██╔══╝      ██╔══██╗██╔══╝  ██╔══██║██╔═══╝ ██╔══╝  ██╔══██╗
         ╚█████╔╝██║  ██║   ██║          ██║   ██║  ██║███████╗    ██║  ██║███████╗██║  ██║██║     ███████╗██║  ██║
          ╚════╝ ╚═╝  ╚═╝   ╚═╝          ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝

                    ┬ ┬┌─┐┌┬┐┌─┐┬ ┬  ┌─┐┬ ┬┌┬┐  ┌─┐┌─┐┬─┐  ┌┬┐┬ ┬┌─┐┌┬┐  ┌─┐┬ ┬┬┌┐┌┌─┐
                    │││├─┤ │ │  ├─┤  │ ││ │ │   ├┤ │ │├┬┘   │ ├─┤├─┤ │   └─┐││││││││ ┬
                    └┴┘┴ ┴ ┴ └─┘┴ ┴  └─┘└─┘ ┴   └  └─┘┴└─   ┴ ┴ ┴┴ ┴ ┴   └─┘└┴┘┴┘└┘└─┘
```

<div align="center">

<a href="https://github.com/TheReaperJay"><img src="https://img.shields.io/badge/GitHub-TheReaperJay-181717?style=for-the-badge&logo=github" alt="GitHub"></a>
<a href="https://discord.gg/realjaybrew"><img src="https://img.shields.io/badge/Discord-realjaybrew-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
<a href="https://t.me/realjaybrew"><img src="https://img.shields.io/badge/Telegram-realjaybrew-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
<a href="https://github.com/TheReaperJay/gsd2-provider-claude-code/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"></a>

</div>

---

# Claude Code CLI for GSD2

Native Claude integration for [GSD](https://github.com/gsd-build/gsd-2). Run Opus 4.6, Sonnet 4.6, and Haiku 4.5 through your existing Claude Code CLI subscription — no API keys required.

Built on [@thereaperjay/gsd-provider-api](https://github.com/TheReaperJay/gsd-provider-api), an extension framework for GSD provider plugins.

- **Full streaming integration** — real-time text, thinking, and tool-use events streamed through GSD's event system
- **Automatic onboarding** — detects your Claude CLI auth on first launch, prompts you to set a default model, persists your choice
- **Extended thinking** — off, minimal, low, medium, and high reasoning levels for Opus and Sonnet
- **Tool bridge** — GSD's tool registry is exposed to Claude via MCP, so Claude can use GSD-native tools (file ops, search, bash) without separate configuration
- **Activity logging** — SDK messages are translated into GSD's JSONL activity format for session forensics and cost tracking
- **Lifecycle hooks** — install-time CLI verification, session-start auth checks, and plugin state management all handled by the framework
- **Zero credential handling** — no API keys, no OAuth tokens, no stored secrets. All model calls route through your locally authenticated Claude CLI via the official [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

## Licensing and Authentication

This extension uses the official [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) (`@anthropic-ai/claude-agent-sdk`) to execute model queries. It operates entirely through your locally authenticated Claude CLI session.

**This plugin does NOT:**

- Scrape, intercept, or re-use OAuth tokens or API keys
- Spoof logins, sessions, or authentication credentials
- Access or store your Anthropic account credentials
- Make direct API calls to Anthropic's API endpoints
- Bypass any subscription or rate-limiting mechanisms

**This plugin DOES:**

- Bridge GSD/Pi's lifecycle, message format, and tool system to the Claude CLI
- Use `claude auth status` to verify your CLI is authenticated (read-only check)
- Call `query()` from the Claude Agent SDK, which routes through your local Claude CLI
- Respect your subscription tier's rate limits and model access

Your Claude subscription and its terms of service govern all model usage. This plugin is a transport bridge, not an API client.

## Models

| Model | ID | Context | Reasoning | Max Output |
|---|---|---|---|---|
| Opus 4.6 | `claude-code:opus-4-6` | 1,000,000 | Yes | 32,000 |
| Sonnet 4.6 | `claude-code:sonnet-4-6` | 200,000 | Yes | 16,000 |
| Haiku 4.5 | `claude-code:haiku-4-5` | 200,000 | No | 8,096 |

Switch models with `/model` in a GSD session.

## Thinking Levels

Opus and Sonnet support extended thinking via the `/thinking` command:

```
/thinking off       No reasoning
/thinking minimal   Very brief (~1k tokens)
/thinking low       Light reasoning (~2k tokens)
/thinking medium    Moderate reasoning (~8k tokens)
/thinking high      Deep reasoning (~16k tokens)
```

Maximum supported level is `high`. The `xhigh` level is not available due to a GSD core limitation that may be patched in a future release.

## Onboarding

Onboarding happens automatically on first session start after installation.

1. The plugin checks that the Claude CLI is installed (`claude --version`)
2. The plugin verifies authentication (`claude auth status --json`)
3. If authenticated, you're prompted to set Claude Code as your default provider and pick a model
4. Your choice is persisted to GSD settings

**If onboarding fails**, run `claude auth login` in your terminal and restart GSD. The onboarding check will re-run on the next session start.

## Requirements

- GSD 2.44.0+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Active Claude subscription (Pro, Team, or Enterprise)

## Installation

### Via GitHub (recommended)

```bash
gsd install https://github.com/TheReaperJay/gsd2-provider-claude-code
```

To remove:

```bash
gsd remove https://github.com/TheReaperJay/gsd2-provider-claude-code
```

### Local / Manual

Clone the repo, install dependencies, then point GSD to the local path:

```bash
git clone https://github.com/TheReaperJay/gsd2-provider-claude-code.git
cd gsd2-provider-claude-code
npm install
```

Then install locally in GSD:

```bash
gsd install ./path/to/gsd2-provider-claude-code
```

### Troubleshooting

If installation fails or the extension doesn't load, remove and reinstall:

```bash
gsd remove https://github.com/TheReaperJay/gsd2-provider-claude-code
gsd install https://github.com/TheReaperJay/gsd2-provider-claude-code
```

This clears the cached clone and triggers a fresh `npm install` and lifecycle hooks, which will attempt to verify and repair the installation. The most common cause of install failure is a transient `npm install` error (network timeout, registry unavailability) that leaves the extension in a partially installed state.

### Why not npmjs?

This package is distributed via GitHub Packages, not npmjs.org. The npm public registry has a persistent problem with supply chain attacks and offers inadequate privacy controls for scoped packages. GitHub Packages ties distribution to the source repo, providing verifiable provenance.

## Links

- GitHub: [TheReaperJay](https://github.com/TheReaperJay)
- Discord: `realjaybrew`
- Telegram: `realjaybrew`
- GSD core: [gsd-build/gsd-2](https://github.com/gsd-build/gsd-2)
- Provider API: [TheReaperJay/gsd-provider-api](https://github.com/TheReaperJay/gsd-provider-api)
