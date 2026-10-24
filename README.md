# dsh-im-idmanagement

给 DSH 的每个 IM 账号一套人设、一份共用记忆。

## 它做什么

一台 DSH 接了多个 IM 账号（微信、QQ、飞书……），每个号背后是不同的人。默认所有人都吃同一份 `AGENTS.md`：同一个称呼、同一套规矩。

装了这个插件：

- 每个账号在 `IM用户设定/<名字>/AGENTS.md` 有自己的一份规矩。
- 记忆只有一份（目录可自定义）；人设只指路，不抄。
- 各框要记的事，统一往收件箱追加一行。
- 管理入口就在 DSH 的 **设置 → IM 身份管理**，不用记端口和网址；独立页面留作备用。

它站在 im-connect **前面**：先把骨架准备好，用户再去 im-connect 把账号的工作目录指过来。它不改任何人的配置。

## 装、用、卸

见 [`docs/usage.md`](docs/usage.md)。改动记录见 [`CHANGELOG.md`](CHANGELOG.md)。

## 现在到哪一步（0.1.0）

- ✅ 选根目录 / 单独指定记忆目录
- ✅ 新建人设（名字、称呼、人设规则）、首次生成 README 与收件箱
- ✅ 根 `AGENTS.md` 标记块（幂等、文件不存在则不造）
- ✅ 页面内编辑人设文件
- ✅ 删除进回收站、自动清理、手动清空
- ✅ 原生设置页（**设置 → IM 身份管理**），与独立页面功能一致
- ⬜ 上下文用量与自动归档（M3）

## 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/dsh-im-idmanagement/` | 独立页面（备用；主入口是 **设置 → IM 身份管理**） |
| GET | `/api/dsh-im-idmanagement/status` | 状态、路径、工作区列表、人设列表 |
| POST | `/api/dsh-im-idmanagement/config` | 改根目录 / 记忆目录 |
| GET | `/api/dsh-im-idmanagement/personas` | 人设列表 |
| POST | `/api/dsh-im-idmanagement/personas` | 新建（name / address / notes / overwrite） |
| GET | `/api/dsh-im-idmanagement/persona?name=` | 读一份人设 |
| POST | `/api/dsh-im-idmanagement/persona` | 保存一份人设 |
| POST | `/api/dsh-im-idmanagement/personas/delete` | 挪进回收站 |
| GET | `/api/dsh-im-idmanagement/trash` | 回收站列表与占用 |
| POST | `/api/dsh-im-idmanagement/trash/empty` | 清空回收站 |

## 开发

```bash
node --check lib/index.js
node --test test/scaffold.test.mjs
```

设计稿在 `DESIGN.md`。
