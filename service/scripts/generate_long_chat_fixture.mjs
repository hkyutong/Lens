import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(serviceDir, '.env') })

const LONG_CHAT_FIXTURES = [
  { title: process.env.LONG_CHAT_500_TITLE || 'E2E 长会话 500', totalMessages: 500 },
  { title: process.env.LONG_CHAT_1000_TITLE || 'E2E 长会话 1000', totalMessages: 1000 },
]

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_DATABASE || 'yuto3996',
  charset: 'utf8mb4',
}

const apiOrigin = process.env.SERVICE_ORIGIN || 'http://127.0.0.1:9520'

const defaultGroupConfig = {
  modelInfo: {
    model: 'gpt-5-nano',
    modelName: 'GPT-5 nano',
    keyType: 1,
    deductType: 1,
    deduct: 1,
    isFileUpload: 2,
    isImageUpload: 0,
    isNetworkSearch: 1,
    deepThinkingType: 1,
    isMcpTool: 0,
    modelAvatar: '',
    modelDescription: 'Long chat pressure fixture',
    maxRounds: 20,
    isGPTs: 0,
    isFlowith: 0,
    isFixedModel: 0,
  },
  fileInfo: {},
}

const sampleAttachmentUrls = [
  `${apiOrigin}/file/dev/smoke-e2e/smoke.pdf`,
  `${apiOrigin}/file/dev/smoke-e2e/smoke.docx`,
]

const pad = value => String(value).padStart(2, '0')

const buildMarkdownTable = index => {
  const rows = [
    '| 指标 | 数值 | 说明 |',
    '| --- | --- | --- |',
    `| 样本批次 | Batch-${pad(index)} | 用于回归对比 |`,
    `| 显存预算 | ${16 + (index % 5)} GB | 压测中的推理资源约束 |`,
    `| 关键观察 | Case-${index} | Chrome 中需要保持可交互 |`,
  ]
  return rows.join('\n')
}

const buildCodeBlock = index => {
  return [
    '```ts',
    `export function summarizeCase${index}(items: string[]) {`,
    '  return items',
    '    .filter(Boolean)',
    "    .map(item => item.trim())",
    "    .join(' | ')",
    '}',
    '```',
  ].join('\n')
}

const buildMermaid = index => {
  return [
    '```mermaid',
    'flowchart TD',
    `A${index}[采集问题] --> B${index}[解析资料]`,
    `B${index} --> C${index}[生成摘要]`,
    `C${index} --> D${index}[形成可交付结果]`,
    '```',
  ].join('\n')
}

const buildAssistantContent = pairIndex => {
  switch (pairIndex % 6) {
    case 0:
      return [
        `### 研究结果 ${pairIndex}`,
        '',
        '下面是本轮分析的关键结论与建议：',
        '',
        '- 已完成长会话结构扫描',
        '- 已提取主要假设、变量与限制条件',
        '- 建议优先关注结论与实验设置的对应关系',
      ].join('\n')
    case 1:
      return buildMarkdownTable(pairIndex)
    case 2:
      return buildCodeBlock(pairIndex)
    case 3:
      return buildMermaid(pairIndex)
    case 4:
      return [
        `针对第 ${pairIndex} 轮材料，建议从研究问题、方法假设、实验边界和可复现实验四个部分继续追问。`,
        '',
        '1. 研究问题是否被准确约束',
        '2. 数据来源与采样是否充分',
        '3. 指标与结论是否一一对应',
        '4. 是否存在需要补充的局限性说明',
      ].join('\n')
    default:
      return [
        `本轮内容包含一段偏长的学术总结，用于模拟真实研究记录在 Chrome 中的渲染压力。`,
        '我们同时保留普通段落、强调文本、列表和多段换行，以覆盖 markdown 渲染、高亮和布局测量。',
        '如果页面在打开或回滚历史时仍出现明显停顿，就说明仍有渲染链路需要继续收敛。',
      ].join('\n\n')
  }
}

const buildUserContent = pairIndex => {
  switch (pairIndex % 5) {
    case 0:
      return `请继续总结第 ${pairIndex} 轮论文材料的研究问题、方法和主要结论。`
    case 1:
      return `请把第 ${pairIndex} 轮的英文摘要润色成更自然的学术表达。`
    case 2:
      return `请解释第 ${pairIndex} 轮代码片段的输入、输出和关键实现逻辑。`
    case 3:
      return `请把第 ${pairIndex} 轮 LaTeX 内容翻译成中文，保留公式与命令不变。`
    default:
      return `请基于第 ${pairIndex} 轮资料输出一个结构化表格，并指出还需要补充哪些证据。`
  }
}

const buildMessages = totalMessages => {
  const rows = []
  const pairCount = Math.floor(totalMessages / 2)
  for (let pairIndex = 1; pairIndex <= pairCount; pairIndex += 1) {
    const attachmentIndex = pairIndex % sampleAttachmentUrls.length
    const hasAttachment = pairIndex % 9 === 0
    rows.push({
      role: 'user',
      content: buildUserContent(pairIndex),
      model: '',
      modelName: '我',
      reasoning_content: '',
      tool_calls: '',
      imageUrl: '',
      fileUrl: hasAttachment
        ? JSON.stringify([
            {
              url: sampleAttachmentUrls[attachmentIndex],
              name: attachmentIndex === 0 ? 'smoke.pdf' : 'smoke.docx',
            },
          ])
        : '',
      fileVectorResult: '',
      networkSearchResult: '',
      status: 3,
      type: 1,
    })
    rows.push({
      role: 'assistant',
      content: buildAssistantContent(pairIndex),
      model: 'gpt-5-nano',
      modelName: 'GPT-5 nano',
      reasoning_content:
        pairIndex % 7 === 0
          ? '正在整理分析路径、证据链和可交付结论，用于长会话压测。'
          : '',
      tool_calls: '',
      imageUrl: '',
      fileUrl: '',
      fileVectorResult:
        pairIndex % 11 === 0
          ? JSON.stringify([
              {
                path: `gpt_log/long-chat-${pairIndex}.md`,
                name: `long-chat-${pairIndex}.md`,
              },
            ])
          : '',
      networkSearchResult: '',
      status: 3,
      type: 1,
    })
  }
  return rows
}

const getUser = async connection => {
  const preferredUsername = process.env.E2E_LONG_CHAT_USER || 'super'
  const [rows] = await connection.query(
    'SELECT id, username FROM users WHERE username = ? ORDER BY id ASC LIMIT 1',
    [preferredUsername]
  )
  if (Array.isArray(rows) && rows.length) return rows[0]

  const [fallbackRows] = await connection.query(
    "SELECT id, username FROM users WHERE role = 'super' ORDER BY id ASC LIMIT 1"
  )
  if (Array.isArray(fallbackRows) && fallbackRows.length) return fallbackRows[0]

  throw new Error('未找到可用于生成长会话压测数据的用户，请先确认 super 用户存在。')
}

const getGroupConfig = async (connection, userId) => {
  const [rows] = await connection.query(
    'SELECT config FROM chat_group WHERE userId = ? AND isDelete = 0 AND config IS NOT NULL ORDER BY updatedAt DESC LIMIT 1',
    [userId]
  )
  if (Array.isArray(rows) && rows.length && rows[0]?.config) {
    try {
      const parsed = JSON.parse(rows[0].config)
      if (parsed && parsed.modelInfo) {
        parsed.modelInfo.isFileUpload = 2
        return JSON.stringify(parsed)
      }
    } catch (_error) {}
  }
  return JSON.stringify(defaultGroupConfig)
}

const ensureFixtureGroup = async (connection, { userId, title, config }) => {
  const [rows] = await connection.query(
    'SELECT id FROM chat_group WHERE userId = ? AND title = ? AND isDelete = 0 ORDER BY id DESC',
    [userId, title]
  )
  const existing = Array.isArray(rows) ? rows : []

  let groupId = existing[0]?.id
  if (!groupId) {
    const [result] = await connection.query(
      `INSERT INTO chat_group
      (userId, isSticky, title, appId, isDelete, config, params, fileUrl, pdfTextContent, createdAt, updatedAt, deletedAt)
      VALUES (?, 0, ?, 0, 0, ?, '', '', '', NOW(), NOW(), NULL)`,
      [userId, title, config]
    )
    groupId = Number(result.insertId)
  } else {
    await connection.query(
      `UPDATE chat_group
       SET isDelete = 0, deletedAt = NULL, config = ?, appId = 0, params = '', fileUrl = '', updatedAt = NOW()
       WHERE id = ?`,
      [config, groupId]
    )
  }

  if (existing.length > 1) {
    const duplicateIds = existing.slice(1).map(item => Number(item.id)).filter(Boolean)
    if (duplicateIds.length) {
      await connection.query(
        `UPDATE chat_group SET isDelete = 1, deletedAt = NOW(), updatedAt = NOW() WHERE id IN (${duplicateIds
          .map(() => '?')
          .join(',')})`,
        duplicateIds
      )
    }
  }

  await connection.query('DELETE FROM chatlog WHERE groupId = ?', [groupId])
  return groupId
}

const insertMessages = async (connection, { groupId, userId, messages }) => {
  const chunkSize = 100
  const startTime = Date.now() - messages.length * 60 * 1000

  for (let offset = 0; offset < messages.length; offset += chunkSize) {
    const chunk = messages.slice(offset, offset + chunkSize)
    const values = chunk.map((message, index) => {
      const createdAt = new Date(startTime + (offset + index) * 60 * 1000)
      return [
        userId,
        message.model,
        message.role,
        message.content,
        message.reasoning_content,
        message.tool_calls,
        message.imageUrl,
        '',
        '',
        message.fileUrl,
        message.type,
        message.modelName,
        '',
        '127.0.0.1',
        '',
        '',
        '',
        '',
        0,
        0,
        0,
        '',
        message.status,
        '',
        '',
        '',
        '',
        0,
        groupId,
        0,
        0,
        '',
        '',
        '',
        '',
        message.networkSearchResult,
        message.fileVectorResult,
        createdAt,
        createdAt,
        null,
      ]
    })

    await connection.query(
      `INSERT INTO chatlog
      (userId, model, role, content, reasoning_content, tool_calls, imageUrl, videoUrl, audioUrl, fileUrl,
       type, modelName, modelAvatar, curIp, prompt, extraParam, pluginParam, answer,
       promptTokens, completionTokens, totalTokens, progress, status, action, customId, drawId,
       ttsUrl, rec, groupId, appId, isDelete, taskId, taskData, fileInfo, promptReference,
       networkSearchResult, fileVectorResult, createdAt, updatedAt, deletedAt)
      VALUES ?`,
      [values]
    )
  }
}

const main = async () => {
  const connection = await mysql.createConnection(dbConfig)
  try {
    await connection.beginTransaction()
    const user = await getUser(connection)
    const config = await getGroupConfig(connection, user.id)
    const summary = []

    for (const fixture of LONG_CHAT_FIXTURES) {
      const groupId = await ensureFixtureGroup(connection, {
        userId: user.id,
        title: fixture.title,
        config,
      })
      const messages = buildMessages(fixture.totalMessages)
      await insertMessages(connection, {
        groupId,
        userId: user.id,
        messages,
      })
      await connection.query('UPDATE chat_group SET updatedAt = NOW() WHERE id = ?', [groupId])
      summary.push({
        groupId,
        title: fixture.title,
        totalMessages: fixture.totalMessages,
      })
    }

    await connection.commit()
    console.log(JSON.stringify({ ok: true, fixtures: summary }, null, 2))
  } catch (error) {
    await connection.rollback()
    console.error('[generate_long_chat_fixture] failed:', error)
    process.exitCode = 1
  } finally {
    await connection.end()
  }
}

await main()
