# Changelog

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
