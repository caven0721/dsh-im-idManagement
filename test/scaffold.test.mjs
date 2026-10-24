import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveConfig } from '../lib/config.js'
import { createPersona, deletePersona, listTrash, emptyTrash, readPersona, writePersona, patchRootAgents, ensureInbox, render } from '../lib/scaffold.js'
import { sanitizeName, listPersonas } from '../lib/personas.js'

const templateUrl = new URL('../lib/templates/persona.md', import.meta.url)

async function workspace() {
  return mkdtemp(join(tmpdir(), 'im-idm-'))
}

test('sanitizeName 挡住路径与非法字符', () => {
  assert.equal(sanitizeName('妈妈').ok, true)
  assert.equal(sanitizeName('../evil').ok, false)
  assert.equal(sanitizeName('a/b').ok, false)
  assert.equal(sanitizeName('').ok, false)
  assert.equal(sanitizeName('x'.repeat(40)).ok, false)
})

test('render 只替换已知占位符', () => {
  assert.equal(render('你好 {{name}}', { name: '爸爸' }), '你好 爸爸')
  assert.equal(render('{{unknown}}', {}), '{{unknown}}')
})

test('没选根目录时不写任何东西', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({}, cwd)
    assert.equal(cfg.ready, false)
    assert.equal(cfg.profileDir, '')
    const inbox = await ensureInbox(cfg)
    assert.equal(inbox.created, false)
    const patched = await patchRootAgents(cfg)
    assert.equal(patched.changed, false)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('建人设：目录、AGENTS.md、收件箱都到位', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({}, cwd, { baseDir: cwd })
    const result = await createPersona(cfg, { name: '妈妈', address: '妈咪', notes: '第一句叫妈咪。' }, templateUrl)
    assert.equal(result.created, true)

    const text = await readFile(result.personaPath, 'utf8')
    assert.match(text, /# 妈妈 · 这边的规矩/)
    assert.match(text, /第一句叫「妈咪」/)
    assert.match(text, /本框的规矩优先/)
    assert.match(text, /这个框是谁/)
    assert.ok(!text.includes('{{name}}'), '占位符应已替换')
    assert.ok(!text.includes('{{address}}'), '称呼占位符应已替换')

    const inbox = await readFile(cfg.inboxPath, 'utf8')
    assert.match(inbox, /收件箱/)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('重复生成不覆盖已有 AGENTS.md', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({}, cwd, { baseDir: cwd })
    const first = await createPersona(cfg, { name: '姑姑', notes: '原来的规则' }, templateUrl)
    await readFile(first.personaPath)
    const again = await createPersona(cfg, { name: '姑姑', notes: '改了规则' }, templateUrl)
    assert.equal(again.created, false)
    const text = await readFile(again.personaPath, 'utf8')
    assert.match(text, /原来的规则/)
    assert.ok(!text.includes('改了规则'))
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('根 AGENTS.md 的标记块只写一块，可重复执行', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({}, cwd, { baseDir: cwd })

    // 没有 AGENTS.md 时，不替它造一个（免得污染空白工作区）
    const skipped = await patchRootAgents(cfg)
    assert.equal(skipped.changed, false)
    assert.equal(skipped.reason, 'no-agents-file')

    await writeFile(cfg.rootAgentsPath, '# 这个工作区自己的规矩\n', 'utf8')
    const one = await patchRootAgents(cfg)
    assert.equal(one.changed, true)
    const two = await patchRootAgents(cfg)
    assert.equal(two.changed, false)

    const text = await readFile(cfg.rootAgentsPath, 'utf8')
    assert.equal(text.match(/dsh-im-idmanagement:begin/g).length, 1)
    assert.match(text, /这个工作区自己的规矩/)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('listPersonas 能列出刚建的那个', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({}, cwd, { baseDir: cwd })
    await ensureInbox(cfg)
    await createPersona(cfg, { name: '爸爸', title: '爸爸这边' }, templateUrl)
    const rows = await listPersonas(cfg.profileDir)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, '爸爸')
    assert.equal(rows[0].hasPersona, true)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('回收站：按份数自动清理旧的', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({ trashKeepCount: 2, trashKeepDays: 0 }, cwd, { baseDir: cwd })
    for (const name of ['一', '二', '三']) {
      await createPersona(cfg, { name, address: '你' }, templateUrl)
      await deletePersona(cfg, name)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20))
    }
    const trash = await listTrash(cfg)
    assert.equal(trash.items.length, 2)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('回收站：能一键清空', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({}, cwd, { baseDir: cwd })
    await createPersona(cfg, { name: '临时', address: '你' }, templateUrl)
    await deletePersona(cfg, '临时')
    assert.equal((await listTrash(cfg)).items.length, 1)

    const emptied = await emptyTrash(cfg)
    assert.equal(emptied.removed, 1)
    assert.equal((await listTrash(cfg)).items.length, 0)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('删除人设：挪进回收站，但不许越界', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({}, cwd, { baseDir: cwd })
    await createPersona(cfg, { name: '临时', address: '你' }, templateUrl)
    assert.equal((await listPersonas(cfg.profileDir)).length, 1)

    const removed = await deletePersona(cfg, '临时')
    assert.equal(removed.deleted, true)
    assert.equal((await listPersonas(cfg.profileDir)).length, 0)
    // 文件没有真的消失，挪到了回收站
    assert.ok(removed.trashedTo)
    const trashed = await readFile(join(removed.trashedTo, 'AGENTS.md'), 'utf8')
    assert.match(trashed, /临时/)

    // 越界的名字一律拒绝
    const outside = await deletePersona(cfg, '../evil')
    assert.equal(outside.deleted, false)

    // 根目录自己也不许删
    const root = await deletePersona(cfg, '.')
    assert.equal(root.deleted, false)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('编辑：读得出来、存得回去，越界拒绝', async () => {
  const cwd = await workspace()
  try {
    const cfg = resolveConfig({}, cwd, { baseDir: cwd })
    await createPersona(cfg, { name: '编辑测试', address: '你' }, templateUrl)

    const read = await readPersona(cfg, '编辑测试')
    assert.equal(read.ok, true)
    assert.match(read.content, /编辑测试/)

    const saved = await writePersona(cfg, '编辑测试', read.content + '\n再加一行。\n')
    assert.equal(saved.ok, true)

    const again = await readPersona(cfg, '编辑测试')
    assert.match(again.content, /再加一行/)

    const escaped = await readPersona(cfg, '../evil')
    assert.equal(escaped.ok, false)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
