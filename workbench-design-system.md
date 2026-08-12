# 工作台设计系统：跨项目复刻规范

> **适用对象**：需要在另一个 React / Tailwind 项目中复刻本工作台的视觉语言与应用框架的开发者。
>
> **使用方式**：本文是完整、独立的复刻规范。实现新项目时只以本文的尺寸、token、结构与检查清单为准，无需查阅任何其他文档或代码。

## 1. 设计定位与不可变原则

**名称**：紧凑型开发者工作台（Compact Developer Workbench）。

它服务于 Agent、项目、工作流、知识库等高频管理任务，视觉气质接近 IDE / 运维控制台：克制、可扫描、可长时间使用。

1. **信息密度优先**：常规 UI 是 12–13px，不放大标题，不用大留白营销布局。
2. **线框分区优先**：用 1px 分隔线、文字权重和间距组织层级；普通内容不使用悬浮卡片、渐变或阴影。
3. **语义色克制**：主色只表示主操作、焦点和当前项；成功、警告、错误、信息仅表示状态。
4. **桌面优先**：应用最小宽度是 1180px，不做移动端抽屉式重排；宽内容在所属面板内滚动。
5. **浮层有门槛**：只有 Dialog、Sheet、菜单、独立编辑器和危险确认可以使用圆角与阴影。

## 2. 技术组成与复刻前提

| 层级 | 当前实现 | 复刻要求 |
| --- | --- | --- |
| 框架 | React 19 + Vite | 组件式页面框架即可 |
| 样式 | Tailwind CSS 4 + CSS 自定义属性 | 所有颜色必须通过语义 token 使用 |
| 可访问性交互基元 | Radix UI | Dialog、Select、Tabs、Menu、Tooltip 应保留键盘与焦点行为 |
| 本地组件层 | 项目拥有源码的组件封装 | Button、Input、Card、Dialog、Select、Tabs、Tooltip 等由项目直接维护，不依赖成品 UI 主题 |
| 组件模式 | shadcn/ui 风格 + CVA + `cn()` | 可复制模式，不代表安装了 shadcn/ui npm 包 |
| 图标 | Lucide React | 统一线性图标，不混用填充型图标集 |
| 字体 | Geist Variable、Ubuntu Mono | 按第 4 节分工使用 |

本项目不是任何整站开源 UI 的 fork 或复刻：仓库没有 Git remote、上游 LICENSE / NOTICE 或页面级署名。可以确认的开源基础设施为 Tailwind CSS、Radix UI、Lucide、Geist、Ubuntu Mono，以及 shadcn/ui 的本地可组合组件写法。

## 3. 应用壳与布局尺寸

### 3.1 固定应用框架

```text
┌──────────── sidebar 52 / 192px ────────────┬────────── content ──────────┐
│ brand row, 48px                             │ global header, 48px          │
├─────────────────────────────────────────────┼──────────────────────────────┤
│ primary nav: 6 × 32px                       │ page header, ≥48px            │
│                                             ├──────────────────────────────┤
│ bottom actions                              │ scrollable tool-page          │
│ help · settings · expand                    │ sections / split panes        │
└─────────────────────────────────────────────┴──────────────────────────────┘
```

| 区域 | 尺寸与规则 |
| --- | --- |
| 视口 | `min-width: 1180px`，应用高度 `100vh`，根容器 `overflow: hidden` |
| 主侧栏（收起） | `52px` 宽，右侧 1px 边线 |
| 主侧栏（展开） | `192px`（Tailwind `w-48`），200ms 宽度过渡；状态存于 `localStorage: gpie-navigation-expanded` |
| 品牌行 | 48px 高；标识方块 28px、圆角 6px；展开时显示名称与 10px 副标题 |
| 全局顶栏 | 48px 高，`padding: 8px 16px`，底部 1px 边线 |
| 内容区 | 侧栏和顶栏外的剩余高度；页面本身使用纵向 flex，并由页面内部滚动 |
| 页面头 | 最小 48px，`padding: 8px 16px`，标题区与操作区间隔 12px，底部 1px 边线 |
| 内容分区 | `padding: 12px 16px`，底部 1px 边线 |
| 数据行 | 最小 32px，`padding: 8px 12px`，底部 1px 边线 |
| 空状态 | 最小 240px，内边距 16px，居中，图标/文字间隔 10px |

### 3.2 页面骨架

所有普通页面从下面的骨架开始；不要先套一个带圆角和阴影的 Card。

```tsx
<main className="tool-page">
  <header className="tool-page-header">
    <div>
      <div className="section-kicker">分类标签</div>
      <h1 className="text-base font-semibold">页面标题</h1>
    </div>
    <div className="flex items-center gap-2">主操作</div>
  </header>

  <section className="tool-section">
    <div className="section-kicker mb-2">分区标签</div>
    <div className="tool-row">数据行</div>
  </section>
</main>
```

### 3.3 左侧主导航

- 展开/收起都使用同一批入口；收起时只显示图标，并在鼠标悬停或聚焦时以 Tooltip 显示文字。
- 主导航项：高 32px、圆角 6px、字号 12px、图标 16px、图标描边 `1.8`。
- 展开态：`gap: 8px; padding-inline: 8px`；收起态：居中。
- 当前项：`sidebar-accent` 背景、`sidebar-accent-foreground` 文字，左边增加 1px、16px 高的 `sidebar-primary` 指示线。
- 非当前项：`sidebar-foreground`；悬停使用 `accent` 背景、`foreground` 文字。
- 底部固定操作区用上边线隔开，内边距 6px；包含帮助、设置、展开/收起。
- 当前导航顺序：工作台、智能体、工作流、知识库、仪表盘、工具；底部为帮助、设置、侧栏切换。

### 3.4 内容侧栏与分屏

详情/编辑类页面使用边线分割的固定侧栏，不使用浮起信息卡：

| 位置 | 典型宽度 | 边线 |
| --- | ---: | --- |
| 工作流节点库 | 224px | 右边线 |
| 实体详情 | 300px | 左边线 |
| 节点配置 | 320px | 左边线 |
| 调试面板 | 360px | 左边线 |

侧栏使用 `sidebar` 背景，`overflow: hidden`，内部内容自己滚动；空选择态也维持同一侧栏宽度并居中显示 12px 辅助文案。

## 4. 字体、文字与间距

### 4.1 字体

```css
--font-sans: "Geist Variable", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
--font-mono: "Ubuntu Mono", "SFMono-Regular", Consolas, monospace;
```

| 场景 | 字体 | 尺寸 / 样式 |
| --- | --- | --- |
| 应用默认正文 | `font-sans` | 13px |
| 控件、列表、表单 | `font-sans` | 12px (`text-xs`) |
| 页面标题 | `font-sans` | 16px，`font-semibold` |
| 分区标签 / kicker | `font-sans` | 10px，700，字距 0.06–0.08em；多数场景大写 |
| 说明、空状态 | `font-sans` | 12px，`muted-foreground` |
| 代码、路径、命令、版本、ID、哈希、日志 | **显式** `font-mono` | 通常 12px |

不要让等宽文本继承普通正文；CodeMirror 编辑器、内容与行号统一使用 `font-mono`、12px。

### 4.2 圆角、阴影与动效

- 基础圆角：`--radius: 0.5rem`（8px）；按钮、输入、导航项多为 `rounded-md`（6px）。
- 普通 Card：`rounded-none`、无横向边线、无阴影；仅分区边线。
- 浮层 Card：`rounded-md`、`bg-card`、`shadow-sm`。
- Dialog：最大宽度为视口减 32px，小屏断点最大 512px，`rounded-md`、16px 内边距、`shadow-lg`。
- 菜单：`rounded-md`、4px 内边距、`shadow-md`；主题选择器可用 `rounded-xl` 和 `shadow-lg`。
- 常规颜色过渡：150ms；侧栏宽度过渡：200ms；Dialog / Menu 使用淡入和 95%→100% 缩放。

## 5. 当前启用主题与完整颜色值

主题通过 CSS 变量注入，切换键存于 `localStorage: gpie-theme`。默认键为 `prism-light`。产品当前仅允许使用以下两套主题；任何其他候选主题都必须先补齐本章的完整 token 与视觉验收，才可上线。

### 5.1 棱镜浅色（`prism-light`，默认）

| Token | 值 | 用途 |
| --- | --- | --- |
| `background` | `#f7f8fe` | 应用背景 |
| `foreground` | `#202235` | 主文字 |
| `card` / `popover` | `#ffffff` | 浮层与表面 |
| `primary` | `#7650e7` | 主按钮、当前态、关键强调 |
| `primary-foreground` | `#ffffff` | 主色上的文字 |
| `secondary` / `muted` | `#f1f3ff` | 次级表面 |
| `secondary-foreground` | `#343752` | 次级文字 |
| `muted-foreground` | `#747a92` | 辅助文字 |
| `accent` | `#f3f0ff` | 悬停、当前行/导航背景 |
| `accent-foreground` | `#512bb7` | 强调文字 |
| `destructive` | `#e95462` | 删除、错误 |
| `border` | `#e8eaf4` | 所有常规分隔线 |
| `input` | `#d9dcef` | 输入框边线 |
| `ring` | `#b7a6f6` | 键盘焦点环 |
| `success` / `warning` / `info` | `#28bc88` / `#f2a345` / `#468af7` | 状态语义 |
| `chart-1…5` | `#7650e7` / `#28bc88` / `#468af7` / `#f2a345` / `#df6aa9` | 图表序列 |
| `sidebar` | `#ffffff` | 主/内容侧栏 |
| `sidebar-foreground` | `#656a82` | 非当前导航 |
| `sidebar-primary` | `#7650e7` | 当前导航指示线 |
| `sidebar-accent` | `#f3f0ff` | 当前导航背景 |
| `surface-raised` | `rgba(255,255,255,.78)` | 半透明抬升表面 |
| `surface-overlay` | `rgba(255,255,255,.94)` | 覆盖表面 |
| `app-glow` / `app-glow-secondary` | `rgba(118,80,231,.15)` / `rgba(70,138,247,.10)` | 仅用于低强度背景光晕 |

### 5.2 控制台深色（`console-dark`）

| Token | 值 | 用途 |
| --- | --- | --- |
| `background` | `#12131d` | 应用背景 |
| `foreground` | `#f1f3f8` | 主文字 |
| `card` / `popover` | `#171925` / `#1d2030` | 表面 / 浮层 |
| `primary` | `#8b6bff` | 主操作、当前态 |
| `secondary` / `muted` | `#242738` / `#202332` | 次级表面 |
| `secondary-foreground` / `muted-foreground` | `#eef0f6` / `#9ca3ba` | 次级 / 辅助文字 |
| `accent` / `accent-foreground` | `#2a2943` / `#dcd4ff` | 悬停与强调 |
| `destructive` | `#ff6672` | 删除、错误 |
| `border` / `input` / `ring` | `#2c3043` / `#34394d` / `#a992ff` | 边线、输入、焦点 |
| `success` / `warning` / `info` | `#31d69b` / `#f5a64a` / `#68a2ff` | 状态语义 |
| `chart-1…5` | `#9d86ff` / `#31d69b` / `#68a2ff` / `#f5a64a` / `#ef77b4` | 图表序列 |
| `sidebar` / `sidebar-foreground` | `#141620` / `#a9afc4` | 侧栏表面 / 非当前导航 |
| `sidebar-primary` / `sidebar-accent` | `#9d86ff` / `#28283d` | 当前指示线 / 当前背景 |
| `sidebar-border` / `sidebar-ring` | `#292d3e` / `#a992ff` | 侧栏边线 / 焦点 |
| `surface-raised` / `surface-overlay` | `rgba(28,31,45,.84)` / `rgba(28,31,45,.96)` | 半透明抬升 / 覆盖表面 |
| `app-glow` / `app-glow-secondary` | `rgba(125,92,250,.14)` / `rgba(49,214,155,.06)` | 低强度背景光晕 |

当前产品不包含第三套可选主题。若未来增加主题，必须为本章所有语义 token 给出明确值，完成浅/深色可读性、组件状态与图表序列验收后，才可对用户开放。

## 6. 组件规格

| 组件 | 规格 |
| --- | --- |
| Button 默认 | 高 32px，左右 12px，12px 中等字重，图标间距 6px |
| Button `xs` / `sm` / `lg` | 24px / 28px / 36px 高 |
| 图标按钮 | 24px、28px、32px、36px 四档；默认图标 14px |
| Input / Select 默认 | 高 32px，左右 10px，12px；边线使用 `input`；深色可使用 `input/30` 表面 |
| Textarea | 最小高 64px，左右 10px，上下 6px，12px |
| Badge | 10px，中等字重，药丸形，左右 6px、上下 2px，图标 12px |
| Avatar | 默认 32px；小 24px；大 40px |
| Progress | 高 8px、药丸形；轨道为 `primary/20` |
| Tabs | TabList 高 32px；行式 Tab 当前项使用 2px 底部指示线 |
| Tooltip | 深色反转背景，12px，左右 12px、上下 6px；全局延迟 400ms |
| Dropdown / Select | 圆角 6px，最小宽 128px，4px 内边距，菜单项 12px、左右 8px、上下 6px |

**交互状态**：所有键盘可聚焦控件用 `ring` 的 3px 半透明焦点环；禁用态降低至 50% 不透明且禁止指针；错误输入使用 `destructive` 边线和焦点环。

## 7. 图标与状态图形

- 仅使用 **Lucide React** 的线性图标；常规尺寸 14px（控件）、16px（导航/列表）、12px（徽章/紧凑状态）。
- `strokeWidth={1.8}` 是导航和顶栏的基准；不要混入 Emoji、填充型 Material 图标或多色插画。
- 图标默认跟随文字色；只有主操作、状态和当前项才使用 `primary`、`success`、`warning`、`destructive`、`info`。
- 典型映射：`Terminal` 工作台、`Bot` 智能体、`GitBranch` 工作流、`BookOpen` 知识库、`LayoutDashboard` 仪表盘、`Wrench` 工具、`Settings` 设置。
- 状态优先使用图标 + 文字；7px 的 `.status-dot` 只用于极紧凑的在线/运行提示。

## 8. 复刻检查清单

- [ ] 根容器最小宽度 1180px，侧栏、顶栏和内容区均使用固定应用壳。
- [ ] 侧栏有 52px / 192px 双态、当前项左侧 1px 指示线、收起态 Tooltip。
- [ ] 页面有 48px 页头、16px 横向内边距、1px `border` 分区线。
- [ ] 正文 13px，控件 12px，分区标签 10px，代码/ID 明确使用 Ubuntu Mono。
- [ ] 仅使用两套已注册主题的 token；禁止页面硬编码新的品牌色。
- [ ] 常规 Card 是无阴影的边线分区；浮层才有圆角与阴影。
- [ ] Button / Input 默认高 32px，图标来自 Lucide 且描边统一。
- [ ] Focus、disabled、error 与键盘可访问性均通过 Radix / 本地组件保留。

## 9. 维护边界

1. 新页面先复用本文第 3 节定义的页面、分区、数据行与侧栏原语。
2. 新语义色必须同时添加到每一套产品主题，并贯穿正文、边线、交互、状态和图表；不要只改某个页面。
3. 新组件必须遵循本文第 6 节的尺寸、焦点、禁用与错误状态；不要为单页引入第二套成品组件库。
4. 若复制或大幅改写第三方页面/组件，必须在本规范中记录项目名、URL、许可证与改动范围。
5. 每次新增主题、布局变体或组件规格，都直接更新本文的对应章节与复刻检查清单。
