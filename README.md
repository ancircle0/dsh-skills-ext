# @ancircle0/dsh-skills-ext

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件，页面显示名为 **Skills与MCP管理**：一处维护**预设技能目录**（把其中的技能**链接**进当前 DSH 用户技能目录，或随时**解除链接**），同时管理 **MCP 服务器**（新增 / 编辑 / 启停 / 重启 / 删除，并把它们的工具接进模型工具表）。

- 链接使用**目录联接（junction，Windows，无需管理员权限）**，其他平台使用**符号链接**；
- 解除链接**只删除链接本身**，源目录与其中的文件完全不受影响；
- 链接/解除链接后**立即生效，不用重启也不用新建会话**：插件随后 ① 让技能注册表失效缓存（`invalidateCache()`：`revision + 1`、清空收集缓存、广播 `skills/change`），模型在当前会话的**下一条消息**就能看到技能增减；② 再广播一次"配置已变"的刷新信号，让 `/` 技能选择器这类**客户端缓存**也重拉——所以下次打开 `/` 就是最新结果（正在进行的那一次请求不会中途改变）；
- MCP 服务器在运行时以 `ctx.plugin('@deepseek-ai/dsh-mcp-client', config)` 挂载，工具以 `mcp__<serverName>__<tool>` 出现，编辑/启停/删除即时重连，**不写 profile 组合文件**。

> English: a DSH Harness plugin shown as **Skills & MCP**. It keeps preset skill directories and links/unlinks the skills inside them into the user skill root (directory junction on Windows, symlink elsewhere; unlinking never touches the source), and manages MCP servers by mounting the MCP client at runtime so their tools join the model's tool set.

## 界面入口

同一页内容有两个入口，位置与内置的「归档管理」一致：

- **设置面板侧边栏**的一页「**Skills与MCP管理**」（`settings.section`），导航行使用本插件自己的图标；
- **侧边栏全局面板**图标（`sidebar.panellist` + `main`），点开在中间列显示同一页面（仅内边距不同，没有第二份视图）。

两个入口共享同一份页面快照、同一份 MCP 列表与同一套展开状态，任一处改动都会立刻反映到另一处。提示信息走 `shell.overlay` 的浮层吐司（与宿主自带的 `plugin-manager.refresh-toast` 等同层），不占布局、不引起跳动。

页面结构：**固定标题**（Skills与MCP管理）→ 常驻图标开关 → **「技能 / MCP 服务器」分段切换** → 视图头（标题 + ⓘ + 路径 + 计数，随切换变化）→ 工具栏与列表。分段切换紧贴视图头，切换时标题、路径与计数一起变。

## 功能

- **预设路径**：点「添加」打开系统目录选择器，选完立即添加；列表中可逐条删除。预设保存在插件私有配置里。
- **扫描层级**：一个全局选择框，**1–10 级，默认 1 级**，修改后立即持久化（`settings.json`），在下一次添加或刷新时生效。层级 > 1 时会向下递归，用来越过「技能不在第一层子目录」的情况；进入含 `SKILL.md` 的技能目录后不再继续下钻，避免把技能自己的资源目录当成技能。
- **折叠的路径菜单**：每个预设是一个折叠项，**默认折叠**。折叠时显示该路径与 `已链接 M · 共 N 个`；展开后列出该路径下发现的技能（深层找到的带「第 N 层」标记，重名的带「重名」标记）。
- **链接 / 解除链接**：每个技能右侧一个按钮。未链接时为「链接」，在 `<dshHome>/skills/<技能名>` 建立链接；已链接时变为「解除链接」。同名真实目录、或指向别处的同名链接不会被覆盖，按钮会直接显示占用原因。
- **批量链接**：每个路径右侧一个按钮 —— 未全部链接时为「链接」（一次链接该路径下所有未链接技能），全部链接后变为「取消链接」（一次解除该路径下属于它的链接）。结果以「已链接 N 个（跳过 X，失败 Y）」汇报；占用的名字记为失败，不会被覆盖。
- **侧边栏图标开关**：页面顶部一行「在侧边栏常驻图标」，控件优先使用宿主自带的 `Switch`；宿主未向插件暴露该模块时退回几何一致的备用开关。默认开启，按浏览器记忆（localStorage）；关掉后图标与面板一起移除，若面板正打开会先回到会话。
- **导航图标**：设置页该行的图标走宿主官方插槽 `settings.section.icon`（DSH 0.2.2 起由设置外壳渲染，`root` / `list` / `inline`），插件只需注册一个图标组件，**注册 id 必须与 `settings.section` 的 id 相同**，否则永不渲染；图标是纯 React 节点、用 `currentColor` 绘制，自动跟随选中态、hover 与明暗主题。旧版宿主没有该插槽时注册被忽略、保留默认齿轮，不报错也不白屏。
- **MCP 服务器**：分段切到「MCP 服务器」即可管理。列表存在插件私有目录的 `mcp.json`（JSON、明文、可手改），每个启用的服务器在运行时以 `ctx.plugin('@deepseek-ai/dsh-mcp-client', config)` 挂载，工具以 `mcp__<serverName>__<tool>` 出现在模型工具表；禁用/删除/改参数即时 unmount/remount，**不写 profile 组合文件**。
  - **折叠行**：serverName、传输方式、状态徽章（连接中 / 运行中 / 已停用 / 失败）与工具数；右侧依次是启停开关和 `编辑 / 重启 / 删除`（点这些按钮不会触发展开）。
  - **展开行**：列出该服务器当前注册的工具名与说明（自动去掉 `mcp__<serverName>__` 前缀，过长时列表内部滚动），并显示失败原因或「已连接但未注册工具」提示；环境变量与请求头只显示键名，不显示值。「编辑」按钮仍在摘要行，点它打开页面顶部的编辑卡片（不会改动展开状态）。
  - **状态自动更新**：有处于「连接中」的条目时每 700ms 静默重拉一次快照（不置忙、不弹提示，最多 20 次），所以编辑保存后不必手动点刷新；启动失败按 cordis `FiberState` 判定并给出排查提示。
  - **新增/编辑表单**：支持 stdio 与 streamable-http；命令、工作目录、参数、环境变量各占一行；「命令」行是**下拉 + 输入**：下拉在左，列出 `$DSH_HOME/dsh-runtimes/<payload>/dependencies` 下已解包的运行时（Node / Python / PNPM，带版本号），选中后输入框变为**不可编辑**样式，显示 **`$DSH_HOME/...` 形式的路径**（悬停看完整路径，不会误以为写死了本机路径）；下拉末尾的「自定义」会清空输入框并恢复编辑，「选择目录」按钮也只在自定义时出现。存进 `mcp.json` 的始终是**运行时名称**（`node` / `python` / `pnpm`）或手输内容——名称在挂载时才展开成本机实际路径，所以配置拷到别的设备仍然有效（PNPM 是脚本，挂载时自动变成 `node pnpm.cjs`，且会把 payload 的 `node/bin`、`pnpm/bin`、`python` 前置到子进程 `PATH`）。「命令 / 工作目录 / 参数」旁另有「选择目录」按钮（复用宿主原生目录选择器，把路径插入光标处，含空格自动加引号）；`保存 / 取消` 位于卡片标题行，长表单无需滚到底。备注字段可填写并保存，但不在列表里显示。
  - **编辑 JSON**：直接编辑 `mcp.json` 原文（卡片标题旁显示文件路径），保存时接受 `servers` 数组、裸数组、`mcpServers` 对象三种形状（后两者按字段自动推断 transport），便于从其他 agent 配置粘贴。
  - `serverName` 决定工具名前缀：改名等于改工具名，历史会话里的旧工具名不会自动迁移。

  `mcp.json` 的形状（`id` 只用于本插件，`serverName` 决定工具前缀）：

  ```json
  {
    "version": 1,
    "servers": [
      {
        "id": "mymcp",
        "serverName": "mymcp",
        "transport": "stdio",
        "enabled": true,
        "command": "node",
        "args": ["E:\\path\\to\\server\\dist\\index.js", "--iniPath", "C:\\path\\to\\config.ini"],
        "cwd": "E:\\path\\to\\server",
        "env": { "TOKEN": "..." },
        "failOnStartupError": true
      },
      {
        "id": "remote",
        "serverName": "remote",
        "transport": "streamable-http",
        "enabled": true,
        "url": "http://127.0.0.1:3000/mcp",
        "headers": { "Authorization": "Bearer ..." }
      }
    ]
  }
  ```

  注意 `command` 只放可执行文件（`node` / `npx`），脚本路径与 `--参数` 一律放进 `args`。

## 路径

| 用途 | 位置 |
|---|---|
| 技能根目录（链接目标） | `$DSH_HOME/skills`，默认 `~/.dsh/skills` |
| 插件私有配置 | `$DSH_HOME/skills-ext/presets.json`（预设路径）、`settings.json`（扫描层级等设置）、`mcp.json`（MCP 服务器列表） |

路径全部在宿主侧按平台解析（`$DSH_HOME`，未设置时用 `os.homedir()` 加 `.dsh`，再用 `path.join` 拼接 `skills`），所以 Windows 上是 `%USERPROFILE%\.dsh\skills`，macOS / Linux 上是 `~/.dsh/skills`；代码里不出现任何具体机器的绝对路径。

## 安装

在 DSH 界面里从 npm 安装：

1. 侧边栏打开「**插件**」页；
2. 点「**添加插件**」→「**安装第三方插件**」；
3. 在「包名或地址」里填 `@ancircle0/dsh-skills-ext`（需要固定版本时填 `@ancircle0/dsh-skills-ext@0.5.1`），点「**安装**」。

安装后插件立即生效（安装即启用）。升级时在插件页卸载，再按上面步骤安装新版本。

装好后从「设置 → Skills与MCP管理」或侧边栏的对应图标进入使用。

## 兼容性

- 需要目标 DSH 版本提供 `settings.section`、`sidebar.panellist`、`main`、`shell.overlay` 插槽与 `ctx.remote`（本插件在 `0.2.1-rc.3` 运行时 + `@deepseek-ai/dsh-mcp-client@0.2.1-rc.5` 上开发验证）。
- **宿主依赖以 `peerDependencies` 声明**，由 DSH 运行时提供，插件不自带副本：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-typert-protocol`（Host 侧服务与 Remote 标记）、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-store`（客户端控件与状态）、`@deepseek-ai/dsh-mcp-client`（MCP 服务器桥，缺失时页面会提示不可用）。
- 客户端拿不到某个网格件时（老宿主），相应位置退回等价的最小实现，不会抛错或白屏；设置导航图标是 best-effort DOM 增强，失败保留默认齿轮。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host 入口，导出 `SkillsExtService` |
| `lib/service.js` | Cordis 服务类：`TypertRemoteService` + `@Remote` 标记，方法返回页面快照、失败抛 `RemoteError` |
| `lib/core.js` | 纯文件系统逻辑：预设读写、技能扫描、链接状态、链接创建/删除 |
| `lib/mcp.js` | 纯逻辑：`mcp.json` 读写、服务器校验、导入解析（`servers` / 数组 / `mcpServers`） |
| `lib/mcp-runtime.js` | 每个服务器一个 `ctx.plugin('@deepseek-ai/dsh-mcp-client', config)`，负责挂载/卸载/重启与状态 |
| `client.js` | Web 端：设置页/侧边栏面板、技能与 MCP 两个视图、吐司、导航图标注入、Remote 客户端 |
| `locale/*.json` | 插件在插件列表中的标题与描述（中/英） |
| `test/core.test.mjs` | 核心逻辑测试（临时目录 + 真实链接创建/删除） |
| `test/mcp.test.mjs` | MCP 列表测试（校验、导入三种形状、文件往返、坏文件容错） |
| `test/i18n.test.mjs` | 文案守卫：中英键一致、Host 错误码必须本地化、字典外不得有中文字面量 |
| `test/asar-peek.mjs` | 开发辅助：直接从 DSH 的 `app.asar` 里读取并检索文件 |

## 开发

```bash
npm run check     # 语法检查（index / client / lib 各模块）
npm test          # 三套测试：核心逻辑、MCP 列表、文案守卫
npm run verify    # 两者都跑
npm run pack:check
```

**验证改动时请用打包安装，不要用本地目录 `link:`**：

```powershell
npm pack                        # 得到 ancircle0-dsh-skills-ext-x.y.z.tgz
# plugin_manager: install_bundle target=E:\path\to\ancircle0-dsh-skills-ext-x.y.z.tgz
```

`link:` 会让加载器解析到源码目录，`peerDependencies` 在那里不可解析，会掩盖真实的安装问题；打包安装才会真正走 `node_modules`，与从 npm 安装一致。

调试时可参考 `test/asar-peek.mjs`：它按 asar 头部解析归档，能直接打印/检索宿主源码（`node test/asar-peek.mjs <app.asar> <文件正则> [<内容正则>]`）。

## License

[MIT](LICENSE)
