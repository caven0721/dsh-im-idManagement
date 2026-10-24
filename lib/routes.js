/**
 * 路由：页面、状态、选工作区、建人设。
 * 每次请求都重新算一次配置，这样在页面上换工作区能立刻生效，不用重启。
 */
import { readFile } from 'node:fs/promises'
import { stat, mkdir } from 'node:fs/promises'

const MAX_BODY = 64 * 1024

const STATIC = {
  '/static/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/static/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('请求体太大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function isDir(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export function createHandler({ resolveConfig, config, cwd, store, workspaces, personas, scaffold, webDirUrl }) {
  return async function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.replace(/^\/api\/dsh-im-idmanagement/, '') || '/'
    const method = (req.method ?? 'GET').toUpperCase()

    try {
      if (path === '/' || path === '/page') {
        const html = await readFile(new URL('index.html', webDirUrl), 'utf8')
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(html)
        return
      }

      const asset = STATIC[path]
      if (asset) {
        const text = await readFile(new URL(asset.file, webDirUrl), 'utf8')
        res.writeHead(200, { 'content-type': asset.type, 'cache-control': 'no-store' })
        res.end(text)
        return
      }

      const stored = await store.readStore()
      const cfg = resolveConfig(config, cwd, stored)

      if (path === '/status' && method === 'GET') {
        json(res, 200, {
          ok: true,
          ready: cfg.ready,
          baseDir: cfg.baseDir,
          profileDir: cfg.profileDir,
          memoryDir: cfg.memoryDir,
          memoryDefault: cfg.memoryDefault,
          customMemory: cfg.customMemory,
          inboxPath: cfg.inboxPath,
          rootAgentsPath: cfg.rootAgentsPath,
          workspaces: await workspaces.readWorkspaces(),
          items: cfg.ready ? await personas.listPersonas(cfg.profileDir) : [],
        })
        return
      }

      if (path === '/config' && method === 'POST') {
        const body = await readJsonBody(req)
        const patch = {}

        if (body.baseDir !== undefined) {
          const targetBase = String(body.baseDir ?? '').trim()
          if (targetBase === '' || !(await isDir(targetBase))) {
            json(res, 400, { ok: false, error: '这个根目录不存在，或者不是文件夹' })
            return
          }
          patch.baseDir = targetBase
        }

        if (body.memoryDir !== undefined) {
          const targetMemory = String(body.memoryDir ?? '').trim()
          if (targetMemory === '') {
            patch.memoryDir = '' // 空 = 恢复默认 <根目录>/记忆
          } else {
            const exists = await isDir(targetMemory)
            const created = exists ? true : await mkdir(targetMemory, { recursive: true }).then(() => true).catch(() => false)
            if (!created) {
              json(res, 400, { ok: false, error: '这个记忆目录建不出来，检查一下路径' })
              return
            }
            patch.memoryDir = targetMemory
          }
        }

        if (Object.keys(patch).length === 0) {
          json(res, 400, { ok: false, error: '没有要改的东西' })
          return
        }

        await store.writeStore(patch)
        const next = resolveConfig(config, cwd, await store.readStore())
        await scaffold.ensureInbox(next)
        await scaffold.ensureProfileReadme(next)
        await scaffold.patchRootAgents(next)
        json(res, 200, {
          ok: true,
          baseDir: next.baseDir,
          profileDir: next.profileDir,
          memoryDir: next.memoryDir,
          customMemory: next.customMemory,
        })
        return
      }

      if (path === '/personas' && method === 'GET') {
        json(res, 200, {
          ok: true,
          ready: cfg.ready,
          profileDir: cfg.profileDir,
          items: cfg.ready ? await personas.listPersonas(cfg.profileDir) : [],
        })
        return
      }

      if (path === '/personas' && method === 'POST') {
        if (!cfg.ready) {
          json(res, 409, { ok: false, error: '还没选根目录，先在上面选一个工作区' })
          return
        }
        const body = await readJsonBody(req)
        const checked = personas.sanitizeName(body.name)
        if (!checked.ok) {
          json(res, 400, { ok: false, error: checked.error })
          return
        }
        const result = await scaffold.createPersona(cfg, {
          name: checked.name,
          address: body.address,
          title: body.title,
          notes: body.notes,
          overwrite: body.overwrite === true,
        })
        const patched = await scaffold.patchRootAgents(cfg)
        json(res, 201, { ok: true, ...result, rootAgents: patched })
        return
      }

      if (path === '/persona' && method === 'GET') {
        const name = url.searchParams.get('name') ?? ''
        const result = await scaffold.readPersona(cfg, name)
        json(res, result.ok ? 200 : 400, result)
        return
      }

      if (path === '/persona' && method === 'POST') {
        const body = await readJsonBody(req)
        const checked = personas.sanitizeName(body.name)
        if (!checked.ok) {
          json(res, 400, { ok: false, error: checked.error })
          return
        }
        const result = await scaffold.writePersona(cfg, checked.name, body.content)
        json(res, result.ok ? 200 : 400, result)
        return
      }

      if (path === '/personas/delete' && method === 'POST') {
        if (!cfg.ready) {
          json(res, 409, { ok: false, error: '还没选根目录' })
          return
        }
        const body = await readJsonBody(req)
        const checked = personas.sanitizeName(body.name)
        if (!checked.ok) {
          json(res, 400, { ok: false, error: checked.error })
          return
        }
        const result = await scaffold.deletePersona(cfg, checked.name)
        if (!result.deleted) {
          json(res, 400, { ok: false, error: result.error })
          return
        }
        json(res, 200, { ok: true, deleted: true, path: result.path })
        return
      }

      if (path === '/trash' && method === 'GET') {
        json(res, 200, { ok: true, ...(cfg.ready ? await scaffold.listTrash(cfg) : { dir: '', items: [], totalBytes: 0 }) })
        return
      }

      if (path === '/trash/empty' && method === 'POST') {
        if (!cfg.ready) {
          json(res, 409, { ok: false, error: '还没选根目录' })
          return
        }
        const result = await scaffold.emptyTrash(cfg)
        json(res, 200, { ok: true, ...result })
        return
      }

      json(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}
