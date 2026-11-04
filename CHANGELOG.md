# Changelog

## 0.5.2

- **命令字段变成「下拉 + 输入」组合框**：下拉位于输入框**左侧**，列出 `$DSH_HOME/dsh-runtimes/<payload>/dependencies` 下 DSH 已解包的运行时（Node / Python / PNPM，带版本号）。选中内置运行时时，输入框改为**不可编辑**样式并显示 **`$DSH_HOME/...` 形式的路径**（不是本机绝对路径，避免误以为写死了路径），鼠标悬停可看完整路径；下拉末尾始终有「自定义」，选中即清空输入框恢复编辑，「选择目录」按钮也只在自定义时出现。存进去的始终是**运行时名称**（`node` / `python` / `pnpm`）或你手输的内容。
- **存的是可迁移的名称，不是本机绝对路径**：挂载时才把名称展开成该机器上已解包的路径，所以 `mcp.json` 拷到另一台设备依然有效。PNPM 是脚本，挂载时自动展开成 `node pnpm.cjs`（不会污染 `args`，也不会重复追加）。绝对路径与 `npx` 这类命令原样透传。
- **子进程 PATH 前置内置运行时**：挂载时把 payload 的 `node/bin`、`pnpm/bin`、`python` 等目录放到 `PATH` 最前，服务器自身的 `npx` 调用也能命中 DSH 自带版本。
- **只解析 `$DSH_HOME`**：不读取安装目录的运行时（安装后 `$DSH_HOME` 必有解包版本），因此不依赖 Electron 的 `process.resourcesPath`，换盘/换安装位置都正确；`dsh-runtimes` 尚未解包时降级为只剩自定义输入。
- 新增 `lib/runtimes.js` 与 `test/runtime.test.mjs`（payload 发现、primary 优先、缺目录/缺可执行文件降级、名称展开、PATH 组合）。

## 0.5.1

- **改名与页面结构**：显示名改为 **Skills与MCP管理**（en: `Skills & MCP`），插件列表标题、设置导航行与页面标题一致；页面顶部新增标题，「Skills 管理 + 链接目标路径 + 计数」整行下移到侧边栏开关区块下面，并把「技能 / MCP 服务器」分段切换移到该行**上方** —— 切换时标题、路径、计数一起变，不再像两个割裂的区块。
- **MCP 视图细化**：ⓘ 提示改为 MCP 说明；展开条目列出该服务器已注册的工具名与说明（自动去掉 `mcp__<server>__` 前缀，最多 260px 内部滚动）；`编辑 / 重启 / 删除` 移到摘要行开关右侧；新增/编辑表单与「编辑 JSON」的保存/取消按钮移到卡片标题行，JSON 卡片的文件路径也挪到标题旁（过长省略）。展开区不再重复显示命令/端点与备注。
- **状态自动更新**：条目处于「连接中」时每 700ms 静默重拉快照（不置忙、不弹提示，最多 20 次），编辑保存后无需再手点刷新。
- **失败态修正**：按 cordis `FiberState` 区分 `FAILED` / `DISPOSED`，启动失败现在显示「失败」并给出排查提示（此前会一直停在「连接中」）。

## 0.5.0

**新增 MCP 服务器管理。**

- **页面顶部加分段切换**：`技能` / `MCP 服务器`；MCP 页沿用折叠列表样式，行内显示 serverName、传输方式、状态徽章（连接中/运行中/已停用/失败）与工具数，展开可编辑/重启/删除，摘要行右侧是启停开关。
- **服务器列表存在插件私有目录的 `mcp.json`**（JSON、明文、可手改），**不写 profile 组合**：每个启用的服务器由本插件在运行时 `ctx.plugin('@deepseek-ai/dsh-mcp-client', config)` 挂载，工具以 `mcp__<serverName>__<tool>` 注册，禁用/删除/改参数即 unmount/remount。
- **新增/编辑表单**：serverName、传输方式（stdio / streamable-http）、命令、工作目录、参数（每行一个）、环境变量（每行 `KEY=VALUE`）、URL、请求头、备注、调用超时、启动失败即报错；命令/工作目录/参数三个字段带「选择目录」按钮，复用宿主原生目录选择器并把路径插入光标处（含空格自动加引号）。
- **手动编辑 JSON**：直接展示 `mcp.json` 原文，保存时支持 `servers` 数组、裸数组与 `mcpServers` 对象三种形状（后两者自动推断 transport）。
- **Host 新增 Remote**：`mcpState / mcpCreate / mcpUpdate / mcpRemove / mcpToggle / mcpRestart / mcpRaw / mcpSaveRaw`；`mcp.json` 与校验逻辑在 `lib/mcp.js`，挂载与状态在 `lib/mcp-runtime.js`。
- **状态映射修正**：按 cordis `FiberState` 区分 `FAILED`（失败）与 `DISPOSED`（已停用），失败且无具体错误时给出排查提示。
- 依赖新增 peer：`@deepseek-ai/dsh-mcp-client`；测试新增 `test/mcp.test.mjs`（校验/导入/文件往返）与 `test/i18n.test.mjs`（中英键一致、Host 错误码必须本地化、字典外不得有中文字面量）。

## 0.4.1

- **修复深色模式下扫描层级下拉的弹出列表看不清**：原生 `<select>` 的弹出层由浏览器绘制，此前只设了控件文字色（深色下为白色）却没设 `option` 背景，于是白底白字。现在给 `option` 使用 `--dsw-alias-bg-overlay` / `--dsw-alias-label-primary`，控件本身用 `--dsw-alias-bg-layer-1`，并按页面实际背景亮度设置 `color-scheme`，让原生装饰（边框、滚动条、选中高亮）也跟随主题。

## 0.4.0

**页面结构与交互重做。**

- **预设路径与技能列表合并为折叠菜单**：每个预设是一个折叠项（宿主 `DisclosureRow`），**默认折叠**、默认只在本次会话内记忆展开状态，设置页与侧边栏面板共享。
- **折叠摘要**：预设路径 + `已链接 M · 共 N 个` 徽章 + 该路径的批量按钮与删除按钮；展开后显示该路径下的技能列表（层级/重名徽章、来源路径、链接/解除链接按钮）。
- **每个路径支持批量操作**：未全部链接时显示「链接」，全部链接后显示「取消链接」，一次处理该路径下所有技能。Host 新增 `linkPreset` / `unlinkPreset`，返回快照 + `summary { linked|unlinked, skipped, failed, failures }`；被真实目录或外部链接占用的名字记为失败而不会被覆盖。
- **头部精简**：链接目标路径移到标题后（`Skills 管理 ⓘ <路径>`），工具栏只保留「预设路径 + 扫描层级 + 添加 + 刷新」。
- **细节**：折叠箭头常显（`previewChevron: false`，宿主默认是 hover 才出现）、条目之间加分隔线、条目 `padding: 14px 0`、删除/批量按钮与内容两端对齐。
- **去除操作时的闪烁**：busy 状态不再是一个全局标志 —— 每个控件只按自己的动作 key 判定禁用与文案，点一行只有那一个按钮短暂变淡；按钮也不再切换成「处理中…」，避免宽度抖动带动整行重排。
- 清理不再使用的文案与样式；core 测试补充批量链接/解除用例。

## 0.3.0

- **多层级扫描**：新增全局「扫描层级」选择框（1–10 级，默认 1 级），解决技能不在预设目录第一层子目录时扫不出来的问题。修改即持久化到 `$DSH_HOME/skills-ext/settings.json`，在下一次添加或刷新时生效；深层找到的技能在列表里带「第 N 层」标记。含 `SKILL.md` 的目录视为技能包，不再向下递归。
- Host 新增 `setScanDepth` Remote 方法；`state` 快照增加 `scanDepth`、`settingsFile`，技能条目增加 `level` 与 `relativePath`。
- 核心测试补充层级用例（默认层级、深层发现、层级持久化、上下限截断）。

## 0.2.1

- 包名改为组织作用域 **`@ancircle0/dsh-skills-ext`**（`publishConfig.access: "public"`），`cordis.patch.yml` 的行名与客户端模块 id 同步更新。安装时请使用新的包名。

## 0.2.0

**宿主能力用起来，不再自己造轮子。**

- **Host**：回到官方写法 —— `class SkillsExtService extends TypertRemoteService`，`[Service.init]()` 里用 `@Remote` 标记方法；删除手写的 `typert.host.js` 清单与手搓的 `typertRemote` / `remote-methods` 记录；失败改用 `RemoteError`。
- **依赖**：改用 `peerDependencies` 声明宿主包（`@deepseek-ai/cordis`、`dsh-typert-protocol`、`dsh-client-ui-primitives`、`dsh-client-store`），不再自带任何副本，也没有 `dependencies`。
- **Client**：控件与状态全部改用宿主实现 —— `Switch`、`Button`、`Tooltip`（标题旁 ⓘ）、`Toast`（提示，取代自绘 div + 计时器）、`Tag`（状态徽章）、`PathLabel`（路径展示）、`@deepseek-ai/dsh-client-store`（快照 store）。只在网格件缺失时退回等价的最小实现。
- **测试方式**：改为 `npm pack` 打包后安装 tgz 验证，**不再用 `link:`** —— link 会让加载器解析到源码目录，`peerDependencies` 在那里不可解析，会掩盖真实安装问题。

## 0.1.3

- **所有动作按钮改用宿主自带的 `Button`**（`@deepseek-ai/dsh-client-ui-primitives`，与宿主各处 UI 同一个组件）：添加/链接用 `primary`，刷新/删除/解除链接用 `outline`（`0.5px solid border-l3`，有明确的点击边界），尺寸随宿主（`sm` / 添加按钮 `md`）——与宿主审批卡「拒绝(outline) + 允许一次(primary)」的搭配一致。
- 修复深色模式下「添加」按钮文字与底色同色的问题：此前按钮是自绘的，白字写死 `#fff`、底色用 `brand-primary`；现在兜底样式也改用宿主专用 token（`button-primary-fill` / `button-primary-hover` / `label-primary-foreground`），与宿主按钮完全一致。

## 0.1.2

- 链接/解除链接后**立即生效**：先让技能注册表失效缓存（`invalidateCache()`），再广播一次 `plugin-manager/changed`，让 `/` 技能选择器等客户端缓存也重拉。
- 修复 0.1.0 从 npm 安装后无法启用的问题（`ERR_MODULE_NOT_FOUND: @deepseek-ai/cordis`）。

## 0.1.1

- Host 半改为零宿主依赖的纯插件：`apply(ctx)` 通过 `ctx.reflect.provide()` 发布 `skillsExt` 服务，Remote 标记（`typertRemote` 与 `remote-methods` 描述符）手写，等价于 `TypertRemoteService` + `@Remote()`；`typert` 清单不再依赖 `zod`。
- 因此 `peerDependencies` 全部移除，从 npm 安装即可加载。

## 0.1.0

- 首个发布：设置面板「Skills 管理」页 + 侧边栏全局面板，共享同一页面快照。
- 预设路径（系统目录选择器，选完即添加）、按预设计算并分组列出技能。
- 每个技能右侧「链接」/「解除链接」：Windows 用目录联接（junction）、其他平台用符号链接；只删链接，不动源目录；同名真实目录或指向别处的链接不会被覆盖。
- 侧边栏图标常驻开关（优先使用宿主 `Switch`）、设置导航行图标注入（best-effort，失败保留默认齿轮）、浮层吐司提示。
