import { app, BrowserWindow, nativeImage, Menu } from 'electron'
import { join } from 'path'
import { createDatabase } from './database/db'
import { AgentCrewRepository } from './database/repository'
import { seedDefaultData } from './database/seed'
import { PtyManager } from './pty-manager'
import { MemoryService } from './memory-service'
import { MessageRouter } from './message-router'
import { CliDetector } from './cli-detector'
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
  // Probe for local models in background (don't block startup)
  memoryService.probeModels().catch(err => console.error('[Memory] probeModels failed:', err))

  // CLI Detector
  const cliDetector = new CliDetector()
  // Pre-warm cache in background
  cliDetector.detectAll().catch(err => console.error('[CliDetector] Pre-warm failed:', err))

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
    cliDetector,
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
    icon: nativeImage.createFromPath(join(__dirname, '../../build/icon.png')),
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
    memoryService.closeAll().catch(err => console.error('[Memory] closeAll failed:', err))
    try { db.close() } catch { /* ignore */ }
  })
}

app.setName('AgentCrew')

app.whenReady().then(() => {
  // macOS: customize app menu name and About panel
  // Windows/Linux: autoHideMenuBar is set, no custom menu needed
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'AgentCrew',
      applicationVersion: app.getVersion(),
      version: '',
      copyright: 'Copyright (c) 2026 AgentCrew',
      credits: 'local Slack for your Agents.',
    })

    const defaultMenu = Menu.getApplicationMenu()
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'AgentCrew',
        submenu: [
          { label: 'About AgentCrew', role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  bootstrap().catch((err) => {
    console.error('[AgentCrew] Bootstrap failed:', err)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Only recreate the window, not the entire bootstrap (DB, IPC already initialized)
      const { join } = require('path')
      mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#f4efe6',
        autoHideMenuBar: true,
        icon: nativeImage.createFromPath(join(__dirname, '../../build/icon.png')),
        titleBarStyle: 'hiddenInset',
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
