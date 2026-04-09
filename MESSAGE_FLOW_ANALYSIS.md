# AgentCrew Message Flow Analysis - Image Attachment Support Implementation Guide

## Executive Summary
This document comprehensively maps the entire message lifecycle in AgentCrew, from user input through database storage to agent dispatch and response. It identifies all integration points where image attachment support must be implemented.

---

## 1. DATA TYPE LAYER

### 1.1 Current Message Types (src/shared/types.ts)

```typescript
// Current MessageRecord - stored in database
export interface MessageRecord {
  id: string
  channelId: string
  senderType: SenderType                    // 'human' | 'agent'
  senderId: string | null                   // Agent ID if from agent, null if human
  content: string                           // Message text content
  mentions: string[]                        // Array of agent IDs mentioned
  createdAt: string                         // ISO timestamp
  // ⚠️ NO ATTACHMENT FIELDS YET
}

// Current MessageDraft - client → server creation
export interface MessageDraft {
  channelId: string
  senderType: SenderType
  senderId?: string | null
  content: string
  mentions?: string[]
  // ⚠️ NO ATTACHMENT FIELDS YET
}
```

### 1.2 Extension Points for Attachments

**Required additions to types.ts:**

```typescript
// Attachment type (platform-agnostic)
export interface MessageAttachment {
  id: string                                // Unique identifier
  type: 'image' | 'file' | 'code'          // Content type
  mimeType: string                          // e.g., 'image/png'
  filename: string                          // Original filename
  size: number                              // Bytes
  url: string                               // Public or data URL
  data?: string                             // Base64 encoded (optional, for inline storage)
  metadata?: Record<string, unknown>        // Custom metadata (dimensions, etc.)
}

// Extended MessageRecord with attachments
export interface MessageRecord {
  // ... existing fields ...
  attachments?: MessageAttachment[]         // NEW: Add attachments array
}

// Extended MessageDraft with attachments
export interface MessageDraft {
  // ... existing fields ...
  attachments?: Omit<MessageAttachment, 'id'>[]  // NEW: without id (generated on save)
}
```

### 1.3 Sender Type Considerations

- **Human → Agent**: User sends message with images; must be encoded/transmitted to API agents or CLI
- **Agent → Human**: API/CLI agents may return images; must be stored and displayed
- **Agent → Agent**: Cross-agent messages may include images (future consideration)

---

## 2. DATABASE SCHEMA LAYER

### 2.1 Current Schema (src/main/database/schema.ts)

```sql
CREATE TABLE IF NOT EXISTS messages (
  id                TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL,
  sender_type       TEXT NOT NULL,           -- 'human' | 'agent'
  sender_id         TEXT,
  content           TEXT NOT NULL,           -- Message text
  mentions          TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_at        TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_channel 
  ON messages (channel_id, created_at);
```

### 2.2 Schema Extension Strategy

**Option A: Add Attachments Column (Recommended)**
```sql
ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]';
-- Stores JSON array: [{ "id": "...", "type": "image", "mimeType": "image/png", ... }]
```

**Option B: Separate Attachment Table (Normalized)**
```sql
CREATE TABLE IF NOT EXISTS message_attachments (
  id                TEXT PRIMARY KEY,
  message_id        TEXT NOT NULL,
  type              TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  filename          TEXT NOT NULL,
  size              INTEGER NOT NULL,
  url               TEXT NOT NULL,
  data              TEXT,                   -- Base64 (optional)
  metadata          TEXT DEFAULT '{}',      -- JSON
  created_at        TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
);

CREATE INDEX idx_attachments_message ON message_attachments (message_id);
```

**Recommendation**: Start with Option A (JSON column) for simplicity; migrate to Option B if attachment volume or queries become complex.

### 2.3 Migration Script

```sql
-- Safe migration (idempotent)
ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]';
-- Verification query to ensure migration worked
```

---

## 3. DATABASE REPOSITORY LAYER

### 3.1 Current Message Operations (src/main/database/repository.ts)

**Current createMessage:**
```typescript
createMessage(draft: MessageDraft): MessageRecord {
  const id = randomUUID()
  const ts = now()
  this.db.prepare(`
    INSERT INTO messages (id, channel_id, sender_type, sender_id, content, mentions, created_at)
    VALUES (@id, @channel_id, @sender_type, @sender_id, @content, @mentions, @created_at)
  `).run({
    id,
    channel_id: draft.channelId,
    sender_type: draft.senderType,
    sender_id: draft.senderId ?? null,
    content: draft.content,
    mentions: JSON.stringify(draft.mentions ?? []),
    created_at: ts
  })
  return mapMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id))
}
```

**Current mapMessage:**
```typescript
function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: row.id as string,
    channelId: row.channel_id as string,
    senderType: row.sender_type as MessageRecord['senderType'],
    senderId: (row.sender_id as string | null) ?? null,
    content: row.content as string,
    mentions: parseJson(row.mentions as string, []),
    createdAt: row.created_at as string
    // ⚠️ NO ATTACHMENT PARSING
  }
}
```

### 3.2 Extensions Required

**Enhanced mapMessage:**
```typescript
function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    // ... existing fields ...
    attachments: parseJson(row.attachments as string, [])  // NEW
  }
}
```

**Enhanced createMessage:**
```typescript
createMessage(draft: MessageDraft): MessageRecord {
  const id = randomUUID()
  const ts = now()
  this.db.prepare(`
    INSERT INTO messages (
      id, channel_id, sender_type, sender_id, content, mentions, attachments, created_at
    )
    VALUES (@id, @channel_id, @sender_type, @sender_id, @content, @mentions, @attachments, @created_at)
  `).run({
    // ... existing fields ...
    attachments: JSON.stringify(draft.attachments ?? [])  // NEW
  })
  return mapMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id))
}
```

**Helper: Attachment ID generation and validation**
```typescript
private generateAttachmentIds(attachments: Omit<MessageAttachment, 'id'>[]): MessageAttachment[] {
  return attachments.map(att => ({
    ...att,
    id: randomUUID()
  }))
}
```

---

## 4. CHAT INPUT COMPONENT LAYER

### 4.1 Current MessageInput Component (src/renderer/src/components/ChatView/MessageInput.tsx)

```typescript
export function MessageInput() {
  const [text, setText] = useState('')                    // Text content
  const [showMentions, setShowMentions] = useState(false) // @ mention popup
  const [mentionFilter, setMentionFilter] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ⚠️ NO ATTACHMENT STATE

  const handleSend = async () => {
    if (!text.trim() || !activeChannelId) return
    const mentions = parseMentions(text)
    await sendMessage({
      channelId: activeChannelId,
      senderType: 'human',
      content: text.trim(),
      mentions
      // ⚠️ NO ATTACHMENTS
    })
    setText('')
    setShowMentions(false)
  }

  return (
    <div className="message-input-container">
      {/* Mention popup */}
      <div className="message-input-row">
        <textarea
          ref={inputRef}
          className="message-textarea"
          placeholder={`Message #${activeChannel?.name ?? 'channel'}`}
          value={text}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button className="btn btn-primary send-btn" onClick={handleSend}>
          <Send size={14} /> Send
        </button>
      </div>
    </div>
  )
}
```

### 4.2 Required Extensions

**New state additions:**
```typescript
const [attachments, setAttachments] = useState<MessageAttachment[]>([])
const [isUploading, setIsUploading] = useState(false)
const fileInputRef = useRef<HTMLInputElement>(null)
```

**New handler: File picker**
```typescript
const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.currentTarget.files
  if (!files) return

  setIsUploading(true)
  try {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        console.warn(`Skipping non-image: ${file.name}`)
        continue
      }

      // Convert to base64 or upload to server
      const base64 = await fileToBase64(file)
      
      setAttachments(prev => [...prev, {
        id: randomUUID(),
        type: 'image',
        mimeType: file.type,
        filename: file.name,
        size: file.size,
        url: base64,  // or server URL if uploaded
      }])
    }
  } finally {
    setIsUploading(false)
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
```

**Enhanced handleSend:**
```typescript
const handleSend = async () => {
  if ((!text.trim() && attachments.length === 0) || !activeChannelId) return
  
  const mentions = parseMentions(text)
  await sendMessage({
    channelId: activeChannelId,
    senderType: 'human',
    content: text.trim(),
    mentions,
    attachments: attachments.map(({ id, ...rest }) => rest)  // Remove ID for draft
  })
  
  setText('')
  setAttachments([])
  setShowMentions(false)
}
```

**New UI: Attachment preview section**
```typescript
return (
  <div className="message-input-container">
    {attachments.length > 0 && (
      <div className="attachments-preview">
        {attachments.map(att => (
          <div key={att.id} className="attachment-item">
            <img 
              src={att.url} 
              alt={att.filename} 
              className="attachment-thumbnail"
            />
            <button
              className="btn-remove"
              onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    )}

    <div className="message-input-row">
      <textarea
        // ... existing props ...
      />
      <button
        className="icon-btn"
        onClick={() => fileInputRef.current?.click()}
        title="Attach image"
        disabled={isUploading}
      >
        <Paperclip size={14} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      <button className="btn btn-primary send-btn" onClick={handleSend}>
        <Send size={14} /> Send
      </button>
    </div>
  </div>
)
```

---

## 5. STATE MANAGEMENT LAYER

### 5.1 Current App Store (src/renderer/src/store/app-store.ts)

**Store state:**
```typescript
export interface AppState {
  messages: MessageRecord[]
  // ⚠️ NO ATTACHMENT STATE
  
  sendMessage: (draft: MessageDraft) => Promise<MessageRecord>
  appendMessage: (msg: MessageRecord) => void
}
```

**Current sendMessage:**
```typescript
sendMessage: async (draft) => {
  await window.api.messages.create(draft)
  await get().loadMessages(draft.channelId)
  return get().messages[get().messages.length - 1]
}
```

**Current appendMessage:**
```typescript
appendMessage: (msg) => {
  set(s => {
    if (msg.channelId !== s.activeChannelId) return s
    if (s.messages.some(m => m.id === msg.id)) return s
    return { messages: [...s.messages, msg] }
  })
}
```

### 5.2 Required Extensions

**No app store changes needed** — MessageRecord and MessageDraft now include attachments via type definitions. The existing sendMessage and appendMessage handlers will automatically propagate attachments.

---

## 6. IPC BRIDGE LAYER

### 6.1 Current Preload (src/preload/index.ts)

```typescript
messages: {
  list: (channelId: string, limit?: number, before?: string): Promise<MessageRecord[]> =>
    ipcRenderer.invoke(IPC.MESSAGES_LIST, channelId, limit, before),
  create: (draft: MessageDraft): Promise<MessageRecord> =>
    ipcRenderer.invoke(IPC.MESSAGES_CREATE, draft),
  onStream: (callback: (msg: MessageRecord) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, msg: MessageRecord) => callback(msg)
    ipcRenderer.on(IPC.MESSAGES_STREAM, listener)
    return () => ipcRenderer.removeListener(IPC.MESSAGES_STREAM, listener)
  },
}
```

### 6.2 Extensions Required

**No preload changes needed** — The existing `messages.create()` method accepts MessageDraft which now includes attachments. The type system automatically enforces passing attachments through.

---

## 7. IPC HANDLER LAYER

### 7.1 Current IPC Handlers (src/main/ipc.ts)

```typescript
ipcMain.handle(IPC.MESSAGES_CREATE, async (_e, draft: MessageDraft) => {
  // routeMessage creates the message, broadcasts via MESSAGES_STREAM, and dispatches to agents
  await messageRouter.routeMessage(draft)
})
```

### 7.2 Extensions Required

**No changes needed to ipcMain.handle** — it already routes MessageDraft through messageRouter.routeMessage, which will now include attachments.

---

## 8. MESSAGE ROUTER LAYER

### 8.1 Current Message Router (src/main/message-router.ts - lines 88-120)

```typescript
export class MessageRouter {
  constructor(private ctx: MessageRouterContext) {}

  async routeMessage(draft: MessageDraft): Promise<void> {
    const msg = this.ctx.repository.createMessage(draft)  // Creates in DB
    this.broadcast(msg)                                    // Sends to UI via IPC

    if (draft.senderType !== 'human') return              // Agents don't trigger dispatch

    let agentIds = draft.mentions ?? []
    if (agentIds.length === 0) {
      const channel = this.ctx.repository.getChannel(draft.channelId)
      if (channel.memberIds.length === 1) {
        agentIds = [channel.memberIds[0]]
      }
    }

    for (const agentId of agentIds) {
      try {
        const agent = this.ctx.repository.getAgent(agentId)
        const cleanContent = this.stripMentions(draft.content, agentIds, draft.channelId)
        if (agent.type === 'cli') {
          this.dispatchCli(agent, draft.channelId, cleanContent)
        } else if (agent.type === 'api') {
          this.dispatchApi(agent, draft.channelId, cleanContent)
        }
      } catch (err) {
        this.postError(draft.channelId, agentId, err)
      }
    }
  }
}
```

### 8.2 Critical Integration Points

**Point A: routeMessage entry (line 92)**
```typescript
async routeMessage(draft: MessageDraft): Promise<void> {
  const msg = this.ctx.repository.createMessage(draft)
  // ⚠️ Attachments now in msg.attachments (persisted in DB)
  this.broadcast(msg)
  // ⚠️ Attachments broadcast to UI
}
```

**Point B: dispatchApi (lines 570-635)**
```typescript
private dispatchApi(agent: AgentRecord, channelId: string, prompt: string): void {
  // ... existing code ...
  
  // Build conversation context from recent channel messages
  const recentMessages = this.ctx.repository.listMessages(channelId, 20)
  const chatMessages = recentMessages.map(m => ({
    role: (m.senderType === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content
    // ⚠️ ATTACHMENTS NOT PASSED TO API YET
  }))
}
```

**Point C: dispatchCli (lines 309-341)**
```typescript
private dispatchCli(agent: AgentRecord, channelId: string, prompt: string): void {
  // ... existing code ...
  
  // prompts only contain text; attachments must be handled separately
  this.sendUserMessage(agent, channelId, session.ptyId, prompt)
  // ⚠️ NO ATTACHMENT SUPPORT FOR CLI (text-only terminals)
}
```

### 8.3 Required Extensions

**Attachment-aware dispatchApi:**
```typescript
private dispatchApi(agent: AgentRecord, channelId: string, prompt: string, attachments?: MessageAttachment[]): void {
  const recentMessages = this.ctx.repository.listMessages(channelId, 20)
  const chatMessages = recentMessages.map(m => {
    const base: ChatMessage = {
      role: (m.senderType === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content
    }
    
    // If message has attachments and uses Vision API format
    if (m.attachments && m.attachments.length > 0) {
      return {
        ...base,
        attachments: m.attachments.map(att => ({
          type: att.type === 'image' ? 'image' : 'file',
          url: att.url,
          mimeType: att.mimeType
        }))
      }
    }
    
    return base
  })
  
  // ... rest of existing code ...
}
```

**Attachment-aware CLI dispatch:**
```typescript
private dispatchCli(agent: AgentRecord, channelId: string, prompt: string, attachments?: MessageAttachment[]): void {
  // Options:
  // 1. Save images to temp files, reference paths in prompt
  // 2. Encode base64 in prompt (problematic for large images)
  // 3. Create a CLI context object accessible via file descriptor
  
  if (attachments && attachments.length > 0) {
    // Save attachments to temp directory
    const tempDir = await this.saveCLIAttachments(attachments)
    const attachmentNote = `Attachments available in: ${tempDir}`
    const enrichedPrompt = `${prompt}\n\n${attachmentNote}`
    this.sendUserMessage(agent, channelId, session.ptyId, enrichedPrompt)
  } else {
    this.sendUserMessage(agent, channelId, session.ptyId, prompt)
  }
}

private async saveCLIAttachments(attachments: MessageAttachment[]): Promise<string> {
  // Implementation: Save base64 images to /tmp/agentcrew-attachments-{id}/
}
```

---

## 9. API CLIENT LAYER

### 9.1 Current API Client (src/main/api-client.ts)

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class ApiClient {
  static async streamChat(
    options: ApiClientOptions,
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    const allMessages: ChatMessage[] = []
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt + '\n\n' + OUTPUT_CONSTRAINT })
    } else {
      allMessages.push({ role: 'system', content: OUTPUT_CONSTRAINT })
    }
    allMessages.push(...messages)

    const body = JSON.stringify({
      model,
      messages: allMessages,
      stream: true
    })
    // ⚠️ Standard OpenAI format, doesn't support attachments
  }
}
```

### 9.2 Required Extensions

**Support Vision API extensions:**
```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>
}

interface ApiClientOptions {
  endpoint: string
  apiKey: string
  model: string
  systemPrompt?: string
  supportsVision?: boolean  // NEW: Auto-detect or explicit flag
}

export class ApiClient {
  static async streamChat(
    options: ApiClientOptions,
    messages: ChatMessage[],
    // ... callbacks ...
  ): Promise<void> {
    // ... existing setup ...
    
    // Transform messages if Vision API support detected
    const transformedMessages = options.supportsVision 
      ? this.transformToVisionFormat(allMessages)
      : allMessages
    
    const body = JSON.stringify({
      model,
      messages: transformedMessages,
      stream: true
    })
    // ... rest of existing code ...
  }

  private static transformToVisionFormat(
    messages: ChatMessage[]
  ): ChatMessage[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return msg  // Already text
      }
      // content is already in Vision format
      return msg
    })
  }
}
```

---

## 10. MESSAGE DISPLAY LAYER

### 10.1 Current MessageTimeline (src/renderer/src/components/ChatView/MessageTimeline.tsx)

```typescript
export function MessageBubble({ message }: { message: MessageRecord }) {
  const agents = useAppStore(s => s.agents)
  const userName = useAppStore(s => s.userName)
  const isHuman = message.senderType === 'human'

  return (
    <div className="message-bubble">
      <div className="message-avatar">
        {isHuman ? (
          <div className="avatar avatar-human"><User size={16} /></div>
        ) : (
          <div className="avatar avatar-agent"><AgentIcon icon={agent?.icon ?? 'bot'} size={16} /></div>
        )}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="message-sender">{isHuman ? userName : (agent?.name ?? 'agent')}</span>
          <span className="message-role">{isHuman ? 'owner' : 'agent'}</span>
          <span className="message-time">{formatTime(message.createdAt)}</span>
        </div>
        <div className="message-content">{message.content}</div>
        {/* ⚠️ NO ATTACHMENT DISPLAY */}
      </div>
    </div>
  )
}
```

### 10.2 Required Extensions

**Attachment display component:**
```typescript
function AttachmentGallery({ attachments }: { attachments: MessageAttachment[] }) {
  return (
    <div className="attachment-gallery">
      {attachments.map(att => (
        <div key={att.id} className="attachment">
          {att.type === 'image' && (
            <img
              src={att.url}
              alt={att.filename}
              className="attachment-image"
              title={`${att.filename} (${(att.size / 1024).toFixed(1)} KB)`}
            />
          )}
          {att.type === 'file' && (
            <a href={att.url} download={att.filename} className="attachment-file">
              📄 {att.filename}
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

export function MessageBubble({ message }: { message: MessageRecord }) {
  // ... existing code ...
  
  return (
    <div className="message-bubble">
      {/* ... existing avatar and meta ... */}
      <div className="message-body">
        <div className="message-meta">
          {/* ... existing meta ... */}
        </div>
        <div className="message-content">{message.content}</div>
        
        {/* NEW: Display attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentGallery attachments={message.attachments} />
        )}
      </div>
    </div>
  )
}
```

---

## 11. COMPLETE MESSAGE FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. USER INPUT (ChatView/MessageInput.tsx)                           │
├─────────────────────────────────────────────────────────────────────┤
│ • User types text + optionally selects images via file picker       │
│ • Local state: attachments[] (base64 or URLs)                       │
│ • handleSend() → calls store.sendMessage()                          │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. STATE MANAGEMENT (app-store.ts)                                  │
├─────────────────────────────────────────────────────────────────────┤
│ • sendMessage(draft: MessageDraft)                                   │
│   • draft includes: content, mentions, attachments[]                │
│ • Calls window.api.messages.create(draft)                           │
│ • Returns and reload messages via loadMessages()                    │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼ IPC Bridge (preload/index.ts)
┌─────────────────────────────────────────────────────────────────────┐
│ 3. IPC INVOKE (messages.create)                                     │
├─────────────────────────────────────────────────────────────────────┤
│ ipcRenderer.invoke(IPC.MESSAGES_CREATE, draft)                       │
│ → Main process receives MESSAGES_CREATE event                       │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. IPC HANDLER (src/main/ipc.ts line 58)                            │
├─────────────────────────────────────────────────────────────────────┤
│ ipcMain.handle(IPC.MESSAGES_CREATE, async (_e, draft: MessageDraft) │
│   → messageRouter.routeMessage(draft)                               │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. MESSAGE ROUTING (src/main/message-router.ts line 92)             │
├─────────────────────────────────────────────────────────────────────┤
│ routeMessage(draft: MessageDraft):                                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ a) repository.createMessage(draft)                              │ │
│ │    • Insert into DB with all fields including attachments      │ │
│ │    • Returns MessageRecord with ID generated                   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ b) broadcast(msg)                                               │ │
│ │    • Send via IPC MESSAGES_STREAM to renderer                  │ │
│ │    • Renderer appends to UI immediately                        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ c) For human messages, determine agents to dispatch            │ │
│ │    • Parse @mentions or use single channel member              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ d) For each agent:                                              │ │
│ │    → if CLI: dispatchCli(agent, channelId, content)             │ │
│ │    → if API: dispatchApi(agent, channelId, content)             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────────┐    ┌──────────────────────┐
│ DISPATCH CLI         │    │ DISPATCH API         │
├──────────────────────┤    ├──────────────────────┤
│ (Line 309)           │    │ (Line 570)           │
│                      │    │                      │
│ • Ensure PTY running │    │ • Build chat context │
│ • Write prompt +     │    │ • Transform to Vision│
│   attachment notes   │    │   format if supported│
│ • Detect turn end    │    │ • Stream via API     │
│ • Extract screen     │    │ • Create reply msg   │
│ • Summarize output   │    │ • Retain to memory   │
│ • Post reply msg     │    │ • Post reply msg     │
└──────────────────────┘    └──────────────────────┘
        │                             │
        └──────────────┬──────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. AGENT REPLY (created and broadcast)                              │
├─────────────────────────────────────────────────────────────────────┤
│ • postCliReply() or onDone() callback                                │
│ • repository.createMessage({ senderType: 'agent', ... })            │
│ • broadcast(replyMsg) → sent to renderer via MESSAGES_STREAM        │
│ • Renderer appends to MessageTimeline                               │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. MESSAGE DISPLAY (MessageTimeline + MessageBubble)                │
├─────────────────────────────────────────────────────────────────────┤
│ • Render message content                                             │
│ • NEW: Render attachments gallery if present                        │
│ • Display sender avatar, time, role badge                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 12. IMPLEMENTATION CHECKLIST

### Phase 1: Foundation (Database & Types)
- [ ] Extend `MessageRecord` interface with optional `attachments` field
- [ ] Extend `MessageDraft` interface with optional `attachments` field
- [ ] Create `MessageAttachment` interface
- [ ] Add migration: `ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]'`
- [ ] Update `mapMessage()` to parse attachments JSON
- [ ] Update `repository.createMessage()` to persist attachments

### Phase 2: Frontend Input
- [ ] Add attachment state to MessageInput component
- [ ] Add file input and picker UI
- [ ] Implement `fileToBase64()` conversion or upload handler
- [ ] Add attachment preview gallery
- [ ] Update `handleSend()` to include attachments in draft
- [ ] Handle attachment removal UI

### Phase 3: Message Router
- [ ] Update `routeMessage()` signature (or extract attachments from draft)
- [ ] Update `dispatchApi()` to detect Vision API capability
- [ ] Transform messages to Vision API format for compatible endpoints
- [ ] Update `dispatchCli()` to handle attachment references
- [ ] Create temp directory handler for CLI attachments

### Phase 4: API Client
- [ ] Update `ChatMessage` interface to support Vision format
- [ ] Update `streamChat()` to handle both text and vision-format messages
- [ ] Auto-detect Vision API support or add explicit flag

### Phase 5: Message Display
- [ ] Create `AttachmentGallery` component
- [ ] Update `MessageBubble` to render attachments
- [ ] Add CSS for image preview gallery
- [ ] Handle download links for non-image attachments

### Phase 6: Testing & Polish
- [ ] Unit tests for attachment serialization/deserialization
- [ ] Integration test: message with image → database → UI → agent
- [ ] Test different image formats (PNG, JPG, WebP, etc.)
- [ ] Test large file handling
- [ ] Performance test: multiple attachments per message

---

## 13. KEY ARCHITECTURAL DECISIONS

### Decision 1: Storage Strategy
**Choice**: JSON column in messages table vs. separate attachment table
**Selected**: JSON column (for MVP)
**Rationale**: 
- Simpler queries and transactions
- Messages are fetched atomically
- Can migrate to separate table later if needed

### Decision 2: Attachment URL Source
**Choice**: Base64 data URLs vs. external server vs. filesystem references
**Selected**: Base64 data URLs (for MVP)
**Rationale**:
- Self-contained, no external dependencies
- Works offline
- Can migrate to S3/CDN later

### Decision 3: CLI Attachment Handling
**Choice**: Convert to base64 in prompt vs. temp file references vs. skip CLI support
**Selected**: Temp file references
**Rationale**:
- CLI tools can't decode base64 in text
- Large text payloads slow down terminal
- File paths are standard CLI patterns

### Decision 4: Vision API Support
**Choice**: Hardcode for specific provider vs. auto-detect vs. explicit flag
**Selected**: Auto-detect with explicit flag override
**Rationale**:
- Most modern LLM APIs support vision
- Fallback to text-only gracefully
- Can be overridden in agent settings

---

## 14. FUTURE EXTENSIONS

1. **Attachment Search**: Index attachment metadata for full-text search
2. **Attachment Cleanup**: Periodic garbage collection of unused attachments
3. **Rate Limiting**: Limit attachment size/count per message or per day
4. **Scanning**: Virus/malware scanning via external service
5. **Encryption**: Store attachments encrypted at rest
6. **Compression**: Auto-compress large images before storage
7. **Thumbnail Generation**: Create thumbnails for preview
8. **External Storage**: S3, Google Cloud Storage, etc.
9. **CDN Distribution**: Serve attachments through CDN for performance
10. **Attachment Reactions**: React with emoji to specific attachments

---

## 15. SUMMARY OF INTEGRATION POINTS

| Layer | File | Current Function | Required Changes |
|-------|------|------------------|------------------|
| Types | `src/shared/types.ts` | MessageRecord, MessageDraft | Add `attachments?` field |
| Database Schema | `src/main/database/schema.ts` | CREATE TABLE messages | Add `attachments TEXT` column |
| Database Mapper | `src/main/database/repository.ts` | mapMessage() | Parse attachments JSON |
| Database Write | `src/main/database/repository.ts` | createMessage() | Insert attachments JSON |
| React Input | `src/renderer/src/components/ChatView/MessageInput.tsx` | handleSend() | Add file picker + state |
| React State | `src/renderer/src/store/app-store.ts` | sendMessage() | No changes (types automatic) |
| IPC Preload | `src/preload/index.ts` | messages.create() | No changes (types automatic) |
| IPC Handler | `src/main/ipc.ts` | MESSAGES_CREATE handler | No changes (routes to router) |
| Message Router | `src/main/message-router.ts` | routeMessage(), dispatchApi(), dispatchCli() | Extract/transform attachments |
| API Client | `src/main/api-client.ts` | streamChat() | Support Vision API format |
| Message Display | `src/renderer/src/components/ChatView/MessageTimeline.tsx` | MessageBubble | Add AttachmentGallery component |

