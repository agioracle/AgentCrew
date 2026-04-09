import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import { Send, Paperclip } from 'lucide-react'
import type { MessageAttachment } from '@shared/types'

interface PendingImage {
  id: string
  dataUrl: string // base64 data URL for preview
  filename: string
  mimeType: string
  size: number
}

export function MessageInput() {
  const activeChannelId = useAppStore(s => s.activeChannelId)
  const agents = useAppStore(s => s.agents)
  const channels = useAppStore(s => s.channels)
  const sendMessage = useAppStore(s => s.sendMessage)

  const [text, setText] = useState('')
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeChannel = channels.find(ch => ch.id === activeChannelId)
  const channelAgents = agents.filter(a => activeChannel?.memberIds.includes(a.id))

  // File to base64 data URL
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Add image files to pending list
  const addImageFiles = async (files: File[]) => {
    setIsUploading(true)
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        const dataUrl = await fileToBase64(file)
        setPendingImages(prev => [...prev, {
          id: `temp-${Date.now()}-${Math.random()}`,
          dataUrl,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        }])
      }
    } finally {
      setIsUploading(false)
    }
  }

  // Handle file picker selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (!files) return
    await addImageFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Handle paste — detect images in clipboard
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault() // prevent pasting image as text
      await addImageFiles(imageFiles)
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

  const handleSend = async () => {
    if ((!text.trim() && pendingImages.length === 0) || !activeChannelId) return

    // Upload images to disk and build attachments
    const attachments: Omit<MessageAttachment, 'id'>[] = []
    for (const img of pendingImages) {
      try {
        const filePath = await window.api.upload.image(img.dataUrl, img.filename)
        attachments.push({
          type: 'image',
          mimeType: img.mimeType,
          filename: img.filename,
          size: img.size,
          url: img.dataUrl, // base64 for display & API agent
          data: filePath,   // local file path for CLI agent
        })
      } catch (err) {
        console.error('Failed to upload image:', err)
      }
    }

    const mentions = parseMentions(text)
    await sendMessage({
      channelId: activeChannelId,
      senderType: 'human',
      content: text.trim(),
      mentions,
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    setText('')
    setPendingImages([])
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
      {pendingImages.length > 0 && (
        <div className="attachments-preview">
          {pendingImages.map(img => (
            <div key={img.id} className="attachment-item">
              <img
                src={img.dataUrl}
                alt={img.filename}
                className="attachment-thumbnail"
                title={img.filename}
              />
              <button
                className="attachment-remove"
                onClick={() => setPendingImages(prev => prev.filter(p => p.id !== img.id))}
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
          onPaste={handlePaste}
          rows={1}
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
          aria-hidden="true"
        />

        <button className="btn btn-primary send-btn" onClick={handleSend} disabled={!text.trim() && pendingImages.length === 0}>
          <Send size={14} /> Send
        </button>
      </div>
    </div>
  )
}
