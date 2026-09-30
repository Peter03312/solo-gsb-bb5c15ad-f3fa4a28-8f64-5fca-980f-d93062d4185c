# 多抄本校勘 Web 应用（古籍整理）

面向古籍整理团队的多抄本对校工具：对同一篇文献录入 **至少两份抄本** 的逐行文字，
选定 **底本**，将行内连续字句编入 **对应组**；自动呈现异文、缺文、倒置与未归组文字，
并提供「待修复 → 修复 → 发布」的版本化工作流。

技术栈：**Node.js + TypeScript（Express）· React 18 + Vite · PostgreSQL 16**。

---

## 一、一键启动（Docker，推荐）

前置：已安装 Docker 与 Docker Compose v2。

```bash
docker compose up -d --build
```

启动后打开浏览器：

> **http://localhost:4000**

- 端口可通过环境变量 `APP_PORT` 修改（默认 `4000`）；
- 首次启动自动：建库、建表（`db/schema.sql`）、安装全部依赖、构建前端；
- 数据持久化于命名卷 `collation-pgdata`。

常用命令：

```bash
docker compose logs -f app      # 查看应用日志
docker compose down             # 停止（保留数据）
docker compose down -v          # 停止并删除数据库数据
```

### 配置（可选）

复制 `.env.example` 为 `.env` 后修改：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_PORT` | `4000` | 浏览器访问端口（宿主机） |
| `PGUSER` | `collation` | 数据库用户 |
| `PGPASSWORD` | `collation` | 数据库密码 |
| `PGDATABASE` | `collation` | 数据库名 |

---

## 二、本地开发（不用 Docker）

需要本机已有 PostgreSQL 13+，并预先创建数据库：

```bash
createdb collation
# 表结构由后端启动时自动执行 db/schema.sql 建好；也可手动：
# psql -d collation -f db/schema.sql
```

启动后端（终端 1）：

```bash
cd server
npm install
npm run dev          # http://localhost:4000，热重载
```

启动前端（终端 2）：

```bash
cd web
npm install
npm run dev          # http://localhost:5173 （/api 自动代理到 4000）
```

开发模式请打开 **http://localhost:5173**；生产模式仅暴露 **4000**（Express 托管前端产物）。

后端环境变量（均有默认值）：`PGHOST=localhost PGPORT=5432 PGUSER=collation PGPASSWORD=collation PGDATABASE=collation PORT=4000`。

---

## 三、业务规则与功能

### 录文
- 每份抄本按 **原始行序逐行录入**；新增抄本不限份数。
- 在行文中鼠标拖选连续字句即可就地 **改字**（替换 / 插入 / 删除，删除即替换框留空）。
- 字符位置以 **Unicode 码点** 计，生僻字、扩展区汉字（𫬺、𰻞等）安全。

### 归组规则（保存时强校验，任一不满足即整体拒绝、**绝不部分保存**）
1. 每组 **必须且仅含一个底本片段**（底本片段不能标缺文）；
2. 其他抄本 **每组至多占一个片段**，或对该组显式 **标为缺文**；
3. 同一抄本的片段 **不得在行内重叠归组**（端点相接允许）；
4. 片段不得 **越界**（起点/终点超出该行当前字数）。

校验失败时错误信息逐条给出 **位置与原因**，例如：

> 第 2 组「乙本」越界：该行共 10 字，片段位于第 1 行第 6–99 字；合法范围为第 1–10 字
> 抄本「乙本」第 1 行存在重叠归组：第 1 组 [1, 6) 与第 2 组 [6, 11) 在第 6 字重叠…

组序（底本顺序）必须自 1 连续。

### 对照页
- 上半部 **依底本顺序** 列出每个对应组，自动标注 **异文 / 缺文 / 倒置**；
- 下半部按各抄本 **原始行序** 展示全文：已归组文字加底色，**未归组文字自然完整可见**。

### 改动原文与待修复
- 修改原文时，只有 **受影响** 的对应组变为待修复：
  与改动区间相交、或改动缩短行后导致片段越界的组；
  改动点之后的片段自动平移，不受影响的组保持完好。
- 切换底本后，不含新底本片段的组全部待修复。
- **修复前不得发布新校勘版**；待修复组需逐组重录并通过同一套校验。

### 发布与旧版
- 发布生成 **不可变快照**（JSONB）。发布后继续修改只影响工作版，
  **旧发布版始终可阅读**（“发布与旧版”页签 → 阅读此版）。

### 版本对照（任一已发布校勘版 ↔ 当前工作版）
- “发布与旧版”页签 → **与工作版对照**，或在“版本对照”页签选择任一已发布版本；
- **行文增删改**：按各抄本 **原始行号** 逐行呈现，按 Unicode 码点对齐显示
  <span>增（绿）</span>/删（红）/改；
- **组的变化**：按对应组呈现组序变化、各抄本片段（文字、所在行与码点区间）及
  **缺文标记**的变化；页头同时显示两侧 **底本与版本号**
  （旧版快照的工作版版本号 / 发布号，与当前工作版版本号）；
- **配对规则（关键）**：整批重存会更换全部组 ID，故 **绝不凭组 ID 判定增删**：
  仅当 **底本相同** 且底本片段位置（原始行号 + 码点区间）在两侧都 **唯一对应** 时才配为一组；
  无法唯一配对的旧组与新组 **分别列为“未配对旧组 / 未配对新组”**，不推断移动；
  位置键在任一侧重复的组同样列未配对；
- **底本不同**：所有旧组、新组一律分别列未配对（原因标注“底本不同”），不做配对；
- **待修复组**显式标识；其越界片段只显示越界前现存文字（橙色），
  **不当作确定文字**参与文字比对，且不参与配对（原因“底本片段位置失效”）；
- 对照 **只读**：不修改工作版、也不修改任何快照；点“刷新对照”即按最新工作版重新生成；
- **旧版不存在时返回 404 明确报错**。页面与下方 HTTP API 取得完全相同的结果。

### 并发控制
- 所有写请求必须携带 `expectedVersion`（乐观锁）；
- 基于过期版本的修改返回 **409 拒绝**，不做任何写入，前端提示刷新后重试；
- 事务隔离级别为 `SERIALIZABLE`，序列化冲突同样返回 409。

---

## 四、HTTP API 摘要

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/documents` | 文献列表 |
| POST | `/api/documents` | 新建（标题 + ≥2 份抄本名） |
| GET | `/api/documents/:id` | 校勘读模型（组/异文/缺文/倒置/原始行/覆盖区间/版本号） |
| POST | `/api/documents/:id/manuscripts` | 增加抄本 |
| PUT | `/api/documents/:id/base` | 选定底本 |
| POST | `/api/manuscripts/:msId/lines` | 追加一行 |
| PUT | `/api/lines/:lineId` | 行内改字（`startCp/endCp/replacement`） |
| PUT | `/api/documents/:id/groups` | 整批保存对应组（替换式，全量校验） |
| PUT | `/api/documents/:id/groups/:gid/repair` | 修复单个对应组 |
| DELETE | `/api/documents/:id/groups/:gid` | 删除对应组 |
| POST | `/api/documents/:id/publish` | 发布新版（有待修复组则 409） |
| GET | `/api/documents/:id/editions` / `…/editions/:no` | 版本列表 / 阅读旧版快照 |
| GET | `/api/documents/:id/editions/:no/diff` | **版本对照**：第 :no 版快照 vs 当前工作版（只读） |

写请求体均含 `expectedVersion`；错误响应：`{ "error": "...", "details": [ { "code", "message", "groupOrd", "msName", "lineNo", ... } ] }`。

#### 版本对照 API 调用示例

```bash
# 第 2 版（旧版快照）与当前工作版的变更对照
curl -s http://localhost:4000/api/documents/1/editions/2/diff | jq .
```

返回要点（页面渲染的就是同一份 JSON）：

```jsonc
{
  "documentId": 1,
  "baseChanged": false,
  "oldSide": { "editionNo": 2, "version": 13, "baseMsId": 10, "baseMsName": "甲本" },
  "newSide": { "version": 18, "baseMsId": 10, "baseMsName": "甲本" },
  "manuscripts": [
    { "msId": 10, "oldName": "甲本", "newName": "甲本", "kind": "same" }
  ],
  // 行文增删改：按抄本、原始行号；op: eq/ins/del（逐码点对齐）
  "lineChanges": [
    { "msId": 11, "msName": "乙本", "lineNo": 1, "kind": "modified",
      "changes": [ { "op": "eq", "text": "天命" },
                   { "op": "del", "text": "姓" },
                   { "op": "ins", "text": "性" },
                   { "op": "eq", "text": "之謂性" } ] }
  ],
  // 已配对组（同底本且底本片段行号+码点区间唯一对应；不用组 ID）
  "pairedGroups": [
    { "kind": "paired", "oldOrd": 1, "newOrd": 2, "ordChanged": true,
      "oldBroken": false, "newBroken": false,
      "oldBaseText": "天命", "newBaseText": "天命",
      "cells": [
        { "msId": 11, "msName": "乙本",
          "oldStatus": "text", "newStatus": "text", "changed": true,
          "oldText": "姓", "newText": "性",
          "oldLineNo": 1, "newLineNo": 1,
          "oldStartCp": 4, "oldEndCp": 5, "newStartCp": 4, "newEndCp": 5,
          "charChanges": [ { "op": "del", "text": "姓" },
                           { "op": "ins", "text": "性" } ] }
      ] }
  ],
  // 无法唯一配对的旧组 / 新组（底本不同时全部在此；待修复组在新侧并 broken:true）
  "unpairedOldGroups": [
    { "kind": "unpaired", "side": "old", "ord": 4, "broken": false,
      "reason": "unmatched", "baseText": "EF",
      "cells": [ /* 同单格结构：status=text/missing/broken/absent */ ] }
  ],
  "unpairedNewGroups": [],
  "stats": { "pairedCount": 4, "pairedChangedCount": 2,
             "unpairedOldCount": 1, "unpairedNewCount": 0,
             "linesModified": 1, "linesAdded": 0, "linesRemoved": 0 }
}
```

- 单元格状态 `status`：`text`（确定文字）/ `missing`（显式缺文）/
  `broken`（待修复，越界片段非确定文字，含 `oobEnd`）/ `absent`（该组无此抄本片段）；
- 未配对原因 `reason`：`unmatched`（底本位置无对应）、`duplicate-key`（位置不唯一）、
  `broken-base`（待修复、底本位置失效）、`base-mismatch`（两侧底本不同）；
- 旧版不存在：`404 { "error": "校勘版 #9 不存在，无法与工作版对照（旧版永久保留可读）" }`；
- 该接口为 GET 只读，不接受也不需要 `expectedVersion`，重复调用始终反映 **最新工作版**。

---

## 五、测试

后端使用内嵌 PostgreSQL（PGlite，WASM）做端到端集成测试，无需外部数据库：

```bash
cd server
npm test
```

覆盖：合法归组、异文/缺文判定、倒置、越界/重叠/缺底本/重复抄本报错定位、
整体拒绝不部分保存、乐观锁 409、改字仅波及相关组、平移、缩短越界、
修复流程、发布门禁、旧版快照可读、切换底本等；以及 **版本对照**：
刚发布零差异、行级逐码点增删改、待修复组不参与配对且显式标识、
整批重存换 ID 后凭底本位置配对、组序变化、缺文标记变化、删组未配对、
新增抄本、底本不同全部分列未配对、旧版不存在 404、对照只读不改版本号。

---

## 六、目录结构

```
.
├── Dockerfile                # 多阶段构建：前端 → 后端 → 静态托管
├── docker-compose.yml        # 一键：db(PostgreSQL 16) + app
├── db/schema.sql             # 数据库结构（幂等，可重复执行）
├── server/                   # Node.js + TypeScript + Express
│   └── src/ (db/validate/collation/routes/repo/...)
└── web/                      # React 18 + Vite + TypeScript
    └── src/ (录文 / 归组 / 对照 / 发布与旧版)
```
