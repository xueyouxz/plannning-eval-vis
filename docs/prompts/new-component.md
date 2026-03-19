## New Component Prompt

在 `{target_path}` 新建一个可复用组件 `{component_name}`。

组件职责：{responsibility}
输入输出：{props_contract}
视觉要求：{visual_direction}

要求：
- 使用 TypeScript 明确 props 类型
- 样式优先使用 CSS Modules
- 如果组件跨 feature 复用，放入 `src/shared/`
- 完成后运行 `pnpm lint`
