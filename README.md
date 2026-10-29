# @ancircle0/dsh-skills-ext

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：维护一组**预设技能目录**，把其中的技能**链接**进当前 DSH 用户技能目录，或随时**解除链接**。

- 链接使用**目录联接（junction，Windows，无需管理员权限）**，其他平台使用**符号链接**；
- 解除链接**只删除链接本身**，源目录与其中的文件完全不受影响；
- 链接/解除链接后**立即生效，不用重启也不用新建会话**：插件随后 ① 让技能注册表失效缓存（`invalidateCache()`：`revision + 1`、清空收集缓存、广播 `skills/change`），模型在当前会话的**下一条消息**就能看到技能增减；② 再广播一次"配置已变"的刷新信号，让 `/` 技能选择器这类**客户端缓存**也重拉——所以下次打开 `/` 就是最新结果（正在进行的那一次请求不会中途改变）。

> English: a DSH Harness plugin that keeps preset skill directories and links/unlinks the skills inside them into the user skill root. Linking creates a directory junction on Windows (no admin rights needed) and a symlink elsewhere; unlinking removes only the link and never touches the source directory.

## 界面入口

同一页内容有两个入口，位置与内置的「归档管理」一致：

- **设置面板侧边栏**的一页「Skills 管理」（`settings.section`），导航行使用本插件自己的图标；
- **侧边栏全局面板**图标（`sidebar.panellist` + `main`），点开在中间列显示同一页面（仅内边距不同，没有第二份视图）。

两个入口共享同一份页面快照，任一处添加/删除/链接都会立刻反映到另一处。提示信息走 `shell.overlay` 的浮层吐司（与宿主自带的 `plugin-manager.refresh-toast` 等同层），不占布局、不引起跳动。

## 功能

- **预设路径**：点「添加」打开系统目录选择器，选完立即添加；列表中可逐条删除。预设保存在插件私有配置里。
- **扫描层级**：一个全局选择框，**1–10 级，默认 1 级**，修改后立即持久化（`settings.json`），在下一次添加或刷新时生效。层级 > 1 时会向下递归，用来越过「技能不在第一层子目录」的情况；进入含 `SKILL.md` 的技能目录后不再继续下钻，避免把技能自己的资源目录当成技能。
- **技能列表**：按上述层级扫描每个预设路径，按预设分组列出，读取 frontmatter 的 `name` / `description`；深层找到的技能会带「第 N 层」标记。
- **链接 / 解除链接**：每个技能右侧一个按钮。未链接时为「链接」，在 `<dshHome>/skills/<技能名>` 建立链接；已链接时变为「解除链接」。
  同名真实目录、或指向别处的同名链接不会被覆盖，按钮会直接显示占用原因。
- **侧边栏图标开关**：页面顶部一行「在侧边栏常驻图标」，控件优先使用宿主自带的 `Switch`；宿主未向插件暴露该模块时退回几何一致的备用开关。默认开启，按浏览器记忆（localStorage）；关掉后图标与面板一起移除，若面板正打开会先回到会话。
- **导航图标注入**：设置面板的 section API 没有图标插槽，因此像归档管理那样在导航行挂载后用 CSS mask + `currentColor` 绘制本插件图标。全程 best-effort：选择器变化、不支持 mask 等任何失败都撤掉标记与样式表、保留默认齿轮，不抛错、不白屏。

## 路径

| 用途 | 位置 |
|---|---|
| 技能根目录（链接目标） | `$DSH_HOME/skills`，默认 `~/.dsh/skills` |
| 插件私有配置 | `$DSH_HOME/skills-ext/presets.json`（预设路径）、`$DSH_HOME/skills-ext/settings.json`（扫描层级等设置） |

路径全部在宿主侧按平台解析（`$DSH_HOME`，未设置时用 `os.homedir()` 加 `.dsh`，再用 `path.join` 拼接 `skills`），所以 Windows 上是 `%USERPROFILE%\.dsh\skills`，macOS / Linux 上是 `~/.dsh/skills`；代码里不出现任何具体机器的绝对路径。

## 安装

在 DSH 界面里从 npm 安装：

1. 侧边栏打开「**插件**」页；
2. 点「**添加插件**」→「**安装第三方插件**」；
3. 在「包名或地址」里填 `@ancircle0/dsh-skills-ext`（需要固定版本时填 `@ancircle0/dsh-skills-ext@0.2.1`），点「**安装**」。

安装后插件立即生效（安装即启用）。升级时在插件页卸载，再按上面步骤安装新版本。

装好后从「设置 → Skills 管理」或侧边栏的 Skills 图标进入使用。

## 兼容性

- 需要目标 DSH 版本提供 `settings.section`、`sidebar.panellist`、`main`、`shell.overlay` 插槽与 `ctx.remote`（本插件在 `0.2.1-rc.3` 上开发验证）。
- **宿主依赖以 `peerDependencies` 声明**，由 DSH 运行时提供，插件不自带副本：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-typert-protocol`（Host 侧服务与 Remote 标记）、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-store`（客户端控件与状态）。
- 客户端拿不到某个网格件时（老宿主），相应位置退回等价的最小实现，不会抛错或白屏；设置导航图标是 best-effort DOM 增强，失败保留默认齿轮。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host 入口，导出 `SkillsExtService` |
| `lib/service.js` | Cordis 服务类：`TypertRemoteService` + `@Remote` 标记，方法返回页面快照、失败抛 `RemoteError` |
| `lib/core.js` | 纯文件系统逻辑：预设读写、技能扫描、链接状态、链接创建/删除 |
| `client.js` | Web 端：设置页/侧边栏面板、吐司、导航图标注入、Remote 客户端 |
| `locale/*.json` | 插件在插件列表中的标题与描述（中/英） |
| `test/core.test.mjs` | 核心逻辑测试（临时目录 + 真实链接创建/删除） |
| `test/asar-peek.mjs` | 开发辅助：直接从 DSH 的 `app.asar` 里读取并检索文件 |

## 开发

```bash
npm run check     # 语法检查
npm test          # 核心逻辑测试
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
