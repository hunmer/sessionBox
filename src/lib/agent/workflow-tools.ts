/**
 * 工作流 AI 助手的工具定义和系统提示词。
 *
 * 提供工作流编辑专用的 12 个 Anthropic 工具 schema，
 * 以及带工作流上下文注入的系统提示词生成函数。
 */

import type { ToolDefinition } from './tools'

/** 工作流摘要信息，用于构建上下文感知的系统提示词 */
export interface WorkflowSummary {
  id: string
  name: string
  description?: string
  nodes: Array<{ id: string; type: string; label: string }>
  edges: Array<{ id: string; source: string; target: string }>
}

/** 工作流 AI 助手的工具定义 */
export const WORKFLOW_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_workflow',
    description:
      '按 workflow_id 从磁盘读取指定工作流的最新已保存文件数据。默认返回摘要，summarize=false 返回完整数据。注意：它不包含当前画布未保存改动。',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: '要读取的工作流 ID，必须显式传入。',
        },
        summarize: {
          type: 'boolean',
          description: '是否返回摘要。默认 true；false 返回完整 nodes/edges/data/position。',
          default: true,
        },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'get_current_workflow',
    description:
      '读取当前渲染进程画布中的工作流节点和连线，包含尚未保存到文件的最新编辑状态。默认返回摘要，summarize=false 返回完整数据。',
    input_schema: {
      type: 'object',
      properties: {
        summarize: {
          type: 'boolean',
          description: '是否返回摘要。默认 true；false 返回完整 nodes/edges/data/position。',
          default: true,
        },
      },
    },
  },
  {
    name: 'list_node_types',
    description:
      '查询工作流中可用的节点类型列表。可按分类筛选，返回每种节点类型的 type 标识、标签、分类、描述和参数定义。不传 category 则返回所有分类的全部节点类型。',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            '按分类筛选节点类型。常见分类包括：流程控制、浏览器操作、数据处理、AI 能力、条件判断等。不传则返回全部。',
        },
      },
    },
  },
  {
    name: 'create_node',
    description:
      '在工作流中创建一个新节点。需要指定节点类型（type），可通过 list_node_types 查询可用类型。可选提供节点标签（label）和参数数据（data）。创建后节点会出现在画布上，需要用 create_edge 连接到其他节点。',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            '节点类型标识，必须是 list_node_types 返回的有效类型。例如 "start"、"end"、"browser-click"、"condition" 等。',
        },
        label: {
          type: 'string',
          description: '节点显示名称，方便用户识别。如果不提供则使用节点类型的默认标签。',
        },
        data: {
          type: 'object',
          description:
            '节点的参数数据，键值对结构，对应节点类型的 properties 定义。例如 { "selector": "#btn", "url": "https://example.com" }。',
          properties: {},
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'update_node',
    description:
      '更新指定节点的参数数据。只需传入要修改的字段，未传入的字段保持不变。更新前建议先用 get_current_workflow(summarize=false) 查看节点当前完整数据。',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要更新的节点 ID。',
        },
        data: {
          type: 'object',
          description:
            '要更新的参数键值对，会与现有数据合并（浅合并）。例如 { "selector": "#new-btn", "text": "提交" }。',
          properties: {},
        },
      },
      required: ['nodeId', 'data'],
    },
  },
  {
    name: 'delete_node',
    description:
      '删除指定节点及其所有相关的连线。这是一个破坏性操作，删除后无法撤销，请确认节点 ID 正确后再执行。',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要删除的节点 ID。删除该节点时会自动移除与之相连的所有边。',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'create_edge',
    description:
      '创建一条连线，将两个节点连接起来。source 是起始节点（上游），target 是目标节点（下游）。可选指定 sourceHandle/targetHandle 以连接到特定的连接点。',
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: '起始节点（上游节点）的 ID。',
        },
        target: {
          type: 'string',
          description: '目标节点（下游节点）的 ID。',
        },
        sourceHandle: {
          type: 'string',
          description: '起始节点的连接点标识，用于条件分支等有多个输出的节点。例如 "true"、"false"、"default"。',
        },
        targetHandle: {
          type: 'string',
          description: '目标节点的连接点标识，用于有多个输入的节点。',
        },
      },
      required: ['source', 'target'],
    },
  },
  {
    name: 'delete_edge',
    description:
      '删除指定连线。删除后两个节点之间的连接断开，但不影响节点本身。',
    input_schema: {
      type: 'object',
      properties: {
        edgeId: {
          type: 'string',
          description: '要删除的连线 ID。',
        },
      },
      required: ['edgeId'],
    },
  },
  {
    name: 'batch_update',
    description:
      '批量执行多个工作流编辑操作，在一个事务中完成。支持同时创建节点、删除节点、创建连线和删除连线。所有操作要么全部成功，要么全部回滚。适合需要原子性执行的复杂编辑场景。',
    input_schema: {
      type: 'object',
      properties: {
        createNodes: {
          type: 'array',
          description: '要创建的节点列表。',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: '节点类型' },
              label: { type: 'string', description: '节点标签' },
              data: { type: 'object', description: '节点参数', properties: {} },
            },
            required: ['type'],
          },
        },
        deleteNodeIds: {
          type: 'array',
          description: '要删除的节点 ID 列表。删除节点时会自动移除相关连线。',
          items: { type: 'string' },
        },
        createEdges: {
          type: 'array',
          description: '要创建的连线列表。',
          items: {
            type: 'object',
            properties: {
              sourceId: { type: 'string', description: '起始节点 ID' },
              targetId: { type: 'string', description: '目标节点 ID' },
              sourceHandle: { type: 'string', description: '起始连接点' },
              targetHandle: { type: 'string', description: '目标连接点' },
            },
            required: ['sourceId', 'targetId'],
          },
        },
        deleteEdgeIds: {
          type: 'array',
          description: '要删除的连线 ID 列表。',
          items: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'auto_layout',
    description:
      '使用 dagre 算法对工作流进行自动布局。会自动计算所有节点的位置，使图结构清晰、美观、无重叠。适合在添加/删除节点后整理画布，或在初始创建工作流后一键排列。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'execute_workflow_sync',
    description:
      '同步执行当前工作流。会阻塞等待所有节点按拓扑顺序执行完成后返回完整执行结果（每个节点的输入、输出、状态和耗时）。适用于需要立即获取结果的场景。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'execute_workflow_async',
    description:
      '异步执行当前工作流。立即返回一个 execution_id 用于后续查询执行状态和结果，工作流在后台运行。适用于长时间运行的工作流，可配合 get_workflow_result 轮询结果。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_workflow_result',
    description:
      '获取工作流执行结果。通过 execution_id 查询执行状态和各节点的输入/输出。可选传入 node_id 获取指定节点的结果，不传则返回全部节点的执行结果。',
    input_schema: {
      type: 'object',
      properties: {
        execution_id: {
          type: 'string',
          description: '执行 ID，由 execute_workflow_async 返回。同步执行也可用其返回的 execution_id 查询。',
        },
        node_id: {
          type: 'string',
          description: '可选，指定节点 ID，仅返回该节点的执行结果。不传则返回所有节点的结果。',
        },
      },
      required: ['execution_id'],
    },
  },
]

/** 工作流 AI 助手基础系统提示词 */
export const WORKFLOW_SYSTEM_PROMPT = `你是一个工作流编辑助手，帮助用户创建、修改和优化可视化工作流。你可以通过工具调用直接操作工作流的节点和连线。

## 可用操作

| 操作 | 工具名 | 说明 |
|------|--------|------|
| 查看当前画布 | get_current_workflow | 获取当前画布的节点和连线，包含未保存改动 |
| 查看已保存文件 | get_workflow | 按 workflow_id 读取磁盘中的最新已保存工作流 |
| 查询节点类型 | list_node_types | 查看可用的节点类型及其参数 |
| 创建节点 | create_node | 添加新节点到工作流 |
| 更新节点 | update_node | 修改节点参数 |
| 删除节点 | delete_node | 移除节点及相关连线 |
| 创建连线 | create_edge | 连接两个节点 |
| 删除连线 | delete_edge | 移除节点间的连接 |
| 批量操作 | batch_update | 一次性执行多个创建/删除操作 |
| 自动布局 | auto_layout | 自动排列所有节点位置 |
| 同步执行 | execute_workflow_sync | 同步执行工作流，等待完成后返回结果 |
| 异步执行 | execute_workflow_async | 异步执行工作流，立即返回 execution_id |
| 查询结果 | get_workflow_result | 按 execution_id 查询执行结果，可选 node_id 过滤 |

## 使用指南

1. **先了解现状**：编辑前优先用 get_current_workflow 查看当前画布结构，了解现有节点和连线关系。
2. **确认类型**：创建节点前用 list_node_types 确认可用的节点类型和所需参数。
3. **逐步操作**：复杂修改建议分步执行，每步确认后再继续。
4. **批量编辑**：需要同时创建多个节点和连线时，优先使用 batch_update 以保证原子性。
5. **最终整理**：完成编辑后可调用 auto_layout 自动整理布局。
6. **谨慎删除**：删除操作不可撤销，请确认 ID 正确后再执行。
7. **区分数据来源**：查看当前画布用 \`get_current_workflow\`；查看已保存文件用 \`get_workflow({ workflow_id })\`。
8. **选择执行模式**：短工作流用 \`execute_workflow_sync\` 直接获取结果；长工作流用 \`execute_workflow_async\` 后台运行，再用 \`get_workflow_result\` 轮询结果。

## 注意事项

- \`get_workflow\` 必须显式传入 \`workflow_id\`。
- 节点 ID 由系统自动生成，创建节点后返回结果中会包含新 ID。
- 连线方向为 source -> target，表示数据/控制流从源节点流向目标节点。
- 条件分支节点通常有多个输出连接点（sourceHandle），如 "true"/"false"。
- 每个工作流通常需要一个开始节点（start）和一个或多个结束节点（end）。
- \`execute_workflow_sync\` 会阻塞等待，适合节点少、执行快的工作流。
- \`execute_workflow_async\` 适合节点多或含浏览器操作等耗时的场景。`

/**
 * 构建包含工作流上下文的完整系统提示词。
 *
 * @param workflow 工作流摘要对象，包含名称、描述、节点和连线
 * @returns 完整的系统提示词字符串，末尾附注当前工作流 JSON
 */
export function buildWorkflowSystemPrompt(workflow: WorkflowSummary): string {
  const summary = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: workflow.nodes,
    edges: workflow.edges,
  }

  return `${WORKFLOW_SYSTEM_PROMPT}

---

## 当前工作流

当前 workflow_id: ${workflow.id}

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\``
}
