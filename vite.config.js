import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function readChangeLog() {
  try {
    return execFileSync('git', [
      'log', '--date=iso-strict',
      '--pretty=format:%h%x1f%aI%x1f%s%x1e',
    ], { encoding: 'utf8' })
      .split('\x1e')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [hash, date, title] = entry.split('\x1f')
        return { hash, date, title }
      })
  } catch {
    return []
  }
}

export default defineConfig({
  plugins: [react()],
  base: '/controlFreq/',
  define: {
    __APP_CHANGE_LOG__: JSON.stringify(readChangeLog()),
  },
})
