/**
 * 只做“写”：生成人设文件、收件箱、根 AGENTS.md 的标记块。
 * 已存在的文件一律不覆盖（除非 overwrite=true），免得把用户自己写的冲掉。
 */
import { mkdir, readFile, writeFile, access, lstat, rm, rename, cp, readdir } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

const MARK_BEGIN = '<!-- dsh-im-idmanagement:begin -->'
const MARK_END = '<!-- dsh-im-idmanagement:end -->'

const DEFAULT_INBOX = `# 收件箱

> 各个 IM 账号聊完，值一句话的事往这儿追加一行，别在别处新建记忆文件。
> 主工作区的会话读它，整理进正式记忆，整理完删掉已整理的行。
> 格式：\`YYYY-MM-DD HH:MM | 来源 | 一句话\`

`

const PROFILE_README = `# IM 用户设定

这里每个文件夹对应一个 IM 账号，文件夹名就是账号在人设里的名字（比如「妈妈」「爸爸」）。

## 怎么用

1. 在插件页面（\`/api/dsh-im-idmanagement/\`）新建人设，会在这里生成 \`<名字>/AGENTS.md\`。
2. 打开 DSH 的 **设置 → IM 助理**，选中那个账号，把「工作目录」填成：

   \`<这个目录>/<名字>\`

3. 保存。那个账号下次收到消息，就会读到自己的那份规矩。

## 写的时候记住

- 人设文件第一行永远写「本框的规矩优先于外层那份 AGENTS.md」，不然外层会顶回来。
- 只写跟这个人有关的：称呼、分寸、禁忌。别把整份人生复制一遍。
- 记忆不在这里，在 \`{{memoryDir}}\`；人设只负责指路。
- 别在这个文件夹里新建记忆文件，会养出好几个「你」。
`

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function render(template, vars) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) => {
    const value = vars[key]
    return value === undefined || value === null ? whole : String(value)
  })
}

export async function loadTemplate(cfg, fallbackUrl) {
  if (cfg.personaTemplate) {
    try {
      return await readFile(cfg.personaTemplate, 'utf8')
    } catch {
      // 用内置的
    }
  }
  return readFile(fallbackUrl, 'utf8')
}

export async function ensureInbox(cfg) {
  if (!cfg.memoryDir || !cfg.inboxPath) return { created: false, path: '' }
  await mkdir(cfg.memoryDir, { recursive: true })
  if (await exists(cfg.inboxPath)) return { created: false, path: cfg.inboxPath }
  await writeFile(cfg.inboxPath, DEFAULT_INBOX, 'utf8')
  return { created: true, path: cfg.inboxPath }
}

/** 人设目录里的总说明；有就不动，没有才写。 */
export async function ensureProfileReadme(cfg) {
  if (!cfg.profileDir) return { created: false, path: '' }
  await mkdir(cfg.profileDir, { recursive: true })
  const file = join(cfg.profileDir, 'README.md')
  if (await exists(file)) return { created: false, path: file }
  await writeFile(file, render(PROFILE_README, { memoryDir: cfg.memoryDir }), 'utf8')
  return { created: true, path: file }
}

/**
 * 生成一个人设：建目录、写 AGENTS.md、确保收件箱和人设目录说明在。
 * @returns {{dir: string, personaPath: string, created: boolean}}
 */
export async function createPersona(cfg, { name, address, title, notes, overwrite = false }, templateUrl) {
  const dir = join(cfg.profileDir, name)
  await mkdir(dir, { recursive: true })
  const personaPath = join(dir, 'AGENTS.md')
  const already = await exists(personaPath)

  if (already && !overwrite) {
    await ensureInbox(cfg)
    await ensureProfileReadme(cfg)
    return { dir, personaPath, created: false }
  }

  const template = await loadTemplate(cfg, templateUrl)
  const text = render(template, {
    name,
    address: String(address ?? '').trim() || '（称呼）',
    title: title || name,
    notes: notes || '',
    workspace: cfg.cwd,
    memoryDir: cfg.memoryDir,
    inboxPath: cfg.inboxPath,
  })
  await writeFile(personaPath, text, 'utf8')
  await ensureInbox(cfg)
  await ensureProfileReadme(cfg)
  return { dir, personaPath, created: !already }
}

/**
 * 删一个人设：不真删，挪进回收站目录。
 *
 * 回收站在 `<根目录>\.dsh-im-idmanagement-trash\<时间戳>-<名字>`，
 * 想找回来手动挪回去就行。名字带点开头，不会被当成一个人设列出来。
 */
export async function deletePersona(cfg, name) {
  if (!cfg.profileDir) return { deleted: false, error: '还没选根目录' }

  const base = resolve(cfg.profileDir)
  const target = resolve(base, name)
  const prefix = base.endsWith(sep) ? base : base + sep

  if (target === base || !target.startsWith(prefix)) {
    return { deleted: false, error: '路径不合法，拒绝删除' }
  }

  let info
  try {
    info = await lstat(target)
  } catch {
    return { deleted: false, error: '这个文件夹不存在' }
  }
  if (!info.isDirectory()) return { deleted: false, error: '不是一个文件夹' }
  if (info.isSymbolicLink()) return { deleted: false, error: '这是个链接，不敢顺着删' }

  const trashRoot = cfg.trashDir || resolve(cfg.cwd || base, '.dsh-im-idmanagement-trash')
  await mkdir(trashRoot, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  let destination = join(trashRoot, `${stamp}-${name}`)
  for (let index = 2; await exists(destination); index += 1) {
    destination = join(trashRoot, `${stamp}-${name}-${index}`)
  }

  try {
    await rename(target, destination)
  } catch {
    // 跨盘符之类挪不动：退一步，整份复制过去再删原目录
    await cp(target, destination, { recursive: true })
    await rm(target, { recursive: true, force: true })
  }

  const pruned = await pruneTrash(cfg)
  return { deleted: true, path: target, trashedTo: destination, pruned }
}

/** 把人设名字换成一个安全路径；越界就返回 null。 */
function personaPathOf(cfg, name) {
  if (!cfg.profileDir) return null
  const base = resolve(cfg.profileDir)
  const dir = resolve(base, name)
  const prefix = base.endsWith(sep) ? base : base + sep
  if (dir === base || !dir.startsWith(prefix)) return null
  return join(dir, 'AGENTS.md')
}

/** 读一份人设，给页面上的编辑器用。 */
export async function readPersona(cfg, name) {
  const file = personaPathOf(cfg, name)
  if (!file) return { ok: false, error: '路径不合法' }
  try {
    const content = await readFile(file, 'utf8')
    return { ok: true, path: file, content }
  } catch {
    return { ok: false, error: '这个人设还没有 AGENTS.md' }
  }
}

/** 保存页面编辑器里的内容。 */
export async function writePersona(cfg, name, content) {
  const file = personaPathOf(cfg, name)
  if (!file) return { ok: false, error: '路径不合法' }
  const text = String(content ?? '')
  if (text.length > 512 * 1024) return { ok: false, error: '太大了，512KB 以内' }
  await mkdir(join(cfg.profileDir, name), { recursive: true })
  await writeFile(file, text, 'utf8')
  return { ok: true, path: file, bytes: Buffer.byteLength(text, 'utf8') }
}

/** 递归算一个目录占了多少字节。 */
async function dirSize(path) {
  let total = 0
  let entries = []
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) total += await dirSize(child)
    else {
      try {
        total += (await lstat(child)).size
      } catch {
        // 读不到就跳过
      }
    }
  }
  return total
}

/** 看看回收站里有什么、占多少地方。 */
export async function listTrash(cfg) {
  if (!cfg.trashDir) return { ok: true, dir: '', items: [], totalBytes: 0 }
  let entries = []
  try {
    entries = await readdir(cfg.trashDir, { withFileTypes: true })
  } catch {
    return { ok: true, dir: cfg.trashDir, items: [], totalBytes: 0 }
  }

  const items = []
  let totalBytes = 0
  for (const entry of entries) {
    const path = join(cfg.trashDir, entry.name)
    let updatedAt = 0
    let bytes = 0
    try {
      updatedAt = (await lstat(path)).mtimeMs
      bytes = entry.isDirectory() ? await dirSize(path) : (await lstat(path)).size
    } catch {
      continue
    }
    totalBytes += bytes
    items.push({ name: entry.name, path, bytes, updatedAt })
  }
  items.sort((left, right) => right.updatedAt - left.updatedAt)
  return { ok: true, dir: cfg.trashDir, items, totalBytes }
}

/** 按“保留几天 / 最多几份”清掉旧的。 */
export async function pruneTrash(cfg, now = Date.now()) {
  if (!cfg.trashDir) return { removed: 0 }
  const { items } = await listTrash(cfg)
  const keepDays = Number(cfg.trashKeepDays) || 0
  const keepCount = Number(cfg.trashKeepCount) || 0
  const cutoff = keepDays > 0 ? now - keepDays * 24 * 60 * 60 * 1000 : 0

  const doomed = []
  items.forEach((item, index) => {
    const tooOld = keepDays > 0 && item.updatedAt < cutoff
    const tooMany = keepCount > 0 && index >= keepCount
    if (tooOld || tooMany) doomed.push(item.path)
  })

  let removed = 0
  for (const path of doomed) {
    try {
      await rm(path, { recursive: true, force: true })
      removed += 1
    } catch {
      // 删不掉就留着，下次再说
    }
  }
  return { removed }
}

/** 清空回收站。 */
export async function emptyTrash(cfg) {
  if (!cfg.trashDir) return { removed: 0 }
  const { items } = await listTrash(cfg)
  let removed = 0
  for (const item of items) {
    try {
      await rm(item.path, { recursive: true, force: true })
      removed += 1
    } catch {
      // 同上
    }
  }
  return { removed }
}

/** 往根 AGENTS.md 加一块带标记的提醒；只在标记外一个字节都不动。 */
export async function patchRootAgents(cfg) {
  if (!cfg.rootAgentsPatch) return { changed: false, reason: 'disabled' }
  if (!cfg.rootAgentsPath) return { changed: false, reason: 'no-base-dir' }
  const block = [
    MARK_BEGIN,
    '（本块由 dsh-im-idmanagement 维护，请勿手改）',
    '',
    '若本会话位于 `IM用户设定/` 之下，称呼与分寸以那一层的 `AGENTS.md` 为准。',
    MARK_END,
  ].join('\n')

  let original = ''
  try {
    original = await readFile(cfg.rootAgentsPath, 'utf8')
  } catch {
    // 工作区里没有 AGENTS.md：不替它造一个，免得污染空白工作区
    return { changed: false, reason: 'no-agents-file' }
  }

  const begin = original.indexOf(MARK_BEGIN)
  const end = original.indexOf(MARK_END)
  if (begin >= 0 && end > begin) {
    const next = original.slice(0, begin) + block + original.slice(end + MARK_END.length)
    if (next === original) return { changed: false, reason: 'same' }
    await writeFile(cfg.rootAgentsPath, next, 'utf8')
    return { changed: true, reason: 'updated' }
  }

  const next = original.replace(/\s*$/, '') + '\n\n' + block + '\n'
  await mkdir(cfg.cwd, { recursive: true })
  await writeFile(cfg.rootAgentsPath, next, 'utf8')
  return { changed: true, reason: 'appended' }
}
