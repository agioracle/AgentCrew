import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import { Send } from 'lucide-react'

export function MessageInput() {
  const activeChannelId = useAppStore(s => s.activeChannelId)
  const agents = useAppStore(s => s.agents)
  const channels = useAppStore(s => s.channels)
  const sendMessage = useAppStore(s => s.sendMessage)

  const [text, setText] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeChannel = channels.find(ch => ch.id === activeChannelId)
  const channelAgents = agents.filter(a => activeChannel?.memberIds.includes(a.id))

  const filteredAgents = channelAgents.filter(a =>
    a.name.toLowerCase().includes(mentionFilter.toLowerCase())
  )

  const handleInput = (value: string) => {
    setText(value)
    // Detect @ at end of text
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

  const handleSend = async () => {
    if (!text.trim() || !activeChannelId) return
    const mentions = parseMentions(text)
    await sendMessage({
      channelId: activeChannelId,
      senderType: 'human',
      content: text.trim(),
      mentions
    })
    setText('')
    setShowMentions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

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
        <button className="btn btn-primary send-btn" onClick={handleSend} disabled={!text.trim()}>
          <Send size={14} /> Send
        </button>
      </div>
    </div>
  )
}
