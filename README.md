# AgentCrew
> **local Slack for your Agents.**

AgentCrew is a desktop-class, privacy-first workspace where multiple AI agents collaborate to build wonderful things directly on your local machine. No code leaves your device, and no context is lost.

## Core Philosophy

- **Human as Manager** — You dispatch every task. Agents never talk to each other autonomously. You stay in control.
- **Bring Your Own Agents** — Works with any CLI tool (Claude Code, Codex, Gemini CLI, or your own) and any OpenAI-compatible API. No vendor lock-in.
- **Local-First** — Everything runs on your machine. SQLite database, local PTY terminals, local file storage. No cloud dependency.
- **Slack-Like UX** — Channels, DMs, @mentions, real-time streaming. If you know Slack, you know AgentCrew.

## Features

- **CLI + API Agents** — Run CLI tools in live terminals, or call any OpenAI-compatible API with streaming
- **Channels & DMs** — @mention agents in shared channels or chat 1-on-1; each channel runs isolated sessions
- **Image Support** — Paste or attach images; sent as Vision API content (API agents) or file paths (CLI agents)
- **Smart Output** — xterm-headless extracts clean screen content from TUI tools; optional LLM summarizer refines it further
- **Resizable Terminals** — Per-channel terminal panels with tabs, drag-to-resize, and persistent xterm state
- **Memory** — Agent-private and channel-shared memory capsules with automatic recall and retain

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
npm run dist      # Package installer for current platform
npm run dist:mac  # Package macOS (dmg + zip, x64 + arm64)
npm run dist:win  # Package Windows (nsis, x64)
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

## Image Attachments

You can send images to agents by:
- Clicking the **paperclip button** in the chat input to select image files
- **Pasting** from clipboard (Ctrl+V / Cmd+V) — e.g. screenshots

Images are saved to `~/.agentcrew/uploads/` and forwarded differently depending on the agent type:

| Agent Type | How images are sent |
|------------|-------------------|
| **API Agent** | OpenAI Vision format — `image_url` content parts with base64 data URLs |
| **CLI Agent** | Local file paths appended to the prompt text (e.g. `analyze this /path/to/image.png`) |

CLI tools like Claude Code and Gemini CLI can read image files from the provided paths. Images are displayed as thumbnails in the chat message bubble.

## Memory

AgentCrew uses [Memvid](https://memvid.com) `.mv2` files for agent memory — each agent and channel has its own capsule with automatic recall and retain.

By default, memory search uses **lexical mode** (BM25 full-text search). To enable **semantic search** for better recall quality, download the embedding model and place it in the models directory:

1. Download the model: [nomic-embed-text-v1.5](https://drive.google.com/file/d/1ZQXpdvSJk6ouHQkdhNJ9UbfSGwvaQ-Y3/view?usp=drive_link)
2. Extract and place in `~/.agentcrew/models/`

The directory structure should look like:
```
~/.agentcrew/models/
  └── models--nomic-ai--nomic-embed-text-v1.5/
      ├── blobs/
      ├── refs/
      └── snapshots/
```

AgentCrew detects the model automatically on startup. No API key or internet connection is needed — the model runs entirely on your machine.

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
| `messages` | Chat messages with sender type, @mentions, and image attachments |
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
You type: @coder implement login [+ optional image attachments]
    ↓
message-router strips @mentions → finds Coder agent
    ↓
Memory recall: query agent-private + channel-shared capsules → inject context
    ↓
CLI Agent: chunked write to interactive PTY (text + image paths) → detect turn → extract screen → summarize → post
API Agent: HTTP POST with multimodal content (text + image base64) → stream SSE chunks → post full response
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
| Memory | @memvid/sdk 2 (.mv2 format) |
| Build | electron-vite 5, Vite 6, electron-builder 26 |
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
