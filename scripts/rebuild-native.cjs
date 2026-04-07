/* eslint-disable @typescript-eslint/no-var-requires */
const { execSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')

function rebuild() {
  console.log('Rebuilding native modules for Electron...')
  try {
    execSync('npx electron-rebuild -f -w better-sqlite3,node-pty', {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env }
    })
    console.log('Native modules rebuilt successfully.')
  } catch (err) {
    console.error('Native module rebuild failed:', err.message)
    console.log('Trying alternative rebuild with @electron/rebuild...')
    try {
      execSync('npx @electron/rebuild -f -w better-sqlite3,node-pty', {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env }
      })
      console.log('Native modules rebuilt successfully (alternative).')
    } catch (err2) {
      console.error('All rebuild attempts failed:', err2.message)
      process.exit(1)
    }
  }
}

rebuild()
