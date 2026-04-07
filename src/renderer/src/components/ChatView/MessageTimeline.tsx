import { useAppStore } from '../../store/app-store'
import type { MessageRecord } from '@shared/types'
import { User, Bot } from 'lucide-react'

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

export function MessageBubble({ message }: { message: MessageRecord }) {
  const agents = useAppStore(s => s.agents)
  const isHuman = message.senderType === 'human'
  const agent = !isHuman ? agents.find(a => a.id === message.senderId) : null

  return (
    <div className="message-bubble">
      <div className="message-avatar">
        {isHuman ? (
          <div className="avatar avatar-human"><User size={16} /></div>
        ) : (
          <div className="avatar avatar-agent"><Bot size={16} /></div>
        )}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="message-sender">{isHuman ? 'you' : (agent?.name ?? 'agent')}</span>
          <span className="message-role">{isHuman ? 'owner' : 'agent'}</span>
          <span className="message-time">{formatTime(message.createdAt)}</span>
        </div>
        <div className="message-content">{message.content}</div>
      </div>
    </div>
  )
}

export function MessageTimeline() {
  const messages = useAppStore(s => s.messages)

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
    </div>
  )
}
