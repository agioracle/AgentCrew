# AgentCrew

Lightweight local multi-agent collaboration desktop tool. Manage multiple AI agents in one window — assign tasks via `@agent` in shared channels, watch CLI agents execute in real-time terminals, and let API agents stream responses inline.

**Human as Manager.** Only you dispatch tasks. No autonomous agent-to-agent chains.

## Features

- **Dual Agent Types** — CLI agents (Claude Code, Codex, Gemini CLI, opencode) with live terminal view, and API agents (any OpenAI-compatible endpoint) with streaming responses
- **Channels** — Shared message spaces where you `@mention` agents to assign work; DM channels auto-created per agent
- **MCP & Skills** — Global MCP Server and Skills configuration, shared by default with per-agent authorization
- **Memory** — Dual-capsule Memvid topology: agent-private and channel-shared memory with auto-recall before each task and auto-retain after each reply
- **Concise Output** — Agent replies in channels are summaries (file path + change description), full output available in the terminal panel

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

## Architecture

```
src/
├── main/                         # Electron main process
│   ├── index.ts                  — Bootstrap: DB, PTY, Memory, IPC, Window
│   ├── ipc.ts                    — 30+ IPC handlers (context injection)
│   ├── pty-manager.ts            — CLI Agent PTY process pool (4MB replay buffer)
│   ├── message-router.ts         — @mention dispatch + memory recall/retain
│   ├── api-client.ts             — OpenAI-compatible SSE streaming client
│   ├── memory-service.ts         — Dual capsule recall/retain (Memvid shim)
│   └── database/
│       ├── schema.ts             — 6 SQLite tables
│       ├── repository.ts         — Full CRUD for all entities
│       ├── db.ts                 — Database creation + WAL mode
│       └── seed.ts               — Default "all" channel
├── preload/
│   └── index.ts                  — contextBridge typed API
├── renderer/
│   └── src/
│       ├── App.tsx               — Shell + modal routing
│       ├── store/app-store.ts    — Zustand state (all CRUD + UI)
│       ├── styles.css            — Slock theme (cream/gold/black/pink)
│       └── components/
│           ├── Sidebar/          — Channels, Agents, Humans + DM auto-create
│           ├── ChatView/         — Timeline, @mention input, terminal panel
│           ├── Modals/           — Create Agent/Channel, Members
│           └── Settings/         — Account, MCP, Skills tabs
└── shared/
    ├── types.ts                  — All domain interfaces
    └── ipc-channels.ts           — IPC channel constants
```

## Data Model

6 SQLite tables — no task-run state machines, no artifact versioning, no audit logs.

| Table | Purpose |
|-------|---------|
| `agents` | CLI and API agent configs, status, memory capsule ID |
| `channels` | Named message spaces with shared memory capsule ID |
| `channel_members` | Agent-to-channel membership |
| `messages` | Chat messages with sender type and @mentions |
| `mcp_servers` | MCP Server configs with per-agent allowed list |
| `skills` | Skill configs with per-agent allowed list |

## Agent Types

### CLI Agent

Runs a local command-line AI tool in a PTY terminal. You see the full execution in the embedded terminal panel; the channel gets a concise summary.

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
message-router parses @mention → finds Coder agent
    ↓
Memory recall: query agent-private + channel-shared capsules → inject Top 3
    ↓
CLI Agent: spawn PTY with enriched prompt → stream to terminal + post summary
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
| Terminal | xterm.js 5, node-pty 1 |
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
