/**
 * dsh-skills-ext — Client half (web bundle).
 *
 * Loaded by the DSH web shell through `window.__ModuleLoader__.load`. It adds
 * two entries that render the same page:
 *
 *   - a Settings page (`settings.section`), the same sidebar position the
 *     archive manager occupies, listed under its own nav row;
 *   - a sidebar global panel (`sidebar.panellist` + `main`) that opens the very
 *     same page in the central column — no second view, only extra padding — and
 *     is switched on or off from the page itself (the shell's own `Switch` when
 *     this build publishes it) and remembered per browser;
 *   - this plugin's mark on the Settings nav row, which the section API has no
 *     icon slot for: it is painted best-effort over the default gear and backs
 *     out to that gear whenever anything is unavailable.
 *
 * Both surfaces share one component and one Host service:
 *
 *   - preset skill directories: an absolute-path entry with a native folder
 *     picker, plus a list where each preset can be removed;
 *   - every skill discovered inside those presets, grouped by preset, with a
 *     right-side action that links the skill into `<dshHome>/skills/<name>` as a
 *     directory junction, or removes that junction again.
 *
 * Host communication goes through the `skillsExt` Remote namespace mounted by
 * this module and served by `lib/service.js`.
 */

window.__ModuleLoader__.load({
  id: "dsh-skills-ext",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const h = React.createElement;

    /**
     * Host UI primitives (`Switch` etc.). Required defensively: older hosts do
     * not expose this module, and this plugin must keep working there.
     */
    let ui = null;
    try {
      ui = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch {
      ui = null;
    }
    /**
     * The host's own on/off control (the one its plugin list uses), resolved
     * defensively so an older host without the export still gets the fallback.
     * Same pattern as `dsh-archive-ext`.
     */
    const HostSwitch = (() => {
      let value;
      try {
        value = ui && ui.Switch;
      } catch {
        return null;
      }
      if (typeof value === "function") return value;
      if (value !== null && typeof value === "object" && "$$typeof" in value) return value;
      return null;
    })();
    /** Same defensive resolution for the host's primary button. */
    const HostButton = (() => {
      let value;
      try {
        value = ui && ui.Button;
      } catch {
        return null;
      }
      if (typeof value === "function") return value;
      if (value !== null && typeof value === "object" && "$$typeof" in value) return value;
      return null;
    })();

    const NS = "skillsExt";
    const PACKAGE = "dsh-skills-ext";
    /** Sidebar panel key: also the `main` slot key and the panellist entry id. */
    const PANEL_ID = "skills-ext";

    // ---- Client Remote contribution -----------------------------------------
    // Codecs stay pass-through on this side: the Host manifest
    // (`typert.host.js`) owns every real validation rule.
    let passthroughValue;
    const passthroughSchema = () => (passthroughValue ??= { parse: (value) => value });
    const strictClientCodec = (typeSymbol) => ({
      mode: "strict",
      typeSymbol,
      schema: passthroughSchema(),
      create: passthroughSchema,
    });

    const requestCodec = (typeSymbol) => ({
      name: "request",
      wire: "request",
      source: "json",
      codec: strictClientCodec(typeSymbol),
    });

    const CLIENT_REMOTE = {
      package: PACKAGE,
      descriptors: [
        {
          id: `${PACKAGE}#skillsExt/state`,
          service: "skillsExt",
          namespace: "skillsExt",
          method: "state",
          invocation: { kind: "direct" },
          parameters: [],
          result: strictClientCodec(`${PACKAGE}#SkillsExtStateResult`),
        },
        {
          id: `${PACKAGE}#skillsExt/addPreset`,
          service: "skillsExt",
          namespace: "skillsExt",
          method: "addPreset",
          invocation: { kind: "direct" },
          parameters: [requestCodec(`${PACKAGE}#SkillsExtPathRequest`)],
          result: strictClientCodec(`${PACKAGE}#SkillsExtStateResult`),
        },
        {
          id: `${PACKAGE}#skillsExt/removePreset`,
          service: "skillsExt",
          namespace: "skillsExt",
          method: "removePreset",
          invocation: { kind: "direct" },
          parameters: [requestCodec(`${PACKAGE}#SkillsExtPathRequest`)],
          result: strictClientCodec(`${PACKAGE}#SkillsExtStateResult`),
        },
        {
          id: `${PACKAGE}#skillsExt/link`,
          service: "skillsExt",
          namespace: "skillsExt",
          method: "link",
          invocation: { kind: "direct" },
          parameters: [requestCodec(`${PACKAGE}#SkillsExtLinkRequest`)],
          result: strictClientCodec(`${PACKAGE}#SkillsExtStateResult`),
        },
        {
          id: `${PACKAGE}#skillsExt/unlink`,
          service: "skillsExt",
          namespace: "skillsExt",
          method: "unlink",
          invocation: { kind: "direct" },
          parameters: [requestCodec(`${PACKAGE}#SkillsExtNameRequest`)],
          result: strictClientCodec(`${PACKAGE}#SkillsExtStateResult`),
        },
      ],
    };

    // ---- locale dictionaries -------------------------------------------------
    const ZH = {
      "settings.nav": "Skills 管理",
      "settings.pin": "在侧边栏常驻图标",
      "settings.pinDesc": "开启后在侧边栏显示本插件图标，点开在中间列打开本页。",
      "settings.pinUnsupported": "当前 DSH 版本没有侧边栏面板入口，无法显示图标。",
      "settings.on": "已开启",
      "settings.off": "已关闭",
      "page.title": "Skills 管理",
      "page.intro":
        "维护预设的技能目录，并把其中的技能链接到当前 DSH 用户技能目录。链接使用目录联接（junction），解除链接只删除链接，源目录不受影响。",
      "presets.title": "预设路径",
      "presets.hint": "链接目标：{root}",
      "presets.add": "添加",
      "presets.remove": "删除",
      "presets.empty": "还没有预设路径。添加一个包含技能目录（每个技能一个子目录，里面是 SKILL.md）的路径。",
      "presets.exists": "存在 · {count} 个技能",
      "presets.missing": "路径不存在",
      "skills.title": "已发现的技能",
      "skills.count": "共 {count} 个",
      "skills.refresh": "刷新",
      "skills.empty": "预设路径中还没有发现技能。",
      "skills.link": "链接",
      "skills.unlink": "解除链接",
      "skills.linked": "已链接",
      "skills.conflict": "已被其他链接占用",
      "skills.occupied": "同名目录已存在",
      "skills.duplicate": "重名",
      "skills.noDescription": "（无描述）",
      "skills.busy": "处理中…",
      "notice.added": "已添加预设路径",
      "notice.removed": "已删除预设路径",
      "notice.linked": "已链接 {name}",
      "notice.unlinked": "已解除链接 {name}",
      "notice.refreshed": "已刷新",
      "notice.browseUnavailable": "当前 DSH 版本不支持选择目录，请手动输入路径",
      "errors.path-empty": "请输入预设路径",
      "errors.path-not-absolute": "预设路径必须是绝对路径",
      "errors.path-duplicate": "该预设路径已存在",
      "errors.path-missing": "该预设路径不在列表中",
      "errors.presets-write-failed": "写入预设配置失败",
      "errors.invalid-name": "技能名不合法",
      "errors.invalid-dir": "技能目录不合法",
      "errors.source-missing": "技能目录不存在或缺少 SKILL.md",
      "errors.target-occupied": "技能目录中已存在同名真实目录",
      "errors.target-conflict": "技能目录中已有同名链接指向其他地方",
      "errors.target-not-link": "该条目不是链接，未删除",
      "errors.link-failed": "创建链接失败",
      "errors.unlink-failed": "删除链接失败",
      "errors.state-failed": "读取状态失败",
      "errors.unknown": "操作失败",
    };

    const EN = {
      "settings.nav": "Skills Manager",
      "settings.pin": "Keep the sidebar icon",
      "settings.pinDesc":
        "Show this plugin's icon in the sidebar; clicking it opens this page in the center column.",
      "settings.pinUnsupported":
        "This DSH version has no sidebar panel entry, so the icon cannot be shown.",
      "settings.on": "On",
      "settings.off": "Off",
      "page.title": "Skills Manager",
      "page.intro":
        "Maintain preset skill directories and link the skills they contain into this DSH user skill root. Linking creates a directory junction; unlinking removes only the link and leaves the source untouched.",
      "presets.title": "Preset paths",
      "presets.hint": "Link target: {root}",
      "presets.add": "Add",
      "presets.remove": "Remove",
      "presets.empty":
        "No preset path yet. Add a directory that contains one sub-directory per skill, each with a SKILL.md.",
      "presets.exists": "{count} skills",
      "presets.missing": "Path not found",
      "skills.title": "Discovered skills",
      "skills.count": "{count} total",
      "skills.refresh": "Refresh",
      "skills.empty": "No skills discovered under the preset paths yet.",
      "skills.link": "Link",
      "skills.unlink": "Unlink",
      "skills.linked": "Linked",
      "skills.conflict": "Linked elsewhere",
      "skills.occupied": "Name taken by a real directory",
      "skills.duplicate": "duplicate",
      "skills.noDescription": "(no description)",
      "skills.busy": "Working…",
      "notice.added": "Preset path added",
      "notice.removed": "Preset path removed",
      "notice.linked": "Linked {name}",
      "notice.unlinked": "Unlinked {name}",
      "notice.refreshed": "Refreshed",
      "notice.browseUnavailable": "This DSH version cannot pick directories; type the path instead",
      "errors.path-empty": "Enter a preset path",
      "errors.path-not-absolute": "The preset path must be absolute",
      "errors.path-duplicate": "That preset path already exists",
      "errors.path-missing": "That preset path is not in the list",
      "errors.presets-write-failed": "Could not write the preset configuration",
      "errors.invalid-name": "Invalid skill name",
      "errors.invalid-dir": "Invalid skill directory",
      "errors.source-missing": "The skill directory or its SKILL.md is missing",
      "errors.target-occupied": "A real directory with that name already exists",
      "errors.target-conflict": "A link with that name already points elsewhere",
      "errors.target-not-link": "That entry is not a link, so nothing was removed",
      "errors.link-failed": "Could not create the link",
      "errors.unlink-failed": "Could not remove the link",
      "errors.state-failed": "Could not read the state",
      "errors.unknown": "The operation failed",
    };

    // ---- styles --------------------------------------------------------------
    const CSS = `
.ske-page{display:flex;flex-direction:column;gap:18px;padding:0 0 24px;max-width:920px;color:var(--dsw-alias-label-primary,inherit);font-size:14px;line-height:20px;}
.ske-surface-head{display:flex;align-items:center;gap:10px;padding:0 0 2px;}
.ske-surface-heading{display:flex;align-items:center;gap:6px;flex:1;min-width:0;}
.ske-surface-title{min-width:0;font-weight:500;font-size:16px;line-height:24px;color:var(--dsw-alias-label-primary,inherit);}
.ske-surface-count{flex:none;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary,inherit);}
.ske-tip{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;border-radius:50%;color:var(--dsw-alias-label-secondary,inherit);cursor:help;outline:none;}
.ske-tip:hover,.ske-tip:focus-visible{color:var(--dsw-alias-label-primary,inherit);}
.ske-tip:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4a7dff);}
.ske-tip-body{display:none;position:absolute;top:24px;left:-10px;z-index:30;box-sizing:border-box;width:320px;max-width:min(320px,80vw);padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,inherit);font-size:12px;line-height:18px;font-weight:400;text-align:left;box-shadow:0 6px 18px rgba(0,0,0,.16);}
.ske-tip:hover .ske-tip-body,.ske-tip:focus-visible .ske-tip-body{display:block;}
.ske-page.ske-panel{box-sizing:border-box;height:100%;padding:24px;overflow-y:auto;overscroll-behavior:contain;}
.ske-pin{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16));border-radius:10px;}
.ske-pin-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.ske-pin-label{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary,inherit);}
.ske-pin-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit);}
.ske-toggle-control{display:inline-flex;align-items:center;gap:8px;flex:none;}
.ske-toggle-state{min-width:2.5em;text-align:right;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit);}
.ske-switch{position:relative;flex:none;box-sizing:border-box;width:36px;height:20px;padding:0;border:1px solid transparent;border-radius:999px;background:var(--dsw-alias-label-secondary,rgba(128,128,128,.55));cursor:pointer;transition:background .15s ease,border-color .15s ease;appearance:none;-webkit-appearance:none;}
.ske-switch:disabled{opacity:.5;cursor:default;}
.ske-switch-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 1px 2px rgba(0,0,0,.28);transition:transform .15s ease;}
.ske-switch-on{background:var(--dsw-alias-brand-primary,#4a7dff);}
.ske-switch-on .ske-switch-knob{transform:translateX(16px);}
.ske-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4a7dff);outline-offset:2px;}
.ske-section{display:flex;flex-direction:column;gap:8px;}
.ske-section-head{display:flex;align-items:center;gap:10px;}
.ske-section-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary,inherit);}
.ske-section-hint{flex:1;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ske-btn{flex:none;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));background:transparent;color:var(--dsw-alias-label-primary,inherit);font-family:inherit;font-size:13px;line-height:18px;padding:6px 12px;border-radius:8px;cursor:pointer;white-space:nowrap;}
.ske-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1));}
.ske-btn:disabled{opacity:.55;cursor:default;}
.ske-btn-primary{border-color:transparent;background:var(--dsw-alias-label-primary,var(--dsw-alias-brand-primary,#4a7dff));color:var(--dsw-alias-bg-base,#fff);}
.ske-btn-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary,var(--dsw-alias-brand-primary,#4a7dff));opacity:.9;}
.ske-btn-danger:hover:not(:disabled){border-color:var(--dsw-alias-state-error-primary,#d94a4a);color:var(--dsw-alias-state-error-primary,#d94a4a);}
.ske-list{display:flex;flex-direction:column;gap:2px;}
.ske-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16));}
.ske-row+.ske-row{margin-top:2px;}
.ske-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.ske-row-title{display:flex;align-items:center;gap:6px;font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ske-row-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ske-row-sub{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,inherit);opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ske-row-actions{flex:none;display:flex;align-items:center;gap:6px;}
.ske-group-head{display:flex;align-items:center;gap:8px;margin-top:10px;padding:0 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit);}
.ske-group-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
.ske-group-state{flex:none;}
.ske-tag{flex:none;font-size:11px;line-height:16px;padding:0 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));color:var(--dsw-alias-label-secondary,inherit);}
.ske-tag-ok{color:var(--dsw-alias-state-success-primary,#2f9e5b);border-color:var(--dsw-alias-state-success-primary,#2f9e5b);}
.ske-tag-warn{color:var(--dsw-alias-state-warn-primary,#b9791a);border-color:var(--dsw-alias-state-warn-primary,#b9791a);}
.ske-tag-error{color:var(--dsw-alias-state-error-primary,#d94a4a);border-color:var(--dsw-alias-state-error-primary,#d94a4a);}
.ske-empty{padding:10px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,inherit);border:1px dashed var(--dsw-alias-border-l1,rgba(128,128,128,.24));border-radius:10px;}
.ske-toast{position:fixed;right:24px;bottom:24px;z-index:1200;max-width:360px;padding:10px 14px;border-radius:10px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-2,#fff));color:var(--dsw-alias-label-primary,inherit);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));font-size:13px;line-height:18px;box-shadow:0 12px 40px rgba(0,0,0,.22);pointer-events:none;overflow-wrap:anywhere;}
.ske-toast-ok{border-left:3px solid var(--dsw-alias-state-success-primary,#2f9e5b);}
.ske-toast-error{border-left:3px solid var(--dsw-alias-state-error-primary,#d94a4a);}
`;

    // ---- icons ---------------------------------------------------------------
    // One mark everywhere — a skill card with a sparkle on its top-right corner.
    // `icon.svg` (the plugin row) and the Settings-nav mask below reuse the same
    // geometry, so the row, the sidebar button and the nav entry read as one
    // icon. Every part is drawn with `currentColor` so themes need no overrides.
    /** Sidebar panel button and inline mark: the skill-card silhouette. */
    function IconSkills({ size = 16 }) {
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.4,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": true,
        },
        h("rect", { x: 1.8, y: 6.2, width: 9, height: 8.2, rx: 2.4 }),
        h("path", { d: "M4.5 9.4h3.6" }),
        h("path", { d: "M4.5 11.8h2.4" }),
        h("path", {
          d: "M12.9 0.8l1 1.6 1.6 1-1.6 1-1 1.6-1-1.6-1.6-1 1.6-1z",
          fill: "currentColor",
          stroke: "none",
        }),
      );
    }

    // ---- text helpers --------------------------------------------------------
    /**
     * The small info mark beside the page title; its text lives in a tooltip.
     * @param {{ size?: number }} props - square edge in pixels.
     * @returns {object} React element.
     */
    function IconInfo({ size = 14 }) {
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.3,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": true,
        },
        h("circle", { cx: 8, cy: 8, r: 6.2 }),
        h("path", { d: "M8 7.2v3.6" }),
        h("path", { d: "M8 5.1v0.9" }),
      );
    }

    /**
     * Substitute `{name}` placeholders.
     * @param {string} template - message template.
     * @param {Record<string, unknown>} [vars] - values.
     * @returns {string}
     */
    function formatMessage(template, vars) {
      if (vars === undefined || vars === null) return template;
      return String(template).replace(/\{(\w+)\}/g, (match, key) =>
        vars[key] === undefined || vars[key] === null ? match : String(vars[key]),
      );
    }

    // ---- stores --------------------------------------------------------------
    /**
     * Minimal subscribable value; one plugin toggle needs nothing more.
     * @param {unknown} initial - first value.
     * @returns {{ get: () => any, set: (next: any) => void, subscribe: (listener: () => void) => () => void }}
     */
    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        get: () => value,
        set(next) {
          if (Object.is(next, value)) return;
          value = next;
          for (const listener of Array.from(listeners)) {
            try {
              listener();
            } catch {
              /* one listener must not block the others */
            }
          }
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      };
    }

    /**
     * Read one store as render state without depending on newer React APIs.
     * @param {object | null | undefined} store - store from `createStore`.
     * @param {unknown} fallbackValue - value used when the store is missing.
     * @returns {any}
     */
    function useStore(store, fallbackValue) {
      const usable = Boolean(store && typeof store.subscribe === "function");
      const [value, setValue] = React.useState(() => (usable ? store.get() : fallbackValue));
      React.useEffect(() => {
        if (!usable) {
          setValue(fallbackValue);
          return undefined;
        }
        setValue(store.get());
        return store.subscribe(() => setValue(store.get()));
      }, [store, usable]);
      return usable ? value : fallbackValue;
    }

    // ---- Settings nav icon ---------------------------------------------------
    // A Settings section has no icon option, so its nav row is claimed after it
    // mounts: a marker attribute swaps the shell's gear for this mark through a
    // CSS mask painted in `currentColor`. Strictly best-effort — any failure
    // removes the marker and the stylesheet and leaves the gear in place, so a
    // future shell layout change can never crash this plugin or blank the row.
    const NAV_ICON_SELECTOR = '[role="dialog"] nav button';
    const NAV_ICON_MARKER = "data-dsh-skills-ext-nav-icon";
    const NAV_ICON_SIZE = 16;

    /** The nav mask: the same skill-card mark, drawn for a 14px box. */
    function navIconMaskSvg() {
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="none" stroke="#000" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="1.5" y="5.4" width="7.9" height="7.2" rx="2.1"/>' +
        '<path d="M3.9 8.2h3.1"/>' +
        '<path d="M3.9 10.3h2.1"/>' +
        '<path d="M11.3 0.7l0.85 1.45L13.6 3l-1.45 0.85L11.3 5.3l-0.85-1.45L9 3l1.45-0.85z" fill="#000" stroke="none"/>' +
        '</svg>'
      );
    }

    /**
     * Turn an SVG source into a mask URL.
     * @param {string} [svg] - SVG source; defaults to the plugin glyph.
     * @returns {string}
     */
    function navIconMaskUrl(svg) {
      return "data:image/svg+xml," + encodeURIComponent(svg === undefined ? navIconMaskSvg() : svg);
    }

    /**
     * Build the stylesheet that paints the mask on a marked row.
     * @param {string} maskUrl - mask image URL.
     * @returns {string}
     */
    function navIconCss(maskUrl) {
      return [
        "[" + NAV_ICON_MARKER + "] > svg { display: none; }",
        "[" + NAV_ICON_MARKER + "]::before {",
        "  content: '';",
        "  flex: none;",
        "  width: " + NAV_ICON_SIZE + "px;",
        "  height: " + NAV_ICON_SIZE + "px;",
        "  background-color: currentColor;",
        '  -webkit-mask-image: url("' + maskUrl + '");',
        '  mask-image: url("' + maskUrl + '");',
        "  -webkit-mask-repeat: no-repeat;",
        "  mask-repeat: no-repeat;",
        "  -webkit-mask-position: center;",
        "  mask-position: center;",
        "  -webkit-mask-size: " + NAV_ICON_SIZE + "px " + NAV_ICON_SIZE + "px;",
        "  mask-size: " + NAV_ICON_SIZE + "px " + NAV_ICON_SIZE + "px;",
        "}",
      ].join("\n");
    }

    /**
     * Report a best-effort failure without ever throwing.
     * @param {string} message - diagnostic.
     * @param {unknown} [error] - cause.
     */
    function navIconWarn(message, error) {
      try {
        if (typeof console !== "undefined" && console && typeof console.warn === "function") {
          console.warn(message, error);
        }
      } catch {
        /* logging must never break the fallback */
      }
    }

    /**
     * Whether this engine can paint the glyph as a CSS mask; when it cannot, the
     * `::before` box would show as a solid square, so the gear is kept instead.
     * @returns {boolean}
     */
    function supportsMaskImage() {
      try {
        const css = typeof globalThis === "undefined" ? undefined : globalThis.CSS;
        if (!css || typeof css.supports !== "function") return true;
        return css.supports("mask-image", 'url("x")') || css.supports("-webkit-mask-image", 'url("x")');
      } catch {
        return false;
      }
    }

    /**
     * Whether a nav row shows this plugin's section label.
     * @param {string} rowText - the row's visible text.
     * @param {string} wantedLabel - the current localized section label.
     * @returns {boolean}
     */
    function isOwnNavRow(rowText, wantedLabel) {
      const wanted = String(wantedLabel === null || wantedLabel === undefined ? "" : wantedLabel).trim();
      if (wanted.length === 0) return false;
      return String(rowText === null || rowText === undefined ? "" : rowText).trim() === wanted;
    }

    /**
     * Claim the Settings nav row and paint this plugin's glyph on it, or keep
     * the shell's gear when anything goes wrong. Never throws.
     * @param {object} ctx - Client context, used only for `ctx.effect`.
     * @param {() => string} resolveLabel - current localized section label.
     */
    function installSettingsNavIcon(ctx, resolveLabel) {
      try {
        if (typeof document === "undefined" || document === null) return;
        if (typeof document.querySelectorAll !== "function") return;
        if (!supportsMaskImage()) return;
        ctx.effect(() => {
          let styleTag = null;
          let observer = null;
          let disposed = false;
          let scheduled = false;
          const markedRows = new Set();
          const fallback = (reason) => {
            if (disposed) return;
            disposed = true;
            try {
              if (observer) observer.disconnect();
            } catch {
              /* observer already gone */
            }
            observer = null;
            for (const row of Array.from(markedRows)) {
              try {
                row.removeAttribute(NAV_ICON_MARKER);
              } catch {
                /* row may be gone */
              }
            }
            markedRows.clear();
            try {
              if (styleTag && typeof styleTag.remove === "function") styleTag.remove();
            } catch {
              /* style already detached */
            }
            styleTag = null;
            if (reason !== undefined) {
              navIconWarn("[skills-ext] settings nav icon disabled; keeping the default icon", reason);
            }
          };
          const sync = () => {
            if (disposed) return;
            try {
              const wanted = resolveLabel();
              const rows = document.querySelectorAll(NAV_ICON_SELECTOR);
              const seen = new Set();
              for (const row of Array.from(rows)) {
                seen.add(row);
                if (isOwnNavRow(row && row.textContent, wanted)) {
                  try {
                    row.setAttribute(NAV_ICON_MARKER, "");
                    markedRows.add(row);
                  } catch {
                    /* row may be gone */
                  }
                } else if (markedRows.has(row)) {
                  try {
                    row.removeAttribute(NAV_ICON_MARKER);
                  } catch {
                    /* row may be gone */
                  }
                  markedRows.delete(row);
                }
              }
              for (const row of Array.from(markedRows)) {
                if (seen.has(row)) continue;
                try {
                  row.removeAttribute(NAV_ICON_MARKER);
                } catch {
                  /* row may be gone */
                }
                markedRows.delete(row);
              }
            } catch (error) {
              fallback(error);
            }
          };
          const schedule = () => {
            if (scheduled || disposed) return;
            scheduled = true;
            const run = () => {
              scheduled = false;
              sync();
            };
            try {
              if (typeof queueMicrotask === "function") queueMicrotask(run);
              else run();
            } catch {
              run();
            }
          };
          try {
            if (!document.head || !document.body) return fallback;
            styleTag = document.createElement("style");
            styleTag.setAttribute("data-plugin", "dsh-skills-ext");
            styleTag.setAttribute("data-plugin-css", "dsh-skills-ext/settings-nav-icon");
            styleTag.textContent = navIconCss(navIconMaskUrl());
            document.head.appendChild(styleTag);
            if (typeof MutationObserver === "function") {
              observer = new MutationObserver(schedule);
              observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            }
            sync();
          } catch (error) {
            fallback(error);
          }
          return fallback;
        }, "skills-ext: settings nav icon");
      } catch (error) {
        navIconWarn("[skills-ext] settings nav icon setup failed; keeping the default icon", error);
      }
    }

    // ---- page component ------------------------------------------------------
    /**
     * The Settings section page: preset paths plus discovered skills.
     * @param {object} props - owner props, slot `inject`, and host hooks.
     * @returns {object} React element tree.
     */
    function SkillsTab(props) {
      const page = (props && props.ske) || {};
      const t = page.t;
      const remote = page.remote;
      const uiWorkspace = page.uiWorkspace;
      const setSidebarEnabled = page.setSidebarEnabled;
      const showNotice = page.showNotice;
      const surface = props && props.skeSurface === "panel" ? "panel" : "settings";
      const sidebarEnabled = useStore(page.sidebarEnabledStore, false);
      const sidebarSupported = useStore(page.sidebarSupportedStore, true);

      // One page snapshot shared by every instance: the Settings section and the
      // sidebar panel are two mounts of this component, so a path added (or a
      // skill linked) in one must show up in the other immediately.
      const stateStore =
        page.pageStateStore && typeof page.pageStateStore.set === "function" ? page.pageStateStore : null;
      const sharedState = useStore(stateStore, null);
      const [ownState, setOwnState] = React.useState(null);
      const state = stateStore === null ? ownState : sharedState;
      const setState = React.useCallback(
        (next) => {
          if (stateStore === null) setOwnState(next);
          else stateStore.set(next);
        },
        [stateStore],
      );
      const [pending, setPending] = React.useState(null);
      // Feedback is a frame-level toast (`shell.overlay`), so the page never
      // shifts when a message appears or expires.
      const setNotice = React.useCallback(
        (next) => {
          if (next === null || next === undefined) return;
          if (typeof showNotice === "function") showNotice(next);
        },
        [showNotice],
      );
      const alive = React.useRef(true);

      React.useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);

      /** Turn any failure — envelope error, Error, string — into one message. */
      const describeFailure = React.useCallback(
        (failure) => {
          if (failure === null || failure === undefined) return t("errors.unknown");
          if (typeof failure === "string") return failure;
          const code = typeof failure.code === "string" ? failure.code : null;
          const detail = typeof failure.message === "string" ? failure.message : "";
          if (code !== null) {
            const key = `errors.${code}`;
            const localized = t(key);
            if (localized !== key) return detail === "" ? localized : `${localized}（${detail}）`;
            return detail === "" ? code : detail;
          }
          return detail === "" ? String(failure) : detail;
        },
        [t],
      );

      /**
       * Read one Remote answer. The wire carries exactly one envelope — `{ ok:
       * true, value }` for a success, `{ ok: false, error }` for a failure — and
       * each Host method returns the page snapshot itself, so `value` is that
       * snapshot. Nothing else is unwrapped.
       * @param {unknown} answer - Remote answer.
       * @returns {object} the page snapshot.
       */
      const readAnswer = (answer) => {
        if (!answer || typeof answer !== "object") throw { code: "state-failed" };
        if (answer.ok === false) throw answer.error === undefined ? { code: "unknown" } : answer.error;
        const snapshot = answer.value;
        if (!snapshot || typeof snapshot !== "object") throw { code: "state-failed" };
        return snapshot;
      };

      /** Apply one Host answer: render its snapshot, or report its failure. */
      const applyState = React.useCallback(
        (answer, okText) => {
          if (!alive.current) return;
          try {
            setState(readAnswer(answer));
            setNotice(okText ? { kind: "ok", text: okText } : null);
          } catch (failure) {
            setNotice({ kind: "error", text: describeFailure(failure) });
          }
        },
        [describeFailure, setState],
      );

      /**
       * Run one Host call and render the snapshot it returns. Every method — the
       * mutations included — answers with the refreshed snapshot, so the page
       * never keeps a view the Host no longer has.
       */
      const run = React.useCallback(
        async (key, call, okText) => {
          if (remote === null || remote === undefined) {
            setNotice({ kind: "error", text: t("errors.state-failed") });
            return;
          }
          setPending(key);
          try {
            const snapshot = readAnswer(await call());
            if (!alive.current) return;
            setState(snapshot);
            setNotice(okText ? { kind: "ok", text: okText } : null);
          } catch (error) {
            if (!alive.current) return;
            setNotice({ kind: "error", text: describeFailure(error) });
          } finally {
            if (alive.current) setPending(null);
          }
        },
        [describeFailure, remote, setState, t],
      );

      const refresh = React.useCallback(
        (announce) => {
          void run("refresh", () => remote.state(), announce === true ? t("notice.refreshed") : undefined);
        },
        [run, remote, t],
      );

      // Load once per mount, through refs: the snapshot depends only on the Host
      // filesystem, and re-running this on every render (a fresh `inject` face
      // changes identity) would fetch in a loop and blank the surface.
      const latest = React.useRef({ t, remote, applyState, describeFailure });
      latest.current = { t, remote, applyState, describeFailure };
      React.useEffect(() => {
        const current = latest.current;
        if (current.remote === null || current.remote === undefined) {
          setNotice({ kind: "error", text: current.t("errors.state-failed") });
          return undefined;
        }
        let cancelled = false;
        setPending("refresh");
        Promise.resolve(current.remote.state())
          .then((result) => {
            if (!cancelled && alive.current) current.applyState(result, undefined);
          })
          .catch((error) => {
            if (cancelled || !alive.current) return;
            setNotice({ kind: "error", text: current.describeFailure(error) });
          })
          .finally(() => {
            if (!cancelled && alive.current) setPending(null);
          });
        return () => {
          cancelled = true;
        };
      }, []);

      /**
       * The 添加 button: open the system folder picker and add the chosen
       * directory straight away — nothing to type, nothing to confirm.
       */
      const onAdd = () => {
        const picker = uiWorkspace;
        if (picker === null || picker === undefined || typeof picker.pickDirectory !== "function") {
          setNotice({ kind: "error", text: t("notice.browseUnavailable") });
          return;
        }
        setPending("browse");
        Promise.resolve(picker.pickDirectory())
          .then((picked) => {
            if (!alive.current) return;
            const path = typeof picked === "string" ? picked.trim() : "";
            if (path === "") return;
            void run("add", () => remote.addPreset({ path }), t("notice.added"));
          })
          .catch(() => {
            if (alive.current) setNotice({ kind: "error", text: t("notice.browseUnavailable") });
          })
          .finally(() => {
            if (alive.current) setPending(null);
          });
      };

      const onRemovePreset = (path) => {
        void run("remove", () => remote.removePreset({ path }), t("notice.removed"));
      };

      const onLink = (skill) => {
        void run(
          `link:${skill.name}`,
          () => remote.link({ name: skill.name, dir: skill.dir }),
          t("notice.linked", { name: skill.name }),
        );
      };

      const onUnlink = (skill) => {
        void run(
          `unlink:${skill.name}`,
          () => remote.unlink({ name: skill.name }),
          t("notice.unlinked", { name: skill.name }),
        );
      };

      const busy = pending !== null;
      const presets = (state && state.presets) || [];
      const skills = (state && state.skills) || [];
      const skillsRoot = state && state.skillsRoot ? state.skillsRoot : "";

      const skillRow = (skill) => {
        const linkState = skill.link;
        const linkKey = `link:${skill.name}`;
        const unlinkKey = `unlink:${skill.name}`;
        let action;
        if (linkState === "linked") {
          action = h(
            "button",
            {
              type: "button",
              className: "ske-btn ske-btn-danger",
              disabled: busy,
              onClick: () => onUnlink(skill),
            },
            pending === unlinkKey ? t("skills.busy") : t("skills.unlink"),
          );
        } else if (linkState === "missing") {
          action = h(
            "button",
            {
              type: "button",
              className: "ske-btn ske-btn-primary",
              disabled: busy || skill.warning !== undefined,
              onClick: () => onLink(skill),
            },
            pending === linkKey ? t("skills.busy") : t("skills.link"),
          );
        } else {
          const label = linkState === "conflict" ? t("skills.conflict") : t("skills.occupied");
          action = h(
            "button",
            {
              type: "button",
              className: "ske-btn",
              disabled: true,
              title: skill.actual || skill.target || "",
            },
            label,
          );
        }

        return h(
          "div",
          { className: "ske-row", key: `${skill.presetPath}|${skill.name}` },
          h(
            "div",
            { className: "ske-row-main" },
            h(
              "div",
              { className: "ske-row-title" },
              h("span", null, skill.name),
              linkState === "linked"
                ? h("span", { className: "ske-tag ske-tag-ok" }, t("skills.linked"))
                : null,
              skill.duplicate ? h("span", { className: "ske-tag ske-tag-warn" }, t("skills.duplicate")) : null,
              skill.warning !== undefined
                ? h("span", { className: "ske-tag ske-tag-warn" }, skill.warning)
                : null,
            ),
            h("div", { className: "ske-row-desc" }, skill.description || t("skills.noDescription")),
            h("div", { className: "ske-row-sub" }, skill.target || skill.dir),
          ),
          h("div", { className: "ske-row-actions" }, action),
        );
      };

      const groups = presets.map((preset) => ({
        preset,
        skills: skills.filter((skill) => skill.presetPath === preset.path),
      }));

      // The switch is part of this one page, so it appears wherever the page
      // does: the Settings section and the sidebar panel render identically.
      const toggle = (next) => {
        if (!sidebarSupported) return;
        const value = typeof next === "boolean" ? next : !sidebarEnabled;
        if (typeof setSidebarEnabled === "function") setSidebarEnabled(value);
      };
      // The host's own switch whenever the shell publishes it; the fallback only
      // mimics its geometry so an older host still gets a usable control.
      const switchControl = HostSwitch
        ? h(HostSwitch, {
            checked: sidebarEnabled,
            onChange: toggle,
            // Both callback spellings: the host control's contract has used
            // either across releases, and an ignored extra prop is harmless.
            onCheckedChange: toggle,
            label: t("settings.pin"),
            disabled: !sidebarSupported,
            title: sidebarSupported ? t("settings.pinDesc") : t("settings.pinUnsupported"),
          })
        : h(
            "span",
            { className: "ske-toggle-control" },
            h(
              "button",
              {
                type: "button",
                role: "switch",
                "aria-checked": sidebarEnabled ? "true" : "false",
                "aria-label": t("settings.pin"),
                className: "ske-switch" + (sidebarEnabled ? " ske-switch-on" : ""),
                disabled: !sidebarSupported,
                title: sidebarSupported ? t("settings.pinDesc") : t("settings.pinUnsupported"),
                onClick: () => toggle(!sidebarEnabled),
              },
              h("span", { className: "ske-switch-knob" }),
            ),
            h(
              "span",
              { className: "ske-toggle-state" },
              sidebarEnabled ? t("settings.on") : t("settings.off"),
            ),
          );

      const pinRow = h(
        "div",
        { className: "ske-pin" },
        h(
          "div",
          { className: "ske-pin-text" },
          h("div", { className: "ske-pin-label" }, t("settings.pin")),
          h(
            "div",
            { className: "ske-pin-desc" },
            sidebarSupported ? t("settings.pinDesc") : t("settings.pinUnsupported"),
          ),
        ),
        switchControl,
      );

      return h(
        "div",
        { className: surface === "panel" ? "ske-page ske-panel" : "ske-page" },
        h(
          "div",
          { className: "ske-surface-head" },
          h(
            "div",
            { className: "ske-surface-heading" },
            h("span", { className: "ske-surface-title" }, t("page.title")),
            h(
              "span",
              {
                className: "ske-tip",
                tabIndex: 0,
                role: "note",
                "aria-label": t("page.intro"),
                title: t("page.intro"),
              },
              h(IconInfo, { size: 14 }),
              h("span", { className: "ske-tip-body", role: "tooltip" }, t("page.intro")),
            ),
          ),
          h("span", { className: "ske-surface-count" }, t("skills.count", { count: skills.length })),
        ),
        pinRow,
        h(
          "section",
          { className: "ske-section" },
          h(
            "div",
            { className: "ske-section-head" },
            h("span", { className: "ske-section-title" }, t("presets.title")),
            h(
              "span",
              { className: "ske-section-hint", title: skillsRoot },
              skillsRoot === "" ? "" : t("presets.hint", { root: skillsRoot }),
            ),
            HostButton
              ? h(
                  HostButton,
                  {
                    variant: "primary",
                    disabled: busy,
                    onClick: onAdd,
                  },
                  pending === "add" || pending === "browse" ? t("skills.busy") : t("presets.add"),
                )
              : h(
                  "button",
                  { type: "button", className: "ske-btn ske-btn-primary", disabled: busy, onClick: onAdd },
                  pending === "add" || pending === "browse" ? t("skills.busy") : t("presets.add"),
                ),
          ),
          presets.length === 0
            ? h("div", { className: "ske-empty" }, t("presets.empty"))
            : h(
                "div",
                { className: "ske-list" },
                presets.map((preset) =>
                  h(
                    "div",
                    { className: "ske-row", key: `preset:${preset.path}` },
                    h(
                      "div",
                      { className: "ske-row-main" },
                      h("div", { className: "ske-row-title" }, preset.path),
                      h(
                        "div",
                        { className: "ske-row-sub" },
                        preset.exists
                          ? t("presets.exists", { count: preset.skillCount || 0 })
                          : preset.warning || t("presets.missing"),
                      ),
                    ),
                    h(
                      "div",
                      { className: "ske-row-actions" },
                      h(
                        "button",
                        {
                          type: "button",
                          className: "ske-btn ske-btn-danger",
                          disabled: busy,
                          onClick: () => onRemovePreset(preset.path),
                        },
                        t("presets.remove"),
                      ),
                    ),
                  ),
                ),
              ),
        ),
        h(
          "section",
          { className: "ske-section" },
          h(
            "div",
            { className: "ske-section-head" },
            h("span", { className: "ske-section-title" }, t("skills.title")),
            h("span", { className: "ske-section-hint" }, t("skills.count", { count: skills.length })),
            h(
              "button",
              {
                type: "button",
                className: "ske-btn",
                disabled: busy,
                onClick: () => refresh(true),
              },
              pending === "refresh" ? t("skills.busy") : t("skills.refresh"),
            ),
          ),
          skills.length === 0
            ? h("div", { className: "ske-empty" }, t("skills.empty"))
            : h(
                "div",
                null,
                groups.map((group) =>
                  h(
                    "div",
                    { key: `group:${group.preset.path}` },
                    h(
                      "div",
                      { className: "ske-group-head" },
                      h("span", { className: "ske-group-path", title: group.preset.path }, group.preset.path),
                      h(
                        "span",
                        { className: "ske-group-state" },
                        group.preset.exists
                          ? t("presets.exists", { count: group.skills.length })
                          : t("presets.missing"),
                      ),
                    ),
                    h(
                      "div",
                      { className: "ske-list" },
                      group.skills.length === 0
                        ? h("div", { className: "ske-empty" }, t("skills.empty"))
                        : group.skills.map((skill) => skillRow(skill)),
                    ),
                  ),
                ),
              ),
        ),
      );
    }

    // ---- panel component -----------------------------------------------------
    /**
     * The sidebar panel surface: the same content rendered in the central
     * column, with its own padding and scroll instead of the settings column's.
     * @param {object} props - slot `inject` faces and host hooks.
     * @returns {object} React element tree.
     */
    function SkillsPanel(props) {
      return h(SkillsTab, { ...props, skeSurface: "panel" });
    }

    // ---- toast component -----------------------------------------------------
    /**
     * Frame-level feedback: mounted in `shell.overlay`, so a message never takes
     * layout space and the page never moves when it appears and expires.
     * @param {object} props - slot `inject` carrying the notice store.
     * @returns {object | null} React element, or nothing while idle.
     */
    function SkillsToast(props) {
      const notice = useStore(props.noticeStore, null);
      if (!notice || typeof notice.text !== "string" || notice.text === "") return null;
      return h(
        "div",
        {
          className: notice.kind === "error" ? "ske-toast ske-toast-error" : "ske-toast ske-toast-ok",
          role: "status",
          "aria-live": "polite",
        },
        notice.text,
      );
    }

    // ---- plugin apply --------------------------------------------------------
    /**
     * Mount the Remote namespace and contribute both entry points.
     * @param {object} ctx - Client Cordis context.
     */
    async function apply(ctx) {
      await ctx.remote.$mount(CLIENT_REMOTE);
      const remote = ctx.get("remote.skillsExt");
      if (!remote) throw new Error("skillsExt Remote namespace is unavailable");

      const styleTag = document.createElement("style");
      styleTag.setAttribute("data-plugin", "dsh-skills-ext");
      styleTag.textContent = CSS;
      document.head.appendChild(styleTag);
      ctx.effect(() => () => styleTag.remove(), "skills-ext: styles");

      let locale = null;
      const getLocaleService = () => {
        try {
          if (locale) return locale;
          const current = ctx.get("locale");
          if (current) locale = current;
          return current || null;
        } catch {
          return null;
        }
      };
      let dictionariesRegistered = false;
      const ensureDictionaries = () => {
        if (dictionariesRegistered) return;
        const service = getLocaleService();
        if (!service || typeof service.register !== "function") return;
        try {
          ctx.effect(() => service.register(NS, { zh: ZH, en: EN }), "skills-ext: dictionaries");
          dictionariesRegistered = true;
        } catch {
          /* the built-in dictionary below stays in use */
        }
      };
      let boundTranslate = null;
      const getBoundTranslate = () => {
        if (boundTranslate) return boundTranslate;
        const service = getLocaleService();
        if (!service || typeof service.bind !== "function") return null;
        try {
          const candidate = service.bind(NS);
          if (typeof candidate === "function") boundTranslate = candidate;
        } catch {
          boundTranslate = null;
        }
        return boundTranslate;
      };
      const t = (key, vars) => {
        let value;
        const bound = getBoundTranslate();
        if (bound) {
          try {
            value = bound(key, vars);
          } catch {
            value = undefined;
          }
        }
        if (value === undefined || value === key) value = ZH[key] === undefined ? key : ZH[key];
        return formatMessage(value, vars);
      };
      ensureDictionaries();

      const getUiWorkspace = () => {
        try {
          return ctx.get("uiWorkspace") || null;
        } catch {
          return null;
        }
      };

      // ---- sidebar panel preference -------------------------------------------
      // Remembered per browser: the panel entry is opt-in, the Settings page that
      // hosts its switch is always present.
      const SIDEBAR_STORAGE_KEY = "dsh-skills-ext.sidebar";
      const readSidebarPreference = () => {
        try {
          const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
          return stored === null ? true : stored === "true";
        } catch {
          return true;
        }
      };
      let sidebarDesired = readSidebarPreference();
      const sidebarEnabledStore = createStore(sidebarDesired);
      const sidebarSupportedStore = createStore(false);
      // The page snapshot both surfaces read and write, so one mount never shows
      // what another mount left behind.
      const pageStateStore = createStore(null);
      // Frame-level feedback state; the toast entry below renders it.
      const noticeStore = createStore(null);
      let noticeTimer;
      /**
       * Show one transient message for a few seconds.
       * @param {{ kind?: 'ok' | 'error', text?: string } | null} notice - message.
       */
      const showNotice = (notice) => {
        if (!notice || typeof notice.text !== "string" || notice.text === "") return;
        noticeStore.set({ kind: notice.kind === "error" ? "error" : "ok", text: notice.text });
        if (noticeTimer !== undefined) clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => {
          noticeStore.set(null);
          noticeTimer = undefined;
        }, 3200);
      };
      ctx.effect(() => () => {
        if (noticeTimer !== undefined) clearTimeout(noticeTimer);
        noticeTimer = undefined;
      }, "skills-ext: toast timer");
      let sidebarSlotReady = false;
      let panelDisposers = null;
      let setSidebarEnabled = () => {};

      const injected = () => ({
        ske: {
          t,
          remote,
          uiWorkspace: getUiWorkspace(),
          sidebarEnabledStore,
          sidebarSupportedStore,
          pageStateStore,
          showNotice,
          setSidebarEnabled,
        },
      });

      /** Register the `main` panel and its `sidebar.panellist` icon. */
      const registerPanel = () => {
        if (panelDisposers) return;
        let offPanel;
        let offIcon;
        try {
          offPanel = ctx.slots.register(
            { name: "main", key: PANEL_ID, locale: NS, inject: injected },
            SkillsPanel,
          );
          offIcon = ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: PANEL_ID,
              order: 3,
              label: () => t("settings.nav"),
              locale: NS,
            },
            (owner) => h(IconSkills, { size: (owner && owner.size) || 16 }),
          );
        } catch (error) {
          if (typeof offIcon === "function") offIcon();
          if (typeof offPanel === "function") offPanel();
          navIconWarn("[skills-ext] sidebar panel registration failed", error);
          return;
        }
        panelDisposers = () => {
          if (typeof offIcon === "function") offIcon();
          if (typeof offPanel === "function") offPanel();
        };
      };

      /** Return to the conversation when this panel is the open one, then drop it. */
      const disposePanel = () => {
        try {
          const layout = ctx.get("layout");
          const snapshot =
            layout && layout.panelInfo && typeof layout.panelInfo.getSnapshot === "function"
              ? layout.panelInfo.getSnapshot()
              : null;
          if (snapshot && snapshot.activePanelId === PANEL_ID && typeof layout.selectPanel === "function") {
            layout.selectPanel(null);
          }
        } catch {
          /* the panel may already be gone */
        }
        const stop = panelDisposers;
        panelDisposers = null;
        if (typeof stop === "function") stop();
      };

      const syncSidebar = () => {
        sidebarSupportedStore.set(sidebarSlotReady);
        sidebarEnabledStore.set(sidebarDesired);
        if (!sidebarSlotReady) return;
        try {
          if (sidebarDesired) registerPanel();
          else disposePanel();
        } catch (error) {
          navIconWarn("[skills-ext] sidebar panel sync failed", error);
        }
      };

      setSidebarEnabled = (next) => {
        sidebarDesired = Boolean(next);
        try {
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarDesired ? "true" : "false");
        } catch {
          /* the preference then lasts for this page only */
        }
        syncSidebar();
      };

      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: "skills-ext",
            order: 55,
            label: () => t("settings.nav"),
            locale: NS,
            inject: injected,
          },
          SkillsTab,
        ),
      );

      // Frame-level feedback: `shell.overlay` is the layer the shipped toasts use
      // (`schedule.delete-toast`, `plugin-manager.refresh-toast`, …), so a message
      // floats above the page instead of pushing layout around.
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          {
            name: "shell.overlay",
            id: "skills-ext.toast",
            order: 500,
            label: () => t("settings.nav"),
            locale: NS,
            inject: () => ({ noticeStore }),
          },
          SkillsToast,
        ),
      );

      // Best-effort only: replaces the Settings nav row's default gear with this
      // plugin's mark, and keeps the gear whenever anything is unavailable.
      installSettingsNavIcon(ctx, () => t("settings.nav"));

      // The sidebar icon exists only while the preference is on, and only when
      // this shell actually declares the panel list slot.
      ctx.slots.inject("sidebar.panellist", () => {
        sidebarSlotReady = true;
        if (panelDisposers) {
          const stop = panelDisposers;
          panelDisposers = null;
          stop();
        }
        syncSidebar();
        return () => {
          sidebarSlotReady = false;
          disposePanel();
          syncSidebar();
        };
      });
    }

    exports.apply = apply;
    exports.inject = ["slots", "remote"];
    exports.CLIENT_REMOTE = CLIENT_REMOTE;
    return module.exports;
  },
});
