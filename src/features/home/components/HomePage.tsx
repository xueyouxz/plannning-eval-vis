import { useState } from 'react'
import styles from './HomePage.module.css'

type TreeNode = {
  id: string
  name: string
  path: string
  title: string
  description: string
  children?: TreeNode[]
}

const treeData: TreeNode[] = [
  {
    id: 'src',
    name: 'src',
    path: 'src/',
    title: '源码目录',
    description: '承载前端应用的主要实现，是项目中最核心的业务与基础代码所在位置。',
    children: [
      {
        id: 'src-app',
        name: 'app',
        path: 'src/app/',
        title: '应用启动层',
        description: '集中管理应用入口、路由配置和全局 Provider，是应用的装配与启动中心。'
      },
      {
        id: 'src-features',
        name: 'features',
        path: 'src/features/',
        title: '功能模块层',
        description: '按业务域拆分组件、hooks、api、store 和 types，保证功能代码自包含且可扩展。'
      },
      {
        id: 'src-shared',
        name: 'shared',
        path: 'src/shared/',
        title: '共享基础层',
        description: '存放跨功能复用的状态管理基建、类型、常量和基础工具，避免重复实现。'
      },
      {
        id: 'src-layouts',
        name: 'layouts',
        path: 'src/layouts/',
        title: '布局层',
        description: '负责页面壳层、导航和路由嵌套结构，将页面骨架与业务内容分离。'
      },
      {
        id: 'src-assets',
        name: 'assets',
        path: 'src/assets/',
        title: '资源目录',
        description: '保存需要经过 Vite 构建处理的图片、图标、字体等资源文件。'
      },
      {
        id: 'src-styles',
        name: 'styles',
        path: 'src/styles/',
        title: '全局样式层',
        description: '定义设计变量、基础 reset 和全局样式约定，不承载具体业务逻辑。'
      }
    ]
  },
  {
    id: 'public',
    name: 'public',
    path: 'public/',
    title: '公开静态资源',
    description: '放置无需构建处理、直接以原路径暴露给浏览器访问的静态文件。'
  },
  {
    id: 'claude',
    name: '.claude',
    path: '.claude/',
    title: 'Claude 配置',
    description: '定义 Claude Code 的规则、slash commands 和 hooks，约束 AI 生成代码的行为。'
  },
  {
    id: 'docs-prompts',
    name: 'docs/prompts',
    path: 'docs/prompts/',
    title: 'Prompt 模板库',
    description: '沉淀常见开发任务的提示词模板，提升 Vibe Coding 的一致性与复用率。'
  },
  {
    id: 'github-workflows',
    name: '.github/workflows',
    path: '.github/workflows/',
    title: 'CI 配置',
    description: '通过自动化流程执行安装、lint 和 build，保证模板在提交与合并前可验证。'
  }
]

const nodeMap = new Map<string, TreeNode>()

function collectNodes(nodes: TreeNode[]) {
  nodes.forEach(node => {
    nodeMap.set(node.id, node)

    if (node.children) {
      collectNodes(node.children)
    }
  })
}

collectNodes(treeData)

type TreeItemProps = {
  expandedIds: string[]
  level?: number
  nodes: TreeNode[]
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  selectedId: string
}

function TreeItems({
  expandedIds,
  level = 0,
  nodes,
  onSelect,
  onToggle,
  selectedId
}: TreeItemProps) {
  return (
    <ul className={styles.treeList}>
      {nodes.map(node => {
        const isExpanded = expandedIds.includes(node.id)
        const hasChildren = Boolean(node.children?.length)
        const isSelected = selectedId === node.id

        return (
          <li key={node.id} className={styles.treeItem}>
            <div
              className={styles.treeRow}
              style={{ ['--level' as string]: level } as React.CSSProperties}
            >
              {hasChildren ? (
                <button
                  type='button'
                  className={styles.treeToggle}
                  aria-label={isExpanded ? `收起 ${node.name}` : `展开 ${node.name}`}
                  aria-expanded={isExpanded}
                  onClick={() => onToggle(node.id)}
                >
                  <span className={isExpanded ? styles.chevronExpanded : styles.chevron} />
                </button>
              ) : (
                <span className={styles.treeDot} aria-hidden='true' />
              )}

              <button
                type='button'
                className={isSelected ? styles.treeButtonActive : styles.treeButton}
                onClick={() => onSelect(node.id)}
              >
                <span className={styles.nodeName}>{node.name}</span>
                <span className={styles.nodePath}>{node.path}</span>
              </button>
            </div>

            {hasChildren && isExpanded ? (
              <TreeItems
                expandedIds={expandedIds}
                level={level + 1}
                nodes={node.children ?? []}
                onSelect={onSelect}
                onToggle={onToggle}
                selectedId={selectedId}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export default function HomePage() {
  const [expandedIds, setExpandedIds] = useState<string[]>(['src'])
  const [selectedId, setSelectedId] = useState('src-app')

  const selectedNode = nodeMap.get(selectedId) ?? treeData[0]

  function handleToggle(id: string) {
    setExpandedIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    )
  }

  return (
    <section className={styles.page}>
      <article className={styles.hero}>
        <div className={styles.contentGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>目录结构</h2>
            </div>
            <div className={styles.treePanel}>
              <div className={styles.treeRoot}>
                <span className={styles.rootBadge}>Project</span>
                <span className={styles.rootPath}>template/</span>
              </div>
              <TreeItems
                nodes={treeData}
                expandedIds={expandedIds}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggle={handleToggle}
              />
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>功能与作用</h2>
            </div>
            <div className={styles.detailPanel}>
              <p className={styles.path}>{selectedNode.path}</p>
              <p className={styles.itemTitle}>{selectedNode.title}</p>
              <p className={styles.itemDescription}>{selectedNode.description}</p>
              <p className={styles.detailHint}>
                点击左侧目录可切换说明，带箭头的目录支持展开和收起。
              </p>
            </div>
          </section>
        </div>

        <div className={styles.copy}>
          <p className={styles.eyebrow}>React 19 + Vite 7 + TypeScript</p>
          <h1 className={styles.title}>模板结构总览</h1>
          <p className={styles.description}>
            首页聚焦目录导航与职责说明，便于快速理解模板结构；接入业务后可以直接移除。
          </p>
        </div>
      </article>
    </section>
  )
}
