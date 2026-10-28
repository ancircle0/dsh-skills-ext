# Changelog

## 0.1.3

- 深色模式下「添加」按钮文字与底色同色的问题：按钮优先使用宿主自带的 `Button`（`variant: "primary"`，随主题正确着色），兜底样式改为"前景色填充 + 背景色文字"的反色对，两种主题下都有对比度。

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
