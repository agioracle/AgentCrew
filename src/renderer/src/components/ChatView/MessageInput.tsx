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
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeChannel = channels.find(ch => ch.id === activeChannelId)
  const channelAgents = agents.filter(a => activeChannel?.memberIds.includes(a.id))

  // File to base64 converter
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Handle file selection
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
        fileInputRef.current.value = '' // Reset input
      }
    }
  }

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
    if ((!text.trim() && attachments.length === 0) || !activeChannelId) return

    const mentions = parseMentions(text)
    await sendMessage({
      channelId: activeChannelId,
      senderType: 'human',
      content: text.trim(),
      mentions,
      attachments: attachments.map(({ id, ...rest }) => rest) // Remove temp IDs
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

      {/* Attachment preview gallery */}
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

        {/* Image attachment button */}
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
