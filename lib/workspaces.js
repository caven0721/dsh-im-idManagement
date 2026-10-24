/**
 * 读 DSH 的工作区列表（~/.dsh/storages/workspace.json）。
 * 只读，用来在页面上给用户挑一个当“根”。
 *
 * 文件结构（v2）：
 *   { unit, global: { workspaceIds, defaultWorkspaceId, ... },
 *     tables: { workspaces: { "<id>": { path, name, cwd } } } }
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

function storagesDir() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages')
}

export async function readWorkspaces() {
  try {
    const text = await readFile(join(storagesDir(), 'workspace.json'), 'utf8')
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
    const table = parsed?.tables?.workspaces
    if (table === null || typeof table !== 'object') return []

    const order = Array.isArray(parsed?.global?.workspaceIds) ? parsed.global.workspaceIds : []
    const ids = order.length > 0 ? order.filter((id) => table[id] !== undefined) : Object.keys(table)

    return ids
      .map((id) => {
        const item = table[id] ?? {}
        const path = String(item.path ?? '')
        return { id: String(id), path, name: String(item.name ?? '') || (path ? basename(path) : '') }
      })
      .filter((item) => item.path !== '')
  } catch {
    return []
  }
}
