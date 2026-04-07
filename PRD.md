# AgentCrew 产品需求文档 (PRD)

**产品名称:** AgentCrew
**文档版本:** v1.2
**产品定位:** 轻量级本地多 Agent 协作桌面工具
**产品目标:** 让个人开发者在一个窗口内管理多个独立运行的 AI Agent，通过 Channel 实现人（作为 Manager）与 Agent 之间的自然语言协作。

**v1.1 → v1.2 变更摘要：**
1. **[核心] Agent 输出简洁化** — Agent 在 Channel 中的回复消息必须保持简洁摘要形式，不输出完整文件内容；文件操作仅展示文件路径和修改位置，完整内容通过终端面板查看

**v1.0 → v1.1 变更摘要：**
1. **[核心] 人即 Manager** — 去掉 Agent 间自主互唤机制，只有人类可以通过 @agent 分配任务
2. **[核心] MCP & Skills** — 新增全局 MCP Server 和 Skills 配置，默认所有 Agent 共享，支持按 Agent 粒度授权
3. **[核心] Agent 双类型** — Agent 分为 CLI 类型（PTY 终端）和 API 类型（HTTP 调用），支持 Claude Code、Codex、Gemini CLI、opencode 等 CLI 工具，也支持配置远端/本地 LLM 或多模态模型
4. **[核心] Memory** — 基于 Memvid Node.js SDK 实现 Agent 私有记忆 + Channel 共享记忆双胶囊拓扑

---

## 1. 设计渊源与简化策略

AgentCrew 从三个参考产品中各取一个核心机制，去掉所有不必要的复杂度：

| 参考产品 | 借鉴机制 | 去掉的复杂度 |
|---------|---------|-------------|
| **HiClaw** | Channel 通信模型 — 人与 Agent 在同一 Channel 中对话，所有参与者共享消息流 | 去掉 Matrix 协议服务端、Docker 容器编排、MinIO 文件系统、Higress 网关、Manager-Workers 层级架构（改为人即 Manager） |
| **Constellagent** | 并行 Agent 运行机制 — 每个 Agent 独立 PTY 进程、独立工作目录、并行运行 | 去掉 git worktree 管理、Monaco 编辑器、文件树浏览、自动化调度 |
| **SlockClaw** | 数据模型骨架 + Memvid 记忆集成模式 | 去掉 Coordinator 拓扑、task_run/execution_session/artifact 三层执行模型、五层安全纵深、命令白名单、Secret Broker |

**核心简化原则：**
- 人即 Manager：不存在 Agent 自主调度 Agent 的复杂链路
- 只保留"人能 @Agent 分配任务、Agent 能独立运行、多个 Agent 可并行"三个核心能力
- 通过 MCP & Skills 赋予 Agent 扩展能力，而非内建复杂功能

---

## 2. 核心概念

### 2.1 人即 Manager

AgentCrew 中**人类用户是唯一的 Manager**。与 HiClaw 的 Manager Agent + Worker Agent 层级架构不同，AgentCrew 不设 Agent 层级角色：

- **只有人类可以通过 `@agent` 向 Agent 分配任务**
- Agent 不能自主 @其他 Agent 发起任务（避免不可控的 Agent 链式调用）
- Agent 回复统一返回给人类所在的 Channel，由人类决定下一步操作
- 人类可以在任意 Channel 中同时与多个 Agent 协作，但调度权始终在人手中

这确保了最简单的控制面：人类发出指令 → Agent 执行并回报 → 人类决策下一步。

### 2.2 Agent

一个独立运行的 AI 助手实例。分为两种类型：

#### CLI Agent（命令行工具类型）

基于本地命令行 AI 工具创建，通过 PTY 终端交互，用户可以在 UI 中实时查看执行过程。

**支持的 Runtime：**
| Runtime | 说明 |
|---------|------|
| `claude-code` | Anthropic Claude Code CLI |
| `codex` | OpenAI Codex CLI |
| `gemini-cli` | Google Gemini CLI |
| `opencode` | opencode CLI |
| `custom-cli` | 用户自定义命令行工具 |

**技术实现：** 基于 xterm.js（前端终端渲染）+ node-pty（后端 PTY 进程管理），参考 Constellagent 的 `pty-manager.ts` 模式。

#### API Agent（API 调用类型）

通过 HTTP API 调用远端或本地部署的模型，支持 LLM 对话模型和多模态模型（图片、视频等）。

**必要配置：**
| 字段 | 说明 |
|------|------|
| apiEndpoint | API 端点 URL（如 `https://api.openai.com/v1`、`http://localhost:11434/v1`） |
| apiKey | API 认证密钥 |
| model | 模型标识（如 `gpt-4o`、`llama3`、`stable-diffusion-xl`） |
| systemPrompt | System Prompt，定义 Agent 角色和行为 |

**技术实现：** 通过 Electron Main Process 中的 HTTP Client 发起 API 调用，支持 OpenAI 兼容接口格式。无 PTY 进程，回复直接写入 Channel 消息流。

#### Agent 通用属性

| 字段 | 必填 | 说明 |
|------|------|------|
| name | * | Agent 名称，全局唯一 |
| description | | 简短描述 |
| type | * | `cli` 或 `api` |
| memoryCapsuleId | 自动 | 自动分配的 Memvid 私有记忆胶囊 ID |

**CLI Agent 额外属性：**
| 字段 | 必填 | 说明 |
|------|------|------|
| runtime | * | CLI 工具类型 |
| model | | AI 模型（取决于 runtime） |
| workingDirectory | * | 工作目录 |
| envVars | | 注入 PTY 的环境变量 |

**API Agent 额外属性：**
| 字段 | 必填 | 说明 |
|------|------|------|
| apiEndpoint | * | API 端点 URL |
| apiKey | * | API 密钥（加密存储） |
| model | * | 模型标识 |
| systemPrompt | | System Prompt |

**生命周期：** `idle` → `running` → `idle` / `error`
- CLI Agent：idle 无 PTY 进程 → running PTY 活跃 → idle/error PTY 退出
- API Agent：idle 无活跃请求 → running API 调用中 → idle 调用完成 / error 调用失败

### 2.3 Channel

一个消息空间，人类用户与一个或多个 Agent 共同参与。

**必要属性：**
| 字段 | 必填 | 说明 |
|------|------|------|
| name | * | Channel 名称 |
| description | | 简短描述 |
| members | | 参与的 Agent 列表（人类默认参与所有 Channel） |
| memoryCapsuleId | 自动 | 自动分配的 Memvid 共享记忆胶囊 ID |

**Channel 类型（隐式，根据成员数自动区分）：**
- **Agent DM**：只有一个 Agent — 人与单个 Agent 的一对一对话
- **Group Channel**：多个 Agent — 人与多个 Agent 的群组协作

### 2.4 MCP Server & Skills

全局共享的扩展能力，通过配置赋予 Agent 访问外部工具和技能的能力。

#### MCP Server

MCP (Model Context Protocol) Server 为 Agent 提供外部工具能力（如 GitHub 操作、数据库查询、文件搜索等）。

**MCP Server 配置属性：**
| 字段 | 必填 | 说明 |
|------|------|------|
| name | * | MCP Server 名称，如 `github`、`filesystem` |
| command | * | 启动命令，如 `npx @modelcontextprotocol/server-github` |
| args | | 命令参数列表 |
| envVars | | 环境变量（如 `GITHUB_TOKEN`） |
| allowedAgents | | 允许使用此 MCP 的 Agent 列表；为空表示所有 Agent 可用 |

#### Skills

Skills 为 Agent 提供预定义的能力模板（如代码审查、文档生成等），本质是 System Prompt 片段 + 工具配置的组合。

**Skills 配置属性：**
| 字段 | 必填 | 说明 |
|------|------|------|
| name | * | Skill 名称 |
| description | | Skill 描述 |
| source | * | Skill 来源路径或 URL |
| allowedAgents | | 允许使用此 Skill 的 Agent 列表；为空表示所有 Agent 可用 |

**共享与授权机制：**
- **默认共享**：新添加的 MCP Server / Skill 默认对所有 Agent 可用
- **按 Agent 授权**：可在全局配置中指定 `allowedAgents` 列表限制访问范围
- **Agent 视角查看**：在 Agent 详情/编辑页中可以查看该 Agent 能使用的 MCP Server 和 Skills 列表，也可以快捷添加新的授权

### 2.5 Memory（记忆）

基于 Memvid Node.js SDK（`@memvid/sdk`）实现，参考 SlockClaw 的 `memvidService.ts` 双胶囊拓扑设计。

#### 双胶囊拓扑

```
Agent 私有记忆                     Channel 共享记忆
┌─────────────────┐               ┌─────────────────┐
│ agent-{id}.mv2  │               │ channel-{id}.mv2│
│                 │               │                 │
│ 该 Agent 的     │               │ Channel 内所有  │
│ 个人经验和知识  │               │ 参与者共享的    │
│                 │               │ 对话知识和决策  │
└─────────────────┘               └─────────────────┘
```

- **Agent 私有记忆（`agent-{id}.mv2`）**：每个 Agent 一个 Capsule，存储该 Agent 的个人经验。仅该 Agent 自身可访问。Agent 创建时自动创建，删除时可选择保留或移除。
- **Channel 共享记忆（`channel-{id}.mv2`）**：每个 Channel 一个 Capsule，存储该 Channel 中的共享知识。Channel 内所有 Agent 成员可访问。Channel 创建时自动创建。

#### 记忆写入时机

| 时机 | 写入目标 | 内容 |
|------|---------|------|
| Agent 完成一次任务回复 | Agent 私有 Capsule | Agent 的执行经验摘要 |
| Agent 完成一次任务回复 | Channel 共享 Capsule | 任务结果摘要（scope=shared） |

#### 记忆召回时机

当人类 @Agent 发起新任务时，系统自动：
1. 从 Agent 私有 Capsule 检索相关记忆（Top 3）
2. 从当前 Channel 共享 Capsule 检索相关记忆（Top 3）
3. 合并去重后注入 Agent 上下文

#### 实现要点（参考 SlockClaw memvidService.ts）

- 使用 `@memvid/sdk` 的 `create()` / `open()` 管理 `.mv2` 文件
- 使用 `put()` 写入记忆帧，`find()` 进行 lexical 检索
- SDK 加载失败时降级为 JSON shim（本地 JSON 文件模拟 Capsule）
- 记忆文件存储在 `~/.agentcrew/memvid/capsules/` 下

### 2.6 Message

Channel 中的一条消息。

**必要属性：**
| 字段 | 说明 |
|------|------|
| channelId | 所属 Channel |
| senderType | `human` 或 `agent` |
| senderId | Agent ID（人类发送时为 null） |
| content | 消息正文 |
| mentions | @提及的 Agent ID 列表 |
| createdAt | 时间戳 |

---

## 3. 交互模型

### 3.1 人 @Agent 分配任务（核心交互）

人类是唯一的任务发起者。在任何 Channel 中，人类通过 `@agent-name` 语法向指定 Agent 分配任务：

```
人类: @coder 请实现用户登录功能
       ↓
系统解析 @mention → 找到 Coder Agent
       ↓
[CLI Agent] 启动/复用 PTY → 写入 stdin → 流式输出到 Channel
[API Agent] 发起 API 调用 → 流式回复写入 Channel
       ↓
coder: 好的，我来实现登录功能...（实时流式输出）
       ↓
人类看到结果，决定下一步
人类: @reviewer 请审查 coder 刚才的实现
```

**关键约束：Agent 不能自主 @其他 Agent。** 如果 Agent 回复中包含 `@other-agent` 文本，系统将其视为普通文本显示，不触发路由。任务调度权始终在人类手中。

### 3.2 人与单个 Agent 对话（Agent DM）

在只有一个 Agent 成员的 Channel 中，人类发送的消息默认发给该 Agent，无需 @mention。

### 3.3 Agent 并行运行

参考 Constellagent 的设计：
- 多个 CLI Agent 各自拥有独立的 PTY 进程，互不阻塞
- 多个 API Agent 各自独立发起 HTTP 请求，互不阻塞
- 用户可在不同 Channel 间自由切换，实时查看各 Agent 的输出
- 用户可随时中止任意 Agent 的运行（CLI Agent 杀 PTY 进程，API Agent 取消 HTTP 请求）

### 3.4 CLI Agent 终端查看

对于 CLI 类型的 Agent，用户可以点击 Channel 顶栏的终端图标，打开一个嵌入式终端面板（xterm.js），实时查看 Agent 的 PTY 原始输出（包括 ANSI 颜色、进度条等），体验与直接使用命令行工具一致。

### 3.5 Agent 输出简洁化

Channel 消息流是人类的主要阅读界面，**Agent 在 Channel 中的回复必须保持简洁摘要形式**，避免信息过载。完整的执行细节通过终端面板（CLI Agent）或展开详情查看。

#### 输出规则

| 场景 | Channel 消息中展示 | 不展示（通过终端面板查看） |
|------|-------------------|------------------------|
| 创建文件 | `Created src/auth/login.ts` | 文件完整内容 |
| 修改文件 | `Modified src/auth/login.ts:42-58 — added password validation` | 修改前后的完整代码 |
| 删除文件 | `Deleted src/auth/legacy-login.ts` | — |
| 执行命令 | `Ran npm test — 12 passed, 0 failed` | 完整命令输出 |
| 代码审查 | 逐条审查意见，每条标明文件和行号 | 被审查代码的完整内容 |
| 错误/异常 | 错误摘要 + 关键错误信息 | 完整 stack trace |

#### 示例对比

**好的输出（简洁摘要）：**
```
Coder  agent  10:09 AM
Done. Changes:
• Created src/auth/login.ts — login handler with JWT token generation
• Modified src/routes/index.ts:8 — added /login route
• Modified package.json — added jsonwebtoken dependency
• Ran npm test — 15 passed, 0 failed
```

**差的输出（信息过载，应避免）：**
```
Coder  agent  10:09 AM
I created src/auth/login.ts with the following content:
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
export async function loginHandler(req: Request, res: Response) {
  const { username, password } = req.body;
  // ... 50 行完整代码 ...
}
```

#### 实现方式

- **CLI Agent**：Agent 的 PTY 原始输出（包含完整代码、命令输出等）全部写入终端面板；message-service 从 PTY 输出中提取结构化摘要写入 Channel 消息流。CLI 工具（如 Claude Code）自身通常已有结构化输出格式，优先解析该格式。
- **API Agent**：在 System Prompt 中注入输出格式约束，要求 Agent 回复遵循简洁摘要规范。对于文件操作，要求仅描述操作类型、文件路径和修改位置，不输出完整文件内容。

---

## 4. 数据模型（SQLite）

```sql
-- Agent 定义
CREATE TABLE agents (
  id                TEXT PRIMARY KEY,
  name              TEXT UNIQUE NOT NULL,
  description       TEXT,
  type              TEXT NOT NULL,                -- 'cli' | 'api'
  -- CLI Agent 字段
  runtime           TEXT,                         -- 'claude-code' | 'codex' | 'gemini-cli' | 'opencode' | 'custom-cli'
  model             TEXT,
  working_dir       TEXT,
  env_vars          TEXT NOT NULL DEFAULT '{}',   -- JSON
  -- API Agent 字段
  api_endpoint      TEXT,
  api_key           TEXT,                         -- 加密存储
  system_prompt     TEXT,
  -- 通用字段
  memory_capsule_id TEXT,                         -- 自动生成：'agent-{id}'
  status            TEXT NOT NULL DEFAULT 'idle', -- 'idle' | 'running' | 'error'
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- Channel 定义
CREATE TABLE channels (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  memory_capsule_id TEXT,                         -- 自动生成：'channel-{id}'
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- Channel 成员关系
CREATE TABLE channel_members (
  channel_id        TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  joined_at         TEXT NOT NULL,
  PRIMARY KEY (channel_id, agent_id),
  FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
);

-- 消息
CREATE TABLE messages (
  id                TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL,
  sender_type       TEXT NOT NULL,                -- 'human' | 'agent'
  sender_id         TEXT,                         -- Agent ID, NULL for human
  content           TEXT NOT NULL,
  mentions          TEXT NOT NULL DEFAULT '[]',   -- JSON array of Agent IDs
  created_at        TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE
);

-- MCP Server 配置
CREATE TABLE mcp_servers (
  id                TEXT PRIMARY KEY,
  name              TEXT UNIQUE NOT NULL,
  command           TEXT NOT NULL,
  args              TEXT NOT NULL DEFAULT '[]',   -- JSON array
  env_vars          TEXT NOT NULL DEFAULT '{}',   -- JSON
  allowed_agents    TEXT NOT NULL DEFAULT '[]',   -- JSON array of Agent IDs, empty = all
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- Skills 配置
CREATE TABLE skills (
  id                TEXT PRIMARY KEY,
  name              TEXT UNIQUE NOT NULL,
  description       TEXT,
  source            TEXT NOT NULL,                -- 文件路径或 URL
  allowed_agents    TEXT NOT NULL DEFAULT '[]',   -- JSON array of Agent IDs, empty = all
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_messages_channel ON messages (channel_id, created_at);
```

**共 6 张表**：agents、channels、channel_members、messages、mcp_servers、skills。

**与 SlockClaw 8 张表对比 — 去掉了：** task_runs、execution_sessions、artifacts、artifact_versions、audit_logs；**新增了：** mcp_servers、skills。

---

## 5. UI 设计（参考 Slock 设计图）

### 5.1 设计原则

- **极简风格**：采用 Slock 视觉风格 — 暖米色背景 `#FFF8E7`、黄色侧边栏 `#FFD700`、黑色粗边框、粉色 `#FF69B4` 强调按钮
- **二栏布局**：左侧边栏 + 右侧主内容区
- **只展示用户需要做出决策的信息**：不展示 PTY PID、进程退出码、Capsule ID 等技术细节
- **使用 impeccable skills 进行设计优化**：在开发过程中使用 impeccable 系列 skills 对 UI 进行布局、动效、色彩、排版等方面的优化

### 5.2 整体布局

```
┌──────────────────────────────────────────────────────────────┐
│  [Machine Status Bar]                          [Reconnect]   │
├───────────┬──────────────────────────────────────────────────┤
│ AgentCrew │  # channel-name — description     [▣] [⚙] [👥]  │
│ ▼         │  ┌──────┐ ┌────────┐                             │
│───────────│  │ CHAT │ │ AGENTS │                             │
│ 📺  📱   │  └──────┘ └────────┘                             │
│───────────│                                                  │
│           │  ┌──────────────────────────────────────────┐    │
│ CHANNELS  │  │ wallezen  owner  Yesterday 10:08 AM      │    │
│  # all    │  │ @coder 请实现登录功能                      │    │
│  # dev    │  │                                          │    │
│           │  │ Coder  agent  Yesterday 10:09 AM         │    │
│ AGENTS    │  │ 好的，我来实现登录功能...                   │    │
│  ◉ Coder  │  │                                          │    │
│  ○ Review │  └──────────────────────────────────────────┘    │
│           │                                                  │
│ HUMANS    │  ┌──────────────────────────────────────────┐    │
│  👤 you   │  │ Message #channel-name           [Send ▷] │    │
│           │  └──────────────────────────────────────────┘    │
├───────────┼──────────────────────────────────────────────────┤
│ 👤 user ⚙│                                                  │
└───────────┴──────────────────────────────────────────────────┘
```

### 5.3 侧边栏

参考 Slock 设计图：

- **顶部**：产品名称 "AgentCrew"
- **CHANNELS 分组**：Channel 列表 + `[+]` 创建按钮
- **AGENTS 分组**：Agent 列表 + `[+]` 创建按钮，名称旁显示运行状态（◉ running / ○ idle / ✕ error），CLI Agent 和 API Agent 使用不同图标区分
- **HUMANS 分组**：当前用户
- **底部**：用户信息 + 设置齿轮图标

**侧边栏交互：**
- 点击 Channel → 主内容区切换到该 Channel 聊天视图
- 点击 Agent → 主内容区切换到该 Agent 的 DM Channel（自动创建或复用）
- 点击 Human → 主内容区显示用户 Profile

### 5.4 主内容区

#### Channel 聊天视图（CHAT 标签）

参考 Slock 的 `channel-chat.png`：
- **顶栏**：`# channel-name — description` + 右侧工具按钮（终端图标 — 仅当 Channel 含 CLI Agent 时显示、设置图标、成员数图标）
- **消息时间线**：每条消息显示 头像 + 发送者名称 + 角色标签（owner/agent）+ 时间 + 消息正文
- **输入区**：底部输入框 + `[Send ▷]` 按钮；输入 `@` 触发 Agent 名称自动补全

#### Channel 成员视图（AGENTS 标签）

- HUMANS 分组 + AGENTS 分组
- 每个 Agent 显示名称 + 类型标签（CLI/API）+ 运行状态
- `[+ Add Agent]` 和 `[Delete Channel]` 按钮

#### 嵌入式终端面板

点击顶栏终端图标后，主内容区底部展开一个可调节高度的终端面板（xterm.js），显示当前 Channel 中 CLI Agent 的 PTY 原始输出。若 Channel 中有多个 CLI Agent，通过标签页切换。

### 5.5 弹窗（Modal）

所有弹窗采用 Slock 视觉风格：白色背景、黑色粗边框、右上角 `[X]` 关闭按钮。

#### Create Agent 弹窗

根据选择的 Agent 类型动态切换表单字段：

```
┌──────────────────────────────────────┐
│  CREATE AGENT                     [X]│
│                                      │
│  NAME *                              │
│  ┌──────────────────────────────────┐│
│  │ e.g. Coder                       ││
│  └──────────────────────────────────┘│
│                                      │
│  DESCRIPTION (optional)              │
│  ┌──────────────────────────────────┐│
│  │ What does this agent do?         ││
│  └──────────────────────────────────┘│
│                                      │
│  TYPE *                              │
│  ┌────────────┐ ┌──────────────┐     │
│  │ ● CLI Tool │ │ ○ API Model  │     │
│  └────────────┘ └──────────────┘     │
│                                      │
│  ── CLI Tool 模式 ──                  │
│  RUNTIME *                           │
│  ┌──────────────────────────────────┐│
│  │ claude-code                   ▼  ││
│  └──────────────────────────────────┘│
│                                      │
│  MODEL                               │
│  ┌──────────────────────────────────┐│
│  │ opus                          ▼  ││
│  └──────────────────────────────────┘│
│                                      │
│  WORKING DIRECTORY *                 │
│  ┌──────────────────────────────────┐│
│  │ ~/projects/my-app                ││
│  └──────────────────────────────────┘│
│                                      │
│  ── 或 API Model 模式 ──             │
│  API ENDPOINT *                      │
│  ┌──────────────────────────────────┐│
│  │ https://api.openai.com/v1        ││
│  └──────────────────────────────────┘│
│                                      │
│  API KEY *                           │
│  ┌──────────────────────────────────┐│
│  │ sk-...                           ││
│  └──────────────────────────────────┘│
│                                      │
│  MODEL *                             │
│  ┌──────────────────────────────────┐│
│  │ gpt-4o                           ││
│  └──────────────────────────────────┘│
│                                      │
│  SYSTEM PROMPT (optional)            │
│  ┌──────────────────────────────────┐│
│  │ You are a code reviewer...       ││
│  └──────────────────────────────────┘│
│                                      │
│  ▶ ADVANCED                          │
│    ENVIRONMENT VARIABLES             │
│    + Add Variable                    │
│                                      │
│    MCP SERVERS                       │
│    ☑ github  ☑ filesystem            │
│                                      │
│    SKILLS                            │
│    ☑ code-review  ☐ doc-gen          │
│                                      │
│       [Cancel]  [Create Agent]       │
└──────────────────────────────────────┘
```

**说明：** TYPE 选择 "CLI Tool" 时显示 RUNTIME / MODEL / WORKING DIRECTORY 字段；选择 "API Model" 时显示 API ENDPOINT / API KEY / MODEL / SYSTEM PROMPT 字段。ADVANCED 区域包含环境变量、MCP Servers 授权勾选、Skills 授权勾选。

#### Create Channel 弹窗

参考 Slock 的 `create-channel.png`，保持一致：

```
┌──────────────────────────────────────┐
│  CREATE CHANNEL                   [X]│
│                                      │
│  NAME *                              │
│  ┌──────────────────────────────────┐│
│  │ e.g. ai-research                 ││
│  └──────────────────────────────────┘│
│                                      │
│  DESCRIPTION (optional)              │
│  ┌──────────────────────────────────┐│
│  │ What is this channel about?      ││
│  └──────────────────────────────────┘│
│                                      │
│  MEMBERS (optional)                  │
│  [Select agents to add...]           │
│                                      │
│       [Cancel]  [Create Channel]     │
└──────────────────────────────────────┘
```

#### Agent Detail / Edit 弹窗

点击 Agent 设置图标或在侧边栏右键 Agent 时弹出，显示 Agent 完整信息并支持编辑：

```
┌──────────────────────────────────────┐
│  AGENT: Coder                     [X]│
│                                      │
│  ┌──────┐ ┌───────┐ ┌──────────┐    │
│  │ INFO │ │  MCP  │ │  SKILLS  │    │
│  └──────┘ └───────┘ └──────────┘    │
│                                      │
│  [INFO 标签]                          │
│  Name: Coder                         │
│  Type: CLI Tool                      │
│  Runtime: claude-code                │
│  Model: opus                         │
│  Working Dir: ~/projects/my-app      │
│  Status: ◉ running                   │
│  Memory: 12 entries (agent-xxx.mv2)  │
│                                      │
│  [MCP 标签]                           │
│  ☑ github       (全局共享)            │
│  ☑ filesystem   (全局共享)            │
│  ☐ database     (未授权)              │
│  [+ Add MCP Server]                  │
│                                      │
│  [SKILLS 标签]                        │
│  ☑ code-review  (全局共享)            │
│  ☐ doc-gen      (未授权)              │
│  [+ Add Skill]                       │
│                                      │
│       [Delete Agent]  [Save]         │
└──────────────────────────────────────┘
```

#### Settings — MCP & Skills 管理

在 Settings 页面中新增 MCP 和 Skills 标签：

```
┌──────────────────────────────────────┐
│  ⚙ Settings                          │
│  ┌─────────┐ ┌─────┐ ┌────────┐     │
│  │ ACCOUNT │ │ MCP │ │ SKILLS │     │
│  └─────────┘ └─────┘ └────────┘     │
│                                      │
│  [MCP 标签]                           │
│  ┌──────────────────────────────────┐│
│  │ github                           ││
│  │ npx @mcp/server-github           ││
│  │ Agents: All                      ││
│  ├──────────────────────────────────┤│
│  │ filesystem                       ││
│  │ npx @mcp/server-filesystem       ││
│  │ Agents: Coder, Reviewer          ││
│  └──────────────────────────────────┘│
│  [+ Add MCP Server]                  │
│                                      │
│  [SKILLS 标签]                        │
│  ┌──────────────────────────────────┐│
│  │ code-review                      ││
│  │ ~/.skills/code-review            ││
│  │ Agents: All                      ││
│  └──────────────────────────────────┘│
│  [+ Add Skill]                       │
└──────────────────────────────────────┘
```

### 5.6 Settings 页面

参考 Slock 的 `settings-account.png`，三个标签：

- **ACCOUNT**：用户名、显示名称
- **MCP**：MCP Server 列表管理（新增/编辑/删除/授权）
- **SKILLS**：Skills 列表管理（新增/编辑/删除/授权）

---

## 6. 技术架构

### 6.1 技术栈

| 层 | 技术选型 | 说明 |
|---|---------|------|
| 桌面壳 | Electron | 跨平台桌面容器 |
| 前端 | React + TypeScript | UI 框架 |
| 状态管理 | Zustand | 轻量状态管理 |
| 终端 | xterm.js + node-pty | CLI Agent PTY 进程管理 |
| 数据库 | better-sqlite3 | 本地持久化 |
| 记忆 | @memvid/sdk | Agent 私有记忆 + Channel 共享记忆 |
| 构建 | electron-vite | 构建工具链 |
| 包管理 | bun | 包管理器 |

### 6.2 进程架构

```
Main Process (Node.js)
├── database.ts          — SQLite 初始化与查询
├── pty-manager.ts       — CLI Agent PTY 进程池管理（参考 Constellagent）
├── api-client.ts        — API Agent HTTP 调用（OpenAI 兼容接口）
├── agent-service.ts     — Agent CRUD + 生命周期（CLI/API 双分支）
├── channel-service.ts   — Channel CRUD + 成员管理
├── message-service.ts   — 消息读写 + @mention 路由（仅路由人类发起的 @mention）
├── mcp-service.ts       — MCP Server 配置管理 + 进程启停
├── skill-service.ts     — Skills 配置管理
├── memory-service.ts    — Memvid 记忆层（参考 SlockClaw memvidService.ts）
└── ipc.ts               — IPC handler 注册

Preload
└── index.ts             — contextBridge 暴露 window.api

Renderer (React)
├── App.tsx              — 二栏主布局
├── store/app-store.ts   — Zustand 全局状态
└── components/
    ├── Sidebar/         — 侧边栏（Channels, Agents, Humans）
    ├── ChatView/        — Channel 聊天 + 嵌入式终端面板
    ├── AgentList/       — Channel 内 Agent 成员视图
    ├── Profile/         — 用户 Profile 页
    ├── Settings/        — 设置页（Account / MCP / Skills）
    └── Modals/          — Create Agent / Create Channel / Agent Detail / Members
```

### 6.3 消息路由机制

**核心约束：只路由人类发起的 @mention。**

```
1. 人类在 Channel 中发送消息
2. message-service 解析 @mentions
3. 对每个被 @mention 的 Agent:
   a. 从 Memory 召回相关记忆（Agent 私有 + Channel 共享）
   b. 注入记忆上下文 + Channel 近期消息作为输入
   c. [CLI Agent] 启动/复用 PTY → 写入 stdin → 流式输出到 Channel
      [API Agent] 构建 API 请求 → 发起 HTTP 调用 → 流式回复写入 Channel
   d. 回复完成后，写入记忆（Agent 私有 + Channel 共享）
4. 若无 @mention 且 Channel 只有一个 Agent 成员，默认发给该 Agent
5. Agent 回复中的 @other-agent 视为普通文本，不触发路由
```

### 6.4 PTY 管理（CLI Agent）

参考 Constellagent 的 `pty-manager.ts`，简化实现：

- 每个 CLI Agent 对应一个 PTY 进程实例
- PTY 在 Agent 首次被 @mention 时按需启动
- PTY stdout 实时流式传输到 Renderer（同时写入 Channel 消息 + 终端面板渲染）
- 用户可通过 UI 手动停止 / 重启 Agent PTY
- 支持 PTY 输出重放（新打开终端面板时回放历史输出）

### 6.5 API 调用（API Agent）

- 使用 OpenAI 兼容接口格式（`/v1/chat/completions`），覆盖主流 LLM 提供商
- 支持 SSE 流式响应，实时显示在 Channel 消息流中
- API Key 在 SQLite 中加密存储，运行时解密使用
- 多模态模型支持：消息中的图片/文件附件通过 base64 或 URL 传入 API 请求

### 6.6 MCP 管理

- MCP Server 进程由 Main Process 管理，按需启停
- Agent 发起工具调用时，message-service 检查该 Agent 是否有权限访问目标 MCP Server
- MCP 通信使用 stdio 传输，与 Agent 进程解耦

---

## 7. MVP 验收场景

> **"用户创建一个 CLI Agent（Coder，runtime=claude-code）和一个 API Agent（Reviewer，使用 GPT-4o 审查代码），配置一个 github MCP Server 并授权给两者。创建一个 Group Channel 并加入两者。人类在 Channel 中 @Coder 下达编码任务，Coder 在 PTY 中运行 Claude Code 实现功能，人类通过终端面板实时查看执行过程。完成后人类 @Reviewer 审查代码，Reviewer 通过 API 调用分析并回复审查意见。两个 Agent 的记忆分别记录了各自的经验，Channel 记忆记录了共享的任务上下文。下次在同一 Channel 中提问时，Agent 的回复自动参考之前的记忆。"**

该场景覆盖：
- ✅ CLI Agent 创建 + PTY 终端执行 + 实时查看
- ✅ API Agent 创建 + API 调用执行
- ✅ MCP Server 配置 + Agent 授权
- ✅ Channel 创建 + 成员管理
- ✅ 人即 Manager：人类 @Agent 分配任务，Agent 不自主调度
- ✅ Agent 并行运行
- ✅ Memory：Agent 私有记忆 + Channel 共享记忆 + 自动召回

---

## 8. 不在 MVP 范围内的能力

| 能力 | 原因 |
|------|------|
| Agent 自主调度 Agent / Manager-Workers 层级 | 人即 Manager，保持最简控制面 |
| Task Run / Execution Session 状态机 | 用 PTY 进程状态 + API 调用状态替代 |
| Artifact 版本管理 | Agent 直接操作文件系统 |
| 安全沙箱 / 命令白名单 | 本地工具，信任用户配置 |
| Git worktree 隔离 | 未来迭代考虑 |
| 自动化调度 (Cron) | 未来迭代考虑 |
| Skills 市场 / 在线安装 | 未来迭代考虑，MVP 仅支持本地路径配置 |
| Server 多实例 / Plan & Billing | 本地免费使用 |
