# AgentCrew Message Flow - Complete Exploration Summary

## Documents Created

I've created three comprehensive documents in your repository:

1. **MESSAGE_FLOW_ANALYSIS.md** (38 KB, 995 lines)
   - Complete architectural analysis
   - All 15 layers of the message flow
   - Integration points and patterns
   - Future extensions and decisions

2. **KEY_CODE_SNIPPETS.md** (17 KB)
   - Ready-to-use code implementations
   - All 8 files that need modification
   - Copy-paste ready snippets

3. **QUICK_START.md** (8 KB)
   - 75-minute implementation roadmap
   - Step-by-step guide
   - Testing checklist
   - FAQ and next steps

---

## Key Findings

### The Message Lifecycle (90 lines of text flow)

```
1. USER INPUT (MessageInput.tsx)
   └─> User selects images + types message
   └─> handleSend() calls store.sendMessage()

2. STATE MANAGEMENT (app-store.ts)
   └─> sendMessage(draft) invokes IPC
   └─> Draft now includes: { content, mentions, attachments }

3. IPC BRIDGE (preload/index.ts)
   └─> window.api.messages.create(draft)
   └─> NO CHANGES NEEDED (types automatic)

4. IPC HANDLER (ipc.ts line 58)
   └─> MESSAGES_CREATE routes to messageRouter.routeMessage()
   └─> NO CHANGES NEEDED (routes through existing handler)

5. MESSAGE ROUTER (message-router.ts line 92)
   
   a) repository.createMessage(draft)
      └─> Insert into DB with attachments JSON
      └─> Return MessageRecord with attachments
   
   b) broadcast(msg)
      └─> Send via IPC MESSAGES_STREAM to renderer
      └─> UI appends message with images to timeline
   
   c) Determine agents from @mentions
   
   d) For each agent:
      └─> if CLI: dispatchCli() with attachment references
      └─> if API: dispatchApi() with Vision API format

6. DATABASE LAYER (repository.ts)
   
   a) mapMessage() parses attachments JSON
   b) createMessage() persists attachments JSON
   └─> Column: attachments TEXT DEFAULT '[]'

7. API CLIENT (api-client.ts)
   └─> Detect Vision API support
   └─> Transform messages to Vision format:
       { role, content: [{ type: 'text' }, { type: 'image_url' }] }

8. MESSAGE DISPLAY (MessageTimeline.tsx)
   └─> AttachmentGallery component renders images
   └─> Integrates with existing MessageBubble

RESULT: Agent receives images + text context
```

### Data Flow Through the System

```
INPUT LAYER:
  User selects images → base64 in local state
                        │
                        ▼
  User clicks Send → MessageDraft {
                      channelId, content, mentions,
                      attachments: [{
                        type, mimeType, filename, size, url
                      }]
                    }

TRANSPORT LAYER:
  IPC invoke → window.api.messages.create(draft)
               │
               ▼
  Main process ← receives draft
                │
                ▼
  messageRouter.routeMessage()

STORAGE LAYER:
  attachments array → JSON.stringify()
                      │
                      ▼
  "attachments" column ← INSERT into messages table
                        │
                        ▼
  SELECT * FROM messages ← mapMessage() parses JSON

RETRIEVAL LAYER:
  MessageRecord {
    id, channelId, content, mentions,
    attachments: [{id, type, mimeType, filename, size, url}]
  }
                │
                ▼
  broadcast(msg) ← IPC MESSAGES_STREAM
                   │
                   ▼
  Renderer ← appends to store.messages

DISPLAY LAYER:
  MessageBubble {
    content: "...text..."
    <AttachmentGallery>
      <img src="data:image/png;base64,..." />
    </AttachmentGallery>
  }

AGENT LAYER:
  dispatchApi():
    if (msg.attachments) {
      chatMessage = {
        role: 'user',
        content: [
          { type: 'text', text: '...content...' },
          { type: 'image_url', image_url: { url: '...' } }
        ]
      }
    }
    → send to API with Vision support
```

---

## Architecture Patterns Discovered

### 1. Message Creation Path (Lines 92-120 in message-router.ts)
```
routeMessage(draft) 
  → repository.createMessage(draft)      [persist]
  → broadcast(msg)                       [UI update]
  → dispatchCli/dispatchApi(agent)       [agent dispatch]
```

### 2. Entity Mapping Pattern (repository.ts)
All entities follow:
```typescript
function mapEntity(row: Record<string, unknown>): Entity {
  return {
    field1: row.field_1 as Type,
    jsonField: parseJson(row.json_field as string, [])  // ← for attachments
  }
}
```

### 3. IPC Transaction Pattern (ipc.ts)
```
ipcMain.handle(IPC.CHANNEL, async (_, ...args) => {
  // Automatic type safety via TypeScript
  // No changes needed for new optional fields
})
```

### 4. State Management Pattern (app-store.ts)
```
action(draft) 
  → window.api.method(draft)     [IPC invoke]
  → result                        [automatic broadcast]
  → store.refresh() or set()      [UI update]
```

---

## Integration Points (11 locations)

| # | Layer | File | Function | Integration Type |
|---|-------|------|----------|------------------|
| 1 | Types | shared/types.ts | MessageRecord | Add optional attachments field |
| 2 | Types | shared/types.ts | MessageDraft | Add optional attachments field |
| 3 | Schema | database/schema.ts | initializeSchema | Migration: ALTER TABLE |
| 4 | Mapper | database/repository.ts | mapMessage | Parse attachments JSON |
| 5 | Write | database/repository.ts | createMessage | Persist attachments JSON |
| 6 | UI Input | ChatView/MessageInput.tsx | handleSend | Include attachments in draft |
| 7 | UI Input | ChatView/MessageInput.tsx | render | File picker + preview |
| 8 | UI Display | ChatView/MessageTimeline.tsx | MessageBubble | Render AttachmentGallery |
| 9 | Router | message-router.ts | dispatchApi | Transform to Vision API |
| 10 | Router | message-router.ts | dispatchCli | Handle temp file refs |
| 11 | API | api-client.ts | streamChat | Support Vision format |

---

## Files Analyzed

### Frontend (Renderer)
1. ✅ `src/renderer/src/store/app-store.ts` (202 lines)
   - State management for messages
   - sendMessage() invokes IPC

2. ✅ `src/renderer/src/components/ChatView/ChatView.tsx` (187 lines)
   - Main chat view layout
   - Manages tabs and message timeline

3. ✅ `src/renderer/src/components/ChatView/MessageInput.tsx` (105 lines)
   - User message input
   - @mention support
   - **NEEDS**: File picker, attachment state, preview gallery

4. ✅ `src/renderer/src/components/ChatView/MessageTimeline.tsx` (121 lines)
   - Renders all messages in channel
   - Shows thinking indicators
   - **NEEDS**: AttachmentGallery component

### Backend (Main Process)
5. ✅ `src/main/ipc.ts` (107 lines)
   - IPC handler registration
   - Routes MESSAGES_CREATE to messageRouter

6. ✅ `src/main/message-router.ts` (677 lines)
   - Core message orchestration
   - dispatchApi() and dispatchCli() implementations
   - **NEEDS**: Vision API transformation in dispatchApi()

7. ✅ `src/main/api-client.ts` (142 lines)
   - OpenAI-compatible API streaming
   - **NEEDS**: Vision API message format support

8. ✅ `src/main/database/schema.ts` (111 lines)
   - Database initialization and migrations
   - **NEEDS**: ADD COLUMN for attachments

9. ✅ `src/main/database/repository.ts` (389 lines)
   - Entity persistence layer
   - mapMessage() and createMessage()
   - **NEEDS**: Attachment parsing and persistence

### Shared
10. ✅ `src/shared/types.ts` (153 lines)
    - Type definitions
    - **NEEDS**: MessageAttachment, extensions to MessageRecord/MessageDraft

11. ✅ `src/preload/index.ts` (99 lines)
    - IPC bridge between renderer and main
    - **NO CHANGES NEEDED** (types automatic)

12. ✅ `src/shared/ipc-channels.ts` (60 lines)
    - IPC channel constants
    - **NO CHANGES NEEDED**

---

## Critical Code Patterns

### Pattern 1: Type-Driven Design
The app uses TypeScript's type system to enforce consistency across IPC boundaries:
```
MessageDraft (frontend type)
  ↓ (IPC serialization automatic)
MessageDraft (backend receives typed)
  ↓ (type checking at compile time)
repository.createMessage(draft: MessageDraft)
  → No type casting needed
```
**Implication**: Adding optional `attachments?` field automatically propagates everywhere.

### Pattern 2: JSON Serialization for Complex Types
All complex objects stored in DB use JSON:
```typescript
parseJson(row.field as string, [])  // ← handles both null and parsing
JSON.stringify(object)               // ← for storage
```
**Implication**: Attachments array naturally fits this pattern.

### Pattern 3: Broadcasting Pattern
Messages flow to UI via IPC broadcasts:
```typescript
broadcast(msg)  // → win.webContents.send(IPC.MESSAGES_STREAM, msg)
```
Renderer listens:
```typescript
window.api.messages.onStream((msg) => appendMessage(msg))
```
**Implication**: Once database persists attachments, UI automatically receives them.

### Pattern 4: Agent Dispatch Multiplexing
Messages can dispatch to multiple agents based on mentions:
```typescript
for (const agentId of agentIds) {
  const agent = repository.getAgent(agentId)
  if (agent.type === 'cli') dispatchCli(...)
  else if (agent.type === 'api') dispatchApi(...)
}
```
**Implication**: Each agent type handles attachments differently.

---

## Content Analysis

### MessageInput.tsx (105 lines currently)
**Current responsibilities**:
- Text input and focus management
- @mention detection and popup
- parseMentions() to extract agent IDs
- handleSend() builds MessageDraft

**What's missing for attachments**:
- File input element (hidden)
- File picker handler
- Base64 conversion
- Attachment state management
- Preview gallery rendering
- Updated handleSend() to include attachments

**Estimated additions**: ~80 lines of code

### MessageTimeline.tsx (121 lines currently)
**Current responsibilities**:
- Fetch and format all messages
- Group by date
- Render MessageBubble for each
- Show thinking indicators

**What's missing for attachments**:
- AttachmentGallery component (~30 lines)
- Conditional rendering in MessageBubble
- Image styling

**Estimated additions**: ~40 lines of code

### message-router.ts (677 lines currently)
**Current responsibilities**:
- routeMessage entry point
- CLI and API agent dispatch
- PTY management for CLI tools
- Output summarization
- Memory management

**What's missing for attachments**:
- In dispatchApi(): Check for attachments, transform to Vision format
- In dispatchCli(): Save attachments to temp files, reference in prompt

**Estimated additions**: ~60 lines of code (mostly in dispatchApi)

### api-client.ts (142 lines currently)
**Current responsibilities**:
- Construct OpenAI-compatible request
- Stream and parse SSE responses
- Error handling

**What's missing for attachments**:
- Vision API message format support
- Message transformation logic
- Optional supportsVision detection

**Estimated additions**: ~40 lines of code

---

## Backward Compatibility

### What stays the same
- ✅ All text-only messages work unchanged
- ✅ All existing agent configurations work unchanged
- ✅ All existing database records work unchanged (attachments default to [])
- ✅ IPC interface unchanged (optional field doesn't break calls)
- ✅ App store logic unchanged (types are just more specific)

### What changes
- ✅ MessageRecord type gains optional field
- ✅ Database schema gains optional column
- ✅ UI gains file picker button
- ✅ Agent dispatch has new capability

---

## Performance Considerations

**Storage**:
- Base64 encoding adds ~33% size overhead
- Example: 100KB image → ~133KB in JSON
- Mitigation: Implement image compression in Phase 2

**Rendering**:
- Thumbnail preview in input: no performance impact (<60px square)
- Message display: single <img> per attachment, browser optimized
- Mitigation: Lazy load large images in Phase 2

**Network**:
- Base64 images transmit via IPC in-process (no network)
- Vision API sends to external LLM (inherent network cost)
- Mitigation: Batch small images, compress before Phase 2

---

## Security Considerations

**Current MVP**:
- ✅ Images from user's local filesystem only (no web upload)
- ✅ Base64 stored in local SQLite database (no external exposure)
- ✅ IPC bridge internal to Electron (no network exposure)

**Phase 2 considerations**:
- 🔒 Implement file type validation (magic bytes, not just MIME)
- 🔒 Scan for malware before storage
- 🔒 Implement rate limiting (max images per message/day)
- 🔒 Add encryption for attachments at rest
- 🔒 Implement access control (who can see attachments)

---

## Total Code Changes Estimate

| Component | Current | New | Δ | % |
|-----------|---------|-----|---|---|
| Types | 153 | 170 | +17 | +11% |
| Schema | 111 | 115 | +4 | +4% |
| Repository | 389 | 410 | +21 | +5% |
| MessageInput | 105 | 185 | +80 | +76% |
| MessageTimeline | 121 | 160 | +39 | +32% |
| MessageRouter | 677 | 737 | +60 | +9% |
| ApiClient | 142 | 182 | +40 | +28% |
| CSS | 210 | 310 | +100 | +48% |
| **TOTAL** | **1908** | **2269** | **+361** | **+19%** |

---

## Recommendations

### For MVP (Phase 1)
1. Start with types and database (lowest risk)
2. Add file picker and preview UI
3. Implement Vision API transformation
4. Test end-to-end with one LLM provider

### For Phase 2
1. Migrate from base64 to file storage (S3, local fs)
2. Add image compression and thumbnails
3. Implement CLI attachment support (temp files)
4. Add attachment reactions and metadata

### For Phase 3
1. Attachment search and filtering
2. Garbage collection for orphaned attachments
3. End-to-end encryption
4. CDN distribution for attachments

---

## Key Takeaways

1. **The architecture is attachment-ready** — Most infrastructure already exists, just needs types
2. **Type safety does heavy lifting** — Adding optional fields propagates automatically through IPC
3. **JSON storage pattern is proven** — Already used for mentions, will work for attachments
4. **Agent dispatch is flexible** — Can handle attachments differently per agent type
5. **UI is component-based** — Can add attachment features without touching core message flow
6. **Database migrations are safe** — Try/catch pattern prevents errors on re-runs
7. **No breaking changes needed** — Entirely backward compatible

