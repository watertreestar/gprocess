# 工作台设计语言

所有前端页面以工作台为视觉基准：紧凑、信息密度优先、边线分区优先，而不是默认使用浮起卡片。

## 基础规则

- 界面使用 Geist；代码、路径、ID、哈希值和命令使用 Ubuntu Mono。
- 常规正文使用 12–14px，分区标签使用 10px，页头标题使用 16px；操作控件高度通常为 28–32px。
- 普通内容区使用边框、分隔线、文字权重和留白建立层级；选中、编辑、警告、错误和成功才使用低饱和背景色。
- 两个主题只改变颜色 token，不改变组件层级、信息密度或布局逻辑。
- 本产品按桌面工具设计，最小宽度为 1180px；不要求移动端折叠，超宽内容使用所属分区的滚动容器。
- 路径、命令、版本、哈希、ID、模型名、日志和代码片段必须显式添加 `font-mono`。

## 页面骨架

每个路由页优先使用以下结构：

```text
工具页
├─ 紧凑页头：标题、上下文、主操作
└─ 分隔区：区域标题/工具栏 + 数据行、编辑区或空状态
```

列表页使用紧凑数据行；详情页使用分隔的主区与侧区；编辑页使用工具栏、编辑区和检查/详情侧区。仅对话框、编辑器、明显警示区和必须浮起的交互使用圆角面板。

## 原语与变体

```text
tool-page
  tool-page-header        页标题、上下文和主操作，底部边线
  tool-section            普通内容分区，默认只有上下或底部边线
    tool-section-title    10px 分区标签与紧凑工具栏
    tool-row              28–40px 数据行，悬停/选中才出现背景
  tool-empty-state        小图标、12px 说明和紧凑操作
```

- 普通分区使用 12–16px 内边距和 8–12px 间距；不加默认阴影。
- `tool-row` 用底部边线分隔。选中、警告、错误、成功和危险操作分别使用低饱和语义背景，不新增页面专属颜色。
- Button、Input、Select、Textarea、Tabs、DropdownMenu、Tooltip、Badge 与 Label 默认使用 28–32px 高度（适用时）和 12px 字号；编辑器、对话框、抽屉和危险确认使用明确的浮层变体，不能被全局“去卡片”规则压平。

最小结构示例：

```tsx
<main className="tool-page">
  <header className="tool-page-header">标题与操作</header>
  <section className="tool-section">
    <div className="tool-section-title">分区标签</div>
    <div className="tool-row">数据行</div>
    <div className="tool-empty-state">空状态</div>
  </section>
</main>
```

页头和数据行使用底部边线；普通分区使用 12–16px 内边距，数据行使用 8–12px 内边距与 8px 间距。默认不使用阴影、圆角背景或页面专属颜色。

## 命名约定

全局样式原语使用 `tool-*` 前缀：`tool-page`、`tool-page-header`、`tool-section`、`tool-section-title`、`tool-row`、`tool-empty-state`、`tool-sidebar`。页面不得复制颜色值，应使用主题 token。

`tool-sidebar` 用于详情页和编辑器的固定侧栏，使用分隔线而非浮起容器。`Card` 默认使用 `flat` 变体；只有对话框确认区、独立编辑器或危险操作需要脱离背景时，才显式使用 `variant="floating"`。
