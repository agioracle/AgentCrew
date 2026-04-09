# Image Attachment Support - Quick Start Guide

## Overview
This guide provides a quick reference for implementing image attachment support in AgentCrew. Full documentation is available in `MESSAGE_FLOW_ANALYSIS.md` and `KEY_CODE_SNIPPETS.md`.

---

## Architecture at a Glance

```
User selects image in UI
         ↓
   MessageInput.tsx (file picker)
         ↓
   Convert to base64, store in local state
         ↓
   User clicks Send
         ↓
   sendMessage(draft) with attachments
         ↓
   [IPC Bridge] → Main process
         ↓
   messageRouter.routeMessage()
         ↓
   ┌─────────────────────────────────────────┐
   │ repository.createMessage()              │
   │ • Insert into DB with attachments JSON  │
   └─────────────────────────────────────────┘
         ↓
   ┌─────────────────────────────────────────┐
   │ broadcast() → send via IPC              │
   │ • Message received in UI                │
   │ • MessageTimeline displays attachment   │
   └─────────────────────────────────────────┘
         ↓
   ┌─────────────────────────────────────────┐
   │ dispatchApi() / dispatchCli()           │
   │ • Transform for Vision API if needed    │
   │ • Pass images to agent                  │
   └─────────────────────────────────────────┘
         ↓
   Agent processes with image context
         ↓
   Agent reply (text-only or with images)
```

---

## Implementation Roadmap

### 1. Add Type Definitions (5 min)
**File**: `src/shared/types.ts`

Add the `MessageAttachment` interface and extend `MessageRecord` and `MessageDraft`:

```typescript
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

export interface MessageRecord {
  // ... existing fields ...
  attachments?: MessageAttachment[]
}

export interface MessageDraft {
  // ... existing fields ...
  attachments?: Omit<MessageAttachment, 'id'>[]
}
```

### 2. Database Migration (5 min)
**File**: `src/main/database/schema.ts`

Add column migration:

```typescript
function migrateIfNeeded(db: Database.Database): void {
  const migrations = [
    // ... existing ...
    "ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]'",
  ]
  // ... rest of function ...
}
```

### 3. Update Repository (10 min)
**File**: `src/main/database/repository.ts`

Update `mapMessage()` to parse attachments:

```typescript
function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    // ... existing fields ...
    attachments: parseJson(row.attachments as string, [])
  }
}
```

Update `createMessage()` to persist attachments:

```typescript
this.db.prepare(`
  INSERT INTO messages (..., attachments, ...)
  VALUES (..., @attachments, ...)
`).run({
  // ... existing params ...
  attachments: JSON.stringify(attachments)
})
```

### 4. Update Message Input Component (20 min)
**File**: `src/renderer/src/components/ChatView/MessageInput.tsx`

- Add state: `const [attachments, setAttachments] = useState<MessageAttachment[]>([])`
- Add file input and picker
- Convert files to base64
- Show attachment preview gallery
- Update `handleSend()` to include attachments in draft

### 5. Add Message Display (10 min)
**File**: `src/renderer/src/components/ChatView/MessageTimeline.tsx`

- Create `AttachmentGallery` component
- Update `MessageBubble` to render attachments if present
- Add CSS styling

### 6. Update Message Router (15 min)
**File**: `src/main/message-router.ts`

- In `dispatchApi()`: Transform messages to Vision API format when attachments present
- In `dispatchCli()`: Save attachments to temp files and reference in prompt (optional for MVP)

### 7. Enhance API Client (10 min)
**File**: `src/main/api-client.ts`

- Support Vision API message format (text + image_url array)
- Auto-detect or flag Vision API support
- Transform messages if supported

### 8. Add CSS Styling (10 min)
**File**: `src/renderer/src/components/ChatView/ChatView.css`

Add styles for:
- `.attachments-preview` - gallery in input area
- `.attachment-item` - individual thumbnail with remove button
- `.attachment-gallery` - gallery in message display
- `.attachment-image` - image styling

---

## Total Implementation Time
**~75 minutes** of focused work, or can be split into phases

---

## Testing Checklist

- [ ] User can select image files via file picker
- [ ] Selected images show as thumbnails in input area
- [ ] User can remove selected images before sending
- [ ] Message with image can be sent
- [ ] Message with image is stored in database
- [ ] Message with image renders in chat timeline
- [ ] Attachment displays as image in message bubble
- [ ] Image can be clicked/viewed in full size (optional lightbox)
- [ ] Multiple images in single message work
- [ ] Large images don't break UI
- [ ] API agent receives image in Vision API format
- [ ] Agent can respond to image content

---

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Storage | JSON column in messages table |
| URL Format | Base64 data URLs (self-contained) |
| Migration | Schema add column migration |
| Vision API | Auto-detect from endpoint |
| CLI Support | Temp file references (Phase 2) |
| Upload Strategy | Client-side base64 (Phase 1), Server storage Phase 2 |

---

## Files to Modify

1. ✅ `src/shared/types.ts` - Add types
2. ✅ `src/main/database/schema.ts` - Add migration
3. ✅ `src/main/database/repository.ts` - Update mappers
4. ✅ `src/renderer/src/components/ChatView/MessageInput.tsx` - Add input UI
5. ✅ `src/renderer/src/components/ChatView/MessageTimeline.tsx` - Add display UI
6. ✅ `src/main/message-router.ts` - Transform for agents
7. ✅ `src/main/api-client.ts` - Vision API support
8. ✅ `src/renderer/src/components/ChatView/ChatView.css` - Styling

**Files that don't need changes**:
- ❌ `src/preload/index.ts` - Types automatically picked up
- ❌ `src/renderer/src/store/app-store.ts` - Types automatically picked up
- ❌ `src/main/ipc.ts` - Routes through messageRouter (already works)

---

## Reference Documentation

- **Full Analysis**: See `MESSAGE_FLOW_ANALYSIS.md` (sections 1-15)
- **Code Examples**: See `KEY_CODE_SNIPPETS.md` (8 complete implementations)
- **Data Flow**: See "Message Flow Diagram" in MESSAGE_FLOW_ANALYSIS.md section 11

---

## FAQ

**Q: Do I need to change the preload file?**
A: No. The preload already routes `messages.create()` through the IPC handler, which passes through messageRouter. Types automatically include attachments.

**Q: How are images stored?**
A: As base64 data URLs in the messages table as JSON. This is simple for MVP; can be migrated to external storage later.

**Q: What about CLI agents?**
A: Phase 1 focuses on API agents with Vision support. CLI support can be added in Phase 2 using temp file references.

**Q: Can I send text-only messages?**
A: Yes! Attachments are optional. All existing functionality continues to work.

**Q: How does the database migration work?**
A: The `migrateIfNeeded()` function runs on startup. It attempts `ALTER TABLE` to add the column. If it already exists, the try/catch silently ignores the error.

**Q: What if my API doesn't support Vision?**
A: Attachments are stored and displayed in UI, but just won't be sent to non-Vision endpoints. Can add an explicit `supportsVision` flag in agent settings for Phase 2.

---

## Next Steps

1. Read `MESSAGE_FLOW_ANALYSIS.md` sections 1-8 for deep understanding
2. Copy code snippets from `KEY_CODE_SNIPPETS.md`
3. Follow implementation steps above in order
4. Test each phase before moving to next
5. Run full test suite to ensure no regressions

