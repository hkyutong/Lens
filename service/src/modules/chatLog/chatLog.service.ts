import { ChatType } from '@/common/constants/balance.constant';
import { formatDate, maskEmail } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import excel from 'exceljs';
import { Request, Response } from 'express';
import { In, LessThan, Like, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { UserEntity } from '../user/user.entity';
import { ChatLogEntity } from './chatLog.entity';
import { ChatListDto } from './dto/chatList.dto';
import { DelDto } from './dto/del.dto';
import { DelByGroupDto } from './dto/delByGroup.dto';
import { ExportExcelChatlogDto } from './dto/exportExcelChatlog.dto';
import { QuerAllChatLogDto } from './dto/queryAllChatLog.dto';
import { QueryByAppIdDto } from './dto/queryByAppId.dto';
import { QuerMyChatLogDto } from './dto/queryMyChatLog.dto';
import { recDrawImgDto } from './dto/recDrawImg.dto';
// import { ModelsTypeEntity } from '../models/modelType.entity';
import { JwtPayload } from 'src/types/express';
import { ModelsService } from '../models/models.service';
import { QuerySingleChatDto } from './dto/querySingleChat.dto';
import { SyncDisplayContentDto } from './dto/syncDisplayContent.dto';

@Injectable()
export class ChatLogService {
  private readonly logger = new Logger(ChatLogService.name);
  constructor(
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    @InjectRepository(ChatGroupEntity)
    private readonly chatGroupEntity: Repository<ChatGroupEntity>,
    private readonly modelsService: ModelsService,
  ) {}

  private isTransientDbError(error: any) {
    const code = String(error?.code || error?.driverError?.code || '');
    const message = String(error?.message || error || '');
    return (
      code === 'PROTOCOL_CONNECTION_LOST' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      /Connection lost:\s*The server closed the connection/i.test(message) ||
      /server has gone away/i.test(message)
    );
  }

  private async sleep(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private splitMarkdownTableCells(line: string) {
    const text = String(line || '').trim();
    if (!text.startsWith('|')) return [];
    let body = text.slice(1);
    if (body.endsWith('|')) body = body.slice(0, -1);
    const cells: string[] = [];
    let current = '';
    let escaped = false;
    for (const char of body) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        current += char;
        escaped = true;
        continue;
      }
      if (char === '|') {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    cells.push(current.trim());
    return cells;
  }

  private isMarkdownTableSeparator(line: string) {
    return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*(?:\s*:?-{3,}:?\s*)?\|?\s*$/.test(
      String(line || ''),
    );
  }

  private normalizeMarkdownTableRow(cells: string[], expectedColumns = 3) {
    const normalizedCells = (cells || []).map(item => String(item || '').trim());
    const size = Math.max(2, expectedColumns || 0);
    if (normalizedCells.length > size) {
      const head = normalizedCells.slice(0, size - 1);
      const tail = normalizedCells.slice(size - 1).join(' ');
      normalizedCells.splice(0, normalizedCells.length, ...head, tail);
    }
    while (normalizedCells.length < size) normalizedCells.push('');
    return `| ${normalizedCells.slice(0, size).join(' | ')} |`;
  }

  private normalizeLeakedPolishControlText(value: string) {
    return String(value || '')
      .replace(/[‘’“”"'`*_]/g, '')
      .replace(/[：:；;，,。.!！?？]/g, '')
      .replace(/\s+/g, '');
  }

  private getStablePolishRowKey(before: string, after: string) {
    return `${this.normalizeLeakedPolishControlText(before)}\u0000${this.normalizeLeakedPolishControlText(after)}`;
  }

  private readonly stablePolishReasonCuePattern =
    /^(?:将|把|增加|删除|改为|省略|直接使用|体现|突出|避免|保留|添加|调整|补齐|更换|优化|用词|语气|强调|通过|采用|概括|引出|去除(?:冗余)?|简化(?:表达|表述)|删除冗余描述|合并和简化要求|此句表达已较清晰|未作修改|补充[“"]|用[“"]|为[“"]|使用(?:更|[“"'A-Za-z])|改为主动建议句式|“[^”]+”比“[^”]+”|“[^”]+”改为“[^”]+”|“)/;

  private isLikelyStablePolishReasonSegment(value: string) {
    return this.stablePolishReasonCuePattern.test(String(value || '').trim());
  }

  private isLikelyStablePolishSnippetSegment(value: string) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (this.isLeakedPolishControlCell(text)) return false;
    return !this.isLikelyStablePolishReasonSegment(text);
  }

  private explodeMergedStablePolishRows(candidate: {
    before: string;
    after: string;
    reason: string;
  }) {
    const reason = String(candidate.reason || '').trim();
    const segments = reason
      .split(/\s+/)
      .map(item => String(item || '').trim())
      .filter(Boolean);
    if (segments.length < 4) return [{ ...candidate, reason }];

    const rows: Array<{ before: string; after: string; reason: string }> = [];
    const currentReasonParts = [segments[0]];
    let cursor = 1;

    while (cursor < segments.length) {
      const before = String(segments[cursor] || '').trim();
      const after = String(segments[cursor + 1] || '').trim();
      const reasonStart = String(segments[cursor + 2] || '').trim();
      const hasEmbeddedRow =
        cursor + 2 < segments.length &&
        this.isLikelyStablePolishSnippetSegment(before) &&
        this.isLikelyStablePolishSnippetSegment(after) &&
        this.isLikelyStablePolishReasonSegment(reasonStart);

      if (!hasEmbeddedRow) {
        currentReasonParts.push(before);
        cursor += 1;
        continue;
      }

      const reasonParts = [reasonStart];
      cursor += 3;
      while (cursor < segments.length) {
        const nextBefore = String(segments[cursor] || '').trim();
        const nextAfter = String(segments[cursor + 1] || '').trim();
        const nextReasonStart = String(segments[cursor + 2] || '').trim();
        const nextIsEmbeddedRow =
          cursor + 2 < segments.length &&
          this.isLikelyStablePolishSnippetSegment(nextBefore) &&
          this.isLikelyStablePolishSnippetSegment(nextAfter) &&
          this.isLikelyStablePolishReasonSegment(nextReasonStart);
        if (nextIsEmbeddedRow) break;
        reasonParts.push(nextBefore);
        cursor += 1;
      }

      rows.push({
        before,
        after,
        reason: reasonParts.join(' ').trim(),
      });
    }

    return [
      {
        before: candidate.before,
        after: candidate.after,
        reason: currentReasonParts.join(' ').trim(),
      },
      ...rows,
    ].filter(row => row.before && row.after && row.reason);
  }

  private isLeakedPolishControlCell(value: string) {
    const normalized = this.normalizeLeakedPolishControlText(value);
    if (!normalized) return false;
    return [
      /^(?:列名|表头)(?:必须)?(?:严格)?为$/i,
      /^表格列名(?:必须)?(?:严格)?为$/i,
      /^(?:确保|每一行只允许)每?一行只描述一个局部修改$/i,
      /^不要把多个句子或多处改动合并成一行$/i,
      /^每个单元格(?:内容)?(?:将)?尽量简短只摘录必要片段(?:不要整段照抄)?$/i,
      /^第三列只解释这一处修改说明要简洁准确$/i,
      /Markdown表格/i,
      /^请先用中文提供文本的更正版本然后输出一个Markdown表格$/i,
      /^我将首先用中文提供文本的更正版本然后输出一个Markdown表格$/i,
    ].some(pattern => pattern.test(normalized));
  }

  private extractEmbeddedStablePolishRow(reason: string) {
    const segments = String(reason || '')
      .split(/\s+/)
      .map(item => String(item || '').trim())
      .filter(Boolean);
    if (segments.length < 4) return null;

    let tailIndex = -1;
    for (let idx = 2; idx < segments.length; idx += 1) {
      if (this.stablePolishReasonCuePattern.test(segments[idx])) {
        tailIndex = idx;
        break;
      }
    }
    if (tailIndex < 3) return null;

    const middle = segments.slice(1, tailIndex);
    let splitIndex = -1;
    if (middle.length === 2) {
      splitIndex = 1;
    } else {
      for (let idx = 1; idx < middle.length; idx += 1) {
        const previous = middle.slice(0, idx).join(' ');
        const current = String(middle[idx] || '');
        if (/[A-Za-z]/.test(current) && !/[A-Za-z]/.test(previous)) {
          splitIndex = idx;
          break;
        }
      }
      if (splitIndex < 0 && middle.length === 3) {
        splitIndex = 1;
      }
    }
    if (splitIndex < 1 || splitIndex >= middle.length) return null;

    const before = middle.slice(0, splitIndex).join(' ').trim();
    const after = middle.slice(splitIndex).join(' ').trim();
    const leadingReason = String(segments[0] || '').trim();
    const tailReason = segments.slice(tailIndex).join(' ').trim();
    if (!before || !after || !leadingReason || !tailReason) return null;
    return {
      leadingReason,
      embeddedRow: {
        before,
        after,
        reason: tailReason,
      },
    };
  }

  private trimStablePolishReasonOverflow(
    reason: string,
    upcomingRows: Array<{ before: string; after: string; reason: string }>,
  ) {
    let output = String(reason || '').trim();
    if (!output) return '';
    let cutIndex = -1;
    for (const row of upcomingRows) {
      const candidates = [row.before, row.after]
        .map(item => String(item || '').trim())
        .filter(Boolean);
      for (const candidate of candidates) {
        const idx = output.indexOf(candidate);
        if (idx > 0 && (cutIndex < 0 || idx < cutIndex)) {
          cutIndex = idx;
        }
      }
      if (cutIndex > 0) break;
    }
    if (cutIndex > 0) {
      output = output.slice(0, cutIndex).trim();
    }
    return output.replace(/\s{2,}/g, ' ');
  }

  private collectRecoveredStablePolishRows(text: string) {
    const source = String(text || '');
    if (!source) return [];
    const lines = source.split('\n').map(line => String(line || '').trimEnd());
    const headerIndex = lines.findIndex(line => {
      const headerCells = this.splitMarkdownTableCells(String(line || '').trim());
      return (
        headerCells.length === 3 &&
        headerCells[0] === '修改前原文片段' &&
        headerCells[1] === '修改后片段' &&
        headerCells[2] === '修改原因与解释'
      );
    });
    if (headerIndex < 0) return [];

    let separatorIndex = -1;
    for (let idx = headerIndex + 1; idx < lines.length; idx += 1) {
      const trimmed = String(lines[idx] || '').trim();
      if (!trimmed) continue;
      if (this.isMarkdownTableSeparator(trimmed)) {
        separatorIndex = idx;
        break;
      }
      break;
    }
    if (separatorIndex < 0) return [];

    const rawRows: Array<{ before: string; after: string; reason: string }> = [];
    for (let idx = separatorIndex + 1; idx < lines.length; idx += 1) {
      const trimmed = String(lines[idx] || '').trim();
      if (!trimmed || !/^\s*\|.*\|\s*$/.test(trimmed)) continue;
      const rowCells = this.splitMarkdownTableCells(trimmed);
      if (rowCells.length !== 3) continue;
      rawRows.push({
        before: String(rowCells[0] || '').trim(),
        after: String(rowCells[1] || '').trim(),
        reason: String(rowCells[2] || '').trim(),
      });
    }

    const recovered: Array<{ before: string; after: string; reason: string }> = [];
    const seen = new Set<string>();
    for (let idx = 0; idx < rawRows.length; idx += 1) {
      const row = rawRows[idx];
      if (!row.before || !row.after) continue;
      if (this.isLeakedPolishControlCell(row.before) || this.isLeakedPolishControlCell(row.after)) {
        continue;
      }
      const pushRow = (
        candidate: { before: string; after: string; reason: string },
        depth = 0,
        skipSequentialSplit = false,
      ) => {
        if (depth > 4) return;
        const reason = depth
          ? String(candidate.reason || '').trim()
          : this.trimStablePolishReasonOverflow(candidate.reason, rawRows.slice(idx + 1, idx + 4));
        if (!reason) return;
        if (
          !candidate.before ||
          !candidate.after ||
          this.isLeakedPolishControlCell(candidate.before) ||
          this.isLeakedPolishControlCell(candidate.after)
        ) {
          return;
        }
        if (!skipSequentialSplit) {
          const explodedRows = this.explodeMergedStablePolishRows({
            before: candidate.before,
            after: candidate.after,
            reason,
          });
          if (explodedRows.length > 1) {
            explodedRows.forEach(rowItem => pushRow(rowItem, depth + 1, true));
            return;
          }
        }
        const splitResult = this.extractEmbeddedStablePolishRow(reason);
        const finalReason = String(splitResult?.leadingReason || reason).trim();
        const rowKey = this.getStablePolishRowKey(candidate.before, candidate.after);
        if (!seen.has(rowKey) && finalReason) {
          seen.add(rowKey);
          recovered.push({
            before: candidate.before,
            after: candidate.after,
            reason: finalReason,
          });
        }
        if (splitResult?.embeddedRow) {
          pushRow(splitResult.embeddedRow, depth + 1);
        }
      };
      pushRow(row);
    }

    return recovered;
  }

  private buildRecoveredStablePolishTable(text: string) {
    const source = String(text || '');
    const rows = this.collectRecoveredStablePolishRows(source);
    if (!rows.length) return '';

    const lines = source.split('\n').map(line => String(line || '').trimEnd());
    const headerIndex = lines.findIndex(line => {
      const headerCells = this.splitMarkdownTableCells(String(line || '').trim());
      return (
        headerCells.length === 3 &&
        headerCells[0] === '修改前原文片段' &&
        headerCells[1] === '修改后片段' &&
        headerCells[2] === '修改原因与解释'
      );
    });
    const maybeTitle = String(lines[headerIndex - 1] || '').trim();
    const tableLines = [
      /^修改对照表[:：]?$/.test(maybeTitle) ? maybeTitle : '',
      '| 修改前原文片段 | 修改后片段 | 修改原因与解释 |',
      '| --- | --- | --- |',
      ...rows.map(row => `| ${row.before} | ${row.after} | ${row.reason} |`),
    ].filter(Boolean);
    return tableLines.join('\n');
  }

  private stripLeadingStablePolishOverflowBlock(text: string) {
    const lines = String(text || '').split('\n');
    let firstMeaningfulIndex = 0;
    while (firstMeaningfulIndex < lines.length && !String(lines[firstMeaningfulIndex] || '').trim()) {
      firstMeaningfulIndex += 1;
    }
    if (firstMeaningfulIndex >= lines.length) return '';
    if (!String(lines[firstMeaningfulIndex] || '').trim().startsWith('|')) {
      return String(text || '').trimStart();
    }
    let cursor = firstMeaningfulIndex;
    while (cursor < lines.length) {
      const trimmed = String(lines[cursor] || '').trim();
      if (!trimmed) {
        cursor += 1;
        continue;
      }
      if (!trimmed.startsWith('|')) break;
      cursor += 1;
    }
    return lines.slice(cursor).join('\n').trimStart();
  }

  private replacePolishReasonTableWithRecoveredSnapshot(text: string) {
    const source = String(text || '');
    const snapshot = this.buildRecoveredStablePolishTable(source);
    if (!snapshot) return source;
    const lines = source.split('\n').map(line => String(line || '').trimEnd());
    const headerIndex = lines.findIndex(line => {
      const headerCells = this.splitMarkdownTableCells(String(line || '').trim());
      return (
        headerCells.length === 3 &&
        headerCells[0] === '修改前原文片段' &&
        headerCells[1] === '修改后片段' &&
        headerCells[2] === '修改原因与解释'
      );
    });
    if (headerIndex < 0) return source;

    const maybeTitle = String(lines[headerIndex - 1] || '').trim();
    const start = /^修改对照表[:：]?$/.test(maybeTitle) ? Math.max(0, headerIndex - 1) : headerIndex;
    let end = headerIndex + 1;
    let separatorSeen = false;
    for (let idx = headerIndex + 1; idx < lines.length; idx += 1) {
      const trimmed = String(lines[idx] || '').trim();
      if (!trimmed) {
        if (separatorSeen) {
          end = idx;
          break;
        }
        continue;
      }
      if (!separatorSeen) {
        if (this.isMarkdownTableSeparator(trimmed)) {
          separatorSeen = true;
          end = idx + 1;
          continue;
        }
        end = idx;
        break;
      }
      if (!trimmed.startsWith('|')) {
        end = idx;
        break;
      }
      end = idx + 1;
    }
    const prefix = lines.slice(0, start).join('\n').trimEnd();
    const suffix = this.stripLeadingStablePolishOverflowBlock(lines.slice(end).join('\n'));
    return [prefix, snapshot, suffix]
      .filter(section => String(section || '').trim())
      .join('\n\n')
      .trim();
  }

  private stripLeakedPolishDisplayNoise(value: string) {
    const source = String(value || '');
    if (
      !source ||
      !/(修改前原文片段\s*\|.*修改原因与解释|Markdown\s*表格|第三列只解释这一处修改|每一行只允许描述一个局部修改|每个单元格(?:内容)?(?:将)?尽量简短|(?:列名|表头)(?:必须)?(?:严格)?为)/i.test(
        source,
      )
    ) {
      return source;
    }

    const normalized = source
      .replace(
        /^[^\S\r\n>]*\|?\s*(?:列名|表头)(?:必须)?(?:严格)?为[:：]\s*\|?\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|?\s*$/gim,
        '',
      )
      .replace(
        /(?:列名|表头)(?:必须)?(?:严格)?为[:：]\s*\|?\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|?/gi,
        '',
      )
      .replace(
        /^[^\n]*Markdown\s*表格[^\n]*(?:修改前原文片段|每一行只描述一个局部修改|每个单元格(?:内容)?(?:将)?尽量简短)[^\n]*$/gim,
        '',
      )
      .replace(
        /(?:然后)?输出一个\s*Markdown\s*表格(?:列名|表头)?(?:必须)?(?:严格)?为[:：]?\s*`?\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*`?/gi,
        '',
      )
      .replace(/表格(?:会)?按[“"'`]?小句\/短片段[”"'`]?的粒度拆分[，,、 ]*/gi, '')
      .replace(/(?:确保每一行只描述一个局部修改|每一行只允许描述一个局部修改)[，,、 ]*/gi, '')
      .replace(
        /每个单元格(?:内容)?(?:将)?尽量简短，只摘录必要片段(?:，?不要整段照抄)?[；;，,、 ]*/gi,
        '',
      )
      .replace(/第三列只解释这一处修改，说明要简洁准确[:：]?\s*/gi, '');

    const lines = normalized.split('\n');
    const output: string[] = [];
    const seenRows = new Set<string>();

    for (const line of lines) {
      const trimmed = String(line || '').trim();
      if (!trimmed) {
        output.push(line);
        continue;
      }
      if (
        /Markdown\s*表格/i.test(trimmed) &&
        /(修改前原文片段|每一行只描述一个局部修改|每个单元格(?:内容)?(?:将)?尽量简短)/.test(
          trimmed,
        )
      ) {
        continue;
      }
      if (!trimmed.startsWith('|')) {
        if (this.isLeakedPolishControlCell(trimmed)) continue;
        output.push(line);
        continue;
      }

      const cells = this.splitMarkdownTableCells(trimmed);
      if (cells.length === 3) {
        if (this.isLeakedPolishControlCell(cells[0]) || this.isLeakedPolishControlCell(cells[1])) {
          continue;
        }
        const normalizedRow = this.normalizeMarkdownTableRow(cells, 3);
        const isHeader =
          cells[0] === '修改前原文片段' &&
          cells[1] === '修改后片段' &&
          cells[2] === '修改原因与解释';
        if (!isHeader && !this.isMarkdownTableSeparator(trimmed)) {
          if (seenRows.has(normalizedRow)) continue;
          seenRows.add(normalizedRow);
        }
        output.push(normalizedRow);
        continue;
      }

      output.push(line);
    }

    const cleaned = output.join('\n').replace(/\n{4,}/g, '\n\n\n');
    return this.replacePolishReasonTableWithRecoveredSnapshot(cleaned);
  }

  private sanitizeDisplayText(value: any) {
    if (value === null || value === undefined) return '';
    let text = String(value || '');
    if (!text) return '';
    text = text
      .replace(/[​⁠﻿]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(
        /(?:private_upload|public\/file|userFiles|file\/dev\/userFiles|private\/upload)[^ \n,，)]+/gi,
        '',
      )
      .replace(/(?:\/Users\/|C:\\\\Users\\\\)[^ \n,，)]+/g, '')
      .replace(/\/www\/wwwroot\/[^ \n,，)]+/g, '')
      .replace(/\/(?:root|home|opt|var|tmp)\/[^ \n,，)]+/g, '')
      .replace(/【文件路径已隐藏】/g, '')
      .replace(/\[路径已隐藏\]/g, '')
      .replace(/(找不到任何[^\n:：]*文件)\s*[:：]\s*(?=\n|$)/g, '$1。')
      .replace(/(找不到本地项目或(?:无权访问|无法处理))\s*[:：]\s*(?=\n|$)/g, '$1。')
      .replace(/(解析项目)\s*[:：]\s*(?=\n|$)/g, '$1')
      .replace(/｜/g, '|');
    text = this.stripLeakedPolishDisplayNoise(text)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{4,}/g, '\n\n\n');
    return text;
  }

  /* 记录问答日志 */
  async saveChatLog(logInfo): Promise<any> {
    const savedLog = await this.chatLogEntity.save(logInfo);
    return savedLog; // 这里返回保存后的实体，包括其 ID
  }

  /* 更新问答日志 */
  async updateChatLog(id, logInfo) {
    const maxAttempts = 3;
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.chatLogEntity.update({ id }, logInfo);
      } catch (error) {
        lastError = error;
        if (!this.isTransientDbError(error) || attempt === maxAttempts) {
          this.logger?.error?.(
            `updateChatLog failed id=${id} attempt=${attempt}: ${String(error?.message || error)}`,
          );
          // 降级返回，避免学术流在落库失败时把前端响应中断成空白。
          return { affected: 0 };
        }
        await this.sleep(120 * attempt);
      }
    }
    return { affected: 0, error: String(lastError?.message || lastError || '') };
  }

  async syncDisplayContent(req: Request, body: SyncDisplayContentDto) {
    const userId = req.user.id;
    const chatId = Number(body?.chatId || 0);
    if (!chatId) return '请输入正确的聊天ID';

    const chatLog = await this.chatLogEntity.findOne({
      where: {
        id: chatId,
        userId,
        isDelete: false,
      },
    });
    if (!chatLog) return '未找到该消息';
    if (chatLog.role !== 'assistant') return '仅支持同步助手消息';

    const content = String(body?.content || '').replace(/\r\n/g, '\n').trim();
    const reasoningText =
      body?.reasoningText === undefined || body?.reasoningText === null
        ? undefined
        : String(body.reasoningText || '').replace(/\r\n/g, '\n').trim();
    if (!content) return '展示内容不能为空';

    const nextContent = this.sanitizeDisplayText(content) || content;
    const nextReasoning =
      reasoningText === undefined ? undefined : this.sanitizeDisplayText(reasoningText);
    await this.updateChatLog(chatId, {
      content: nextContent,
      ...(nextReasoning !== undefined ? { reasoning_content: nextReasoning || null } : {}),
    });
    return '同步成功';
  }

  async findOneChatLog(id) {
    return await this.chatLogEntity.findOne({ where: { id } });
  }

  async findLatestAssistantLog(userId: number, groupId: number) {
    if (!userId || !groupId) return null;
    return await this.chatLogEntity.findOne({
      where: { userId, groupId, isDelete: false, role: 'assistant' },
      order: { id: 'DESC' },
    });
  }

  /* 查询我的绘制记录 */
  async querDrawLog(req: Request, query: QuerMyChatLogDto) {
    const { id } = req.user;
    const { model } = query;
    const where: any = { userId: id, type: ChatType.PAINT };
    if (model) {
      where.model = model;
      if (model === 'DALL-E2') {
        where.model = In(['DALL-E2', 'dall-e-3']);
      }
    }
    const data = await this.chatLogEntity.find({
      where,
      order: { id: 'DESC' },
      select: ['id', 'answer', 'prompt', 'model', 'type', 'fileInfo'],
    });
    data.forEach((r: any) => {
      if (r.type === 'paintCount') {
        const w = r.model === 'mj' ? 310 : 160;
        const imgType = r.answer.includes('cos') ? 'tencent' : 'ali';
        const compress =
          imgType === 'tencent'
            ? `?imageView2/1/w/${w}/q/55`
            : `?x-oss-process=image/resize,w_${w}`;
        r.thumbImg = r.answer + compress;
        try {
          r.fileInfo = r.fileInfo ? JSON.parse(r.fileInfo) : null;
        } catch (error) {
          r.fileInfo = {};
        }
      }
    });
    return data;
  }

  /* 推荐图片到对外展示 */
  async recDrawImg(body: recDrawImgDto) {
    const { id } = body;
    const l = await this.chatLogEntity.findOne({
      where: { id, type: ChatType.PAINT },
    });
    if (!l) {
      throw new HttpException('你推荐的图片不存在、请检查！', HttpStatus.BAD_REQUEST);
    }
    const rec = l.rec === 1 ? 0 : 1;
    const res = await this.chatLogEntity.update({ id }, { rec });
    if (res.affected > 0) {
      return `${rec ? '推荐' : '取消推荐'}图片成功！`;
    }
    throw new HttpException('你操作的图片不存在、请检查！', HttpStatus.BAD_REQUEST);
  }

  /* 导出为excel对话记录 */
  async exportExcel(body: ExportExcelChatlogDto, res: Response) {
    const where = { type: ChatType.NORMAL_CHAT };
    const { page = 1, size = 30, prompt, email } = body;
    prompt && Object.assign(where, { prompt: Like(`%${prompt}%`) });
    if (email) {
      const user = await this.userEntity.findOne({ where: { email } });
      user?.id && Object.assign(where, { userId: user.id });
    }
    const [rows, count] = await this.chatLogEntity.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
      where,
    });

    const userIds = rows.map(r => r.userId);
    const userInfos = await this.userEntity.find({
      where: { id: In(userIds) },
    });
    const data = rows.map(r => {
      const userInfo = userInfos.find(u => u.id === r.userId);
      return {
        username: userInfo ? userInfo.username : '',
        email: userInfo ? userInfo.email : '',
        prompt: r.prompt,
        answer: r.answer,
        createdAt: formatDate(r.createdAt),
      };
    });

    const workbook = new excel.Workbook();

    const worksheet = workbook.addWorksheet('chatlog');

    worksheet.columns = [
      { header: '用户名', key: 'username', width: 20 },
      { header: '用户邮箱', key: 'email', width: 20 },
      { header: '提问时间', key: 'createdAt', width: 20 },
      { header: '提问问题', key: 'prompt', width: 80 },
      { header: '回答答案', key: 'answer', width: 150 },
    ];

    data.forEach(row => worksheet.addRow(row));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename=' + 'chat.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  }

  /* 查询所有对话记录 */
  async querAllChatLog(params: QuerAllChatLogDto, req: Request) {
    const { page = 1, size = 20, userId, prompt, type, model } = params;
    // const where = { type: ChatType.NORMAL_CHAT, content: Not('') };
    const where: any = {};
    userId && Object.assign(where, { userId });
    prompt && Object.assign(where, { prompt: Like(`%${prompt}%`) });
    type && Object.assign(where, { type });
    model && Object.assign(where, { model });
    const [rows, count] = await this.chatLogEntity.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
      where,
    });
    const userIds = rows.map(item => item.userId);
    const userInfo = await this.userEntity.find({
      where: { id: In(userIds) },
      select: ['id', 'username', 'email', 'nickname'],
    });
    rows.forEach((item: any) => {
      const { username, email, nickname } = userInfo.find(u => u.id === item.userId) || {};
      item.username = username;
      item.email = email;
      item.nickname = nickname;
    });
    req.user.role !== 'super' && rows.forEach((t: any) => (t.email = maskEmail(t.email)));
    rows.forEach((item: any) => {
      !item.email && (item.email = `${item?.userId}@aiweb.com`);
      !item.username && (item.username = `游客${item?.userId}`);
    });
    return { rows, count };
  }

  /* 查询当前对话的列表 */
  async chatList(req: Request, params: ChatListDto) {
    const { id } = req.user;
    const { groupId, size = 80, beforeChatId } = params;
    const safeSize = Math.min(Math.max(Number(size) || 80, 1), 200);
    const where: any = { userId: id, isDelete: false };
    groupId && Object.assign(where, { groupId });
    if (beforeChatId) {
      Object.assign(where, { id: LessThan(Number(beforeChatId)) });
    }
    if (groupId) {
      const count = await this.chatGroupEntity.count({
        where: { id: Number(groupId), userId: id, isDelete: false },
      });
      if (count === 0) {
        return {
          rows: [],
          hasMore: false,
          nextBeforeChatId: 0,
        };
      }
    }
    const rawList = await this.chatLogEntity.find({
      where,
      order: { id: 'DESC' },
      take: safeSize + 1,
    });
    const hasMore = rawList.length > safeSize;
    const list = rawList.slice(0, safeSize).reverse();
    const rows = list.map(item => {
      const {
        prompt,
        role,
        answer,
        createdAt,
        model,
        modelName,
        type,
        status,
        action,
        drawId,
        id,
        imageUrl,
        fileInfo,
        fileUrl,
        ttsUrl,
        videoUrl,
        audioUrl,
        customId,
        pluginParam,
        progress,
        modelAvatar,
        taskData,
        promptReference,
        networkSearchResult,
        fileVectorResult,
        taskId,
        reasoning_content,
        tool_calls,
        content,
      } = item;
      return {
        chatId: id,
        dateTime: formatDate(createdAt),
        content: this.sanitizeDisplayText(content || (role === 'assistant' ? answer : prompt)),
        reasoningText: this.sanitizeDisplayText(reasoning_content),
        tool_calls: tool_calls,
        modelType: type,
        status: status,
        action: action,
        drawId: drawId,
        customId: customId,
        role: role,
        error: false,
        imageUrl: imageUrl || fileInfo || '',
        fileUrl: fileUrl,
        ttsUrl: ttsUrl,
        videoUrl: videoUrl,
        audioUrl: audioUrl,
        progress,
        model: model,
        modelName: modelName,
        pluginParam: pluginParam,
        modelAvatar: modelAvatar,
        taskData: taskData,
        promptReference: promptReference,
        networkSearchResult: networkSearchResult,
        fileVectorResult: fileVectorResult,
        taskId: taskId,
      };
    });
    return {
      rows,
      hasMore,
      nextBeforeChatId: rows.length ? Number(rows[0].chatId || 0) : 0,
    };
  }

  /* 查询历史对话的列表 */
  async chatHistory(groupId: number, rounds: number) {
    // Logger.debug(`查询历史对话的列表, groupId: ${groupId}, rounds: ${rounds}`);

    if (rounds === 0) {
      // Logger.debug('轮次为0，返回空数组');
      return [];
    }

    const where = { isDelete: false, groupId: groupId };
    // Logger.debug('查询条件:', JSON.stringify(where, null, 2));

    const list = await this.chatLogEntity.find({
      where,
      order: {
        createdAt: 'DESC',
      },
      take: rounds * 2, // 只取最新的rounds条记录
    });

    // Logger.debug('查询结果:', JSON.stringify(list, null, 2));

    const result = list
      .map(item => {
        const {
          role,
          content,
          answer,
          prompt,
          imageUrl,
          fileInfo,
          fileUrl,
          ttsUrl,
          videoUrl,
          audioUrl,
          reasoning_content,
          tool_calls,
          progress,
        } = item;
        const record = {
          role: role,
          content: this.sanitizeDisplayText(content || (role === 'assistant' ? answer : prompt)),
          imageUrl: imageUrl || fileInfo || '',
          fileUrl: fileUrl,
          ttsUrl: ttsUrl,
          videoUrl: videoUrl,
          audioUrl: audioUrl,
          reasoningText: this.sanitizeDisplayText(reasoning_content),
          tool_calls: tool_calls,
          progress,
        };
        // Logger.debug('处理记录:', JSON.stringify(record, null, 2));
        return record;
      })
      .reverse(); // 添加.reverse()来反转数组，使结果按时间从旧到新排列

    // Logger.debug('处理后的结果:', JSON.stringify(result, null, 2));

    return result;
  }

  /* 删除单条对话记录 */
  async deleteChatLog(req: Request, body: DelDto) {
    const { id: userId } = req.user;
    const { id } = body;
    const c = await this.chatLogEntity.findOne({ where: { id, userId } });
    if (!c) {
      throw new HttpException('你删除的对话记录不存在、请检查！', HttpStatus.BAD_REQUEST);
    }
    const r = await this.chatLogEntity.update({ id }, { isDelete: true });
    if (r.affected > 0) {
      return '删除对话记录成功！';
    } else {
      throw new HttpException('你删除的对话记录不存在、请检查！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 清空一组对话记录 */
  async delByGroupId(req: Request, body: DelByGroupDto) {
    const { groupId } = body;
    const { id } = req.user;
    const g = await this.chatGroupEntity.findOne({
      where: { id: groupId, userId: id },
    });

    if (!g) {
      throw new HttpException('你删除的对话记录不存在、请检查！', HttpStatus.BAD_REQUEST);
    }

    const r = await this.chatLogEntity.update({ groupId }, { isDelete: true });

    if (r.affected > 0) {
      return '删除对话记录成功！';
    }

    if (r.affected === 0) {
      throw new HttpException('当前页面已经没有东西可以删除了！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 删除对话组中某条对话及其后的所有对话 */
  async deleteChatsAfterId(req: Request, body: any) {
    const { id } = body; // 从请求体中获取对话记录 id
    const { id: userId } = req.user; // 从请求中获取用户ID

    // 查找该对话记录，确保其存在且属于当前用户
    const chatLog = await this.chatLogEntity.findOne({ where: { id, userId } });
    if (!chatLog) {
      // 如果对话记录不存在，抛出异常
      throw new HttpException('你删除的对话记录不存在、请检查！', HttpStatus.BAD_REQUEST);
    }

    const { groupId } = chatLog; // 获取该对话记录所在的对话组ID

    // 删除该对话组中所有 ID 大于等于当前 id 的对话记录
    const result = await this.chatLogEntity.update(
      { groupId, id: MoreThanOrEqual(id) },
      { isDelete: true },
    );

    if (result.affected > 0) {
      // 如果更新成功，返回成功消息
      return '删除对话记录成功！';
    } else {
      // 如果没有任何记录被更新，抛出异常
      throw new HttpException('当前页面已经没有东西可以删除了！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询单个应用的使用记录 */
  async byAppId(req: Request, body: QueryByAppIdDto) {
    const { id } = req.user;
    const { appId, page = 1, size = 10 } = body;
    const [rows, count] = await this.chatLogEntity.findAndCount({
      where: { userId: id, appId, role: 'assistant' },
      order: { id: 'DESC' },
      take: size,
      skip: (page - 1) * size,
    });
    return { rows, count };
  }

  async checkModelLimits(userId: JwtPayload, model: string) {
    const ONE_HOUR_IN_MS = 3600 * 1000;
    const oneHourAgo = new Date(Date.now() - ONE_HOUR_IN_MS);

    try {
      // 计算一小时内模型的使用次数
      const usageCount = await this.chatLogEntity.count({
        where: {
          userId: userId.id,
          model,
          createdAt: MoreThan(oneHourAgo),
        },
      });

      const adjustedUsageCount = Math.ceil(usageCount / 2);

      Logger.log(
        `用户ID: ${userId.id} 一小时内调用 ${model} 模型 ${adjustedUsageCount + 1} 次`,
        'ChatLogService',
      );

      // 获取模型的使用限制

      let modelInfo;
      if (model.startsWith('gpt-4-gizmo')) {
        modelInfo = await this.modelsService.getCurrentModelKeyInfo('gpts');
      } else {
        modelInfo = await this.modelsService.getCurrentModelKeyInfo(model);
      }
      const modelLimits = Number(modelInfo.modelLimits);

      Logger.log(`模型 ${model} 的使用次数限制为 ${modelLimits}`, 'ChatLogService');

      // 检查是否超过使用限制
      if (adjustedUsageCount > modelLimits) {
        return true;
      }
      return false;
    } catch (error) {
      Logger.error(
        `查询数据库出错 - 用户ID: ${userId.id}, 模型: ${model}, 错误信息: ${error.message}`,
        error.stack,
        'ChatLogService',
      );
    }
  }

  /**
   * 查询单条聊天记录
   * @param req 请求对象
   * @param params 查询参数，包含 chatId
   * @returns 返回格式化后的查询结果
   */
  async querySingleChat(req: Request, params: QuerySingleChatDto) {
    try {
      const { chatId } = params;

      // 参数验证
      if (!chatId) {
        return '请输入正确的聊天ID';
      }

      // 查询单条消息，将chatId转换为数字类型
      const chatLog = await this.chatLogEntity.findOne({
        where: { id: Number(chatId) },
      });

      // 消息不存在处理
      if (!chatLog) {
        Logger.warn(`未找到ID为 ${chatId} 的消息记录`, 'ChatLogService');
        return '未找到该消息';
      }

      const rawContent =
        chatLog.content || (chatLog.role === 'assistant' ? chatLog.answer : chatLog.prompt) || '';
      const rawReasoning = chatLog.reasoning_content || '';
      const sanitizedContent = this.sanitizeDisplayText(rawContent);
      const sanitizedReasoning = this.sanitizeDisplayText(rawReasoning);
      const normalizedStoredContent = String(rawContent || '').replace(/\r\n/g, '\n').trim();
      const normalizedStoredReasoning = String(rawReasoning || '').replace(/\r\n/g, '\n').trim();
      if (
        chatLog.role === 'assistant' &&
        ((sanitizedContent && sanitizedContent !== normalizedStoredContent) ||
          sanitizedReasoning !== normalizedStoredReasoning)
      ) {
        await this.updateChatLog(chatLog.id, {
          ...(sanitizedContent ? { content: sanitizedContent } : {}),
          reasoning_content: sanitizedReasoning || null,
        });
      }

      // 格式化查询结果
      const formattedResult = {
        id: chatLog.id,
        action: chatLog.action || '',
        taskData: chatLog.taskData || '',
        chatId: chatLog.id, // 保持兼容性
        content: sanitizedContent,
        reasoningText: sanitizedReasoning,
        tool_calls: chatLog.tool_calls || '',
        role: chatLog.role || 'assistant',
        status: chatLog.status || 0,
        model: chatLog.model || '',
        modelName: chatLog.modelName || '',
        modelType: chatLog.type || 1,
        imageUrl: chatLog.imageUrl || chatLog.fileInfo || '',
        fileUrl: chatLog.fileUrl || '',
        drawId: chatLog.drawId || '',
        customId: chatLog.customId || '',
        inversion: chatLog.role === 'user',
        createdAt: chatLog.createdAt,
        progress: chatLog.progress || 0,
        updatedAt: chatLog.updatedAt,
        ttsUrl: chatLog.ttsUrl || '',
        videoUrl: chatLog.videoUrl || '',
        audioUrl: chatLog.audioUrl || '',
        taskId: chatLog.taskId || '',
        promptReference: chatLog.promptReference || '',
        networkSearchResult: chatLog.networkSearchResult || '',
        fileVectorResult: chatLog.fileVectorResult || '',
        pluginParam: chatLog.pluginParam || '',
        modelAvatar: chatLog.modelAvatar || '',
      };

      // 返回成功结果
      return formattedResult;
    } catch (error) {
      // 详细记录错误信息
      Logger.error(`查询单条消息失败: ${error.message}`, error.stack, 'ChatLogService');

      // 返回错误响应
      return error.message;
    }
  }
}
