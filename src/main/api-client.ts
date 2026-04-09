import https from 'https'
import http from 'http'
import { URL } from 'url'

interface ChatMessageContent {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatMessageContent[]
}

interface ApiClientOptions {
  endpoint: string
  apiKey: string
  model: string
  systemPrompt?: string
}

const OUTPUT_CONSTRAINT = `
IMPORTANT: Keep your responses concise. When describing file operations:
- For file creation: state "Created <path>" with a brief description
- For file modification: state "Modified <path>:<lines>" with what changed
- For commands: state "Ran <command>" with the result summary
- Never paste full file contents in your response
`.trim()

export class ApiClient {
  /**
   * Send a chat completion request with SSE streaming.
   * Calls onChunk for each text delta, onDone when complete.
   * Supports Vision API with image attachments.
   */
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

    // If the endpoint already includes /chat/completions, use it directly.
    // Otherwise treat it as a base URL and append /chat/completions.
    let chatUrl: URL
    if (endpoint.includes('/chat/completions')) {
      chatUrl = new URL(endpoint)
    } else {
      const url = new URL(endpoint.endsWith('/') ? endpoint : endpoint + '/')
      chatUrl = new URL('chat/completions', url)
    }

    const body = JSON.stringify({
      model,
      messages: allMessages,
      stream: true
    })

    const isHttps = chatUrl.protocol === 'https:'
    const requestFn = isHttps ? https.request : http.request

    const req = requestFn(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream'
      }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          onError(new Error(`API error ${res.statusCode}: ${body.slice(0, 500)}`))
        })
        return
      }

      let fullText = ''
      let buffer = ''
      let done = false

      const finalize = () => {
        if (done) return
        done = true
        onDone(fullText)
      }

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            finalize()
            return
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string }
                finish_reason?: string
              }>
            }
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              fullText += delta
              onChunk(delta)
            }
            if (parsed.choices?.[0]?.finish_reason === 'stop') {
              finalize()
            }
          } catch {
            // Skip malformed JSON
          }
        }
      })

      res.on('end', () => {
        if (fullText) {
          finalize()
        }
      })

      res.on('error', onError)
    })

    req.on('error', onError)
    req.write(body)
    req.end()
  }
}
