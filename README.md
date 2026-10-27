# dsh-skills-ext

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：维护一组**预设技能目录**，把其中的技能**链接**进当前 DSH 用户技能目录，或随时**解除链接**。

- 链接使用**目录联接（junction，Windows，无需管理员权限）**，其他平台使用**符号链接**；
- 解除链接**只删除链接本身**，源目录与其中的文件完全不受影响；
- 链接/解除链接后**不用重启，也不用新建会话**：DSH 自带的技能监视器（chokidar）会发现目录变化，插件还会在链接/解除后主动广播一次 `skills/change`，让技能目录尽快重扫。新技能以"替换目录"的形式在**同一个会话的下一条消息**里生效（正在进行的那一次请求不会中途改变）。

> English: a DSH Harness plugin that keeps preset skill directories and links/unlinks the skills inside them into the user skill root. Linking creates a directory junction on Windows (no admin rights needed) and a symlink elsewhere; unlinking removes only the link and never touches the source directory.

## 界面入口

同一页内容有两个入口，位置与内置的「归档管理」一致：

- **设置面板侧边栏**的一页「Skills 管理」（`settings.section`），导航行使用本插件自己的图标；
- **侧边栏全局面板**图标（`sidebar.panellist` + `main`），点开在中间列显示同一页面（仅内边距不同，没有第二份视图）。

两个入口共享同一份页面快照，任一处添加/删除/链接都会立刻反映到另一处。提示信息走 `shell.overlay` 的浮层吐司（与宿主自带的 `plugin-manager.refresh-toast` 等同层），不占布局、不引起跳动。

## 功能

- **预设路径**：点「添加」打开系统目录选择器，选完立即添加；列表中可逐条删除。预设保存在插件私有配置里。
- **技能列表**：扫描每个预设路径下一层的技能目录（`<预设>/<名称>/SKILL.md`，与 DSH 内置文件系统技能提供者规则一致），按预设分组列出，读取 frontmatter 的 `name` / `description`。
- **链接 / 解除链接**：每个技能右侧一个按钮。未链接时为「链接」，在 `<dshHome>/skills/<技能名>` 建立链接；已链接时变为「解除链接」。
  同名真实目录、或指向别处的同名链接不会被覆盖，按钮会直接显示占用原因。
- **侧边栏图标开关**：页面顶部一行「在侧边栏常驻图标」，控件优先使用宿主自带的 `Switch`；宿主未向插件暴露该模块时退回几何一致的备用开关。默认开启，按浏览器记忆（localStorage）；关掉后图标与面板一起移除，若面板正打开会先回到会话。
- **导航图标注入**：设置面板的 section API 没有图标插槽，因此像归档管理那样在导航行挂载后用 CSS mask + `currentColor` 绘制本插件图标。全程 best-effort：选择器变化、不支持 mask 等任何失败都撤掉标记与样式表、保留默认齿轮，不抛错、不白屏。

## 路径

| 用途 | 位置 |
|---|---|
| 技能根目录（链接目标） | `$DSH_HOME/skills`，默认 `~/.dsh/skills` |
| 插件私有配置 | `$DSH_HOME/skills-ext/presets.json` |

路径全部在宿主侧按平台解析（`$DSH_HOME`，未设置时用 `os.homedir()` 加 `.dsh`，再用 `path.join` 拼接 `skills`），所以 Windows 上是 `%USERPROFILE%\.dsh\skills`，macOS / Linux 上是 `~/.dsh/skills`；代码里不出现任何具体机器的绝对路径。

## 安装

在 DSH 界面里从 npm 安装：

1. 侧边栏打开「**插件**」页；
2. 点「**添加插件**」→「**安装第三方插件**」；
3. 在「包名或地址」里填 `dsh-skills-ext`（需要固定版本时填 `dsh-skills-ext@0.1.0`），点「**安装**」。

安装后插件立即生效（安装即启用）。升级时在插件页卸载，再按上面步骤安装新版本。

装好后从「设置 → Skills 管理」或侧边栏的 Skills 图标进入使用。

## 兼容性

- 需要目标 DSH 版本提供 `settings.section`、`sidebar.panellist`、`main`、`shell.overlay` 插槽与 `ctx.remote`（本插件在 `0.2.1-rc.3` 上开发验证）。
- 插件通过 `typert` 清单发布 `skillsExt` Remote 服务；宿主未暴露某个 UI 能力时，相应功能会**自行降级**而不是报错（例如导航图标退回默认齿轮、侧边栏开关显示"当前版本不支持"）。
- **不依赖任何宿主包**：Host 半只 import `node:*` 内置模块，服务用 `ctx.reflect.provide()` 发布、Remote 标记手写（等价于 `TypertRemoteService` + `@Remote` 生成的两条记录），因此从 npm 安装即可加载，不会出现 `Cannot find package '@deepseek-ai/...'`。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host 入口，导出 `apply(ctx, config)` |
| `lib/service.js` | 纯插件：发布 `skillsExt` 服务，方法返回页面快照，失败抛带 `code` 的错误 |
| `lib/core.js` | 纯文件系统逻辑：预设读写、技能扫描、链接状态、链接创建/删除 |
| `typert.host.js` | Typert Host 清单，声明 `skillsExt` 的 Remote 描述符 |
| `client.js` | Web 端：设置页/侧边栏面板、吐司、导航图标注入、Remote 客户端 |
| `locale/*.json` | 插件在插件列表中的标题与描述（中/英） |
| `test/core.test.mjs` | 核心逻辑测试（临时目录 + 真实链接创建/删除） |
| `test/asar-peek.mjs` | 开发辅助：直接从 DSH 的 `app.asar` 里读取并检索文件 |

## 开发

```bash
npm run check   # 语法检查
npm test        # 核心逻辑测试
npm run verify  # 两者都跑
npm run pack:check
```

调试插件本身时可参考 `test/asar-peek.mjs`：它按 asar 头部解析归档，能直接打印/检索宿主源码（`node test/asar-peek.mjs <app.asar> <文件正则> [<内容正则>]`）。

## License

[MIT](LICENSE)
