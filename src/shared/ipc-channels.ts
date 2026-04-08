export const IPC = {
  // Bootstrap
  BOOTSTRAP: 'app:bootstrap',

  // Agents
  AGENTS_LIST: 'agents:list',
  AGENTS_GET: 'agents:get',
  AGENTS_CREATE: 'agents:create',
  AGENTS_UPDATE: 'agents:update',
  AGENTS_DELETE: 'agents:delete',

  // Channels
  CHANNELS_LIST: 'channels:list',
  CHANNELS_GET: 'channels:get',
  CHANNELS_CREATE: 'channels:create',
  CHANNELS_UPDATE: 'channels:update',
  CHANNELS_DELETE: 'channels:delete',
  CHANNELS_ADD_MEMBER: 'channels:add-member',
  CHANNELS_REMOVE_MEMBER: 'channels:remove-member',

  // Messages
  MESSAGES_LIST: 'messages:list',
  MESSAGES_CREATE: 'messages:create',
  MESSAGES_STREAM: 'messages:stream', // agent reply streaming

  // MCP
  MCP_LIST: 'mcp:list',
  MCP_CREATE: 'mcp:create',
  MCP_UPDATE: 'mcp:update',
  MCP_DELETE: 'mcp:delete',

  // Skills
  SKILLS_LIST: 'skills:list',
  SKILLS_CREATE: 'skills:create',
  SKILLS_UPDATE: 'skills:update',
  SKILLS_DELETE: 'skills:delete',

  // PTY
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_DESTROY: 'pty:destroy',
  PTY_DATA: 'pty:data',
  PTY_REATTACH: 'pty:reattach',
  PTY_LIST: 'pty:list',

  // Memory
  MEMORY_STATUS: 'memory:status',
  MEMORY_RECALL: 'memory:recall',

  // CLI Detection
  CLI_DETECT_ALL: 'cli:detect-all',
  CLI_DETECT: 'cli:detect',
  CLI_START_SESSION: 'cli:start-session',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_DELETE: 'settings:delete',
} as const
