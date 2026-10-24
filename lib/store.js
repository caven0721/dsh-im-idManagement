/**
 * 插件自己的小配置：只存“用哪个工作区”这种选择。
 * 放 ~/.dsh/dsh-im-idmanagement/config.json，不碰宿主的任何文件。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function stateDir() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-im-idmanagement')
}

export function stateFile() {
  return join(stateDir(), 'config.json')
}

export async function readStore() {
  try {
    const text = await readFile(stateFile(), 'utf8')
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
    if (parsed !== null && typeof parsed === 'object') return parsed
  } catch {
    // 第一次跑，没有文件很正常
  }
  return {}
}

export async function writeStore(patch) {
  const current = await readStore()
  const next = { ...current, ...patch }
  await mkdir(stateDir(), { recursive: true })
  await writeFile(stateFile(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
