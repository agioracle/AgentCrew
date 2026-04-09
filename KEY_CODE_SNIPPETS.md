# Key Code Snippets for Image Attachment Implementation

## 1. TYPE DEFINITIONS TO ADD (src/shared/types.ts)

```typescript
// New attachment interface
export interface MessageAttachment {
  id: string
  type: 'image' | 'file' | 'code'
  mimeType: string
  filename: string
  size: number
  url: string
  data?: string
  metadata?: Record<string, unknown>
}

// Extend existing MessageRecord
export interface MessageRecord {
  id: string
  channelId: string
  senderType: SenderType
  senderId: string | null
  content: string
  mentions: string[]
  createdAt: string
  attachments?: MessageAttachment[]  // NEW
}

// Extend existing MessageDraft
export interface MessageDraft {
  channelId: string
  senderType: SenderType
  senderId?: string | null
  content: string
  mentions?: string[]
  attachments?: Omit<MessageAttachment, 'id'>[]  // NEW
}
```

---

## 2. DATABASE SCHEMA CHANGES (src/main/database/schema.ts)

```typescript
// Add to migrateIfNeeded() function:
function migrateIfNeeded(db: Database.Database): void {
  const migrations = [
    // ... existing migrations ...
    "ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]'",  // NEW
  ]
  for (const sql of migrations) {
    try {
      db.exec(sql)
    } catch {
      // Column already exists — ignore
    }
  }
}
```

---

## 3. DATABASE REPOSITORY UPDATES (src/main/database/repository.ts)

```typescript
// Update mapMessage function
function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: row.id as string,
    channelId: row.channel_id as string,
    senderType: row.sender_type as MessageRecord['senderType'],
    senderId: (row.sender_id as string | null) ?? null,
    content: row.content as string,
    mentions: parseJson(row.mentions as string, []),
    createdAt: row.created_at as string,
    attachments: parseJson(row.attachments as string, [])  // NEW
  }
}

// Update createMessage function
createMessage(draft: MessageDraft): MessageRecord {
  const id = randomUUID()
  const ts = now()
  
  // Generate IDs for attachments
  const attachments = (draft.attachments ?? []).map(att => ({
    ...att,
    id: randomUUID()
  }))
  
  this.db.prepare(`
    INSERT INTO messages (id, channel_id, sender_type, sender_id, content, mentions, attachments, created_at)
    VALUES (@id, @channel_id, @sender_type, @sender_id, @content, @mentions, @attachments, @created_at)
  `).run({
    id,
    channel_id: draft.channelId,
    sender_type: draft.senderType,
    sender_id: draft.senderId ?? null,
    content: draft.content,
    mentions: JSON.stringify(draft.mentions ?? []),
    attachments: JSON.stringify(attachments),  // NEW
    created_at: ts
  })
  
  return mapMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>)
}
```

---

## 4. MESSAGE INPUT COMPONENT (src/renderer/src/components/ChatView/MessageInput.tsx)

```typescript
import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import { Send, Paperclip } from 'lucide-react'
import type { MessageAttachment } from '@shared/types'

export function MessageInput() {
  const activeChannelId = useAppStore(s => s.activeChannelId)
  const agents = useAppStore(s => s.agents)
  const channels = useAppStore(s => s.channels)
  const sendMessage = useAppStore(s => s.sendMessage)

  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])  // NEW
  const [isUploading, setIsUploading] = useState(false)  // NEW
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)  // NEW

  const activeChannel = channels.find(ch => ch.id === activeChannelId)
  const channelAgents = agents.filter(a => activeChannel?.memberIds.includes(a.id))

  // NEW: File to base64 converter
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // NEW: Handle file selection
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

        const base64 = await fileToBase64(file)
        setAttachments(prev => [...prev, {
          id: `temp-${Date.now()}-${Math.random()}`,
          type: 'image',
          mimeType: file.type,
          filename: file.name,
          size: file.size,
          url: base64,
        }])
      }
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''  // Reset input
      }
    }
  }

  const handleInput = (value: string) => {
    setText(value)
    const atMatch = value.match(/@(\w*)$/)
    if (atMatch) {
      setShowMentions(true)
      setMentionFilter(atMatch[1])
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (agentName: string) => {
    const newText = text.replace(/@\w*$/, `@${agentName} `)
    setText(newText)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  const parseMentions = useCallback((content: string): string[] => {
    const mentions: string[] = []
    const pattern = /@(\S+)/g
    let match
    while ((match = pattern.exec(content)) !== null) {
      const agent = agents.find(a => a.name.toLowerCase() === match![1].toLowerCase())
      if (agent) mentions.push(agent.id)
    }
    return mentions
  }, [agents])

  // UPDATED: Include attachments
  const handleSend = async () => {
    if ((!text.trim() && attachments.length === 0) || !activeChannelId) return
    
    const mentions = parseMentions(text)
    await sendMessage({
      channelId: activeChannelId,
      senderType: 'human',
      content: text.trim(),
      mentions,
      attachments: attachments.map(({ id, ...rest }) => rest)  // Remove temp IDs
    })
    
    setText('')
    setAttachments([])
    setShowMentions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const filteredAgents = channelAgents.filter(a =>
    a.name.toLowerCase().includes(mentionFilter.toLowerCase())
  )

  return (
    <div className="message-input-container">
      {showMentions && filteredAgents.length > 0 && (
        <div className="mention-popup">
          {filteredAgents.map(agent => (
            <div
              key={agent.id}
              className="mention-item"
              onClick={() => insertMention(agent.name)}
            >
              @{agent.name}
            </div>
          ))}
        </div>
      )}

      {/* NEW: Attachment preview gallery */}
      {attachments.length > 0 && (
        <div className="attachments-preview">
          {attachments.map(att => (
            <div key={att.id} className="attachment-item">
              <img 
                src={att.url} 
                alt={att.filename} 
                className="attachment-thumbnail"
                title={att.filename}
              />
              <button
                className="attachment-remove"
                onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                aria-label="Remove attachment"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

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
        
        {/* NEW: Image attachment button */}
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
          aria-hidden="true"
        />

        <button className="btn btn-primary send-btn" onClick={handleSend} disabled={!text.trim() && attachments.length === 0}>
          <Send size={14} /> Send
        </button>
      </div>
    </div>
  )
}
```

---

## 5. MESSAGE DISPLAY COMPONENT (src/renderer/src/components/ChatView/MessageTimeline.tsx)

```typescript
import { useAppStore } from '../../store/app-store'
import type { MessageRecord, MessageAttachment } from '@shared/types'
import { User, Bot } from 'lucide-react'
import { AgentIcon } from '../AgentIcon'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// NEW: Attachment display component
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
  const agents = useAppStore(s => s.agents)
  const userName = useAppStore(s => s.userName)
  const isHuman = message.senderType === 'human'
  const agent = !isHuman ? agents.find(a => a.id === message.senderId) : null

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
        
        {/* NEW: Display attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentGallery attachments={message.attachments} />
        )}
      </div>
    </div>
  )
}

// ... rest of MessageTimeline implementation unchanged ...
```

---

## 6. MESSAGE ROUTER - ATTACHMENT HANDLING (src/main/message-router.ts)

```typescript
// In dispatchApi (around line 570):
private dispatchApi(agent: AgentRecord, channelId: string, prompt: string): void {
  if (!agent.apiEndpoint || !agent.apiKey || !agent.model) {
    this.postError(channelId, agent.id, new Error('API agent missing configuration'))
    return
  }

  const enrichedPrompt = this.recallContext(agent, channelId, prompt)
  this.ctx.repository.updateAgentStatus(agent.id, 'running')
  this.startThinking(agent.id, channelId)

  // Build conversation context from recent channel messages
  const recentMessages = this.ctx.repository.listMessages(channelId, 20)
  
  // NEW: Transform messages to Vision API format if needed
  const chatMessages = recentMessages.map(m => {
    const baseMessage = {
      role: (m.senderType === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content
    }

    // If message has attachments, include them in Vision API format
    if (m.attachments && m.attachments.length > 0) {
      return {
        ...baseMessage,
        attachments: m.attachments.map(att => ({
          type: att.type === 'image' ? 'image' : 'file',
          url: att.url,
          mimeType: att.mimeType
        }))
      }
    }

    return baseMessage
  })

  // Replace last user message with enriched version
  if (chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'user') {
    chatMessages[chatMessages.length - 1].content = enrichedPrompt
  }

  let fullResponse = ''

  ApiClient.streamChat(
    {
      endpoint: agent.apiEndpoint,
      apiKey: agent.apiKey,
      model: agent.model,
      systemPrompt: agent.systemPrompt ?? undefined
    },
    chatMessages,
    // onChunk
    (chunk) => {
      this.stopThinking(agent.id)
      fullResponse += chunk
      this.broadcast({ type: 'agent-stream-chunk', agentId: agent.id, channelId, chunk, fullText: fullResponse })
    },
    // onDone
    (fullText) => {
      const replyMsg = this.ctx.repository.createMessage({
        channelId,
        senderType: 'agent',
        senderId: agent.id,
        content: fullText || '(No response)',
      })
      this.broadcast(replyMsg)
      this.ctx.repository.updateAgentStatus(agent.id, 'idle')
      this.retainMemory(agent, channelId, fullText || '')
    },
    // onError
    (err) => {
      this.stopThinking(agent.id)
      this.postError(channelId, agent.id, err)
      this.ctx.repository.updateAgentStatus(agent.id, 'error')
    }
  )
}
```

---

## 7. API CLIENT - VISION SUPPORT (src/main/api-client.ts)

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>
  attachments?: Array<{ type: string; url: string; mimeType: string }>  // NEW
}

interface ApiClientOptions {
  endpoint: string
  apiKey: string
  model: string
  systemPrompt?: string
  supportsVision?: boolean  // NEW
}

export class ApiClient {
  static async streamChat(
    options: ApiClientOptions,
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    const { endpoint, apiKey, model, systemPrompt } = options

    const allMessages: ChatMessage[] = []
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt + '\n\n' + OUTPUT_CONSTRAINT })
    } else {
      allMessages.push({ role: 'system', content: OUTPUT_CONSTRAINT })
    }
    allMessages.push(...messages)

    // NEW: Transform to Vision API format if supported
    const transformedMessages = options.supportsVision 
      ? allMessages.map(msg => {
          if (typeof msg.content === 'string' && msg.attachments?.length) {
            return {
              ...msg,
              content: [
                { type: 'text' as const, text: msg.content },
                ...msg.attachments.map(att => ({
                  type: 'image_url' as const,
                  image_url: { url: att.url }
                }))
              ]
            }
          }
          return msg
        })
      : allMessages

    const body = JSON.stringify({
      model,
      messages: transformedMessages,
      stream: true
    })

    // ... rest of implementation unchanged ...
  }
}
```

---

## 8. CSS ADDITIONS (src/renderer/src/components/ChatView/ChatView.css)

```css
/* Attachment preview gallery in input */
.attachments-preview {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
  align-items: center;
}

.attachment-item {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.attachment-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.attachment-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 3px;
  width: 20px;
  height: 20px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.attachment-item:hover .attachment-remove {
  opacity: 1;
}

/* Attachment gallery in message display */
.attachment-gallery {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.attachment {
  max-width: 300px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-secondary);
}

.attachment-image {
  max-width: 100%;
  max-height: 400px;
  display: block;
  border-radius: 6px;
  cursor: pointer;
}

.attachment-image:hover {
  opacity: 0.9;
}

.attachment-file {
  display: inline-block;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text-primary);
  cursor: pointer;
}

.attachment-file:hover {
  background: var(--bg-hover);
}
```

