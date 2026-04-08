# AgentCrew

Lightweight local multi-agent collaboration desktop tool. Manage multiple AI agents in one window — assign tasks via `@agent` in shared channels, watch CLI agents execute in real-time terminals, and let API agents stream responses inline.

**Human as Manager.** Only you dispatch tasks. No autonomous agent-to-agent chains.

## Features

- **Dual Agent Types** — CLI agents (Claude Code, Codex, Gemini CLI, opencode) with live terminal view, and API agents (any OpenAI-compatible endpoint) with streaming responses
- **Interactive CLI Sessions** — CLI agents run in persistent interactive mode (not one-shot `--print`), supporting multi-turn conversation within a single terminal session
- **Channels** — Shared message spaces where you `@mention` agents to assign work; DM channels auto-created per agent
- **Multi-Agent Terminals** — Each CLI agent gets its own terminal tab; terminal auto-switches when you `@mention` an agent
- **Smart Output Extraction** — Uses xterm-headless to extract the final visible screen content from CLI tools, correctly handling TUI rendering, ANSI cursor movement, and screen redraws
- **Summarizer (Optional)** — Configure an LLM to summarize CLI agent output before displaying in chat; falls back to last 20 lines if not configured
- **Thinking Indicators** — Animated status verbs (Thinking, Musing, Pondering...) while agents are processing, including during summarization
- **Agent Icons** — Choose from 20 Lucide icons per agent, displayed in chat and sidebar
- **Memory** — Dual-capsule Memvid topology: agent-private and channel-shared memory with auto-recall before each task and auto-retain after each reply
- **Editable User Profile** — Customizable display name shown in chat messages

## Quick Start

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

## Commands

```bash
npm run dev       # Start dev server + Electron app
npm run build     # Production build
npm run preview   # Preview production build
npm run rebuild   # Rebuild native modules (node-pty, better-sqlite3)
```

## Summarizer Configuration

CLI agent output goes through a processing pipeline before appearing in chat:

1. **Raw PTY data** → xterm-headless extracts final visible screen content
2. **If Summarizer configured** → LLM summarizes the clean text into the agent's actual response
3. **If not configured** → Falls back to displaying the last 20 lines

To configure, go to **Settings → SUMMARIZER** and fill in:
- **API Endpoint** — Any OpenAI-compatible chat completions URL (e.g. `https://api.openai.com/v1/chat/completions`)
- **API Key** — Your API key
- **Model** — Model name (e.g. `gpt-4o-mini`)
- **System Prompt** — Pre-filled with a tuned default; expand to customize if needed

Use the **Clear** button to remove all Summarizer configuration and revert to truncation mode.

## CLI Agent Turn Detection

AgentCrew detects when a CLI agent's turn is complete using two signals:

1. **Primary: Prompt detection** — Monitors for the CLI tool's input prompt (`❯`, `>`, etc.), indicating it's ready for the next input
2. **Fallback: Silence timeout** — 10 seconds of no output triggers turn completion

The detection is persistent — if the CLI tool pauses for user confirmation (e.g. permission prompts), the confirmed output is posted to chat, and monitoring continues for the next turn. Duplicate outputs are automatically deduplicated.

## Architecture

```
src/
├── main/                         # Electron main process
│   ├── index.ts                  — Bootstrap: DB, PTY, Memory, IPC, Window
│   ├── ipc.ts                    — IPC handlers (context injection)
│   ├── pty-manager.ts            — CLI Agent PTY process pool (4MB replay buffer)
│   ├── message-router.ts         — @mention dispatch, turn detection, summarizer, memory
│   ├── api-client.ts             — OpenAI-compatible SSE streaming client
│   ├── cli-detector.ts           — Auto-detect installed CLI tools
│   ├── memory-service.ts         — Dual capsule recall/retain (Memvid shim)
│   └── database/
│       ├── schema.ts             — SQLite tables (agents, channels, messages, settings, ...)
│       ├── repository.ts         — Full CRUD for all entities
│       ├── db.ts                 — Database creation + WAL mode
│       └── seed.ts               — Default "all" channel
├── preload/
│   └── index.ts                  — contextBridge typed API
├── renderer/
│   └── src/
│       ├── App.tsx               — Shell + modal routing + stream handler
│       ├── store/app-store.ts    — Zustand state (all CRUD + UI)
│       ├── styles.css            — Slock theme (cream/gold/black/pink)
│       └── components/
│           ├── Sidebar/          — Channels, Agents, user profile + DM auto-create
│           ├── ChatView/         — Timeline, @mention input, multi-tab terminal panel
│           ├── Modals/           — Create/Edit Agent/Channel with icon picker
│           ├── Settings/         — Account + Summarizer tabs
│           ├── AgentIcon.tsx     — Lucide icon mapper (20 icons)
│           └── IconPicker.tsx    — Icon selection grid
└── shared/
    ├── types.ts                  — All domain interfaces
    └── ipc-channels.ts           — IPC channel constants
```

## Data Model

SQLite tables — no task-run state machines, no artifact versioning, no audit logs.

| Table | Purpose |
|-------|---------|
| `agents` | CLI and API agent configs, icon, memory capsule ID |
| `channels` | Named message spaces with shared memory capsule ID |
| `channel_members` | Agent-to-channel membership |
| `messages` | Chat messages with sender type and @mentions |
| `settings` | Key-value settings (Summarizer config, user preferences) |

## Agent Types

### CLI Agent

Runs a local command-line AI tool in a persistent interactive PTY terminal. You see the full execution in the embedded terminal panel; the channel gets a clean summarized response.

CLI sessions are pre-launched when you click an agent in the sidebar, so the first message is delivered without delay.

| Runtime | Tool |
|---------|------|
| `claude-code` | Anthropic Claude Code CLI |
| `codex` | OpenAI Codex CLI |
| `gemini-cli` | Google Gemini CLI |
| `opencode` | opencode CLI |
| `custom-cli` | Any shell command |

### API Agent

Calls any OpenAI-compatible chat completions endpoint with SSE streaming. Works with OpenAI, Anthropic (via proxy), local LLMs (Ollama, vLLM), and multimodal models.

Configure: endpoint URL + API key + model name + optional system prompt.

## Message Routing

```
You type: @coder implement login
    ↓
message-router strips @mentions → finds Coder agent
    ↓
Memory recall: query agent-private + channel-shared capsules → inject context
    ↓
CLI Agent: write to interactive PTY → detect turn completion → extract screen → summarize → post
API Agent: HTTP POST to endpoint → stream SSE chunks → post full response
    ↓
Memory retain: write to both capsules
```

Agent replies containing `@other-agent` are displayed as plain text — no re-routing. You are always the dispatcher.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 35 |
| Frontend | React 19, TypeScript 5, Zustand 5 |
| Terminal | xterm.js 5, @xterm/headless 5, node-pty 1 |
| Database | better-sqlite3 12 |
| Memory | Memvid JSON shim (upgradeable to @memvid/sdk) |
| Build | electron-vite 5, Vite 6 |
| Icons | lucide-react |

## Design

Visual language adapted from [Slock](https://slock.ai/):

- Warm cream background `#f4efe6`
- Gold sidebar `#e8c840`
- Black borders `#1a1a1a`
- Pink accent `#e8196c`
- Monospace typography (SF Mono / Menlo)

## License

Private.
