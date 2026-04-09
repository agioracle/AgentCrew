import { useAppStore } from '../../store/app-store'
import type { MessageRecord, MessageAttachment } from '@shared/types'
import { User, Bot } from 'lucide-react'
import { AgentIcon } from '../AgentIcon'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString()
}

// Attachment display component
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
            <div className="attachment-file">
              <div className="attachment-icon">📎</div>
              <div className="attachment-info">
                <div className="attachment-filename">{att.filename}</div>
                <div className="attachment-size">{(att.size / 1024).toFixed(1)} KB</div>
              </div>
            </div>
          )}
          {att.type === 'code' && (
            <div className="attachment-code">
              <pre><code>{att.data?.substring(0, 200)}{att.data && att.data.length > 200 ? '...' : ''}</code></pre>
            </div>
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
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentGallery attachments={message.attachments} />
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator({ agentName, agentIcon, verb }: { agentName: string; agentIcon: string; verb: string }) {
  return (
    <div className="message-bubble thinking-bubble">
      <div className="message-avatar">
        <div className="avatar avatar-agent"><AgentIcon icon={agentIcon} size={16} /></div>
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="message-sender">{agentName}</span>
          <span className="message-role">agent</span>
        </div>
        <div className="message-content thinking-content">
          <span className="thinking-verb">{verb}</span>
          <span className="thinking-dots">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export function MessageTimeline() {
  const messages = useAppStore(s => s.messages)
  const agents = useAppStore(s => s.agents)
  const thinkingAgents = useAppStore(s => s.thinkingAgents)
  const activeChannelId = useAppStore(s => s.activeChannelId)

  if (messages.length === 0) {
    return (
      <div className="timeline-empty">
        <p>No messages yet. Start the conversation!</p>
      </div>
    )
  }

  // Group by date
  let lastDate = ''
  const items: Array<{ type: 'date'; date: string } | { type: 'msg'; msg: MessageRecord }> = []
  for (const msg of messages) {
    const date = formatDate(msg.createdAt)
    if (date !== lastDate) {
      items.push({ type: 'date', date })
      lastDate = date
    }
    items.push({ type: 'msg', msg })
  }

  return (
    <div className="message-timeline">
      {items.map((item, i) =>
        item.type === 'date' ? (
          <div key={`d-${i}`} className="date-separator">
            <span>{item.date}</span>
          </div>
        ) : (
          <MessageBubble key={item.msg.id} message={item.msg} />
        )
      )}
      {/* Thinking indicators for agents currently processing in this channel */}
      {Object.entries(thinkingAgents)
        .filter(([key]) => key.endsWith(`:${activeChannelId}`))
        .map(([key, verb]) => {
        const agentId = key.split(':')[0]
        const agent = agents.find(a => a.id === agentId)
        return (
          <ThinkingIndicator
            key={`thinking-${agentId}`}
            agentName={agent?.name ?? 'agent'}
            agentIcon={agent?.icon ?? 'bot'}
            verb={verb}
          />
        )
      })}
    </div>
  )
}
