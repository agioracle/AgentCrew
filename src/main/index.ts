import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createDatabase } from './database/db'
import { AgentCrewRepository } from './database/repository'
import { seedDefaultData } from './database/seed'
import { PtyManager } from './pty-manager'
import { MemoryService } from './memory-service'
import { MessageRouter } from './message-router'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

async function bootstrap(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'agentcrew.db')

  console.log('[AgentCrew] userData:', userDataPath)
  console.log('[AgentCrew] database:', dbPath)

  // Database
  const db = createDatabase(dbPath)
  const repository = new AgentCrewRepository(db)
  seedDefaultData(db)

  // PTY Manager
  ptyManager = new PtyManager()

  // Memory Service
  const memoryService = new MemoryService()

  // Message Router
  const messageRouter = new MessageRouter({
    repository,
    ptyManager,
    memoryService,
    getMainWindow
  })

  // IPC
  registerIpcHandlers({
    repository,
    ptyManager,
    messageRouter,
    getMainWindow
  })

  // Window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f4efe6',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  // Cleanup
  app.on('before-quit', () => {
    ptyManager?.destroyAll()
    try { db.close() } catch { /* ignore */ }
  })
}

app.whenReady().then(() => {
  bootstrap().catch((err) => {
    console.error('[AgentCrew] Bootstrap failed:', err)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrap()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

process.on('unhandledRejection', (reason) => {
  console.error('[AgentCrew] Unhandled rejection:', reason)
})
