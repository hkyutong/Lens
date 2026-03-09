import axios from 'axios';
import * as FormData from 'form-data';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as pdf from 'pdf-parse';
import * as mammoth from 'mammoth';
import { Readable } from 'stream';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { formatUrl, getTokenCount } from '@/common/utils';
import { ChatLogService } from '../chatLog/chatLog.service';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ModelsService } from '../models/models.service';
import { UserService } from '../user/user.service';
import { UserBalanceService } from '../userBalance/userBalance.service';

interface AcademicChatBody {
  function?: 'chat' | 'basic' | 'plugin';
  main_input?: string;
  llm_kwargs?: Record<string, any>;
  plugin_kwargs?: Record<string, any>;
  history?: string[];
  system_prompt?: string;
  core_function?: string;
  plugin_name?: string;
  chatId?: string;
  overwriteReply?: boolean;
  replyChatId?: number;
  model?: string;
  modelName?: string;
  modelType?: number;
  modelAvatar?: string;
  prompt?: string;
  fileUrl?: string;
  appId?: number;
  options?: {
    groupId?: number;
    usingNetwork?: boolean;
    usingDeepThinking?: boolean;
    usingMcpTool?: boolean;
  };
}

interface AcademicStreamState {
  fullContent: string;
  hasStreamContent: boolean;
  tracebackMode: boolean;
  fullReasoning: string;
  stablePolishContent: string;
  fileVectorResult: string;
  networkSearchResult: string;
  promptReference: string;
  toolCalls: string;
  streamError: string;
  finishReason: string;
}

@Injectable()
export class AcademicService {
  private readonly logger = new Logger(AcademicService.name);
  private readonly academicPluginOrder = [
    '论文速读',
    'PDF 批量总结',
    'PDF 深度理解',
    'Word 批量总结',
    'Arxiv摘要',
    'Arxiv 英文摘要',
    'LaTeX 摘要',
    'LaTeX 精准翻译',
    'LaTeX 英文润色',
    'LaTeX 中文润色',
    'LaTeX 高亮纠错',
  ];
  private readonly academicFileRequiredPluginKeys = new Set(
    [
      '论文速读',
      'pdf批量总结',
      'pdf深度理解',
      'word批量总结',
      'latex摘要',
      'latex精准翻译',
      'latex英文润色',
      'latex中文润色',
      'latex高亮纠错',
      '解析整个python项目',
      '注释整个python项目',
      '解析整个matlab项目',
      '解析整个c项目头文件',
      '解析整个c项目cpphpp等',
      '解析整个go项目',
      '解析整个rust项目',
      '解析整个java项目',
      '解析整个前端项目jstscss等',
      '解析整个lua项目',
      '解析整个csharp项目',
      '解析jupyternotebook文件',
      '翻译markdown或readme',
      '批量生成函数注释',
      '解析项目源代码自定义文件类型',
    ].map(name => this.normalizePluginName(name)),
  );
  private pluginListCache: { ts: number; rows: any[] } | null = null;
  private coreFunctionCache: { ts: number; rows: any[] } | null = null;
  private arxivMetaCache = new Map<string, { title: string; summary: string; ts: number }>();

  constructor(
    private readonly userBalanceService: UserBalanceService,
    private readonly userService: UserService,
    private readonly chatLogService: ChatLogService,
    private readonly chatGroupService: ChatGroupService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly modelsService: ModelsService,
  ) {}

  private normalizeAcademicBaseUrl(url: string) {
    const normalized = String(url || '').trim();
    if (!normalized) return '';
    return normalized.replace(/\/+$/, '');
  }

  private isLocalAcademicBase(baseUrl: string) {
    try {
      const host = new URL(baseUrl).hostname.toLowerCase();
      return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0';
    } catch (_error) {
      return false;
    }
  }

  private getAcademicTimeout(baseUrl: string, preferredTimeout = 10000) {
    const timeout = Number(preferredTimeout || 10000);
    const normalizedTimeout = Math.max(Number.isFinite(timeout) ? timeout : 10000, 1000);
    if (this.isLocalAcademicBase(baseUrl)) {
      return normalizedTimeout;
    }
    // 远端也需要给文件上传/解析留足时间，避免大文件插件在 15s 内被误杀。
    const remoteCap = Number(process.env.ACADEMIC_REMOTE_TIMEOUT_CAP_MS || 180000);
    if (!Number.isFinite(remoteCap) || remoteCap <= 0) return normalizedTimeout;
    return Math.min(normalizedTimeout, Math.max(remoteCap, 1000));
  }

  private createTimeoutSignal(parentSignal: AbortSignal, timeoutMs: number) {
    const scopedController = new AbortController();
    const parentAbort = () => scopedController.abort();
    if (parentSignal?.aborted) {
      scopedController.abort();
    } else {
      parentSignal?.addEventListener?.('abort', parentAbort, { once: true });
    }
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            scopedController.abort();
          }, timeoutMs)
        : null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      parentSignal?.removeEventListener?.('abort', parentAbort);
    };
    return { signal: scopedController.signal, cleanup };
  }

  private getAcademicBaseUrls() {
    const configured = String(process.env.ACADEMIC_API_URL || '')
      .split(',')
      .map(item => String(item || '').trim())
      .filter(Boolean);
    const fallback = ['http://127.0.0.1:38000', 'http://localhost:38000'];
    const configuredUrls = configured
      .map(item => this.normalizeAcademicBaseUrl(item))
      .filter((url, index, arr) => Boolean(url) && arr.indexOf(url) === index);
    // 按配置顺序尝试，不丢弃本地地址；由配置顺序决定优先级。
    if (configuredUrls.length > 0) {
      return configuredUrls;
    }
    const merged = fallback.map(item => this.normalizeAcademicBaseUrl(item));
    return merged.filter((url, index) => Boolean(url) && merged.indexOf(url) === index);
  }

  private isModelEnabled(modelInfo: any) {
    if (!modelInfo) return false;
    if (modelInfo.status === undefined || modelInfo.status === null) return true;
    return Number(modelInfo.status) !== 0;
  }

  private normalizeAcademicModelLookup(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private async findAcademicModelInfo(preferredModel: string, preferredModelName = '') {
    const requestedModel = String(preferredModel || '').trim();
    const requestedModelName = String(preferredModelName || '').trim();

    if (requestedModel) {
      const exactByModel = await this.modelsService.getCurrentModelKeyInfo(requestedModel);
      if (exactByModel) return exactByModel;
    }

    if (!requestedModel && !requestedModelName) return null;

    const normalizedCandidates = [requestedModel, requestedModelName]
      .map(item => this.normalizeAcademicModelLookup(item))
      .filter(Boolean);
    if (!normalizedCandidates.length) return null;

    const allModelsRaw = await this.modelsService.getAllKey();
    const allModels = Array.isArray(allModelsRaw) ? allModelsRaw : [];

    return (
      allModels.find(item =>
        normalizedCandidates.includes(this.normalizeAcademicModelLookup(item?.model)),
      ) ||
      allModels.find(item =>
        normalizedCandidates.includes(this.normalizeAcademicModelLookup(item?.modelName)),
      ) ||
      null
    );
  }

  private async resolveAcademicModelInfo(preferredModel: string, preferredModelName = '') {
    const requested = String(preferredModel || '').trim();
    const requestedDisplayName = String(preferredModelName || '').trim();
    const explicitModelInfo = await this.findAcademicModelInfo(requested, requestedDisplayName);
    if (this.isModelEnabled(explicitModelInfo)) {
      return {
        requestedModel: requested,
        requestedModelName: requestedDisplayName,
        resolvedModel: String(explicitModelInfo.model || requested),
        modelInfo: explicitModelInfo,
      };
    }

    if (requested || requestedDisplayName) {
      return {
        requestedModel: requested,
        requestedModelName: requestedDisplayName,
        resolvedModel: '',
        modelInfo: null,
      };
    }

    const baseConfig = await this.modelsService.getBaseConfig();
    const baseModel = String(baseConfig?.modelInfo?.model || '').trim();
    if (baseModel) {
      const modelInfo = await this.modelsService.getCurrentModelKeyInfo(baseModel);
      if (this.isModelEnabled(modelInfo)) {
        return {
          requestedModel: requested,
          requestedModelName: requestedDisplayName,
          resolvedModel: String(modelInfo.model || baseModel),
          modelInfo,
        };
      }
    }

    const allModels = await this.modelsService.getAllKey();
    const enabledModels = (Array.isArray(allModels) ? allModels : [])
      .filter(item => this.isModelEnabled(item))
      .sort((a, b) => Number(a.modelOrder || 0) - Number(b.modelOrder || 0));
    if (enabledModels.length) {
      const fallbackModelInfo = enabledModels[0];
      return {
        requestedModel: requested,
        requestedModelName: requestedDisplayName,
        resolvedModel: String(fallbackModelInfo.model || ''),
        modelInfo: fallbackModelInfo,
      };
    }

    return null;
  }

  /**
   * 仅允许前端覆盖少量推理参数，避免客户端篡改上游模型与密钥。
   */
  private sanitizeIncomingLlmKwargs(llmKwargs?: Record<string, any>) {
    if (!llmKwargs || typeof llmKwargs !== 'object') return {};
    const allowKeys = new Set([
      'temperature',
      'top_p',
      'max_length',
      'max_tokens',
      'presence_penalty',
      'frequency_penalty',
      'stop',
      'embed_model',
    ]);
    const sanitized: Record<string, any> = {};
    Object.entries(llmKwargs).forEach(([key, value]) => {
      if (!allowKeys.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    return sanitized;
  }

  private async postAcademic(pathname: string, data: any, config: Record<string, any> = {}) {
    let lastError: any = null;
    const { timeout: preferredTimeout, ...restConfig } = config || {};
    for (const baseUrl of this.getAcademicBaseUrls()) {
      try {
        const timeout = this.getAcademicTimeout(baseUrl, Number(preferredTimeout || 10000));
        const response = await axios.post(`${baseUrl}${pathname}`, data, {
          timeout,
          validateStatus: () => true,
          ...restConfig,
          proxy: false,
        });
        if (response.status < 400) {
          return { response, baseUrl };
        }
        lastError = new Error(`academic status ${response.status}`);
        this.logger.warn(
          JSON.stringify({
            event: 'academic_post_failed',
            path: pathname,
            baseUrl,
            status: response.status,
          }),
        );
      } catch (error) {
        lastError = error;
        this.logger.warn(
          JSON.stringify({
            event: 'academic_post_error',
            path: pathname,
            baseUrl,
            message: (error as Error)?.message || 'request failed',
          }),
        );
      }
    }
    throw lastError || new Error('academic request failed');
  }

  private async getAcademic(pathname: string, config: Record<string, any> = {}) {
    let lastError: any = null;
    const { timeout: preferredTimeout, ...restConfig } = config || {};
    for (const baseUrl of this.getAcademicBaseUrls()) {
      try {
        const timeout = this.getAcademicTimeout(baseUrl, Number(preferredTimeout || 10000));
        const response = await axios.get(`${baseUrl}${pathname}`, {
          timeout,
          validateStatus: () => true,
          ...restConfig,
          proxy: false,
        });
        if (response.status < 400) {
          return { response, baseUrl };
        }
        lastError = new Error(`academic status ${response.status}`);
        this.logger.warn(
          JSON.stringify({
            event: 'academic_get_failed',
            path: pathname,
            baseUrl,
            status: response.status,
          }),
        );
      } catch (error) {
        lastError = error;
        this.logger.warn(
          JSON.stringify({
            event: 'academic_get_error',
            path: pathname,
            baseUrl,
            message: (error as Error)?.message || 'request failed',
          }),
        );
      }
    }
    throw lastError || new Error('academic request failed');
  }

  private async fetchAcademicStream(
    pathname: string,
    payload: Record<string, any>,
    signal: AbortSignal,
  ) {
    let lastStatus = 0;
    let lastBody = '';
    let lastError: any = null;
    for (const baseUrl of this.getAcademicBaseUrls()) {
      try {
        const scopedTimeout = this.isLocalAcademicBase(baseUrl)
          ? Number(process.env.ACADEMIC_STREAM_FETCH_TIMEOUT_MS || 1800000)
          : Number(process.env.ACADEMIC_STREAM_REMOTE_TIMEOUT_MS || 45000);
        const scoped = this.createTimeoutSignal(signal, scopedTimeout);
        const response = await (async () => {
          try {
            return await fetch(`${baseUrl}${pathname}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: scoped.signal,
            });
          } finally {
            scoped.cleanup();
          }
        })();
        if (response.status < 400) {
          return { response, baseUrl };
        }
        lastStatus = response.status;
        try {
          lastBody = (await response.text()).slice(0, 800);
        } catch (_err) {
          lastBody = '';
        }
        this.logger.warn(
          JSON.stringify({
            event: 'academic_fetch_failed',
            path: pathname,
            baseUrl,
            status: response.status,
            body: lastBody,
          }),
        );
      } catch (error) {
        if ((error as any)?.name === 'AbortError' && signal?.aborted) {
          throw error;
        }
        lastError = error;
        this.logger.warn(
          JSON.stringify({
            event: 'academic_fetch_error',
            path: pathname,
            baseUrl,
            message: (error as Error)?.message || 'fetch failed',
          }),
        );
      }
    }
    if (lastStatus > 0) {
      throw new HttpException(`学术服务异常(${lastStatus})`, HttpStatus.BAD_GATEWAY);
    }
    throw lastError || new Error('academic request failed');
  }

  private async getAcademicPluginRows() {
    const now = Date.now();
    if (this.pluginListCache && now - this.pluginListCache.ts < 60_000) {
      return this.pluginListCache.rows;
    }
    try {
      const { response: res } = await this.postAcademic('/academic/plugin-list', {});
      const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];
      this.pluginListCache = { ts: now, rows };
      return rows;
    } catch (_error) {
      return this.pluginListCache?.rows || [];
    }
  }

  private async getAcademicCoreRows() {
    const now = Date.now();
    if (this.coreFunctionCache && now - this.coreFunctionCache.ts < 60_000) {
      return this.coreFunctionCache.rows;
    }
    try {
      const { response: res } = await this.postAcademic('/academic/core-function-list', {});
      const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];
      this.coreFunctionCache = { ts: now, rows };
      return rows;
    } catch (_error) {
      return this.coreFunctionCache?.rows || [];
    }
  }

  private async resolvePluginName(requestedName?: string) {
    const name = String(requestedName || '').trim();
    if (!name) return '';
    const rows = await this.getAcademicPluginRows();
    const exact = rows.find(
      row =>
        String(row?.displayName || '').trim() === name || String(row?.name || '').trim() === name,
    );
    if (exact?.name) return exact.name;
    const builtinMap: Record<string, string> = {
      论文速读: '速读论文',
      'PDF 批量总结': '批量总结PDF文档',
      'PDF 深度理解': '理解PDF文档内容 （模仿ChatPDF）',
      'Word 批量总结': '批量总结Word文档',
      Arxiv摘要: '一键下载arxiv论文并翻译摘要（先在input输入编号，如1812.10695）',
      'Arxiv 英文摘要': '📚Arxiv论文精细翻译（输入arxivID）[需Latex]',
      Arxiv英文摘要: '📚Arxiv论文精细翻译（输入arxivID）[需Latex]',
      'Arxiv 精准翻译': '📚Arxiv论文精细翻译（输入arxivID）[需Latex]',
      'LaTeX 摘要': '读Tex论文写摘要',
      'LaTeX 精准翻译': '📚本地Latex论文精细翻译（上传Latex项目）[需Latex]',
      'LaTeX 英文润色': '英文Latex项目全文润色（输入路径或上传压缩包）',
      'LaTeX 中文润色': '中文Latex项目全文润色（输入路径或上传压缩包）',
      'LaTeX 高亮纠错': 'Latex英文纠错+高亮修正位置 [需Latex]',
      Arxiv精准翻译: '📚Arxiv论文精细翻译（输入arxivID）[需Latex]',
      LaTeX摘要: '读Tex论文写摘要',
      LaTeX精准翻译: '📚本地Latex论文精细翻译（上传Latex项目）[需Latex]',
      LaTeX英文润色: '英文Latex项目全文润色（输入路径或上传压缩包）',
      LaTeX中文润色: '中文Latex项目全文润色（输入路径或上传压缩包）',
      LaTeX高亮纠错: 'Latex英文纠错+高亮修正位置 [需Latex]',
    };
    if (builtinMap[name]) return builtinMap[name];
    return name;
  }

  private async resolveCoreFunction(requestedName?: string) {
    const name = String(requestedName || '').trim();
    if (!name) return '';
    const builtinMap: Record<string, string> = {
      学术型代码解释: '解释代码',
      中英互译: '学术中英互译',
    };
    if (builtinMap[name]) return builtinMap[name];
    const rows = await this.getAcademicCoreRows();
    const exact = rows.find(
      row =>
        String(row?.displayName || '').trim() === name || String(row?.name || '').trim() === name,
    );
    if (exact?.name) return exact.name;
    return name;
  }
  private normalizePluginKwargs(pluginName: string, kwargs: Record<string, any>) {
    const normalized = { ...(kwargs || {}) };
    const normalizeText = (value: any) => String(value || '').trim();
    const normalizedPluginName = this.normalizePluginName(pluginName || '');
    if (typeof normalized.user_prompt === 'string') {
      normalized.user_prompt = normalizeText(normalized.user_prompt);
    }
    if (typeof normalized.advanced_arg === 'string') {
      normalized.advanced_arg = normalizeText(normalized.advanced_arg);
    }
    if (!normalized.advanced_arg && typeof normalized.user_prompt === 'string') {
      normalized.advanced_arg = normalized.user_prompt;
    }
    if (!normalized.user_prompt && typeof normalized.advanced_arg === 'string') {
      normalized.user_prompt = normalized.advanced_arg;
    }
    if (
      /注释(?:整个)?python项目|批量生成函数注释/.test(normalizedPluginName) &&
      normalized.use_chinese === undefined
    ) {
      normalized.use_chinese = true;
    }
    if (/历史上的今天/.test(normalizedPluginName) && normalized.num_day === undefined) {
      normalized.num_day = 1;
    }
    if (/解析项目源代码/.test(normalizedPluginName)) {
      if (normalized.advanced_arg === undefined || normalized.advanced_arg === null) {
        normalized.advanced_arg = '';
      }
      if (normalized.user_prompt === undefined || normalized.user_prompt === null) {
        normalized.user_prompt = normalized.advanced_arg;
      }
    }
    return normalized;
  }

  private getPluginDisplayName(item: any) {
    if (!item || typeof item !== 'object') return '';
    return String(item.displayName || item.name || '').trim();
  }

  private getPluginSortKey(name: string) {
    const normalized = this.normalizePluginName(name);
    if (
      normalized.includes('arxiv') &&
      (normalized.includes('摘要') || normalized.includes('下载'))
    ) {
      return this.normalizePluginName('Arxiv摘要');
    }
    return normalized;
  }

  private normalizePluginName(name: string) {
    return String(name || '')
      .replace(/\s+/g, '')
      .replace(/[\-_/\\]+/g, '')
      .replace(/[（）()【】\[\]<>《》:：,.，。'"`]/g, '')
      .replace(/latex/gi, 'latex')
      .toLowerCase();
  }

  private isArxivPlugin(normalizedPluginName: string) {
    return String(normalizedPluginName || '').includes('arxiv');
  }

  private isFileRequiredPlugin(normalizedPluginName: string) {
    if (!normalizedPluginName) return false;
    if (this.isArxivPlugin(normalizedPluginName)) return false;
    if (this.academicFileRequiredPluginKeys.has(normalizedPluginName)) return true;
    // 兜底：兼容历史插件名与展示名差异，按关键词判定文件型插件。
    const fallbackPatterns = [
      /(?:pdf|word|latex|tex)/i,
      /(?:jupyternotebook|readme|markdown)/i,
      /(?:解析(?:整个|一个)?(?:python|matlab|c|go|rust|java|前端|lua|csharp)|解析项目源代码)/i,
      /(?:注释(?:整个)?python项目|批量生成函数注释)/i,
      /(?:批量总结pdf文档|理解pdf文档内容|批量总结word文档)/i,
    ];
    return fallbackPatterns.some(pattern => pattern.test(normalizedPluginName));
  }

  private isLongRunningAcademicPlugin(normalizedPluginName: string) {
    if (!normalizedPluginName) return false;
    if (this.isArxivPlugin(normalizedPluginName)) return true;
    if (this.isFileRequiredPlugin(normalizedPluginName)) return true;
    const longRunningPatterns = [
      /latex/i,
      /pdf/i,
      /word/i,
      /解析/,
      /注释/,
      /函数注释/,
      /notebook/i,
      /markdown|readme/i,
    ];
    return longRunningPatterns.some(pattern => pattern.test(normalizedPluginName));
  }

  private applyAcademicPluginOrder(rows: any[]) {
    if (!Array.isArray(rows)) return rows;
    const orderMap = new Map(
      this.academicPluginOrder.map((name, index) => [this.normalizePluginName(name), index]),
    );
    return rows
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const nameA = this.getPluginDisplayName(a.item);
        const nameB = this.getPluginDisplayName(b.item);
        const idxA = orderMap.has(this.getPluginSortKey(nameA))
          ? orderMap.get(this.getPluginSortKey(nameA))!
          : 9999;
        const idxB = orderMap.has(this.getPluginSortKey(nameB))
          ? orderMap.get(this.getPluginSortKey(nameB))!
          : 9999;
        if (idxA !== idxB) return idxA - idxB;
        if (idxA === 9999 && idxB === 9999) return a.index - b.index;
        return a.index - b.index;
      })
      .map(entry => entry.item);
  }
  private normalizeDisplayContent(text: string) {
    return String(text || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n');
  }

  private extractStablePolishReasonTable(text: string) {
    const source = this.repairBrokenMarkdownTables(
      this.normalizeDisplayContent(this.sanitizeAcademicOutput(text || '')),
    );
    if (!source) return '';

    const lines = source.split('\n');
    const headerPattern =
      /^\s*\|\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|\s*$/;

    let bestTable = '';

    for (let i = 0; i < lines.length; i += 1) {
      if (!headerPattern.test(String(lines[i] || '').trim())) continue;

      const tableLines: string[] = [];
      const maybeTitle = String(lines[i - 1] || '').trim();
      if (/^修改对照表[:：]?$/.test(maybeTitle)) {
        tableLines.push(maybeTitle);
      }

      tableLines.push(String(lines[i] || '').trim());

      let separatorConsumed = false;
      let rowCount = 0;

      for (let j = i + 1; j < lines.length; j += 1) {
        const current = String(lines[j] || '');
        const trimmed = current.trim();

        if (!trimmed) {
          if (separatorConsumed && rowCount > 0) break;
          continue;
        }

        if (!separatorConsumed) {
          if (this.isAcademicMarkdownTableSeparator(trimmed)) {
            tableLines.push(trimmed);
            separatorConsumed = true;
            continue;
          }
          break;
        }

        if (!/^\s*\|/.test(trimmed)) break;
        tableLines.push(trimmed);
        rowCount += 1;
      }

      if (separatorConsumed && rowCount > 0) {
        const candidate = tableLines.join('\n').trim();
        if (candidate.length > bestTable.length) {
          bestTable = candidate;
        }
      }
    }

    return bestTable;
  }

  private splitConcatenatedJsonObjects(value: string): string[] {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const segments: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < raw.length; i += 1) {
      const char = raw[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }
      if (char === '}') {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          segments.push(raw.slice(start, i + 1));
          start = -1;
        }
      }
    }
    return segments;
  }

  private pickBestAcademicOutput(state: AcademicStreamState) {
    const stablePolishText = this.extractStablePolishReasonTable(
      state.stablePolishContent || state.fullContent || '',
    );
    if (stablePolishText) {
      return stablePolishText;
    }

    const contentText = this.normalizeDisplayContent(
      this.sanitizeAcademicOutput(state.fullContent || ''),
    );
    if (contentText) return contentText;
    const reasoningText = this.normalizeDisplayContent(
      this.sanitizeAcademicOutput(state.fullReasoning || ''),
    );
    if (reasoningText) return reasoningText;
    return contentText || reasoningText || '';
  }

  private preserveStablePolishDisplay(
    state: AcademicStreamState,
    candidate: string,
    fallbackSource = '',
  ) {
    const stablePolishText = this.extractStablePolishReasonTable(
      state.stablePolishContent || candidate || fallbackSource || state.fullContent || '',
    );
    if (stablePolishText) {
      state.stablePolishContent = stablePolishText;
      return stablePolishText;
    }
    return candidate;
  }

  private extractTextFromSerializedContent(value: string) {
    const raw = String(value || '');
    if (!raw.length) return '';
    const trimmed = raw.trim();
    if (!trimmed) return raw;

    const hasPayloadMarker =
      this.hasSerializedPayloadMarkers(trimmed) ||
      this.looksLikeAcademicJsonFragment(trimmed) ||
      /}\s*{/.test(trimmed);
    if (!hasPayloadMarker) return raw;

    const pullText = (node: any): string => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) {
        return this.joinAcademicTextSegments(node.map(item => pullText(item)));
      }
      if (typeof node !== 'object') return '';

      if (node.delta) {
        const fromDelta =
          pullText(node.delta.content) ||
          pullText(node.delta.reasoning_content) ||
          pullText(node.delta.text);
        if (fromDelta) return fromDelta;
      }
      if (Array.isArray(node.choices)) {
        const fromChoices = this.joinAcademicTextSegments(
          node.choices.map(
            (choice: any) =>
              pullText(choice?.delta?.content) ||
              pullText(choice?.message?.content) ||
              pullText(choice?.content) ||
              pullText(choice?.text),
          ),
        );
        if (fromChoices) return fromChoices;
      }
      if (Array.isArray(node.output)) {
        const fromOutput = this.joinAcademicTextSegments(
          node.output.map((item: any) => pullText(item?.content) || pullText(item)),
        );
        if (fromOutput) return fromOutput;
      }
      if (node.content !== undefined) {
        const fromContent = pullText(node.content);
        if (fromContent) return fromContent;
      }
      if (typeof node.text === 'string') return node.text;
      if (typeof node.message === 'string') return node.message;
      if (typeof node.response === 'string') return node.response;
      if (typeof node.finalContent === 'string') return node.finalContent;
      if (typeof node.full_content === 'string') return node.full_content;
      if (typeof node.reasoning_content === 'string') return node.reasoning_content;
      if (typeof node.full_reasoning_content === 'string') return node.full_reasoning_content;
      return '';
    };

    const finalize = (rawText: string) => this.finalizeExtractedAcademicText(rawText);

    const tryParseAndPull = (fragment: string) => {
      try {
        const parsed = JSON.parse(fragment);
        const extracted = finalize(this.cleanupSerializedPayloadResidue(pullText(parsed)));
        return extracted;
      } catch (_error) {
        return '';
      }
    };

    const direct = tryParseAndPull(trimmed);
    if (direct) return direct;

    const segments = this.splitConcatenatedJsonObjects(trimmed);
    if (!segments.length) {
      const loose = this.extractLooseSerializedText(trimmed);
      return loose ? finalize(loose) : '';
    }

    const recoveredParts = segments.map(segment => tryParseAndPull(segment)).filter(Boolean);
    if (!recoveredParts.length) {
      const loose = this.extractLooseSerializedText(trimmed);
      return loose ? finalize(loose) : '';
    }
    return this.joinAcademicTextSegments(recoveredParts);
  }

  private extractLooseSerializedText(value: string) {
    const source = String(value || '');
    if (!source) return '';
    const bucket: string[] = [];
    const pushDecoded = (raw: string) => {
      const decoded = String(raw || '')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\r/g, '\r');
      if (decoded.trim()) bucket.push(decoded);
    };

    const textPattern = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    const contentPattern = /"content"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    const messagePattern = /"(?:message|response|finalContent)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let matched: RegExpExecArray | null = null;
    while ((matched = textPattern.exec(source)) !== null) {
      pushDecoded(matched[1] || '');
    }
    while ((matched = contentPattern.exec(source)) !== null) {
      pushDecoded(matched[1] || '');
    }
    while ((matched = messagePattern.exec(source)) !== null) {
      pushDecoded(matched[1] || '');
    }
    return this.joinAcademicTextSegments(this.dedupeAcademicTextSegments(bucket));
  }

  private finalizeExtractedAcademicText(value: string) {
    const source = String(value || '');
    if (!source.trim()) return '';
    let normalized = this.stripInlineSerializedPayloadResidue(
      this.cleanupSerializedPayloadResidue(source),
    );
    normalized = this.stripAcademicInlineBoilerplate(normalized);
    normalized = this.sanitizeAcademicDelta(normalized);
    if (!normalized.trim()) return '';
    if (
      this.hasSerializedPayloadMarkers(normalized) ||
      this.isLikelyAcademicJsonResidue(normalized)
    )
      return '';
    if (this.isAcademicTraceNoise(normalized)) return '';
    if (this.isAcademicHeartbeatText(normalized)) return '';
    return normalized;
  }

  private getSafeAcademicErrorMessage(value: string) {
    const normalized = this.normalizeDisplayContent(
      this.sanitizeAcademicOutput(this.extractTextFromSerializedContent(String(value || ''))),
    );
    if (!normalized) return '';
    if (/(incorrect api key|invalid_api_key|api key provided)/i.test(normalized)) {
      return '学术服务 API Key 无效，请联系管理员更新学术服务配置。';
    }
    if (/(request timeout|network error|检查代理服务器|proxy)/i.test(normalized)) {
      return '学术服务网络异常，请检查学术服务代理配置或云端连通性。';
    }
    if (/^(?:academic\s+error|error|null|undefined)$/i.test(normalized)) return '';
    if (/^(?:学术服务异常|服务器内部错误|internal server error)$/i.test(normalized)) return '';
    return normalized;
  }

  private async collectAcademicStreamState(
    payload: Record<string, any>,
    signal: AbortSignal,
  ): Promise<AcademicStreamState> {
    const state: AcademicStreamState = {
      fullContent: '',
      hasStreamContent: false,
      tracebackMode: false,
      fullReasoning: '',
      stablePolishContent: '',
      fileVectorResult: '',
      networkSearchResult: '',
      promptReference: '',
      toolCalls: '',
      streamError: '',
      finishReason: '',
    };

    const { response } = await this.fetchAcademicStream('/academic/chat-process', payload, signal);
    if (!response.body) {
      throw new HttpException('学术服务无响应数据', HttpStatus.BAD_GATEWAY);
    }

    const upstreamBody = Readable.fromWeb(response.body as any);
    let buffer = '';
    let pendingSerializedLine = '';

    for await (const chunk of upstreamBody as any) {
      buffer += chunk.toString('utf-8');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const rawLine = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        const mergedRawLine = pendingSerializedLine
          ? `${pendingSerializedLine}\n${rawLine}`
          : rawLine;
        const line = this.normalizeAcademicStreamLine(mergedRawLine);
        if (line) {
          const segments = this.splitConcatenatedJsonObjects(line);
          if (this.looksLikeAcademicJsonFragment(line) && !segments.length) {
            pendingSerializedLine = line;
            index = buffer.indexOf('\n');
            continue;
          }
          pendingSerializedLine = '';
          const lines =
            segments.length > 1 || (segments.length === 1 && segments[0] !== line)
              ? segments
              : [line];
          for (const item of lines) {
            const safeLine = this.sanitizeAcademicStreamLine(item);
            if (!safeLine) continue;
            this.consumeAcademicLine(safeLine, state, true);
          }
        }
        index = buffer.indexOf('\n');
      }
    }

    const normalizedBufferTail = buffer.replace(/\r+$/, '');
    const mergedTailRaw = `${pendingSerializedLine}${
      pendingSerializedLine && normalizedBufferTail ? '\n' : ''
    }${normalizedBufferTail}`;
    if (mergedTailRaw.trim()) {
      const tail = this.normalizeAcademicStreamLine(mergedTailRaw);
      if (tail) {
        const segments = this.splitConcatenatedJsonObjects(tail);
        const lines =
          segments.length > 1 || (segments.length === 1 && segments[0] !== tail)
            ? segments
            : [tail];
        for (const item of lines) {
          const safeTail = this.sanitizeAcademicStreamLine(item);
          if (!safeTail) continue;
          this.consumeAcademicLine(safeTail, state, false);
        }
      }
    }

    return state;
  }

  async coreFunctionList(req: Request) {
    const requestId = (req as any).requestId;
    const userId = req.user?.id;
    try {
      const { response: res } = await this.postAcademic('/academic/core-function-list', {});
      const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];
      const renameMap: Record<string, string> = {
        [this.normalizePluginName('解释代码')]: '学术型代码解释',
        [this.normalizePluginName('学术中英互译')]: '中英互译',
      };
      const sanitizeText = (value: string) =>
        String(value || '')
          .replace(/\s*[（(][^()（）]*插件Demo[^()（）]*[）)]/g, '')
          .replace(/\s*[（(][^()（）]*面向开发者[^()（）]*[）)]/g, '')
          .replace(
            /\s*(?:\|\s*)?(不需要输入参数[^|]*|需要输入参数[^|]*|输入参数为[^|]*|输入参数是[^|]*|输入参数[^|]*|参数为[^|]*)/g,
            '',
          )
          .replace(/\s*[|｜]\s*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      const normalizedRows = rows.map((item: any) => {
        const row = { ...(item || {}) };
        const sourceName = String(row?.displayName || row?.name || '').trim();
        const normalizedName = this.normalizePluginName(sourceName);
        if (renameMap[normalizedName]) {
          row.displayName = renameMap[normalizedName];
        }
        Object.keys(row).forEach(key => {
          if (typeof row[key] === 'string') {
            row[key] = sanitizeText(row[key]);
          }
        });
        return row;
      });
      const coreOrder = [
        '中文润色',
        '英文润色',
        '绘制脑图',
        '中英互译',
        '参考文献转Bib',
        '学术型代码解释',
      ];
      const orderMap = new Map(
        coreOrder.map((name, index) => [this.normalizePluginName(name), index]),
      );
      const orderedRows = normalizedRows
        .map((item: any, index: number) => ({ item, index }))
        .sort((a, b) => {
          const nameA = this.normalizePluginName(a.item?.displayName || a.item?.name || '');
          const nameB = this.normalizePluginName(b.item?.displayName || b.item?.name || '');
          const idxA = orderMap.has(nameA) ? orderMap.get(nameA)! : 9999;
          const idxB = orderMap.has(nameB) ? orderMap.get(nameB)! : 9999;
          if (idxA !== idxB) return idxA - idxB;
          return a.index - b.index;
        })
        .map(entry => entry.item);
      return {
        ...(res?.data || {}),
        rows: orderedRows,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.warn(
          JSON.stringify({
            event: 'academic_core_functions_fallback',
            requestId,
            userId,
            reason: error.message,
          }),
        );
      }
      const err = error as Error;
      this.logger.error(
        JSON.stringify({
          event: 'academic_core_functions_error',
          requestId,
          userId,
          message: err?.message,
        }),
        err?.stack,
      );
      return {
        rows: [
          { name: '中文润色', description: '中文学术表达润色与结构优化' },
          { name: '英文润色', description: '英文论文润色与语法优化' },
          { name: '绘制脑图', description: '将文本总结为结构化脑图' },
          { name: '中英互译', description: '学术场景中英文互译' },
          { name: '参考文献转Bib', description: '将参考文献转换为BibTeX' },
          { name: '学术型代码解释', description: '解释代码含义与逻辑' },
        ],
        source: 'fallback',
      };
    }
  }

  private filterPlugins(data: any) {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const blocked = [
      '虚空终端',
      '批量文件问答',
      '批量文件询问',
      '查互联网后回答',
      '历史上的今天',
      '动态代码解释器（CodeInterpreter）',
      '[多线程Demo]解析此项目本身（源码自译解）',
      '删除所有本地对话历史记录',
      '清除所有缓存文件',
      '数学动画生成（Manim）',
      '批量总结音视频',
      '实时语音对话',
      '交互功能模板Demo函数',
      '多媒体智能体',
    ];
    const sanitizeText = (value: string) => {
      let text = value;
      text = text.replace(/\s*[（(][^()（）]*插件Demo[^()（）]*[）)]/g, '');
      text = text.replace(/\s*[（(][^()（）]*面向开发者[^()（）]*[）)]/g, '');
      text = text.replace(
        /(?:函数)?插件(?:作者|贡献者)\s*[:：]?\s*(?:[A-Za-z0-9_.-]+(?:\s*[,，、/&]\s*[A-Za-z0-9_.-]+)*)[，,;；。\s]*/gi,
        '',
      );
      text = text.replace(/(?:函数)?插件(?:作者|贡献者)\s*\[[^\]]*][，,;；。\s]*/gi, '');
      text = text.replace(/\s*[|｜]\s*/g, ' | ');
      text = text.replace(
        /\s*(?:\|\s*)?(不需要输入参数[^|]*|需要输入参数[^|]*|输入参数为[^|]*|输入参数是[^|]*|输入参数[^|]*|参数为[^|]*)/g,
        '',
      );
      text = text.replace(/\s*\|\s*/g, ' ');
      text = text.replace(/\s{2,}/g, ' ');
      return text.trim();
    };
    const renameMap: Record<string, string> = {
      [this.normalizePluginName('解释代码')]: '学术型代码解释',
      [this.normalizePluginName('学术中英互译')]: '中英互译',
      [this.normalizePluginName('注释Python项目')]: '注释整个Python项目',
      [this.normalizePluginName('解析项目源代码（手动指定和筛选源代码文件类型）')]:
        '解析项目源代码（自定义文件类型）',
      [this.normalizePluginName('PDF批量总结')]: 'PDF 批量总结',
      [this.normalizePluginName('PDF深度理解')]: 'PDF 深度理解',
      [this.normalizePluginName('Word批量总结')]: 'Word 批量总结',
      [this.normalizePluginName('Arxiv摘要')]: 'Arxiv摘要',
      [this.normalizePluginName('Arxiv论文下载')]: 'Arxiv摘要',
      [this.normalizePluginName('Arxiv精准翻译')]: 'Arxiv 英文摘要',
      [this.normalizePluginName('Arxiv英文摘要')]: 'Arxiv 英文摘要',
      [this.normalizePluginName('LaTeX摘要')]: 'LaTeX 摘要',
      [this.normalizePluginName('LaTeX精准翻译')]: 'LaTeX 精准翻译',
      [this.normalizePluginName('LaTeX英文润色')]: 'LaTeX 英文润色',
      [this.normalizePluginName('LaTeX中文润色')]: 'LaTeX 中文润色',
      [this.normalizePluginName('LaTeX高亮纠错')]: 'LaTeX 高亮纠错',
      [this.normalizePluginName('论文速读')]: '论文速读',
      [this.normalizePluginName('一键下载arxiv论文并翻译摘要（先在input输入编号，如1812.10695）')]:
        'Arxiv摘要',
      [this.normalizePluginName('解析整个C++项目（.cpp/.hpp/.c/.h）')]:
        '解析整个C++项目（.cpp/.hpp等）',
      [this.normalizePluginName('上传一系列python源文件(或者压缩包), 为这些代码添加docstring')]:
        '上传python源文件(或压缩包), 为这些代码添加docstring',
      [this.normalizePluginName('解析一个C++项目的所有源文件（.cpp/.hpp/.c/.h）')]:
        '解析一个C++项目的所有源文件',
      [this.normalizePluginName('解析Jupyter Notebook文件若输入0，则不解析notebook中的Markdown块')]:
        '若输入0，则不解析notebook中的Markdown',
      [this.normalizePluginName('将Markdown或README翻译为中文')]: '翻译Markdown或README',
    };
    const descriptionMap: Record<string, string> = {
      [this.normalizePluginName('解析项目源代码（自定义文件类型）')]:
        '手动指定源代码文件类型。自定义指令用,隔开, *代表通配符, 加^代表不匹配; 空代表全部匹配。例如: "*.c, ^*.cpp, .toml"',
      [this.normalizePluginName('Arxiv摘要')]:
        '读取并摘要Arxiv论文，可供下载（先输入编号，如1812.10695）',
      [this.normalizePluginName('Arxiv论文下载')]:
        '读取并摘要Arxiv论文，可供下载（先输入编号，如1812.10695）',
      [this.normalizePluginName('读取并摘要Arxiv论文，可供下载（先输入编号，如1812.10695）')]:
        '读取并摘要Arxiv论文，可供下载（先输入编号，如1812.10695）',
      [this.normalizePluginName('Arxiv精准翻译')]:
        "可自定义翻译要求, 解决部分词汇翻译不准确的问题。 例如当单词'Chair'翻译不准确时, 打开高级设置 - 自定义指令：请把单词'Chair'翻译为'系主任'",
      [this.normalizePluginName('Arxiv英文摘要')]:
        "可自定义翻译要求, 解决部分词汇翻译不准确的问题。 例如当单词'Chair'翻译不准确时, 打开高级设置 - 自定义指令：请把单词'Chair'翻译为'系主任'",
    };
    const argsReminderMap: Record<string, string> = {
      [this.normalizePluginName('解析项目源代码（自定义文件类型）')]:
        '手动指定源代码文件类型。自定义指令用,隔开, *代表通配符, 加^代表不匹配; 空代表全部匹配。例如: "*.c, ^*.cpp, .toml"',
      [this.normalizePluginName('Arxiv精准翻译')]:
        "可自定义翻译要求, 解决部分词汇翻译不准确的问题。 例如当单词'Chair'翻译不准确时, 打开高级设置 - 自定义指令：请把单词'Chair'翻译为'系主任'",
      [this.normalizePluginName('Arxiv英文摘要')]:
        "可自定义翻译要求, 解决部分词汇翻译不准确的问题。 例如当单词'Chair'翻译不准确时, 打开高级设置 - 自定义指令：请把单词'Chair'翻译为'系主任'",
      [this.normalizePluginName('LaTeX精准翻译')]:
        "可自定义翻译要求, 解决部分词汇翻译不准确的问题。 例如当单词'Chair'翻译不准确时, 打开高级设置 - 自定义指令：请把单词'Chair'翻译为'系主任'",
    };
    const sanitizeItem = (item: any) => {
      if (!item || typeof item !== 'object') return item;
      const result: any = { ...item };
      if (typeof result.name === 'string' || typeof result.displayName === 'string') {
        const sourceName =
          typeof result.name === 'string' && result.name
            ? result.name
            : typeof result.displayName === 'string'
            ? result.displayName
            : '';
        const normalizedName = this.normalizePluginName(sourceName);
        if (renameMap[normalizedName]) {
          result.displayName = renameMap[normalizedName];
        } else if (normalizedName.includes('注释python项目')) {
          result.displayName = '注释整个Python项目';
        } else if (
          normalizedName.includes('解析项目源代码') &&
          (normalizedName.includes('手动指定') || normalizedName.includes('筛选'))
        ) {
          result.displayName = '解析项目源代码（自定义文件类型）';
        }
        const normalizedAfterRename = this.normalizePluginName(
          result.displayName || result.name || '',
        );
        if (descriptionMap[normalizedAfterRename]) {
          result.description = descriptionMap[normalizedAfterRename];
          result.info = descriptionMap[normalizedAfterRename];
        }
        if (argsReminderMap[normalizedAfterRename]) {
          result.argsReminder = argsReminderMap[normalizedAfterRename];
        }
      }
      Object.keys(result).forEach(key => {
        if (typeof result[key] === 'string') {
          result[key] = sanitizeText(result[key]);
        }
      });
      return result;
    };
    const filtered = rows
      .filter((item: any) => {
        const name = String(item?.name || '');
        const displayName = String(item?.displayName || '');
        const info = String(item?.info || '');
        const description = String(item?.description || '');
        const haystack = `${name} ${displayName} ${info} ${description}`;
        if (!name) return false;
        if (name.includes('中译英') || displayName.includes('中译英')) return false;
        return !blocked.some(block => haystack.includes(block));
      })
      .map(sanitizeItem);
    const seenPluginNames = new Set<string>();
    const deduped = filtered.filter((item: any) => {
      const key = this.normalizePluginName(item?.displayName || item?.name || '');
      if (!key) return true;
      if (seenPluginNames.has(key)) return false;
      seenPluginNames.add(key);
      return true;
    });
    const ordered = this.applyAcademicPluginOrder(deduped);
    return { ...data, rows: ordered };
  }

  async pluginList(req: Request) {
    const requestId = (req as any).requestId;
    const userId = req.user?.id;
    try {
      const { response: res } = await this.postAcademic('/academic/plugin-list', {});
      return this.filterPlugins(res.data);
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.warn(
          JSON.stringify({
            event: 'academic_plugin_list_fallback',
            requestId,
            userId,
            reason: error.message,
          }),
        );
      }
      const err = error as Error;
      this.logger.error(
        JSON.stringify({
          event: 'academic_plugin_list_error',
          requestId,
          userId,
          message: err?.message,
        }),
        err?.stack,
      );
      const fallback = this.filterPlugins({ rows: [], source: 'fallback' });
      if (Array.isArray(fallback?.rows)) {
        fallback.rows = this.applyAcademicPluginOrder(fallback.rows);
      }
      return fallback;
    }
  }

  private getAcademicDownloadFileName(value: string) {
    const source = String(value || '').trim();
    if (!source) return '';
    const base = source
      .replace(/[?#].*$/, '')
      .split(/[\\/]/)
      .pop();
    if (!base) return '';
    try {
      return decodeURIComponent(base);
    } catch (_error) {
      return base;
    }
  }

  private extractAcademicDownloadPath(value: any): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') {
      const raw = String(value || '').trim();
      if (!raw) return '';
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch (_error) {}
      if (/^[\[{]/.test(decoded)) {
        try {
          return this.extractAcademicDownloadPath(JSON.parse(decoded));
        } catch (_error) {
          return decoded;
        }
      }
      return decoded;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const pathValue = this.extractAcademicDownloadPath(item);
        if (pathValue) return pathValue;
      }
      return '';
    }
    if (typeof value === 'object') {
      const pathKeys = [
        'path',
        'file_path',
        'filePath',
        'file',
        'url',
        'download_path',
        'downloadPath',
      ];
      for (const key of pathKeys) {
        const candidate = this.extractAcademicDownloadPath((value as Record<string, any>)[key]);
        if (candidate) return candidate;
      }
      const files = (value as Record<string, any>).files;
      if (Array.isArray(files)) {
        return this.extractAcademicDownloadPath(files);
      }
    }
    return '';
  }

  private isLikelyAcademicDownloadPath(value: string) {
    const source = String(value || '').trim();
    if (!source) return false;
    if (/^https?:\/\//i.test(source)) return true;
    if (/^[\[{]/.test(source)) return false;
    if (/[{}[\]]/.test(source)) return false;
    if (/^[_-]*files[_-]*/i.test(source)) return false;
    if (/^[a-zA-Z]:[\\/]/.test(source)) return true;
    if (source.startsWith('/')) return true;
    if (
      /^(?:private_upload|gpt_log|downloadzone|public\/file|file\/dev\/userFiles|academic-4\.0)\//i.test(
        source,
      )
    ) {
      return true;
    }
    return /[\\/]/.test(source);
  }

  async proxyFile(pathValue: string, res: Response) {
    const resolvedPath = this.extractAcademicDownloadPath(pathValue);
    if (!resolvedPath || !this.isLikelyAcademicDownloadPath(resolvedPath)) {
      throw new HttpException('下载文件参数无效，请重新生成后再试', HttpStatus.BAD_REQUEST);
    }
    try {
      const { response } = await this.getAcademic('/academic/file', {
        responseType: 'stream',
        params: { path: resolvedPath },
      });
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const contentDisposition = response.headers['content-disposition'];
      res.setHeader('Content-Type', contentType);
      if (contentDisposition) {
        res.setHeader('Content-Disposition', contentDisposition);
      } else {
        const fallbackName = this.getAcademicDownloadFileName(resolvedPath);
        if (fallbackName) {
          res.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(fallbackName)}`,
          );
        }
      }
      response.data.on('error', () => {
        if (!res.headersSent) {
          res.status(HttpStatus.BAD_GATEWAY).end('下载流中断，请稍后重试');
        } else {
          res.end();
        }
      });
      response.data.pipe(res);
    } catch (error) {
      const message = String((error as Error)?.message || '');
      if (/academic status 403/i.test(message)) {
        throw new HttpException('下载文件已失效或无权限访问', HttpStatus.FORBIDDEN);
      }
      if (/academic status 404/i.test(message)) {
        throw new HttpException('下载文件不存在或已过期，请重新生成', HttpStatus.NOT_FOUND);
      }
      if (/academic status 400/i.test(message)) {
        throw new HttpException('下载文件参数无效，请重新生成后再试', HttpStatus.BAD_REQUEST);
      }
      this.logger.warn(
        JSON.stringify({
          event: 'academic_file_proxy_failed',
          message,
        }),
      );
      throw new HttpException('下载服务异常，请稍后重试', HttpStatus.BAD_GATEWAY);
    }
  }

  async academicChatProcess(body: AcademicChatBody, req: Request, res: Response) {
    const requestId = (req as any).requestId;
    const userId = req.user?.id;
    const startTime = Date.now();

    await this.userBalanceService.checkUserCertification(userId);
    await this.userService.checkUserStatus(req.user);

    const openaiBaseModelConfig = await this.globalConfigService.getConfigs(['openaiBaseModel']);
    const openaiBaseModel =
      typeof openaiBaseModelConfig === 'string'
        ? openaiBaseModelConfig
        : openaiBaseModelConfig?.openaiBaseModel;
    const requestedModel = String(body.model || '').trim();
    const requestedModelName = String(body.modelName || '').trim();
    const resolvedModel = await this.resolveAcademicModelInfo(
      requestedModel || (requestedModelName ? '' : String(openaiBaseModel || '').trim()),
      requestedModelName,
    );
    if (!resolvedModel) {
      throw new HttpException('系统未配置可用模型，请联系管理员', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (!resolvedModel.modelInfo) {
      const displayName =
        resolvedModel.requestedModelName || resolvedModel.requestedModel || '当前模型';
      throw new HttpException(
        `所选模型“${displayName}”当前不可用，请刷新模型列表后重试`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      resolvedModel.requestedModel &&
      resolvedModel.requestedModel !== resolvedModel.resolvedModel
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'academic_model_fallback',
          requestId,
          userId,
          requestedModel: resolvedModel.requestedModel,
          resolvedModel: resolvedModel.resolvedModel,
        }),
      );
    }
    const modelInfo = resolvedModel.modelInfo;

    const {
      deduct,
      deductType,
      keyType: modelType,
      key: modelApiKey,
      model: useModel,
      modelName: useModelName,
      id: keyId,
      isTokenBased,
      tokenFeeRatio,
      deductDeepThink = 1,
    } = modelInfo;

    const groupId = body.options?.groupId || null;
    const usingDeepThinking = body.options?.usingDeepThinking || false;

    await this.userBalanceService.validateBalance(
      req,
      deductType,
      deduct * (usingDeepThinking ? deductDeepThink : 1),
    );

    let prompt = body.main_input || body.prompt || '';
    const hasPrompt = Boolean(prompt && prompt.trim());
    const hasFile = Boolean(body.fileUrl);

    if (!hasPrompt && !hasFile) {
      throw new HttpException('请输入内容或上传文件后再提问', HttpStatus.BAD_REQUEST);
    }

    const requestedFunction = String(body.function || 'chat');
    const candidatePluginName = String(
      body.plugin_name || body.plugin_kwargs?.plugin_name || '',
    ).trim();
    const candidateCoreName = String(
      body.core_function || body.plugin_kwargs?.core_function || '',
    ).trim();
    let effectiveFunction: 'chat' | 'basic' | 'plugin' = 'chat';
    if (requestedFunction === 'plugin') {
      if (candidatePluginName && candidatePluginName !== '不启用') {
        effectiveFunction = 'plugin';
      } else if (candidateCoreName && candidateCoreName !== '不启用') {
        effectiveFunction = 'basic';
      }
    } else if (requestedFunction === 'basic') {
      if (candidateCoreName && candidateCoreName !== '不启用') {
        effectiveFunction = 'basic';
      } else if (candidatePluginName && candidatePluginName !== '不启用') {
        effectiveFunction = 'plugin';
      }
    } else {
      if (candidatePluginName && candidatePluginName !== '不启用') {
        effectiveFunction = 'plugin';
      } else if (candidateCoreName && candidateCoreName !== '不启用') {
        effectiveFunction = 'basic';
      }
    }

    if (groupId) {
      try {
        await this.chatGroupService.updateTime(groupId);
      } catch (error) {
        this.logger.warn(`Failed to update group time: ${error.message}`);
      }
    }

    const overwriteReply = Boolean(body.overwriteReply);
    const requestedUserLogId = Number(body.chatId || 0);
    const requestedAssistantLogId = Number(body.replyChatId || 0);
    if (overwriteReply && requestedUserLogId <= 0) {
      throw new HttpException('历史用户消息不存在，请刷新后重试', HttpStatus.BAD_REQUEST);
    }
    if (overwriteReply && requestedAssistantLogId <= 0) {
      throw new HttpException('历史回复不存在，请刷新后重试', HttpStatus.BAD_REQUEST);
    }

    let userLogId = 0;
    if (overwriteReply && requestedUserLogId > 0) {
      const existingUserLog = await this.chatLogService.findOneChatLog(requestedUserLogId);
      if (
        existingUserLog &&
        Number(existingUserLog.userId) === Number(req.user.id) &&
        Number(existingUserLog.groupId || 0) === Number(groupId || 0) &&
        String(existingUserLog.role || '').toLowerCase() === 'user'
      ) {
        userLogId = Number(existingUserLog.id);
        await this.chatLogService.updateChatLog(userLogId, {
          content: prompt,
          fileUrl: body.fileUrl || null,
          model: useModel,
          modelName: '我',
          type: modelType || 1,
        });
      }
    }
    if (overwriteReply && !userLogId) {
      throw new HttpException('历史用户消息已失效，请刷新后重试', HttpStatus.BAD_REQUEST);
    }
    if (!userLogId) {
      const userSaveLog = await this.chatLogService.saveChatLog({
        appId: body.appId || null,
        userId: req.user.id,
        type: modelType || 1,
        fileUrl: body.fileUrl || null,
        imageUrl: null,
        content: prompt,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: useModel,
        modelName: '我',
        role: 'user',
        groupId: groupId || null,
      });
      userLogId = Number(userSaveLog.id);
    }

    let assistantLogId = 0;
    if (overwriteReply && requestedAssistantLogId > 0) {
      const existingAssistantLog = await this.chatLogService.findOneChatLog(
        requestedAssistantLogId,
      );
      if (
        existingAssistantLog &&
        Number(existingAssistantLog.userId) === Number(req.user.id) &&
        Number(existingAssistantLog.groupId || 0) === Number(groupId || 0) &&
        String(existingAssistantLog.role || '').toLowerCase() === 'assistant'
      ) {
        assistantLogId = Number(existingAssistantLog.id);
        await this.chatLogService.updateChatLog(assistantLogId, {
          appId: body.appId || null,
          type: modelType || 1,
          progress: '0%',
          model: useModel,
          modelName: body.modelName || useModelName,
          modelAvatar: body.modelAvatar || '',
          content: '',
          reasoning_content: '',
          tool_calls: null,
          fileVectorResult: null,
          networkSearchResult: null,
          promptReference: null,
          status: 2,
        });
      }
    }
    if (overwriteReply && !assistantLogId) {
      throw new HttpException('历史回复已失效，请刷新后重试', HttpStatus.BAD_REQUEST);
    }
    if (!assistantLogId) {
      const assistantSaveLog = await this.chatLogService.saveChatLog({
        appId: body.appId || null,
        userId: req.user.id,
        type: modelType || 1,
        progress: '0%',
        model: useModel,
        modelName: body.modelName || useModelName,
        role: 'assistant',
        groupId: groupId || null,
        status: 2,
        modelAvatar: body.modelAvatar || '',
      });
      assistantLogId = Number(assistantSaveLog.id);
    }
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.write(`${JSON.stringify({ chatId: assistantLogId, requestId })}\n`);

    const controller = new AbortController();
    let responseCompleted = false;
    let forceCloseTimer: NodeJS.Timeout | null = null;
    const clearForceCloseTimer = () => {
      if (forceCloseTimer) {
        clearTimeout(forceCloseTimer);
        forceCloseTimer = null;
      }
    };
    const forceCloseAcademicStream = (reason: string) => {
      if (responseCompleted || res.writableEnded || res.writableFinished) return;
      clearForceCloseTimer();
      forceCloseTimer = setTimeout(() => {
        void (async () => {
          if (responseCompleted || res.writableEnded || res.writableFinished) return;
          const fallbackContent =
            reason === 'idle_timeout'
              ? '学术服务响应超时，请稍后重试'
              : '学术服务处理超时，请稍后重试';
          try {
            await this.chatLogService.updateChatLog(assistantLogId, {
              content: fallbackContent,
              status: 4,
            });
          } catch (_error) {}
          res.write(
            `${JSON.stringify({
              finalContent: fallbackContent,
              requestId,
              finishReason: 'error',
            })}\n`,
          );
          responseCompleted = true;
          res.end();
        })();
      }, 1500);
    };
    const abortUpstream = (reason: string) => {
      if (responseCompleted || controller.signal.aborted) return;
      controller.abort();
      forceCloseAcademicStream(reason);
      const durationMs = Date.now() - startTime;
      this.logger.warn(
        JSON.stringify({
          event: 'academic_chat_abort',
          requestId,
          userId,
          model: useModel,
          reason,
          durationMs,
        }),
      );
    };
    const handleReqAborted = () => {
      abortUpstream('request_aborted');
    };
    const handleReqClose = () => {
      if (responseCompleted || res.writableEnded || res.writableFinished) return;
      const closedByClient = Boolean(
        (req as any).aborted || (req as any).readableAborted || (req as any).destroyed,
      );
      if (closedByClient) {
        abortUpstream('request_closed');
      }
    };
    const cleanupConnectionListeners = () => {
      clearForceCloseTimer();
      req.off('aborted', handleReqAborted);
      req.off('close', handleReqClose);
    };
    req.on('close', handleReqClose);
    res.on('finish', () => {
      responseCompleted = true;
      cleanupConnectionListeners();
    });
    req.on('aborted', handleReqAborted);

    const state: AcademicStreamState = {
      fullContent: '',
      hasStreamContent: false,
      tracebackMode: false,
      fullReasoning: '',
      stablePolishContent: '',
      fileVectorResult: '',
      networkSearchResult: '',
      promptReference: '',
      toolCalls: '',
      streamError: '',
      finishReason: '',
    };

    let uploadDir = '';
    let uploadErrorMessage = '';
    if (body.fileUrl) {
      try {
        uploadDir = await this.pullFilesToAcademic(body.fileUrl, String(req.user.id), req);
      } catch (error) {
        uploadErrorMessage = String((error as Error)?.message || '文件上传处理失败');
        this.logger.warn(`Failed to pull files to academic service: ${uploadErrorMessage}`);
      }
    }

    if (!prompt && uploadDir) {
      prompt = uploadDir;
    }

    const shouldIgnoreHistory = effectiveFunction === 'plugin' || effectiveFunction === 'basic';
    const safeHistory = shouldIgnoreHistory ? [] : Array.isArray(body.history) ? body.history : [];
    const safePluginKwargs =
      body.plugin_kwargs && typeof body.plugin_kwargs === 'object' ? body.plugin_kwargs : {};

    const rawPluginName = candidatePluginName;
    const rawCoreFunction = candidateCoreName;
    const resolvedPluginName =
      effectiveFunction === 'plugin' ? await this.resolvePluginName(rawPluginName) : rawPluginName;
    const resolvedCoreFunction =
      effectiveFunction === 'basic'
        ? await this.resolveCoreFunction(rawCoreFunction)
        : rawCoreFunction;

    const normalizedPluginKwargs = this.normalizePluginKwargs(
      resolvedPluginName || rawPluginName,
      safePluginKwargs,
    );
    const normalizedPluginName = this.normalizePluginName(
      resolvedPluginName || rawPluginName || '',
    );
    const isArxivPlugin = this.isArxivPlugin(normalizedPluginName);
    const isPaperQuickRead = this.isPaperQuickReadPlugin(normalizedPluginName);
    const isLongRunningPlugin = this.isLongRunningAcademicPlugin(normalizedPluginName);
    const academicPayload: Record<string, any> = {
      function: effectiveFunction,
      main_input: prompt,
      llm_kwargs: {
        llm_model: useModel,
      },
      plugin_kwargs: normalizedPluginKwargs,
      history: safeHistory,
      system_prompt: body.system_prompt || '',
      core_function: resolvedCoreFunction || body.core_function,
      plugin_name: resolvedPluginName || body.plugin_name,
      user_name: String(req.user.id),
      chat_id: String(assistantLogId),
    };

    const incomingLlmKwargs = this.sanitizeIncomingLlmKwargs(body.llm_kwargs);
    if (Object.keys(incomingLlmKwargs).length) {
      academicPayload.llm_kwargs = { ...academicPayload.llm_kwargs, ...incomingLlmKwargs };
    }
    if (modelApiKey && String(modelApiKey).trim()) {
      academicPayload.llm_kwargs.api_key = String(modelApiKey).trim();
    }
    // 服务端强制覆盖，禁止客户端改模型名/密钥。
    academicPayload.llm_kwargs.llm_model = useModel;

    if (academicPayload.function === 'plugin') {
      if (!academicPayload.plugin_kwargs) {
        academicPayload.plugin_kwargs = {};
      }
      academicPayload.plugin_name = resolvedPluginName || rawPluginName;
      academicPayload.plugin_kwargs.plugin_name = resolvedPluginName || rawPluginName;
      if (!academicPayload.plugin_kwargs.main_input && academicPayload.main_input) {
        academicPayload.plugin_kwargs.main_input = academicPayload.main_input;
      }
    }

    if (academicPayload.function === 'basic') {
      if (!academicPayload.plugin_kwargs) {
        academicPayload.plugin_kwargs = {};
      }
      academicPayload.core_function = resolvedCoreFunction || rawCoreFunction;
      academicPayload.plugin_kwargs.core_function = resolvedCoreFunction || rawCoreFunction;
    }

    if (uploadDir) {
      if (!academicPayload.main_input) {
        academicPayload.main_input = uploadDir;
      }
      if (!academicPayload.plugin_kwargs) {
        academicPayload.plugin_kwargs = {};
      }
      if (!academicPayload.plugin_kwargs.main_input) {
        academicPayload.plugin_kwargs.main_input = uploadDir;
      }
    }

    // 绝大多数文件型插件以 main_input 作为真实入口，若这里是用户自然语言会导致后端误判。
    if (uploadDir && academicPayload.function === 'plugin' && !isArxivPlugin) {
      academicPayload.main_input = uploadDir;
      if (!academicPayload.plugin_kwargs) {
        academicPayload.plugin_kwargs = {};
      }
      academicPayload.plugin_kwargs.main_input = uploadDir;
      if (prompt && String(prompt).trim() && !academicPayload.plugin_kwargs.user_prompt) {
        academicPayload.plugin_kwargs.user_prompt = String(prompt).trim();
        if (
          academicPayload.plugin_kwargs.advanced_arg === undefined ||
          academicPayload.plugin_kwargs.advanced_arg === null
        ) {
          academicPayload.plugin_kwargs.advanced_arg = academicPayload.plugin_kwargs.user_prompt;
        }
      }
    }
    if (academicPayload.function === 'plugin') {
      academicPayload.plugin_kwargs = this.normalizePluginKwargs(
        resolvedPluginName || rawPluginName || '',
        academicPayload.plugin_kwargs || {},
      );
    }

    const allowQuickReadByReference =
      normalizedPluginName === this.normalizePluginName('论文速读') &&
      this.hasAcademicPaperReference(prompt || String(academicPayload.main_input || ''));

    if (
      academicPayload.function === 'plugin' &&
      this.isFileRequiredPlugin(normalizedPluginName) &&
      !uploadDir &&
      !allowQuickReadByReference
    ) {
      const fileRequiredMessage = uploadErrorMessage
        ? this.getSafeAcademicErrorMessage(uploadErrorMessage) ||
          '文件上传处理失败，请重新上传后重试'
        : normalizedPluginName === this.normalizePluginName('论文速读')
        ? '论文速读需要上传 PDF 文件，或直接输入有效 DOI / arXiv ID。'
        : '该学术插件需要先上传文件，再发送消息';
      try {
        await this.chatLogService.updateChatLog(assistantLogId, {
          content: fileRequiredMessage,
          status: 4,
        });
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'academic_file_required_update_failed',
            requestId,
            userId,
            message: (error as Error)?.message || 'update failed',
          }),
        );
      }
      res.write(
        `${JSON.stringify({
          finalContent: fileRequiredMessage,
          requestId,
          finishReason: 'error',
        })}\n`,
      );
      res.end();
      return;
    }

    const buildDisplayContent = async (baseText: string, fillEmpty = true) => {
      const content = this.normalizeDisplayContent(this.sanitizeAcademicOutput(baseText || ''));
      if (content) return content;
      if (!fillEmpty) return '';
      if (state.fileVectorResult) return '';
      return '已收到请求，但学术后端未返回可展示内容。';
    };

    this.logger.log(
      JSON.stringify({
        event: 'academic_chat_start',
        requestId,
        userId,
        model: useModel,
        modelName: useModelName,
        function: academicPayload.function,
        pluginName: academicPayload.plugin_name || '',
        coreFunction: academicPayload.core_function || '',
        groupId,
      }),
    );
    this.logger.log(
      JSON.stringify({
        event: 'academic_chat_payload',
        requestId,
        userId,
        function: academicPayload.function,
        pluginName: academicPayload.plugin_name || '',
        coreFunction: academicPayload.core_function || '',
        hasMainInput: Boolean(academicPayload.main_input),
        historyLength: Array.isArray(academicPayload.history) ? academicPayload.history.length : 0,
        pluginKwargKeys:
          academicPayload.plugin_kwargs && typeof academicPayload.plugin_kwargs === 'object'
            ? Object.keys(academicPayload.plugin_kwargs)
            : [],
      }),
    );

    try {
      const { response: upstreamResponse, baseUrl: selectedAcademicBaseUrl } =
        await this.fetchAcademicStream(
          '/academic/chat-process',
          academicPayload,
          controller.signal,
        );

      if (upstreamResponse.status >= 400) {
        const errorBody = await upstreamResponse.text();
        this.logger.error(
          JSON.stringify({
            event: 'academic_upstream_error',
            requestId,
            userId,
            model: useModel,
            baseUrl: selectedAcademicBaseUrl,
            status: upstreamResponse.status,
            body: errorBody.slice(0, 800),
          }),
        );
        throw new HttpException(`学术服务异常(${upstreamResponse.status})`, HttpStatus.BAD_GATEWAY);
      }
      if (!upstreamResponse.body) {
        throw new HttpException('学术服务无响应数据', HttpStatus.BAD_GATEWAY);
      }
      const upstreamBody = Readable.fromWeb(upstreamResponse.body as any);

      let buffer = '';
      const defaultIdleTimeoutMs = Number(process.env.ACADEMIC_STREAM_IDLE_TIMEOUT_MS || 180000);
      const longIdleTimeoutMs = Number(process.env.ACADEMIC_STREAM_IDLE_TIMEOUT_LONG_MS || 300000);
      const arxivIdleTimeoutMs = Number(
        process.env.ACADEMIC_STREAM_IDLE_TIMEOUT_ARXIV_MS || 240000,
      );
      const paperIdleTimeoutMs = Number(
        process.env.ACADEMIC_STREAM_IDLE_TIMEOUT_PAPER_MS || 180000,
      );
      const idleTimeoutMs = isArxivPlugin
        ? Math.max(arxivIdleTimeoutMs, 10000)
        : isPaperQuickRead
        ? Math.max(paperIdleTimeoutMs, 15000)
        : isLongRunningPlugin
        ? Math.max(longIdleTimeoutMs, 60000)
        : Math.max(defaultIdleTimeoutMs, 30000);
      const defaultMaxDurationMs = Number(process.env.ACADEMIC_STREAM_MAX_DURATION_MS || 600000);
      const longMaxDurationMs = Number(process.env.ACADEMIC_STREAM_MAX_DURATION_LONG_MS || 900000);
      const arxivMaxDurationMs = Number(
        process.env.ACADEMIC_STREAM_MAX_DURATION_ARXIV_MS || 600000,
      );
      const paperMaxDurationMs = Number(
        process.env.ACADEMIC_STREAM_MAX_DURATION_PAPER_MS || 600000,
      );
      const maxDurationMs = isArxivPlugin
        ? Math.max(arxivMaxDurationMs, 30000)
        : isPaperQuickRead
        ? Math.max(paperMaxDurationMs, 60000)
        : isLongRunningPlugin
        ? Math.max(longMaxDurationMs, 120000)
        : Math.max(defaultMaxDurationMs, 60000);
      let idleTimer: NodeJS.Timeout | null = null;
      let maxDurationTimer: NodeJS.Timeout | null = null;
      let idleTimedOut = false;
      let pendingSerializedLine = '';
      const resetIdleTimer = () => {
        if (!(idleTimeoutMs > 0)) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          idleTimedOut = true;
          abortUpstream('idle_timeout');
        }, idleTimeoutMs);
      };
      const clearIdleTimer = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      };
      const startMaxDurationTimer = () => {
        if (!(maxDurationMs > 0)) return;
        if (maxDurationTimer) clearTimeout(maxDurationTimer);
        maxDurationTimer = setTimeout(() => {
          abortUpstream('max_duration_timeout');
        }, maxDurationMs);
      };
      const clearMaxDurationTimer = () => {
        if (maxDurationTimer) {
          clearTimeout(maxDurationTimer);
          maxDurationTimer = null;
        }
      };
      let upstreamFinishSignaled = false;
      resetIdleTimer();
      startMaxDurationTimer();
      upstreamBody.on('data', chunk => {
        buffer += chunk.toString('utf-8');
        let index = buffer.indexOf('\n');
        while (index !== -1) {
          const rawLine = buffer.slice(0, index).replace(/\r$/, '');
          buffer = buffer.slice(index + 1);
          const mergedRawLine = pendingSerializedLine
            ? `${pendingSerializedLine}\n${rawLine}`
            : rawLine;
          const line = this.normalizeAcademicStreamLine(mergedRawLine);
          if (line) {
            const segments = this.splitConcatenatedJsonObjects(line);
            if (this.looksLikeAcademicJsonFragment(line) && !segments.length) {
              if (this.shouldKeepAcademicStreamAlive(line)) {
                resetIdleTimer();
              }
              pendingSerializedLine = line;
              index = buffer.indexOf('\n');
              continue;
            }
            pendingSerializedLine = '';
            const lines =
              segments.length > 1 || (segments.length === 1 && segments[0] !== line)
                ? segments
                : [line];
            for (const item of lines) {
              const safeLine = this.sanitizeAcademicStreamLine(item);
              if (!safeLine) continue;
              this.consumeAcademicLine(safeLine, state, true);
              if (this.shouldKeepAcademicStreamAlive(safeLine)) {
                resetIdleTimer();
              }
              const outboundLine = this.ensureAcademicNdjsonLine(safeLine, assistantLogId);
              if (outboundLine) {
                res.write(`${outboundLine}\n`);
              }
              if (
                !upstreamFinishSignaled &&
                /^(?:stop|error)$/i.test(String(state.finishReason || '').trim())
              ) {
                upstreamFinishSignaled = true;
              }
            }
          }
          index = buffer.indexOf('\n');
        }
      });

      upstreamBody.on('end', async () => {
        clearIdleTimer();
        clearMaxDurationTimer();
        clearForceCloseTimer();
        try {
          const normalizedBufferTail = buffer.replace(/\r+$/, '');
          const mergedTailRaw = `${pendingSerializedLine}${
            pendingSerializedLine && normalizedBufferTail ? '\n' : ''
          }${normalizedBufferTail}`;
          pendingSerializedLine = '';
          if (mergedTailRaw.trim()) {
            const tail = this.normalizeAcademicStreamLine(mergedTailRaw);
            if (tail) {
              const segments = this.splitConcatenatedJsonObjects(tail);
              const lines =
                segments.length > 1 || (segments.length === 1 && segments[0] !== tail)
                  ? segments
                  : [tail];
              for (const item of lines) {
                const safeTail = this.sanitizeAcademicStreamLine(item);
                if (!safeTail) continue;
                this.consumeAcademicLine(safeTail, state, false);
                const outboundTail = this.ensureAcademicNdjsonLine(safeTail, assistantLogId);
                if (outboundTail) {
                  res.write(`${outboundTail}\n`);
                }
                if (
                  !upstreamFinishSignaled &&
                  /^(?:stop|error)$/i.test(String(state.finishReason || '').trim())
                ) {
                  upstreamFinishSignaled = true;
                }
              }
            }
          }

          const contentForOutput = this.pickBestAcademicOutput(state);
          let finalContent = await buildDisplayContent(contentForOutput, !state.streamError);
          finalContent = this.preserveStablePolishDisplay(state, finalContent, contentForOutput);
          const shouldRetryOnEmptyError =
            !controller.signal.aborted &&
            Boolean(state.streamError) &&
            !state.fileVectorResult &&
            !this.isMeaningfulAcademicContent(finalContent);
          if (shouldRetryOnEmptyError) {
            try {
              const retryState = await this.collectAcademicStreamState(
                academicPayload,
                controller.signal,
              );
              const retryOutput = this.pickBestAcademicOutput(retryState);
              let retryContent = await buildDisplayContent(retryOutput, !retryState.streamError);
              retryContent = this.preserveStablePolishDisplay(
                retryState,
                retryContent,
                retryOutput,
              );
              if (!this.isMeaningfulAcademicContent(retryContent) && retryState.fileVectorResult) {
                retryContent = '文件已生成，可在下方下载。';
              }
              const recovered =
                this.isMeaningfulAcademicContent(retryContent) ||
                Boolean(retryState.fileVectorResult);
              if (recovered) {
                state.fullContent = retryState.fullContent || retryContent;
                state.fullReasoning = retryState.fullReasoning || state.fullReasoning;
                state.fileVectorResult = retryState.fileVectorResult || state.fileVectorResult;
                state.networkSearchResult =
                  retryState.networkSearchResult || state.networkSearchResult;
                state.promptReference = retryState.promptReference || state.promptReference;
                state.toolCalls = retryState.toolCalls || state.toolCalls;
                state.finishReason = retryState.finishReason || state.finishReason;
                state.stablePolishContent =
                  retryState.stablePolishContent || state.stablePolishContent;
                state.streamError = '';
                finalContent = retryContent;
                this.logger.log(
                  JSON.stringify({
                    event: 'academic_retry_recovered',
                    requestId,
                    userId,
                    model: useModel,
                  }),
                );
              }
            } catch (retryError) {
              this.logger.warn(
                JSON.stringify({
                  event: 'academic_retry_failed',
                  requestId,
                  userId,
                  model: useModel,
                  message: (retryError as Error)?.message || 'retry failed',
                }),
              );
            }
          }
          if (isArxivPlugin) {
            finalContent = await this.ensureArxivSummary(
              finalContent || contentForOutput,
              prompt || String(academicPayload.main_input || ''),
            );
            if (state.streamError && /(?:摘要|abstract)\s*[:：]/i.test(finalContent || '')) {
              state.streamError = '';
            }
          }

          if (
            academicPayload.function === 'plugin' &&
            this.isLatexPlugin(normalizedPluginName) &&
            /Traceback/i.test(finalContent || '')
          ) {
            const stripped = String(finalContent || '')
              .split(/Traceback[:：]/i)[0]
              .trim();
            if (stripped) {
              finalContent = stripped;
              state.fullContent = stripped;
            }
          }

          if (
            academicPayload.function === 'plugin' &&
            (this.isPdfPlugin(normalizedPluginName) ||
              this.isPaperQuickReadPlugin(normalizedPluginName)) &&
            body.fileUrl &&
            (this.isAcademicPlaceholderContent(finalContent) ||
              /插件调用出错|Traceback|学术服务处理超时|无法读取论文内容|文件内容为空或无法提取/i.test(
                finalContent,
              ))
          ) {
            const fallbackSummary = await this.buildPdfFallbackSummary(body.fileUrl, req);
            if (fallbackSummary) {
              finalContent = fallbackSummary;
              state.fullContent = fallbackSummary;
              state.streamError = '';
            }
          }
          if (
            academicPayload.function === 'plugin' &&
            this.isWordPlugin(normalizedPluginName) &&
            body.fileUrl &&
            (this.isAcademicPlaceholderContent(finalContent) ||
              /插件调用出错|Traceback|学术服务处理超时/i.test(finalContent))
          ) {
            const fallbackSummary = await this.buildWordFallbackSummary(body.fileUrl, req);
            if (fallbackSummary) {
              finalContent = fallbackSummary;
              state.fullContent = fallbackSummary;
              state.streamError = '';
            }
          }
          if (
            academicPayload.function === 'plugin' &&
            this.isLatexPlugin(normalizedPluginName) &&
            body.fileUrl &&
            (this.isAcademicPlaceholderContent(finalContent) ||
              /插件调用出错|Traceback|学术服务处理超时|服务器内部错误|无法读取论文内容/i.test(
                finalContent,
              ))
          ) {
            const fallbackSummary = await this.buildLatexFallbackSummary(body.fileUrl, req);
            if (fallbackSummary) {
              finalContent = fallbackSummary;
              state.fullContent = fallbackSummary;
              state.streamError = '';
            }
          }
          if (!this.isMeaningfulAcademicContent(finalContent) && state.fileVectorResult) {
            finalContent = '文件已生成，可在下方下载。';
          }
          if (!this.isMeaningfulAcademicContent(finalContent) && !state.fileVectorResult) {
            state.streamError = state.streamError || '学术后端未返回可展示内容';
            finalContent =
              this.getSafeAcademicErrorMessage(state.streamError) || '学术后端未返回可展示内容';
          }
          const hasRenderableOutput = Boolean(
            this.isMeaningfulAcademicContent(finalContent) || state.fileVectorResult,
          );
          if (state.streamError && hasRenderableOutput) {
            this.logger.warn(
              JSON.stringify({
                event: 'academic_ignore_trailing_error',
                requestId,
                userId,
                model: useModel,
                streamError: String(state.streamError || '').slice(0, 200),
              }),
            );
            state.streamError = '';
          }
          if (state.streamError) {
            if (!finalContent) {
              finalContent =
                this.getSafeAcademicErrorMessage(state.streamError) || '学术服务处理失败，请重试';
            }
            await this.chatLogService.updateChatLog(assistantLogId, {
              content: finalContent || state.fullContent || '',
              reasoning_content: state.fullReasoning || null,
              tool_calls: state.toolCalls || null,
              fileVectorResult: state.fileVectorResult || null,
              networkSearchResult: state.networkSearchResult || null,
              promptReference: state.promptReference || null,
              status: 4,
            });
            res.write(
              `${JSON.stringify({
                finalContent: finalContent || state.fullContent || '',
                requestId,
                finishReason: 'error',
              })}\n`,
            );
            responseCompleted = true;
            res.end();
            return;
          }

          const promptTokens = await getTokenCount(prompt || '');
          const completionTokens = await getTokenCount(
            `${state.fullReasoning}${state.fullContent}`,
          );
          let charge = deduct * (usingDeepThinking ? deductDeepThink : 1);

          if (isTokenBased === true) {
            charge =
              deduct *
              Math.ceil((promptTokens + completionTokens) / tokenFeeRatio) *
              (usingDeepThinking ? deductDeepThink : 1);
          }

          await this.chatLogService.updateChatLog(userLogId, {
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            totalTokens: promptTokens + completionTokens,
          });

          await this.chatLogService.updateChatLog(assistantLogId, {
            content: finalContent || state.fullContent,
            reasoning_content: state.fullReasoning,
            tool_calls: state.toolCalls,
            fileVectorResult: state.fileVectorResult || null,
            networkSearchResult: state.networkSearchResult || null,
            promptReference: state.promptReference || null,
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            totalTokens: promptTokens + completionTokens,
            status: 3,
          });

          await this.userBalanceService.deductFromBalance(
            req.user.id,
            deductType,
            charge,
            promptTokens + completionTokens,
          );
          await this.modelsService.saveUseLog(keyId, promptTokens + completionTokens);

          const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
          res.write(
            `${JSON.stringify({
              userBalance,
              requestId,
            })}\n`,
          );
          res.write(
            `${JSON.stringify({
              finalContent: finalContent || state.fullContent || '',
              requestId,
              finishReason: 'stop',
            })}\n`,
          );
          responseCompleted = true;
          res.end();

          const durationMs = Date.now() - startTime;
          this.logger.log(
            JSON.stringify({
              event: 'academic_chat_end',
              requestId,
              userId,
              model: useModel,
              durationMs,
              promptTokens,
              completionTokens,
            }),
          );
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            JSON.stringify({
              event: 'academic_chat_finalize_error',
              requestId,
              userId,
              model: useModel,
              message: err?.message,
            }),
            err?.stack,
          );
          let fallbackContent = await buildDisplayContent(
            this.pickBestAcademicOutput(state),
            false,
          );
          fallbackContent = this.preserveStablePolishDisplay(state, fallbackContent);
          if (isArxivPlugin) {
            fallbackContent = await this.ensureArxivSummary(
              fallbackContent || state.fullContent || '',
              prompt || String(academicPayload.main_input || ''),
            );
          }
          if (!fallbackContent) {
            fallbackContent =
              this.getSafeAcademicErrorMessage(err?.message) || '学术服务处理失败，请重试';
          }
          await this.chatLogService.updateChatLog(assistantLogId, {
            content: fallbackContent,
            reasoning_content: state.fullReasoning || null,
            tool_calls: state.toolCalls || null,
            fileVectorResult: state.fileVectorResult || null,
            networkSearchResult: state.networkSearchResult || null,
            promptReference: state.promptReference || null,
            status: 4,
          });
          res.write(
            `${JSON.stringify({
              finalContent: fallbackContent,
              requestId,
              finishReason: 'error',
            })}\n`,
          );
          responseCompleted = true;
          res.end();
        }
      });

      upstreamBody.on('error', async error => {
        clearIdleTimer();
        clearMaxDurationTimer();
        clearForceCloseTimer();
        let partialContent = await buildDisplayContent(this.pickBestAcademicOutput(state), false);
        partialContent = this.preserveStablePolishDisplay(state, partialContent);
        if (isArxivPlugin) {
          partialContent = await this.ensureArxivSummary(
            partialContent || state.fullContent || '',
            prompt || String(academicPayload.main_input || ''),
          );
        }
        if (
          academicPayload.function === 'plugin' &&
          (this.isPdfPlugin(normalizedPluginName) ||
            this.isPaperQuickReadPlugin(normalizedPluginName)) &&
          body.fileUrl &&
          (this.isAcademicPlaceholderContent(partialContent) ||
            /插件调用出错|Traceback|学术服务处理超时|无法读取论文内容|文件内容为空或无法提取/i.test(
              partialContent || '',
            ))
        ) {
          const fallbackSummary = await this.buildPdfFallbackSummary(body.fileUrl, req);
          if (fallbackSummary) {
            partialContent = fallbackSummary;
            state.fullContent = fallbackSummary;
            state.streamError = '';
          }
        }
        if (
          academicPayload.function === 'plugin' &&
          this.isWordPlugin(normalizedPluginName) &&
          body.fileUrl &&
          (this.isAcademicPlaceholderContent(partialContent) ||
            /插件调用出错|Traceback|学术服务处理超时/i.test(partialContent || ''))
        ) {
          const fallbackSummary = await this.buildWordFallbackSummary(body.fileUrl, req);
          if (fallbackSummary) {
            partialContent = fallbackSummary;
            state.fullContent = fallbackSummary;
            state.streamError = '';
          }
        }
        if (
          academicPayload.function === 'plugin' &&
          this.isLatexPlugin(normalizedPluginName) &&
          body.fileUrl &&
          (this.isAcademicPlaceholderContent(partialContent) ||
            /插件调用出错|Traceback|学术服务处理超时|服务器内部错误|无法读取论文内容/i.test(
              partialContent || '',
            ))
        ) {
          const fallbackSummary = await this.buildLatexFallbackSummary(body.fileUrl, req);
          if (fallbackSummary) {
            partialContent = fallbackSummary;
            state.fullContent = fallbackSummary;
            state.streamError = '';
          }
        }
        const hasArxivSummary = !isArxivPlugin || this.hasArxivSummaryContent(partialContent || '');
        const hasRenderablePartial = Boolean(
          ((partialContent &&
            this.isMeaningfulAcademicContent(partialContent) &&
            !this.isAcademicHeartbeatText(partialContent)) ||
            state.fileVectorResult) &&
            hasArxivSummary,
        );
        const abortedByUpstream = /aborted/i.test(String(error?.message || ''));
        if (abortedByUpstream && hasRenderablePartial) {
          const gracefulContent =
            partialContent || (state.fileVectorResult ? '文件已生成，可在下方下载。' : '');
          const promptTokens = await getTokenCount(prompt || '');
          const completionTokens = await getTokenCount(
            `${state.fullReasoning}${gracefulContent || state.fullContent || ''}`,
          );
          let charge = deduct * (usingDeepThinking ? deductDeepThink : 1);
          if (isTokenBased === true) {
            charge =
              deduct *
              Math.ceil((promptTokens + completionTokens) / tokenFeeRatio) *
              (usingDeepThinking ? deductDeepThink : 1);
          }
          await this.chatLogService.updateChatLog(userLogId, {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          });
          await this.chatLogService.updateChatLog(assistantLogId, {
            content: gracefulContent || state.fullContent || '',
            reasoning_content: state.fullReasoning || null,
            tool_calls: state.toolCalls || null,
            fileVectorResult: state.fileVectorResult || null,
            networkSearchResult: state.networkSearchResult || null,
            promptReference: state.promptReference || null,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            status: 3,
          });
          await this.userBalanceService.deductFromBalance(
            req.user.id,
            deductType,
            charge,
            promptTokens + completionTokens,
          );
          await this.modelsService.saveUseLog(keyId, promptTokens + completionTokens);
          const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
          res.write(
            `${JSON.stringify({
              userBalance,
              requestId,
            })}\n`,
          );
          res.write(
            `${JSON.stringify({
              finalContent: gracefulContent || state.fullContent || '',
              requestId,
              finishReason: 'stop',
            })}\n`,
          );
          responseCompleted = true;
          res.end();
          return;
        }
        this.logger.error(
          JSON.stringify({
            event: 'academic_stream_error',
            requestId,
            userId,
            model: useModel,
            message: error.message,
          }),
          error.stack,
        );
        let fallbackContent = partialContent;
        if (idleTimedOut && !fallbackContent) {
          fallbackContent = '学术服务响应超时，请稍后重试';
        }
        if (!fallbackContent) {
          fallbackContent =
            this.getSafeAcademicErrorMessage(error?.message) || '学术服务处理失败，请重试';
        }
        await this.chatLogService.updateChatLog(assistantLogId, {
          content: fallbackContent,
          reasoning_content: state.fullReasoning || null,
          tool_calls: state.toolCalls || null,
          fileVectorResult: state.fileVectorResult || null,
          networkSearchResult: state.networkSearchResult || null,
          promptReference: state.promptReference || null,
          status: 4,
        });
        res.write(
          `${JSON.stringify({
            finalContent: fallbackContent,
            requestId,
            finishReason: 'error',
          })}\n`,
        );
        responseCompleted = true;
        res.end();
      });
    } catch (error) {
      clearForceCloseTimer();
      const err = error as Error;
      this.logger.error(
        JSON.stringify({
          event: 'academic_request_failed',
          requestId,
          userId,
          model: useModel,
          message: err?.message,
        }),
        err?.stack,
      );
      let fallbackContent = await buildDisplayContent(this.pickBestAcademicOutput(state), false);
      fallbackContent = this.preserveStablePolishDisplay(state, fallbackContent);
      if (isArxivPlugin) {
        fallbackContent = await this.ensureArxivSummary(
          fallbackContent || state.fullContent || '',
          prompt || String(academicPayload.main_input || ''),
        );
      }
      if (!fallbackContent) {
        fallbackContent =
          this.getSafeAcademicErrorMessage(err?.message) || '学术服务处理失败，请重试';
      }
      await this.chatLogService.updateChatLog(assistantLogId, {
        content: fallbackContent,
        reasoning_content: state.fullReasoning || null,
        tool_calls: state.toolCalls || null,
        fileVectorResult: state.fileVectorResult || null,
        networkSearchResult: state.networkSearchResult || null,
        promptReference: state.promptReference || null,
        status: 4,
      });
      res.write(
        `${JSON.stringify({
          finalContent: fallbackContent,
          requestId,
          finishReason: 'error',
        })}\n`,
      );
      responseCompleted = true;
      res.end();
    }
  }

  private redactFilePaths(text: string) {
    if (!text) return '';
    let result = text;
    const patterns = [
      /(?:private_upload|public\/file|userFiles|file\/dev\/userFiles|private\/upload)[^ \n,，)]+/gi,
      /(?:academic-4\.0|gpt_log|downloadzone)\/[^ \n,，)]+/gi,
      /(^|[\s,(])(?:file\/dev\/userFiles|public\/file|private_upload|userFiles)\/[A-Za-z0-9_\-./]+/g,
      /(?:\/Users\/|C:\\\\Users\\\\)[^ \n,，)]+/g,
      /\/www\/wwwroot\/[^ \n,，)]+/g,
      /\/(?:root|home|opt|var|tmp)\/[^ \n,，)]+/g,
    ];
    patterns.forEach(pattern => {
      result = result.replace(pattern, '');
    });
    result = result
      .replace(/【文件路径已隐藏】/g, '')
      .replace(/\[路径已隐藏\]/g, '')
      .replace(/(找不到任何[^\n:：]*文件)\s*[:：]\s*(?=$|\n)/g, '$1。')
      .replace(/(找不到本地项目或(?:无权访问|无法处理))\s*[:：]\s*(?=$|\n)/g, '$1。')
      .replace(/(解析项目)\s*[:：]\s*(?=$|\n)/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{4,}/g, '\n\n\n');
    return result;
  }
  private isAcademicTraceNoise(text: string) {
    const normalized = String(text || '')
      .replace(/[​⁠﻿]/g, '')
      .trim();
    if (!normalized) return false;
    if (/Traceback\s*\(most recent call last\):/i.test(normalized)) return true;
    if (/在执行过程中遭遇问题.*Traceback/i.test(normalized)) return true;
    if (/^\s*File\s+"\.\//i.test(normalized)) return true;
    if (/^\s*File\s+"[^"\n]+"\s*,\s*line\s+\d+[^\n]*$/i.test(normalized)) return true;
    if (/^\s*BrokenPipeError:/i.test(normalized)) return true;
    if (
      /^\s*(?:During handling of the above exception|The above exception was the direct cause)/i.test(
        normalized,
      )
    )
      return true;
    if (/^\s*[\^~]+\s*$/i.test(normalized)) return true;
    if (/^OSError:\s*\[Errno\s*\d+\]/i.test(normalized)) return true;
    if (/^Exception:\s*local\s+error/i.test(normalized)) return true;
    if (
      /(urllib3\.exceptions|requests\.exceptions|maxretryerror|proxyerror|http\.client\.remotedisconnected|remote end closed connection without response|protocolerror|connection aborted|broken pipe)/i.test(
        normalized,
      )
    )
      return true;
    if (
      /(site-packages\/(?:urllib3|requests)|frameworks\/python\.framework\/versions\/\d+\.\d+\/lib\/python|bridge_chatgpt\.py|bridge_all\.py|crazy_utils\.py)/i.test(
        normalized,
      )
    )
      return true;
    if (/重试中，请稍等\s*\d+\s*\/\s*\d+/i.test(normalized)) return true;
    if (/正在整合分析结果，生成最终报告|解读报告已保存至/i.test(normalized)) return true;
    return false;
  }

  private shouldStartAcademicTracebackMode(text: string) {
    const normalized = String(text || '')
      .replace(/[​⁠﻿]/g, '')
      .trim();
    if (!normalized) return false;
    if (/Traceback\s*\(most recent call last\):/i.test(normalized)) return true;
    if (/在执行过程中遭遇问题.*Traceback/i.test(normalized)) return true;
    if (/^\s*BrokenPipeError:/i.test(normalized)) return true;
    return false;
  }

  private shouldEndAcademicTracebackMode(text: string) {
    const normalized = String(text || '')
      .replace(/[​⁠﻿]/g, '')
      .trim();
    if (!normalized) return false;
    if (/```/.test(normalized)) return true;
    if (/^\s*警告，文本过长将进行截断，Token溢出数[:：]\s*\d+/i.test(normalized)) return true;
    if (
      /^(?:以下|总体而言|总之|摘要[:：]|论文标题[:：]|结论[:：]|总结[:：]|最终|收到|文件已生成|学术服务)/i.test(
        normalized,
      )
    )
      return true;
    return false;
  }

  private stripAcademicTracebackByState(state: AcademicStreamState, text: string) {
    const source = String(text ?? '');
    if (!source.length) return '';
    const lines = source.split('\n');
    const kept: string[] = [];
    for (const rawLine of lines) {
      const line = String(rawLine ?? '');
      const normalized = line.replace(/[​⁠﻿]/g, '').trim();

      if (state.tracebackMode) {
        if (this.shouldEndAcademicTracebackMode(line)) {
          state.tracebackMode = false;
          continue;
        }
        if (!this.isAcademicTraceNoise(line) && /[\u4e00-\u9fffA-Za-z]{8,}/.test(normalized)) {
          state.tracebackMode = false;
          kept.push(line);
        }
        continue;
      }

      if (this.shouldStartAcademicTracebackMode(line)) {
        state.tracebackMode = !/```/.test(line);
        const safeError =
          this.getSafeAcademicErrorMessage(line) || '学术服务网络异常，请稍后重试。';
        state.streamError = state.streamError || safeError;
        continue;
      }

      if (this.isAcademicTraceNoise(line)) continue;
      kept.push(line);
    }
    return kept.join('\n');
  }

  private shouldDropAcademicNoise(text: string) {
    const normalized = String(text || '')
      .replace(/[​⁠﻿]/g, '')
      .trim();
    if (!normalized) return true;
    if (this.isAcademicTraceNoise(normalized)) return true;
    if (this.isAcademicNetworkErrorSnippet(normalized)) return true;
    if (this.isAcademicHeartbeatText(normalized)) return true;
    if (this.isLikelyAcademicJsonResidue(normalized)) return true;
    if (
      this.hasSerializedPayloadMarkers(normalized) &&
      !/[\u4e00-\u9fffA-Za-z]{12,}/.test(normalized)
    ) {
      return true;
    }
    if (/^(?:\[?\s*Local\s+Message\s*]?\s*)$/i.test(normalized)) return true;
    return false;
  }

  private isAcademicPlaceholderContent(text: string) {
    const normalized = this.sanitizeAcademicOutput(String(text || '')).trim();
    if (!normalized) return true;
    if (normalized === '已收到请求，但学术后端未返回可展示内容。') return true;
    if (
      /(使用方式|点击插件开始分析|正在分析论文|正在提取文本内容|请稍作等待|paper_file类型)/i.test(
        normalized,
      ) &&
      normalized.length < 400
    ) {
      return true;
    }
    return false;
  }

  private isMeaningfulAcademicContent(text: string) {
    const normalized = this.sanitizeAcademicOutput(String(text || '')).trim();
    if (!normalized) return false;
    if (this.isAcademicPlaceholderContent(normalized)) return false;
    if (
      /^(?:学术服务异常|学术服务处理失败，请重试|服务器内部错误|internal server error)$/i.test(
        normalized,
      )
    ) {
      return false;
    }
    if (/^(?:\.|…|·|\s)+$/.test(normalized)) return false;
    if (/^(?:waiting\s+gpt\s+response\.?)$/i.test(normalized)) return false;
    if (this.isAcademicHeartbeatText(normalized)) return false;
    return true;
  }

  private isPdfPlugin(normalizedPluginName: string) {
    const key = String(normalizedPluginName || '').toLowerCase();
    if (!key.includes('pdf')) return false;
    return /(总结|理解|chatpdf)/.test(key);
  }

  private isWordPlugin(normalizedPluginName: string) {
    const key = String(normalizedPluginName || '').toLowerCase();
    if (!key.includes('word') && !key.includes('docx')) return false;
    return /(总结|summary|批量)/.test(key);
  }

  private isPaperQuickReadPlugin(normalizedPluginName: string) {
    const key = String(normalizedPluginName || '').toLowerCase();
    return (
      key === this.normalizePluginName('论文速读') || key === this.normalizePluginName('速读论文')
    );
  }

  private isLatexPlugin(normalizedPluginName: string) {
    const key = String(normalizedPluginName || '').toLowerCase();
    return /latex|tex/.test(key);
  }

  private buildFallbackPreview(rawText: string, maxChars = 520) {
    const cleaned = String(rawText || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => String(line || '').trim())
      .filter(Boolean)
      .filter(line => !/^\d+$/.test(line))
      .filter(line => !/^(?:目录|contents?)$/i.test(line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';

    const sentences = cleaned
      .split(/(?<=[。！？.!?])\s+/)
      .map(item => item.trim())
      .filter(Boolean);

    if (!sentences.length) {
      return cleaned.slice(0, maxChars) + (cleaned.length > maxChars ? '...' : '');
    }

    let result = '';
    for (const sentence of sentences) {
      if ((result + sentence).length > maxChars && result.length >= Math.floor(maxChars * 0.6)) {
        break;
      }
      result += (result ? ' ' : '') + sentence;
      if (result.length >= maxChars) break;
    }
    if (!result) {
      result = cleaned.slice(0, maxChars);
    }
    if (cleaned.length > result.length) {
      result = `${result.trim()}...`;
    }
    return result.trim();
  }

  private async buildPdfFallbackSummary(fileUrl: string, req?: Request) {
    const files = this.parseFileUrls(fileUrl);
    if (!files.length) return '';
    const blocks: string[] = [];

    for (const item of files.slice(0, 3)) {
      try {
        let fileBuffer: Buffer | null = null;
        let sourceRef = String(item.url || '');
        const localPath = this.resolveLocalUploadedFilePath(item.url);
        if (localPath) {
          try {
            fileBuffer = await fs.readFile(localPath);
            sourceRef = localPath;
          } catch (_error) {}
        }
        if (!fileBuffer) {
          const resolvedUrl = await this.resolveFileUrl(item.url, req);
          if (!resolvedUrl) continue;
          sourceRef = resolvedUrl;
          const response = await axios.get(resolvedUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            validateStatus: () => true,
          });
          if (response.status >= 400) continue;
          fileBuffer = Buffer.from(response.data);
        }

        const fileName = String(item.name || path.basename(sourceRef.split('?')[0]) || '文档.pdf');
        const ext = path.extname(fileName).toLowerCase();
        if (ext && ext !== '.pdf') continue;

        const parsed = await pdf(fileBuffer);
        const rawText = String(parsed?.text || '').trim();
        if (!rawText) continue;

        const excerpt = this.buildFallbackPreview(rawText, 520);
        if (!excerpt) continue;
        blocks.push(
          [`文档：${fileName}`, `页数：${parsed?.numpages || '未知'}`, `摘要：${excerpt}`].join(
            '\n',
          ),
        );
      } catch (_error) {
        continue;
      }
    }

    if (!blocks.length) return '';
    return blocks.join('\n\n');
  }

  private async buildWordFallbackSummary(fileUrl: string, req?: Request) {
    const files = this.parseFileUrls(fileUrl);
    if (!files.length) return '';
    const blocks: string[] = [];

    for (const item of files.slice(0, 3)) {
      try {
        let fileBuffer: Buffer | null = null;
        let sourceRef = String(item.url || '');
        const localPath = this.resolveLocalUploadedFilePath(item.url);
        if (localPath) {
          try {
            fileBuffer = await fs.readFile(localPath);
            sourceRef = localPath;
          } catch (_error) {}
        }
        if (!fileBuffer) {
          const resolvedUrl = await this.resolveFileUrl(item.url, req);
          if (!resolvedUrl) continue;
          sourceRef = resolvedUrl;
          const response = await axios.get(resolvedUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            validateStatus: () => true,
          });
          if (response.status >= 400) continue;
          fileBuffer = Buffer.from(response.data);
        }

        const fileName = String(item.name || path.basename(sourceRef.split('?')[0]) || '文档.docx');
        const ext = path.extname(fileName).toLowerCase();
        if (ext && ext !== '.docx') continue;

        const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
        const rawText = String(parsed?.value || '').trim();
        if (!rawText) continue;

        const excerpt = this.buildFallbackPreview(rawText, 520);
        if (!excerpt) continue;
        blocks.push([`文档：${fileName}`, `摘要：${excerpt}`].join('\n'));
      } catch (_error) {
        continue;
      }
    }

    if (!blocks.length) return '';
    return blocks.join('\n\n');
  }

  private extractLatexPlainText(raw: string) {
    const source = String(raw || '');
    if (!source.trim()) return '';
    return source
      .replace(/%.*$/gm, '')
      .replace(/\\begin\{[^}]+\}/g, ' ')
      .replace(/\\end\{[^}]+\}/g, ' ')
      .replace(/\\[a-zA-Z@]+(?:\[[^\]]*\])?(?:\{[^{}]*\})?/g, ' ')
      .replace(/[{}]/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private async buildLatexFallbackSummary(fileUrl: string, req?: Request) {
    const files = this.parseFileUrls(fileUrl);
    if (!files.length) return '';
    const blocks: string[] = [];
    for (const item of files.slice(0, 3)) {
      try {
        let fileBuffer: Buffer | null = null;
        let sourceRef = String(item.url || '');
        const localPath = this.resolveLocalUploadedFilePath(item.url);
        if (localPath) {
          try {
            fileBuffer = await fs.readFile(localPath);
            sourceRef = localPath;
          } catch (_error) {}
        }
        if (!fileBuffer) {
          const resolvedUrl = await this.resolveFileUrl(item.url, req);
          if (!resolvedUrl) continue;
          sourceRef = resolvedUrl;
          const response = await axios.get(resolvedUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            validateStatus: () => true,
          });
          if (response.status >= 400) continue;
          fileBuffer = Buffer.from(response.data);
        }

        const fileName = String(item.name || path.basename(sourceRef.split('?')[0]) || '文档.tex');
        const ext = path.extname(fileName).toLowerCase();
        if (ext && ext !== '.tex' && ext !== '.latex') continue;
        const rawText = fileBuffer.toString('utf8');
        const plainText = this.extractLatexPlainText(rawText);
        if (!plainText) continue;
        const excerpt = this.buildFallbackPreview(plainText, 520);
        if (!excerpt) continue;
        blocks.push(`文档：${fileName}\n摘要：${excerpt}`);
      } catch (_error) {
        continue;
      }
    }
    if (!blocks.length) return '';
    return blocks.join('\n\n');
  }

  private stripAcademicNoiseLines(text: string) {
    return String(text || '')
      .split('\n')
      .map(line =>
        this.redactFilePaths(String(line || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')),
      )
      .join('\n');
  }

  private stripAcademicTracebackSections(text: string) {
    let normalized = String(text || '');
    if (!normalized) return '';

    // 1) 先剔除代码块中的 traceback，避免整段堆栈进入前端消息。
    normalized = normalized.replace(
      /```(?:text|txt|log|python)?\s*\n[\s\S]*?Traceback[\s\S]*?```/gi,
      '',
    );

    // 2) 清除从 Traceback 起始到常见分隔标记前的整段错误堆栈。
    normalized = normalized.replace(
      /Traceback\s*\(most recent call last\):[\s\S]*?(?=\n\s*(?:重试中，请稍等|以下|总体而言|总之|摘要[:：]|$))/gi,
      '',
    );

    // 3) 清理常见 Python/requests/urllib3 错误链路残留行。
    normalized = normalized
      .replace(/^\s*File\s+"[^"\n]+"\s*,\s*line\s+\d+[^\n]*$/gim, '')
      .replace(
        /^\s*The above exception was the direct cause of the following exception:\s*$/gim,
        '',
      )
      .replace(/^\s*During handling of the above exception, another exception occurred:\s*$/gim, '')
      .replace(/^\s*(?:urllib3|requests|http\.client)\.[^\n]*$/gim, '')
      .replace(/^\s*(?:warnings?)?[，,\s]*在执行过程中遭遇问题[，,\s]*Traceback[:：]?\s*$/gim, '')
      .replace(/^\s*Traceback[:：]?\s*$/gim, '')
      .replace(/^\s*text\s*$/gim, '')
      .replace(
        /^\s*(?:urllib3\.exceptions\.[^\n]+|requests\.exceptions\.[^\n]+|http\.client\.[^\n]+)\s*$/gim,
        '',
      );

    return normalized;
  }

  private stripAcademicInlineBoilerplate(text: string) {
    let normalized = String(text || '');
    if (!normalized) return '';

    normalized = normalized
      .replace(/\[\s*Local\s+Message\s*]\s*/gi, '')
      .replace(/\b(?:\[?\s*Local\s+Message\s*]?)\s*waiting\s+gpt\s+response\.?/gi, '')
      .replace(/^\s*reconnecting\.\.\.\s*\d+\s*\/\s*\d+\s*$/gim, '')
      .replace(/^\s*重试中，请稍等\s*\d+\s*\/\s*\d+\s*[:：]?\s*$/gim, '')
      .replace(/^\s*explored\s+\d+\s+file[^\n]*$/gim, '')
      .replace(
        /(?:函数)?插件(?:作者|贡献者)\s*[:：]?\s*(?:[A-Za-z0-9_.-]+(?:\s*[,，、/&]\s*[A-Za-z0-9_.-]+)*)[，,;；。\s]*/gi,
        '',
      )
      .replace(/(?:函数)?插件(?:作者|贡献者)\[[^\]]+\][，,。.\s]*/gi, '')
      .replace(/\b(?:(?:函数)?插件作者|(?:函数)?插件贡献者)\s*\[[^\]]*]\s*/gi, '')
      .replace(/^\s*函数插件功能[？?]\s*$/gim, '')
      .replace(/\b(?:PDF_Summary|Word_Summary|PDF_QA)\s*[。.:：]\s*/gi, '')
      .replace(
        /\b(?:Request timeout\.\s*Network error\.?\s*Please check proxy settings in config\.py\.?)/gi,
        '',
      )
      .replace(
        /网络错误[，,。\s]*检查代理服务器是否可用[，,。\s]*以及代理设置的格式是否正确[，,。\s]*格式须是\[协议\]:\/\/\[地址\]:\[端口][，,。\s]*缺一不可[。.]?/gi,
        '',
      )
      .replace(/Please check proxy settings in config\.py\.?/gi, '')
      .replace(
        /(?:Unable to connect to proxy|ProxyError|Max retries exceeded with url)[^\n]*/gi,
        '',
      )
      .replace(/^\s*waiting\s+gpt\s+response\.?\s*$/gim, '')
      .replace(/^\s*Request timeout\.[^\n]*$/gim, '')
      .replace(/^\s*学术服务响应超时[，,。]?\s*请稍后重试\s*$/gim, '')
      .replace(/^\s*对整个Latex项目进行(?:润色|纠错|翻译)[^\n]*$/gim, '')
      .replace(/^\s*将PDF转换为Latex项目[^\n]*$/gim, '')
      .replace(/^\s*注意事项[:：][^\n]*$/gim, '')
      .replace(/^\s*此插件Windows支持最佳[^\n]*$/gim, '')
      .replace(/^\s*Linux下必须使用Docker安装[^\n]*$/gim, '')
      .replace(/^\s*详见项目主README\.md[^\n]*$/gim, '')
      .replace(/^\s*目前对机器学习类文献转化效果最好[^\n]*$/gim, '')
      .replace(/^\s*仅在Windows系统进行了测试[^\n]*$/gim, '')
      .replace(/^\s*如果有Latex环境，请使用[^\n]*$/gim, '')
      .replace(/^\s*分析结果[:：][^\n]*Latex主文件是[^\n]*$/gim, '')
      .replace(/^\s*主程序即将开始[^\n]*$/gim, '')
      .replace(/^\s*正在精细切分latex文件[^\n]*$/gim, '')
      .replace(/(?:任务处理中\s*[，,]?\s*请稍候\s*[（(][^）)\n]{0,240}[）)]\s*)+/gim, '')
      .replace(/\b任务处理中\s*[，,]?\s*请稍候\b/gim, '')
      .replace(/^\s*请开始多线程操作[。.]?\s*$/gim, '')
      .replace(/^\s*多线程操作已经开始[^\n]*$/gim, '')
      .replace(/^\s*执行中\s*[:：]\s*\[[^\n]*\]\s*$/gim, '')
      .replace(
        /^\s*`?(?:等待中|执行中|已成功|截断重试|已失败|输入过长已放弃|重试中\s*\d+\/\d+|等待重试\s*\d+)`?(?:\s*[:：].*)?$/gim,
        '',
      );

    return normalized;
  }

  private dedupeAcademicTruncationWarnings(text: string) {
    const source = String(text || '');
    if (!source) return '';
    const lines = source.split('\n');
    const out: string[] = [];
    let firstWarningPos: number | null = null;
    let maxOverflow: number | null = null;
    const warningPattern =
      /^\s*警告，文本过长将进行截断，Token溢出数[:：]\s*(\d+)(?:\s*[，,]\s*现继续运行)?\s*[。.]?\s*$/;
    for (const line of lines) {
      const matched = warningPattern.exec(String(line || ''));
      if (!matched) {
        out.push(line);
        continue;
      }
      if (firstWarningPos === null) firstWarningPos = out.length;
      const overflowRaw = String(matched[1] || '').trim();
      if (!overflowRaw) continue;
      const overflow = Number.parseInt(overflowRaw, 10);
      if (!Number.isFinite(overflow)) continue;
      if (maxOverflow === null || overflow > maxOverflow) maxOverflow = overflow;
    }
    if (maxOverflow !== null) {
      const warning = `警告，文本过长将进行截断，Token溢出数：${maxOverflow}，现继续运行。`;
      if (firstWarningPos === null || firstWarningPos < 0) {
        out.unshift(warning);
      } else {
        out.splice(Math.min(firstWarningPos, out.length), 0, warning);
      }
    }
    const cleanupCell = (value: string) =>
      String(value || '')
        .replace(/^\s*\|\s*/, '')
        .replace(/\s*\|\s*$/, '')
        .trim();

    // 兜底修复：把“路径行 + 描述行 + 分隔线”折叠成单行表格记录。
    const collapseSplitRowPairs = (value: string) =>
      String(value || '').replace(
        /^\s*\|\s*([^\n]+?)\s*\n(?:\s*\n)*\s*\|\s*([^\n]+?)\s*\|\s*(?:\n(?:\s*\n)*\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|?\s*)?/gm,
        (match: string, leftRaw: string, rightRaw: string) => {
          const left = cleanupCell(leftRaw);
          const right = cleanupCell(rightRaw);
          if (!left || !right) return match;
          if (
            this.isAcademicMarkdownTableSeparator(`| ${left} |`) ||
            this.isAcademicMarkdownTableSeparator(`| ${right} |`)
          ) {
            return match;
          }
          return `| ${left} | ${right} |`;
        },
      );

    const collapseTableBlankLines = (value: string) => {
      const sourceLines = String(value || '').split('\n');
      const output: string[] = [];
      for (let i = 0; i < sourceLines.length; i += 1) {
        const current = String(sourceLines[i] || '');
        if (current.trim()) {
          output.push(current);
          continue;
        }
        let prevIndex = output.length - 1;
        while (prevIndex >= 0 && !String(output[prevIndex] || '').trim()) prevIndex -= 1;
        let nextIndex = i + 1;
        while (nextIndex < sourceLines.length && !String(sourceLines[nextIndex] || '').trim()) {
          nextIndex += 1;
        }
        const prev = prevIndex >= 0 ? String(output[prevIndex] || '') : '';
        const next = nextIndex < sourceLines.length ? String(sourceLines[nextIndex] || '') : '';
        if (/^\s*\|/.test(prev) && /^\s*\|/.test(next)) continue;
        output.push(current);
      }
      return output.join('\n');
    };

    let normalized = out.join('\n');
    normalized = collapseSplitRowPairs(normalized);
    normalized = collapseTableBlankLines(normalized);
    return normalized;
  }

  private normalizeDenseAcademicParagraphs(text: string) {
    const source = String(text || '');
    if (!source.trim()) return '';
    const hasStructuredMarkdown =
      /(^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)|^\s*\|.+$|```)/m.test(source);
    if (hasStructuredMarkdown) return source;

    const nonEmptyLines = source
      .split('\n')
      .map(line => String(line || '').trim())
      .filter(Boolean);
    if (nonEmptyLines.length > 3) return source;
    if (source.length < 220) return source;
    const punctuationCount = (source.match(/[。！？.!?]/g) || []).length;
    if (punctuationCount < 4) return source;

    const parts = this.splitAcademicSentenceLikeParts(source)
      .map(item => item.trim())
      .filter(Boolean);
    if (parts.length < 2) return source;
    return parts.join('\n\n');
  }

  private isAcademicMarkdownTableSeparator(line: string) {
    return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*(?:\s*:?-{3,}:?\s*)?\|?\s*$/.test(String(line || ''));
  }

  private splitAcademicMarkdownTableCells(line: string) {
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

  private normalizeAcademicMarkdownTableRow(cells: string[], expectedColumns: number) {
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

  private repairBrokenMarkdownTables(text: string) {
    const source = String(text || '');
    if (!source.includes('|')) return source;
    const normalizeBars = (line: string) => {
      const current = String(line || '');
      const fullwidthCount = (current.match(/｜/g) || []).length;
      const asciiCount = (current.match(/\|/g) || []).length;
      if (fullwidthCount < 2 || asciiCount > 1) return current;
      return current.replace(/｜/g, '|');
    };
    const sourceLines = source.split('\n').map(line => normalizeBars(line));
    const lines: string[] = [];
    const findNextNonEmptyIndex = (bucket: string[], start: number) => {
      let index = start;
      while (index < bucket.length && !String(bucket[index] || '').trim()) index += 1;
      return index;
    };
    for (let i = 0; i < sourceLines.length; i += 1) {
      const current = String(sourceLines[i] || '');
      const firstPipe = current.indexOf('|');
      if (firstPipe > 0 && !/^\s*\|/.test(current)) {
        const prefix = current.slice(0, firstPipe).trimEnd();
        const maybeHeader = current.slice(firstPipe).trimStart();
        if (prefix && maybeHeader.startsWith('|') && !prefix.includes('|')) {
          const maybeHeaderCells = this.splitAcademicMarkdownTableCells(maybeHeader);
          const nextIndex = findNextNonEmptyIndex(sourceLines, i + 1);
          const next = nextIndex < sourceLines.length ? String(sourceLines[nextIndex] || '') : '';
          const next2Index = findNextNonEmptyIndex(sourceLines, nextIndex + 1);
          const next2 =
            next2Index < sourceLines.length ? String(sourceLines[next2Index] || '') : '';
          const nextCells = this.splitAcademicMarkdownTableCells(next);
          const canSplitNormalHeader =
            maybeHeaderCells.length >= 2 && this.isAcademicMarkdownTableSeparator(next);
          const canSplitSplitHeader =
            maybeHeaderCells.length === 1 &&
            nextCells.length === 1 &&
            this.isAcademicMarkdownTableSeparator(next2);
          if (canSplitNormalHeader || canSplitSplitHeader) {
            lines.push(prefix, maybeHeader);
            continue;
          }
        }
      }
      lines.push(current);
    }
    const out: string[] = [];
    const isTableLike = (line: string) => /^\s*\|/.test(String(line || ''));
    const findNextTableLineIndex = (start: number) => findNextNonEmptyIndex(lines, start);

    let cursor = 0;
    while (cursor < lines.length) {
      const current = String(lines[cursor] || '');
      if (!current.trim()) {
        out.push(current);
        cursor += 1;
        continue;
      }
      const nextIndex = findNextTableLineIndex(cursor + 1);
      const next = nextIndex < lines.length ? String(lines[nextIndex] || '') : '';
      const next2Index = findNextTableLineIndex(nextIndex + 1);
      const next2 = next2Index < lines.length ? String(lines[next2Index] || '') : '';
      const headerCells = this.splitAcademicMarkdownTableCells(current);
      const nextCells = this.splitAcademicMarkdownTableCells(next);
      const hasNormalHeader =
        isTableLike(current) &&
        headerCells.length >= 2 &&
        this.isAcademicMarkdownTableSeparator(next);
      const hasSplitHeader =
        isTableLike(current) &&
        isTableLike(next) &&
        headerCells.length === 1 &&
        nextCells.length === 1 &&
        !!String(headerCells[0] || '').trim() &&
        !!String(nextCells[0] || '').trim() &&
        this.isAcademicMarkdownTableSeparator(next2);

      if (hasNormalHeader || hasSplitHeader) {
        const normalizedHeader = hasSplitHeader ? [headerCells[0], nextCells[0]] : headerCells;
        const expectedColumns = Math.max(2, normalizedHeader.length);
        out.push(this.normalizeAcademicMarkdownTableRow(normalizedHeader, expectedColumns));
        out.push(`| ${new Array(expectedColumns).fill('---').join(' | ')} |`);
        cursor = hasSplitHeader ? next2Index + 1 : nextIndex + 1;

        while (cursor < lines.length) {
          const row = String(lines[cursor] || '');
          if (!row.trim()) {
            const afterBlankIndex = findNextTableLineIndex(cursor + 1);
            if (afterBlankIndex < lines.length && isTableLike(lines[afterBlankIndex])) {
              cursor += 1;
              continue;
            }
            out.push(row);
            cursor += 1;
            break;
          }
          if (!isTableLike(row)) break;
          if (this.isAcademicMarkdownTableSeparator(row)) {
            cursor += 1;
            continue;
          }

          const cells = this.splitAcademicMarkdownTableCells(row);
          if (!cells.length) {
            out.push(row);
            cursor += 1;
            continue;
          }

          if (cells.length === 1 && cursor + 1 < lines.length) {
            const nextRowIndex = findNextTableLineIndex(cursor + 1);
            const nextRow = nextRowIndex < lines.length ? String(lines[nextRowIndex] || '') : '';
            if (isTableLike(nextRow) && !this.isAcademicMarkdownTableSeparator(nextRow)) {
              const nextCells = this.splitAcademicMarkdownTableCells(nextRow);
              if (nextCells.length === 1) {
                out.push(
                  this.normalizeAcademicMarkdownTableRow([cells[0], nextCells[0]], expectedColumns),
                );
                cursor = nextRowIndex + 1;
                continue;
              }
            }
          }

          out.push(this.normalizeAcademicMarkdownTableRow(cells, expectedColumns));
          cursor += 1;
        }
        continue;
      }

      out.push(current);
      cursor += 1;
    }

    const cleanupCell = (value: string) =>
      String(value || '')
        .replace(/^\s*\|\s*/, '')
        .replace(/\s*\|\s*$/, '')
        .trim();

    // 兜底修复：有些输出会把两列表格拆成“路径行 + 描述行 + 分隔线”。
    const collapseSplitRowPairs = (value: string) => {
      const sourceLines = String(value || '').split('\n');
      const result: string[] = [];
      const findNextNonEmpty = (start: number) => {
        let idx = start;
        while (idx < sourceLines.length && !String(sourceLines[idx] || '').trim()) idx += 1;
        return idx;
      };
      let idx = 0;
      while (idx < sourceLines.length) {
        const current = String(sourceLines[idx] || '');
        const currentCells = this.splitAcademicMarkdownTableCells(current);
        if (
          /^\s*\|/.test(current) &&
          !this.isAcademicMarkdownTableSeparator(current) &&
          currentCells.length === 1
        ) {
          const nextIdx = findNextNonEmpty(idx + 1);
          const nextLine = nextIdx < sourceLines.length ? String(sourceLines[nextIdx] || '') : '';
          const nextCells = this.splitAcademicMarkdownTableCells(nextLine);
          if (
            /^\s*\|/.test(nextLine) &&
            !this.isAcademicMarkdownTableSeparator(nextLine) &&
            nextCells.length === 1
          ) {
            const left = cleanupCell(currentCells[0] || '');
            const right = cleanupCell(nextCells[0] || '');
            const isHeaderPair =
              /^(?:文件路径|filepath)$/i.test(left) && /^(?:功能描述|description)$/i.test(right);
            if (left && right && !isHeaderPair) {
              result.push(`| ${left} | ${right} |`);
              const maybeSeparatorIdx = findNextNonEmpty(nextIdx + 1);
              if (
                maybeSeparatorIdx < sourceLines.length &&
                this.isAcademicMarkdownTableSeparator(String(sourceLines[maybeSeparatorIdx] || ''))
              ) {
                idx = maybeSeparatorIdx + 1;
              } else {
                idx = nextIdx + 1;
              }
              continue;
            }
          }
        }
        result.push(current);
        idx += 1;
      }
      return result.join('\n');
    };

    const collapseTableBlankLines = (value: string) => {
      const sourceLines = String(value || '').split('\n');
      const output: string[] = [];
      for (let i = 0; i < sourceLines.length; i += 1) {
        const current = String(sourceLines[i] || '');
        if (current.trim()) {
          output.push(current);
          continue;
        }
        let prevIndex = output.length - 1;
        while (prevIndex >= 0 && !String(output[prevIndex] || '').trim()) prevIndex -= 1;
        let nextIndex = i + 1;
        while (nextIndex < sourceLines.length && !String(sourceLines[nextIndex] || '').trim()) {
          nextIndex += 1;
        }
        const prev = prevIndex >= 0 ? String(output[prevIndex] || '') : '';
        const next = nextIndex < sourceLines.length ? String(sourceLines[nextIndex] || '') : '';
        if (/^\s*\|/.test(prev) && /^\s*\|/.test(next)) continue;
        output.push(current);
      }
      return output.join('\n');
    };

    let normalized = out.join('\n');
    normalized = collapseSplitRowPairs(normalized);
    normalized = collapseTableBlankLines(normalized);
    return normalized;
  }

  private splitAcademicSentenceLikeParts(text: string) {
    const source = String(text || '');
    if (!source) return [];
    // 仅在“句号后 + 空白 + 可能的引号/括号 + 大写或中文”处切句，
    // 避免把 e.g. / i.e. / github.com 这类片段误拆。
    return source.split(/(?<=[。！？!?])\s+|(?<=\.)\s+(?=(?:["'“‘(\[]\s*)?[A-Z\u4E00-\u9FFF])/g);
  }

  private stripAcademicDisplayNoise(
    text: string,
    options: {
      trim?: boolean;
      removeSectionHeadings?: boolean;
    } = {},
  ) {
    const { trim = true, removeSectionHeadings = false } = options;
    if (!text) return '';
    let normalized = this.stripAcademicInlineBoilerplate(
      this.stripAcademicTracebackSections(
        this.stripAcademicNoiseLines(String(text).replace(/[​⁠﻿]/g, '').replace(/\r\n/g, '\n')),
      ),
    ).replace(/\n{4,}/g, '\n\n\n');
    normalized = this.dedupeAcademicTruncationWarnings(normalized);
    normalized = this.repairBrokenMarkdownTables(normalized);
    normalized = this.normalizeDenseAcademicParagraphs(normalized);
    if (removeSectionHeadings) {
      // 兼容旧调用参数：当前策略不再主动删除任何标题文本。
    }
    return trim ? normalized.trim() : normalized;
  }

  private sanitizeAcademicDeltaText(text: string) {
    if (!text) return '';
    const normalized = this.stripAcademicNoiseLines(
      String(text || '')
        .replace(/[​⁠﻿]/g, '')
        .replace(/\r\n/g, '\n'),
    );
    const cleaned = this.stripAcademicTracebackSections(normalized);
    return this.stripAcademicInlineBoilerplate(cleaned);
  }

  private sanitizeAcademicChunk(text: string) {
    if (text === undefined || text === null) return '';
    const normalized = this.stripAcademicDisplayNoise(
      this.stripAcademicTracebackSections(
        this.stripAcademicNoiseLines(String(text).replace(/[​⁠﻿]/g, '').replace(/\r\n/g, '\n')),
      ),
      { trim: false, removeSectionHeadings: false },
    );
    return normalized;
  }

  private cleanupSerializedPayloadResidue(text: string) {
    let normalized = String(text || '');
    if (!normalized) return '';
    if (
      !this.hasSerializedPayloadMarkers(normalized) &&
      !this.looksLikeAcademicJsonFragment(normalized)
    ) {
      return normalized;
    }
    normalized = normalized
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\n{4,}/g, '\n\n\n');
    return normalized;
  }

  private stripInlineSerializedPayloadResidue(text: string) {
    let normalized = String(text || '');
    if (!normalized) return '';
    if (
      !this.hasSerializedPayloadMarkers(normalized) &&
      !this.isLikelyAcademicJsonResidue(normalized)
    ) {
      return normalized;
    }

    normalized = normalized
      .replace(/\{\s*"content"\s*:\s*\[\s*\{\s*"type"\s*:\s*"text"\s*,\s*"text"\s*:\s*"/gi, '')
      .replace(/"\s*}\s*]\s*}\s*/g, '')
      .replace(/"\s*}\s*]\s*,?\s*/g, '')
      .replace(/^\s*"content"\s*:\s*\[\s*\{\s*"type"\s*:\s*"text"\s*,\s*"text"\s*:\s*"/gim, '')
      .replace(
        /^\s*"?(?:chatId|finishReason|promptReference|networkSearchResult|fileVectorResult|tool_calls)"?\s*:\s*[^,\n]+,?\s*$/gim,
        '',
      )
      .replace(
        /^\s*"?(?:full_reasoning_content|reasoning_content)"?\s*:\s*"(?:\\.|[^"])*",?\s*$/gim,
        '',
      )
      .replace(/^\s*"userBalance"\s*:\s*\{[\s\S]*?\}\s*,?\s*$/gim, '')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n');

    return normalized;
  }

  private sanitizeAcademicDelta(text: any) {
    if (text === undefined || text === null) return '';
    let normalized = this.redactFilePaths(
      String(text).replace(/[​⁠﻿]/g, '').replace(/\r\n/g, '\n'),
    );
    normalized = this.stripAcademicTracebackSections(normalized);
    normalized = this.stripAcademicInlineBoilerplate(normalized).replace(
      /Lens Report\s*｜\s*昱镜报告/g,
      'Lens Report｜昱镜报告',
    );
    normalized = this.dedupeAcademicTruncationWarnings(normalized);
    if (!normalized.length) return '';
    return normalized;
  }

  private sanitizeAcademicOutput(text: string) {
    if (!text) return '';
    return this.sanitizeAcademicChunk(String(text));
  }

  private normalizeFileVectorResultEntry(value: any): any {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
      return value
        .map(item => this.normalizeFileVectorResultEntry(item))
        .filter(item => item !== undefined && item !== null && String(item).trim() !== '');
    }
    if (typeof value !== 'object') return value;
    const out: Record<string, any> = { ...(value as Record<string, any>) };
    const pathKeys = [
      'path',
      'file_path',
      'filePath',
      'file',
      'url',
      'download_path',
      'downloadPath',
    ];
    let detectedPath = '';
    pathKeys.forEach(key => {
      const current = out[key];
      if (typeof current === 'string') {
        const trimmed = current.trim();
        out[key] = trimmed;
        if (!detectedPath && trimmed) detectedPath = trimmed;
      }
    });
    const normalizedName = this.getAcademicDownloadFileName(
      String(out.name || out.file_name || out.fileName || ''),
    );
    if (normalizedName) {
      if (out.name !== undefined) out.name = normalizedName;
      else if (out.file_name !== undefined) out.file_name = normalizedName;
      else if (out.fileName !== undefined) out.fileName = normalizedName;
      else out.name = normalizedName;
    } else if (detectedPath) {
      const fallbackName = this.getAcademicDownloadFileName(detectedPath);
      if (fallbackName) out.name = fallbackName;
    }
    return out;
  }

  private normalizeFileVectorResultPayload(value: any): any {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string') {
      const trimmed = String(value || '').trim();
      if (!trimmed) return '';
      if (!/^[\[{]/.test(trimmed)) return trimmed;
      try {
        const parsed = JSON.parse(trimmed);
        const normalized = this.normalizeFileVectorResultPayload(parsed);
        if (typeof normalized === 'string') return normalized;
        return JSON.stringify(normalized);
      } catch (_error) {
        return trimmed;
      }
    }
    if (Array.isArray(value)) {
      return value
        .map(item => this.normalizeFileVectorResultEntry(item))
        .filter(item => item !== undefined && item !== null && String(item).trim() !== '');
    }
    if (typeof value !== 'object') return value;
    const source = value as Record<string, any>;
    if (Array.isArray(source.files)) {
      return {
        ...source,
        files: source.files
          .map(item => this.normalizeFileVectorResultEntry(item))
          .filter(item => item !== undefined && item !== null && String(item).trim() !== ''),
      };
    }
    return this.normalizeFileVectorResultEntry(source);
  }

  private redactPayloadPaths(value: any, keyName = ''): any {
    if (keyName === 'fileVectorResult') {
      return this.normalizeFileVectorResultPayload(value);
    }
    if (typeof value === 'string') return this.redactFilePaths(value);
    if (Array.isArray(value)) return value.map(item => this.redactPayloadPaths(item));
    if (value && typeof value === 'object') {
      const out: Record<string, any> = {};
      Object.keys(value).forEach(key => {
        out[key] = this.redactPayloadPaths(value[key], key);
      });
      return out;
    }
    return value;
  }
  private sanitizeAcademicPayload(payload: any, preserveChunkSpacing = false): any {
    if (payload === null || payload === undefined) return payload;
    if (typeof payload === 'string') {
      return preserveChunkSpacing
        ? this.sanitizeAcademicDelta(payload)
        : this.sanitizeAcademicChunk(payload);
    }
    if (Array.isArray(payload)) {
      return payload.map(item => this.sanitizeAcademicPayload(item, preserveChunkSpacing));
    }
    if (typeof payload !== 'object') return payload;

    const out: Record<string, any> = {};
    Object.keys(payload).forEach(key => {
      const value = payload[key];
      if (key === 'fileVectorResult') {
        out[key] = this.normalizeFileVectorResultPayload(value);
        return;
      }
      out[key] = this.sanitizeAcademicPayload(value, preserveChunkSpacing);
    });
    return out;
  }

  private mergeAcademicContent(current: string, incoming: string) {
    const prev = String(current || '');
    const next = String(incoming || '');
    if (!next) return prev;
    if (!prev) return next;
    if (next === prev) return prev;
    if (next.startsWith(prev)) return next;
    if (prev.endsWith(next)) return prev;
    if (next.length > 24 && prev.includes(next)) return prev;

    // 仅做“尾-头”重叠裁剪，不注入空格/换行，避免破坏 markdown 结构。
    const maxOverlap = Math.min(512, prev.length, next.length);
    for (let size = maxOverlap; size >= 1; size -= 1) {
      if (prev.slice(prev.length - size) === next.slice(0, size)) {
        const suffix = next.slice(size);
        if (!suffix) return prev;
        return `${prev}${this.getAcademicChunkJoiner(prev, suffix)}${suffix}`;
      }
    }
    return `${prev}${this.getAcademicChunkJoiner(prev, next)}${next}`;
  }

  private getAcademicChunkJoiner(prev: string, next: string) {
    const left = String(prev || '');
    const right = String(next || '');
    if (!left || !right) return '';
    const leftLast = left[left.length - 1];
    const rightFirst = right[0];
    if (!leftLast || !rightFirst) return '';
    if (/\s/.test(leftLast) || /\s/.test(rightFirst)) return '';
    if (/^[,.;:!?%)}\]】》〉、，。！？；：]/.test(rightFirst)) return '';
    if (/[({\[【《“‘"'`]/.test(leftLast)) return '';

    const rightIsMarkdownBlockStart = /^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|```|~~~)/.test(right);
    if (rightIsMarkdownBlockStart) {
      if (/\n$/.test(left)) return '';
      return /[。！？.!?：:]$/.test(left) ? '\n\n' : '\n';
    }
    return '';
  }

  private getAcademicStructureScore(text: string) {
    const source = String(text || '');
    if (!source) return 0;
    const lineBreaks = (source.match(/\n/g) || []).length;
    const tableLines = source
      .split('\n')
      .filter(line =>
        /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*(?:\s*:?-{3,}:?\s*)?\|?\s*$/.test(String(line || '')),
      ).length;
    const headingCount = (source.match(/^\s{0,3}#{1,6}\s+/gm) || []).length;
    const listCount = (source.match(/^\s*(?:[-*+]|\d+\.)\s+/gm) || []).length;
    const codeFenceCount = (source.match(/```/g) || []).length;
    return (
      lineBreaks * 2 + tableLines * 16 + headingCount * 8 + listCount * 6 + codeFenceCount * 10
    );
  }

  private isAcademicTextClearlyWorse(candidate: string, existing: string) {
    const next = String(candidate || '');
    const current = String(existing || '');
    if (!next) return true;
    if (!current) return false;

    const nextScore = this.getAcademicStructureScore(next);
    const currentScore = this.getAcademicStructureScore(current);
    if (nextScore + 4 < currentScore) return true;

    const nextLines = next.split('\n').length;
    const currentLines = current.split('\n').length;
    if (currentLines >= 6 && nextLines <= 2) return true;

    return false;
  }

  private chooseBetterAcademicContent(existing: string, candidate: string) {
    const current = this.sanitizeAcademicChunk(existing || '');
    const next = this.sanitizeAcademicChunk(candidate || '');
    if (!next) return current;
    if (!current) return next;
    if (current === next) return next;
    if (current.startsWith(next) || current.includes(next)) return current;
    if (next.startsWith(current) || next.includes(current)) {
      if (this.isAcademicTextClearlyWorse(next, current)) return current;
      return next;
    }
    if (this.isAcademicTextClearlyWorse(next, current)) return current;
    if (next.length > current.length * 1.2) return next;
    return current;
  }

  private joinAcademicTextSegments(segments: string[]) {
    let merged = '';
    for (const segment of segments || []) {
      const current = String(segment || '');
      if (!current) continue;
      merged = this.mergeAcademicContent(merged, current);
    }
    return merged;
  }

  private compactAcademicCompareText(value: string) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。！？,.!?;:：；"'“”‘’（）()\[\]【】<>`~\-_*#|\\/]/g, '');
  }

  private dedupeAcademicTextSegments(segments: string[]) {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of segments || []) {
      const current = String(item || '');
      if (!current) continue;
      const key = this.compactAcademicCompareText(current);
      if (!key) {
        // 仅符号分片（如 "**"、"|"、"\n"）在 Markdown 中是结构本体，不能按“空值”丢弃。
        result.push(current);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(current);
    }
    return result;
  }

  private pickPrimaryAcademicText(segments: string[]) {
    const deduped = this.dedupeAcademicTextSegments(segments || []);
    return deduped.length ? deduped[0] : '';
  }

  private extractAcademicPayloadText(payload: any): string {
    if (!payload) return '';
    if (typeof payload === 'string') return this.extractTextFromSerializedContent(payload);
    if (Array.isArray(payload)) {
      return this.joinAcademicTextSegments(
        payload.map(item => {
          if (!item) return '';
          if (typeof item === 'string') return this.extractTextFromSerializedContent(item);
          if (typeof item?.text === 'string')
            return this.extractTextFromSerializedContent(item.text);
          if (typeof item?.content === 'string') {
            return this.extractTextFromSerializedContent(item.content);
          }
          return '';
        }),
      );
    }
    if (typeof payload === 'object') {
      if (typeof payload.text === 'string')
        return this.extractTextFromSerializedContent(payload.text);
      if (payload.content) return this.extractAcademicPayloadText(payload.content);
    }
    return '';
  }

  private isAcademicHeartbeatText(text: string) {
    const normalized = String(text || '').trim();
    if (!normalized) return true;
    if (/^[.。…·\s]+$/.test(normalized)) return true;
    if (/`执行中`/i.test(normalized) && normalized.length < 180) return true;
    if (/^\s*执行中\s*[:：]\s*\[.*\]\s*$/i.test(normalized)) return true;
    if (/^\s*多线程操作已经开始/i.test(normalized)) return true;
    if (/任务处理中\s*[，,]?\s*请稍候\s*[（(][^）)\n]{0,240}[）)]/i.test(normalized)) return true;
    if (/分析结果[:：].*Latex主文件是/i.test(normalized) && normalized.length < 320) return true;
    if (/正在精细切分latex文件/i.test(normalized) && normalized.length < 320) return true;
    if (/主程序即将开始/i.test(normalized) && normalized.length < 220) return true;
    if (/^\s*请开始多线程操作[。.]?\s*$/i.test(normalized)) return true;
    if (
      /^\s*`?(?:等待中|执行中|已成功|截断重试|已失败|输入过长已放弃|重试中\s*\d+\/\d+|等待重试\s*\d+)`?(?:\s*[:：].*)?\s*$/i.test(
        normalized,
      ) &&
      normalized.length < 320
    ) {
      return true;
    }
    if (/waiting\s+gpt\s+response/i.test(normalized)) return true;
    if (/^\[local\s+message\]/i.test(normalized)) return true;
    if (
      /^(?:注意事项|此插件Windows支持最佳|Linux下必须使用Docker安装|详见项目主README\.md|目前对机器学习类文献转化效果最好|仅在Windows系统进行了测试|如果有Latex环境，请使用)/i.test(
        normalized,
      ) &&
      normalized.length < 420
    ) {
      return true;
    }
    if (/^对整个Latex项目进行(?:润色|纠错|翻译)/i.test(normalized) && normalized.length < 260)
      return true;
    if (/^将PDF转换为Latex项目/i.test(normalized) && normalized.length < 260) return true;
    if (
      /(正在提取摘要并下载pdf文档|下载arxiv论文并翻译摘要|读取并摘要arxiv论文|arxiv论文下载|正在获取文献名|下载中)/i.test(
        normalized,
      ) &&
      normalized.length < 220
    ) {
      return true;
    }
    if (
      /(使用方式|点击插件开始分析|正在分析论文|正在提取文本内容|请稍作等待|paper_file类型|论文快速解读)/i.test(
        normalized,
      ) &&
      normalized.length < 260
    ) {
      return true;
    }
    return false;
  }

  private hasSerializedPayloadMarkers(text: string) {
    const normalized = String(text || '').trim();
    if (!normalized) return false;
    if (
      /"(?:content|reasoning_content|full_reasoning_content|chatId|userBalance|finishReason|promptReference|fileVectorResult|networkSearchResult|tool_calls)"\s*:/.test(
        normalized,
      )
    ) {
      return true;
    }
    if (
      /(?:chatId|finishReason|userBalance|promptReference|fileVectorResult|networkSearchResult|reasoning_content)\s*[:=]/i.test(
        normalized,
      ) &&
      /[{}\[\]]/.test(normalized)
    ) {
      return true;
    }
    if (/ype"\s*:\s*"text"/i.test(normalized)) return true;
    if (/(?:^|[{\[,])\s*"type"\s*:\s*"text"\s*(?:[,}\]])/.test(normalized)) {
      return true;
    }
    return false;
  }

  private isLikelyAcademicJsonResidue(text: string) {
    const normalized = String(text || '').trim();
    if (!normalized) return false;
    if (this.hasSerializedPayloadMarkers(normalized)) return true;
    if (/^\{[^{}]{0,120}"(?:chatId|content|reasoning_content|type)"\s*:/i.test(normalized)) {
      return true;
    }
    if (
      /(?:^|[,{])\s*"content"\s*:\s*\[\s*\{\s*"type"\s*:\s*"text"\s*,\s*"text"\s*:/i.test(
        normalized,
      )
    ) {
      return true;
    }
    if (/^\s*\{?\s*"?(?:chatid|finishreason|userbalance|promptreference)"?\s*:/i.test(normalized)) {
      return true;
    }
    if (
      /"(?:type|content|text)"\s*:\s*"[^"]*$/.test(normalized) &&
      !/[。！？.!?]$/.test(normalized)
    ) {
      return true;
    }
    return false;
  }

  private isAcademicNetworkErrorSnippet(text: string) {
    const normalized = String(text || '').trim();
    if (!normalized) return false;
    return /(?:request timeout|network error|proxy settings in config\.py|检查代理服务器是否可用|代理设置的格式是否正确|格式须是\[协议\]:\/\/\[地址\]:\[端口\]|unable to connect to proxy|proxyerror|max retries exceeded|remote end closed connection without response)/i.test(
      normalized,
    );
  }

  private shouldKeepAcademicStreamAlive(line: string) {
    const normalized = String(line || '').trim();
    if (!normalized) return false;
    try {
      const payload = JSON.parse(normalized);
      if (
        payload?.finishReason ||
        payload?.finish_reason ||
        payload?.fileVectorResult ||
        (Array.isArray(payload?.choices) &&
          payload.choices.some((choice: any) => Boolean(choice?.finish_reason)))
      ) {
        return true;
      }
      const text = this.sanitizeAcademicDelta(
        this.extractAcademicPayloadText(
          payload?.content ??
            payload?.delta?.content ??
            payload?.choices?.[0]?.delta?.content ??
            payload?.choices?.[0]?.message?.content ??
            payload?.text ??
            payload?.message ??
            payload?.response ??
            payload?.finalContent,
        ),
      );
      return Boolean(text && !this.isAcademicHeartbeatText(text));
    } catch (_error) {
      const safeText = this.sanitizeAcademicDelta(normalized);
      return Boolean(safeText && !this.isAcademicHeartbeatText(safeText));
    }
  }

  private normalizeAcademicOutboundChunk(text: any) {
    if (text === undefined || text === null) return '';
    const extracted = this.extractAcademicPayloadText(text);
    const source = extracted || (typeof text === 'string' ? text : '');
    if (!source) return '';
    const normalized = this.sanitizeAcademicDelta(
      this.stripInlineSerializedPayloadResidue(this.cleanupSerializedPayloadResidue(source)),
    );
    if (!normalized) return '';
    if (this.isAcademicTraceNoise(normalized)) return '';
    if (this.isAcademicHeartbeatText(normalized)) return '';
    if (this.isLikelyAcademicJsonResidue(normalized)) return '';
    if (this.shouldDropAcademicNoise(normalized)) return '';
    return normalized;
  }

  private collectAcademicOutboundChunk(value: any, opts: { keepHeartbeat?: boolean } = {}) {
    const bucket: string[] = [];
    this.pushAcademicOutboundChunk(bucket, value, opts);
    return this.joinAcademicTextSegments(this.dedupeAcademicTextSegments(bucket));
  }

  private pushAcademicOutboundChunk(
    bucket: string[],
    value: any,
    opts: { keepHeartbeat?: boolean } = {},
  ) {
    const normalized = this.normalizeAcademicOutboundChunk(value);
    if (!normalized) return;
    if (!opts.keepHeartbeat && this.isAcademicHeartbeatText(normalized)) return;
    bucket.push(normalized);
  }

  private ensureAcademicNdjsonLine(line: string, chatId: number) {
    const normalized = String(line || '').replace(/\r/g, '');
    if (!normalized.trim()) return '';
    try {
      const payload = JSON.parse(normalized);
      if (!payload || typeof payload !== 'object') return '';
      const outbound: Record<string, any> = this.redactPayloadPaths(payload);
      if (!outbound.chatId && chatId) outbound.chatId = String(chatId);
      if (outbound.chatId !== undefined && outbound.chatId !== null) {
        outbound.chatId = String(outbound.chatId);
      }
      return JSON.stringify(outbound);
    } catch (_error) {
      const safeFallback = this.normalizeAcademicOutboundChunk(normalized);
      if (!safeFallback) return '';
      return JSON.stringify({
        content: [{ text: safeFallback }],
        chatId: String(chatId || ''),
      });
    }
  }

  private consumeAcademicLine(
    line: string,
    state: AcademicStreamState,
    hasTrailingNewline = false,
  ) {
    const normalizedLine = this.normalizeAcademicStreamLine(line);
    if (!normalizedLine) return;
    const appendContent = (text: string) => {
      const value = String(text ?? '');
      if (!value.length) return;
      let merged = this.mergeAcademicContent(state.fullContent || '', value);
      if (/警告，文本过长将进行截断，Token溢出数[:：]\s*\d+/i.test(merged)) {
        merged = this.dedupeAcademicTruncationWarnings(merged);
      }
      if (!merged.length) return;
      state.fullContent = merged;
      state.hasStreamContent = true;
      const stablePolishMatch = this.extractStablePolishReasonTable(state.fullContent || '');
      if (stablePolishMatch) {
        state.stablePolishContent = stablePolishMatch;
      }
    };
    const appendSanitizedContent = (text: any) => {
      const raw = String(text ?? '');
      if (!raw.length) return;
      const shouldKeepHeartbeatChunk = (chunk: string) => {
        const source = String(chunk || '');
        if (!source) return false;
        // 保留带结构换行的短分片，避免把“句号+换行”误判为心跳噪声，导致表格前断句丢失。
        return /\n/.test(source);
      };
      const preserveStructuralWhitespace = (chunk: string) => {
        // Markdown 表格/列表/段落高度依赖换行；纯空白分片也可能是有效结构信号，不能一概丢弃。
        if (!chunk.length) return false;
        if (chunk.trim().length !== 0) return false;
        appendContent(chunk);
        return true;
      };
      const rawLooksSerialized =
        this.looksLikeAcademicJsonFragment(raw) || this.hasSerializedPayloadMarkers(raw);
      // 纯文本分片走 fast-path，避免每个 chunk 做 JSON/序列化重解析，降低流式延迟。
      if (!rawLooksSerialized) {
        let quickText = this.sanitizeAcademicDeltaText(raw);
        if (!quickText) return;
        quickText = this.stripAcademicTracebackByState(state, quickText);
        if (!quickText) return;
        if (preserveStructuralWhitespace(quickText)) return;
        if (this.isAcademicTraceNoise(quickText)) return;
        if (this.isAcademicNetworkErrorSnippet(quickText)) {
          const safeError =
            this.getSafeAcademicErrorMessage(quickText) ||
            '学术服务网络异常，请检查学术服务代理配置或云端连通性。';
          state.streamError = state.streamError || safeError;
          return;
        }
        if (this.isAcademicHeartbeatText(quickText) && !shouldKeepHeartbeatChunk(quickText)) return;
        appendContent(quickText);
        return;
      }
      let candidate = this.extractTextFromSerializedContent(raw);
      if (!candidate) {
        const recovered = this.extractTextFromSerializedContent(
          this.cleanupSerializedPayloadResidue(raw),
        );
        if (recovered) candidate = recovered;
      }
      if (!candidate) return;
      let safeText = this.finalizeExtractedAcademicText(candidate);
      safeText = this.stripAcademicTracebackByState(state, safeText);
      if (!safeText) return;
      if (this.hasSerializedPayloadMarkers(safeText) || this.isLikelyAcademicJsonResidue(safeText))
        return;
      if (!safeText) return;
      if (preserveStructuralWhitespace(safeText)) return;
      if (this.isAcademicTraceNoise(safeText)) return;
      if (this.isAcademicNetworkErrorSnippet(safeText)) {
        const safeError =
          this.getSafeAcademicErrorMessage(safeText) ||
          '学术服务网络异常，请检查学术服务代理配置或云端连通性。';
        state.streamError = state.streamError || safeError;
        return;
      }
      if (this.isAcademicHeartbeatText(safeText) && !shouldKeepHeartbeatChunk(safeText)) return;
      // 上游经常按“字符级”流式返回；短分片中的标点/换行必须保留，否则最终排版会断裂。
      if (safeText.length <= 4 || !safeText.trim()) {
        appendContent(safeText);
        return;
      }
      appendContent(safeText);
    };
    try {
      const payload = JSON.parse(normalizedLine);
      if (payload?.resetContent) {
        state.fullContent = '';
        state.hasStreamContent = false;
      }
      const pullText = (value: any) => {
        if (!value) return '';
        if (typeof value === 'string') return this.extractTextFromSerializedContent(value);
        if (Array.isArray(value)) {
          return this.joinAcademicTextSegments(
            value.map(item => {
              if (!item) return '';
              if (typeof item === 'string') return this.extractTextFromSerializedContent(item);
              if (typeof item === 'object' && item.text) {
                return this.extractTextFromSerializedContent(String(item.text || ''));
              }
              return '';
            }),
          );
        }
        if (typeof value === 'object') {
          if (value.text) return this.extractTextFromSerializedContent(String(value.text || ''));
          if (value.content) return pullText(value.content);
        }
        return '';
      };
      const extractOpenAIContent = (value: any) => {
        if (!value) return '';
        if (typeof value === 'string') return this.extractTextFromSerializedContent(value);
        if (Array.isArray(value)) {
          return this.joinAcademicTextSegments(
            value.map(item => {
              if (!item) return '';
              if (typeof item === 'string') return this.extractTextFromSerializedContent(item);
              if (typeof item === 'object' && typeof item.text === 'string') {
                return this.extractTextFromSerializedContent(item.text);
              }
              if (
                typeof item === 'object' &&
                item.type === 'text' &&
                typeof item?.text === 'string'
              ) {
                return this.extractTextFromSerializedContent(item.text);
              }
              if (
                typeof item === 'object' &&
                item.type === 'output_text' &&
                typeof item?.text === 'string'
              ) {
                return this.extractTextFromSerializedContent(item.text);
              }
              if (typeof item === 'object' && item.content)
                return extractOpenAIContent(item.content);
              return '';
            }),
          );
        }
        if (typeof value === 'object') {
          if (typeof value.text === 'string')
            return this.extractTextFromSerializedContent(value.text);
          if (value.content) return extractOpenAIContent(value.content);
        }
        return '';
      };
      const extractTextField = (value: any) => {
        const extracted = pullText(value);
        if (extracted) return extracted;
        if (typeof value !== 'string') return '';
        const raw = String(value || '');
        if (!raw) return '';
        if (this.hasSerializedPayloadMarkers(raw) || this.looksLikeAcademicJsonFragment(raw)) {
          return '';
        }
        return raw;
      };
      const choiceContent = Array.isArray(payload.choices)
        ? this.joinAcademicTextSegments(
            payload.choices.map(
              (choice: any) =>
                extractOpenAIContent(choice?.delta?.content) ||
                extractOpenAIContent(choice?.message?.content) ||
                extractOpenAIContent(choice?.content),
            ),
          )
        : '';
      const outputContent = Array.isArray(payload.output)
        ? this.joinAcademicTextSegments(
            payload.output.map(
              (item: any) => extractOpenAIContent(item?.content) || extractOpenAIContent(item),
            ),
          )
        : '';
      const primaryContent = this.pickPrimaryAcademicText([
        choiceContent,
        extractOpenAIContent(payload?.delta?.content),
        extractTextField(payload?.content),
        extractTextField(payload?.text),
        extractTextField(payload?.message),
        extractTextField(payload?.response),
        outputContent,
      ]);
      appendSanitizedContent(primaryContent);
      if (payload.reasoning_content) {
        const text = extractTextField(payload.reasoning_content);
        const safeReasoning = this.sanitizeAcademicDelta(text);
        if (safeReasoning) {
          state.fullReasoning += safeReasoning;
        }
      }
      if (payload.finalContent) {
        const text = extractTextField(payload.finalContent);
        const safeText = this.sanitizeAcademicChunk(text);
        if (safeText && !this.shouldDropAcademicNoise(safeText)) {
          const current = state.fullContent || '';
          if (state.hasStreamContent && current) {
            if (safeText.startsWith(current)) {
              const suffix = safeText.slice(current.length);
              if (suffix) {
                state.fullContent = this.mergeAcademicContent(current, suffix);
              }
            }
          } else {
            const merged = this.chooseBetterAcademicContent(current, safeText);
            state.fullContent = merged;
            state.hasStreamContent = Boolean(merged);
          }
        }
      }
      if (Array.isArray(payload.choices)) {
        payload.choices.forEach((choice: any) => {
          const choiceReasoning =
            extractOpenAIContent(choice?.delta?.reasoning_content) ||
            extractOpenAIContent(choice?.message?.reasoning_content) ||
            extractOpenAIContent(choice?.reasoning_content);
          const safeChoiceReasoning = this.sanitizeAcademicDelta(choiceReasoning);
          if (safeChoiceReasoning) state.fullReasoning += safeChoiceReasoning;
          if (choice?.finish_reason) {
            state.finishReason = String(choice.finish_reason || '');
          }
        });
      }
      if (payload.full_content) {
        const text = extractTextField(payload.full_content);
        const safeText = this.sanitizeAcademicChunk(text);
        if (safeText && !this.shouldDropAcademicNoise(safeText)) {
          const current = state.fullContent || '';
          if (state.hasStreamContent && current) {
            if (safeText.startsWith(current)) {
              const suffix = safeText.slice(current.length);
              if (suffix) {
                state.fullContent = this.mergeAcademicContent(current, suffix);
              }
            }
          } else {
            const merged = this.chooseBetterAcademicContent(current, safeText);
            state.fullContent = merged;
            state.hasStreamContent = Boolean(merged);
          }
        }
      }
      if (payload.full_reasoning_content) {
        const text = extractTextField(payload.full_reasoning_content);
        const safeReasoning = this.sanitizeAcademicOutput(text) || this.sanitizeAcademicDelta(text);
        if (safeReasoning && !this.shouldDropAcademicNoise(safeReasoning)) {
          state.fullReasoning += safeReasoning;
        }
      }
      if (payload.fileVectorResult) {
        state.fileVectorResult =
          typeof payload.fileVectorResult === 'string'
            ? payload.fileVectorResult
            : JSON.stringify(payload.fileVectorResult);
      }
      if (payload.networkSearchResult) state.networkSearchResult = payload.networkSearchResult;
      if (payload.tool_calls) state.toolCalls = payload.tool_calls;
      if (payload.promptReference) state.promptReference = payload.promptReference;
      if (payload.finishReason || payload.finish_reason) {
        state.finishReason = String(payload.finishReason || payload.finish_reason || '');
      }
      if (String(payload.finishReason || payload.finish_reason || '').toLowerCase() === 'error') {
        const rawError = String(payload.error ?? '').trim();
        const safeError = this.sanitizeAcademicChunk(rawError) || this.redactFilePaths(rawError);
        const allowCacheNoise = /^'?allow_cache'?$/i.test(rawError);
        if (!allowCacheNoise && !state.fileVectorResult) {
          state.streamError = safeError || rawError || state.streamError || 'academic error';
        }
      }
    } catch (error) {
      const extracted = this.extractTextFromSerializedContent(normalizedLine);
      if (!extracted) {
        if (
          this.looksLikeAcademicJsonFragment(normalizedLine) ||
          this.hasSerializedPayloadMarkers(normalizedLine) ||
          this.isLikelyAcademicJsonResidue(normalizedLine)
        ) {
          return;
        }
      }
      const fallbackSource = extracted || normalizedLine;
      const fallbackText = this.finalizeExtractedAcademicText(fallbackSource);
      if (!fallbackText || this.shouldDropAcademicNoise(fallbackText)) return;
      if (this.isAcademicNetworkErrorSnippet(fallbackText)) {
        const safeError =
          this.getSafeAcademicErrorMessage(fallbackText) ||
          '学术服务网络异常，请检查学术服务代理配置或云端连通性。';
        state.streamError = state.streamError || safeError;
        return;
      }
      const fallbackWithBoundary =
        hasTrailingNewline && !fallbackText.endsWith('\n') ? `${fallbackText}\n` : fallbackText;
      state.fullContent = this.mergeAcademicContent(state.fullContent || '', fallbackWithBoundary);
      state.hasStreamContent = Boolean(state.fullContent);
      return;
    }
  }

  private sanitizeAcademicStreamLine(line: string) {
    const normalizedLine = this.normalizeAcademicStreamLine(line);
    if (!normalizedLine) return '';
    try {
      const payload = JSON.parse(normalizedLine);
      // 流式链路中同步做品牌/噪声净化，避免“实时显示脏、刷新后才干净”的抖动体验。
      const sanitizedPayload = this.sanitizeAcademicPayload(this.redactPayloadPaths(payload), true);
      return JSON.stringify(sanitizedPayload);
    } catch (_error) {
      const extracted = this.extractTextFromSerializedContent(normalizedLine);
      if (extracted) {
        const safeExtracted = this.sanitizeAcademicDelta(extracted);
        if (safeExtracted.trim()) {
          return safeExtracted;
        }
      }
      const safeText = this.sanitizeAcademicDelta(normalizedLine);
      if (
        this.hasSerializedPayloadMarkers(safeText) ||
        this.isLikelyAcademicJsonResidue(safeText)
      ) {
        return '';
      }
      if (!safeText.trim()) return '';
      return safeText;
    }
  }

  private looksLikeAcademicJsonFragment(text: string) {
    const line = String(text || '').trim();
    if (!line) return false;
    if (!/^[{\[]/.test(line)) return false;
    return /"[a-zA-Z0-9_]+"\s*:/.test(line);
  }

  private normalizeAcademicStreamLine(line: string) {
    if (line === undefined || line === null) return '';
    let normalized = String(line).replace(/\r/g, '');
    const marker = normalized.trim();
    if (!marker) return '';
    if (/^\s*data:/i.test(normalized)) {
      normalized = normalized.replace(/^\s*data:\s?/i, '');
    }
    const normalizedMarker = normalized.trim();
    if (!normalizedMarker) return '';
    if (/^\[done\]$/i.test(normalizedMarker)) return '';
    if (/^(?:event|id|retry):/i.test(normalizedMarker)) return '';
    return normalized;
  }

  private decodeXmlEntities(input: string) {
    return String(input || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractArxivId(input: string) {
    const text = String(input || '').trim();
    if (!text) return '';
    const matched = text.match(
      /(?:arxiv\.org\/(?:abs|pdf)\/)?((?:[a-z\-]+\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?)/i,
    );
    return matched?.[1] ? String(matched[1]).trim() : '';
  }

  private hasAcademicPaperReference(input: string) {
    const text = String(input || '').trim();
    if (!text) return false;
    if (Boolean(this.extractArxivId(text))) return true;
    const doiPattern = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
    return doiPattern.test(text);
  }

  private hasArxivSummaryContent(content: string) {
    const text = this.sanitizeAcademicOutput(String(content || ''));
    if (!text) return false;
    const summaryMatch = text.match(/(?:摘要|abstract)\s*[:：]\s*([\s\S]+)/i);
    if (summaryMatch?.[1] && summaryMatch[1].trim().length >= 40) return true;
    // 兜底：没有显式“摘要:”前缀时，要求正文长度足够避免把进度提示当成最终答案。
    return text.trim().length >= 80;
  }

  private countChineseChars(value: string) {
    return (String(value || '').match(/[\u4e00-\u9fff]/g) || []).length;
  }

  private hasStructuredMarkdownContent(value: string) {
    return /(^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)、]\s+|>\s+|\|.+\|)|```)/m.test(
      String(value || ''),
    );
  }

  private async fetchArxivMeta(
    arxivId: string,
  ): Promise<{ title: string; summary: string } | null> {
    const id = String(arxivId || '').trim();
    if (!id) return null;
    const urls = [
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`,
      `http://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`,
    ];
    for (const url of urls) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await axios.get(url, {
            timeout: 15000,
            headers: {
              'User-Agent': 'YutoLens/5.0',
            },
            proxy: false,
            maxRedirects: 5,
            responseType: 'text',
            validateStatus: () => true,
          });
          if (response.status >= 400) continue;
          const xml = String(response.data || '');
          const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/i);
          const entry = entryMatch?.[1] || '';
          if (!entry) continue;
          const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
          const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/i);
          const title = this.decodeXmlEntities(titleMatch?.[1] || '');
          const summary = this.decodeXmlEntities(summaryMatch?.[1] || '');
          if (!summary) continue;
          return { title, summary };
        } catch (_error) {
          continue;
        }
      }
    }
    return null;
  }

  private async fetchArxivMetaFromAbsPage(
    arxivId: string,
  ): Promise<{ title: string; summary: string } | null> {
    const id = String(arxivId || '').trim();
    if (!id) return null;
    const urls = [
      `https://arxiv.org/abs/${encodeURIComponent(id)}`,
      `http://arxiv.org/abs/${encodeURIComponent(id)}`,
    ];
    for (const url of urls) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await axios.get(url, {
            timeout: 15000,
            headers: {
              'User-Agent': 'YutoLens/5.0',
            },
            proxy: false,
            maxRedirects: 5,
            responseType: 'text',
            validateStatus: () => true,
          });
          if (response.status >= 400) continue;
          const html = String(response.data || '');
          const titleMatch =
            html.match(/<meta name="citation_title" content="([^"]+)"/i) ||
            html.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
          const abstractMatch =
            html.match(/<blockquote class="abstract[^"]*">([\s\S]*?)<\/blockquote>/i) ||
            html.match(/<meta name="description" content="([^"]+)"/i);
          const stripTags = (value: string) =>
            String(value || '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .replace(/^Abstract:\s*/i, '')
              .trim();
          const title = this.decodeXmlEntities(stripTags(titleMatch?.[1] || ''));
          const summary = this.decodeXmlEntities(stripTags(abstractMatch?.[1] || ''));
          if (!summary) continue;
          return { title, summary };
        } catch (_error) {
          continue;
        }
      }
    }
    return null;
  }
  private async ensureArxivSummary(content: string, input: string) {
    const safeContent = this.sanitizeAcademicOutput(content || '');
    const arxivId = this.extractArxivId(input || safeContent);
    if (!arxivId) return safeContent;
    const safeContentHasSummary = this.hasArxivSummaryContent(safeContent);
    const safeContentChineseChars = this.countChineseChars(safeContent);
    // 流式阶段已生成中文摘要时，禁止收尾再用 arXiv 英文元数据覆盖。
    if (safeContentHasSummary && safeContentChineseChars >= 24) {
      return safeContent;
    }
    const cachedMeta = this.arxivMetaCache.get(arxivId);

    const summaryCandidate = String(
      safeContent.match(/(?:摘要|abstract)\s*[:：]\s*([\s\S]+)/i)?.[1] || '',
    ).trim();
    const summaryCandidateChineseChars = this.countChineseChars(summaryCandidate);
    const preserveExistingSummary =
      Boolean(summaryCandidate) &&
      summaryCandidateChineseChars >= 16 &&
      (this.hasStructuredMarkdownContent(safeContent) || safeContentChineseChars >= 20);
    if (preserveExistingSummary) {
      return safeContent;
    }

    let summary = summaryCandidate;
    let title = String(
      safeContent.match(/论文标题\s*[:：]\s*([^\n]+)/i)?.[1] || cachedMeta?.title || '',
    ).trim();
    if (!summary || (summary.length < 120 && summaryCandidateChineseChars < 16)) {
      let arxivMeta = await this.fetchArxivMeta(arxivId);
      if (!arxivMeta?.summary) {
        arxivMeta = await this.fetchArxivMetaFromAbsPage(arxivId);
      }
      if (!arxivMeta?.summary && cachedMeta?.summary) {
        arxivMeta = { title: cachedMeta.title || '', summary: cachedMeta.summary || '' };
      }
      summary = String(arxivMeta?.summary || '').trim();
      if (!title) {
        title = String(arxivMeta?.title || '').trim();
      }

      if (!summary) {
        const inlineAbstract = String(
          safeContent.match(/(?:英文摘要原文|abstract)\s*[:：]\s*([\s\S]+)/i)?.[1] || '',
        ).trim();
        if (inlineAbstract.length >= 120) {
          summary = inlineAbstract;
        }
      }
    }

    summary = this.sanitizeAcademicOutput(summary || '').replace(
      /^(?:摘要|abstract)\s*[:：]\s*/i,
      '',
    );
    summary = summary
      .replace(/\[\s*Local\s+Message\s*]\s*/gi, '')
      .replace(/(?:函数)?插件(?:贡献者|作者)\[[^\]]*\]/g, '')
      .replace(
        /(?:函数)?插件(?:作者|贡献者)\s*[:：]?\s*(?:[A-Za-z0-9_.-]+(?:\s*[,，、/&]\s*[A-Za-z0-9_.-]+)*)[，,;；。\s]*/gi,
        '',
      )
      .replace(/```+/g, '')
      .replace(/【文件路径已隐藏】/g, '')
      .replace(/PDF文件也已经下载/g, '')
      .trim();
    if (/摘要[:：]/.test(summary)) {
      const nested = summary
        .split(/摘要[:：]/)
        .map(item => item.trim())
        .filter(Boolean);
      if (nested.length > 0) {
        summary = nested[nested.length - 1];
      }
    }
    const sentenceParts = this.splitAcademicSentenceLikeParts(summary)
      .map(item => item.trim())
      .filter(Boolean);
    if (sentenceParts.length > 1) {
      const seen = new Set<string>();
      const uniqueParts = sentenceParts
        .filter(item => {
          if (seen.has(item)) return false;
          seen.add(item);
          return true;
        })
        .filter(Boolean);
      summary = uniqueParts.join(uniqueParts.length >= 4 ? '\n\n' : ' ').trim();
    }
    summary = summary.replace(/\s{2,}/g, ' ').trim();
    if (!summary) {
      return `论文ID：${arxivId}\n\n摘要：暂未获取到摘要，请稍后重试。`;
    }

    this.arxivMetaCache.set(arxivId, {
      title: title || cachedMeta?.title || '',
      summary,
      ts: Date.now(),
    });
    const keepDownloadedNotice = /PDF文件也已经下载/i.test(safeContent);
    const summaryLabel = this.countChineseChars(summary) >= 8 ? '摘要：' : '摘要（原文）：';

    const blocks = [
      title ? `论文标题：${title}` : '',
      `${summaryLabel}${summary}`,
      keepDownloadedNotice ? 'PDF文件也已经下载' : '',
    ]
      .map(item => String(item || '').trim())
      .filter(Boolean);

    return this.sanitizeAcademicOutput(blocks.join('\n\n'));
  }

  private parseFileUrls(fileUrl?: any): Array<{ url: string; name?: string }> {
    if (!fileUrl) return [];

    const normalizeItem = (item: any): { url: string; name?: string } | null => {
      if (!item) return null;
      if (typeof item === 'string') {
        const url = item.trim();
        return url ? { url } : null;
      }
      if (typeof item === 'object') {
        const url = String(item.url || item.path || item.file || '').trim();
        if (!url) return null;
        const name = String(item.name || item.file_name || item.fileName || '').trim();
        return name ? { url, name } : { url };
      }
      return null;
    };

    if (Array.isArray(fileUrl)) {
      return fileUrl.map(normalizeItem).filter(Boolean) as Array<{ url: string; name?: string }>;
    }

    if (typeof fileUrl === 'object') {
      const one = normalizeItem(fileUrl);
      return one ? [one] : [];
    }

    const raw = String(fileUrl || '').trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeItem).filter(Boolean) as Array<{ url: string; name?: string }>;
      }
      const one = normalizeItem(parsed);
      return one ? [one] : [];
    } catch (_error) {
      if (raw.includes(',')) {
        return raw
          .split(',')
          .map(url => ({ url: String(url || '').trim() }))
          .filter(item => item.url);
      }
    }
    return [{ url: raw }];
  }

  private readStreamToString(
    stream: NodeJS.ReadableStream,
    maxBytes = 1024 * 1024,
  ): Promise<string> {
    return new Promise(resolve => {
      let size = 0;
      let chunks = '';
      stream.on('data', (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        size += Buffer.byteLength(text);
        if (size <= maxBytes) {
          chunks += text;
        }
      });
      stream.on('end', () => resolve(chunks));
      stream.on('error', () => resolve(chunks));
    });
  }

  private async resolveFileUrl(rawUrl: string, req?: Request) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) {
      const protocol = req?.protocol || 'http';
      return `${protocol}:${trimmed}`;
    }
    const siteUrlConfig = await this.globalConfigService.getConfigs(['siteUrl']);
    const siteUrl = typeof siteUrlConfig === 'string' ? siteUrlConfig : siteUrlConfig?.siteUrl;
    const preferRequestHost = process.env.ISDEV === 'true';
    const baseUrl = preferRequestHost
      ? req
        ? `${req.protocol}://${req.get('host')}`
        : siteUrl
        ? formatUrl(siteUrl)
        : ''
      : siteUrl
      ? formatUrl(siteUrl)
      : req
      ? `${req.protocol}://${req.get('host')}`
      : '';
    if (!baseUrl) return trimmed;
    if (trimmed.startsWith('/')) return `${baseUrl}${trimmed}`;
    return `${baseUrl}/${trimmed}`;
  }

  private resolveLocalUploadedFilePath(rawUrl: string) {
    const raw = String(rawUrl || '')
      .trim()
      .replace(/[?#].*$/, '')
      .replace(/\\/g, '/');
    if (!raw) return '';
    let relativePath = '';
    if (raw.startsWith('file/')) {
      relativePath = raw.slice('file/'.length);
    } else {
      const idx = raw.indexOf('/file/');
      if (idx >= 0) {
        relativePath = raw.slice(idx + '/file/'.length);
      }
    }
    relativePath = String(relativePath || '')
      .replace(/^\/+/, '')
      .trim();
    if (!relativePath) return '';

    let decoded = relativePath;
    try {
      decoded = decodeURIComponent(relativePath);
    } catch (_error) {}

    const baseDir = path.join(process.cwd(), 'public', 'file');
    const fullPath = path.join(baseDir, decoded);
    if (!fullPath.startsWith(baseDir)) return '';
    return fullPath;
  }

  private async pullFilesToAcademic(fileUrl: string, userName: string, req?: Request) {
    const urls = this.parseFileUrls(fileUrl);
    if (!urls.length) return '';

    const preparedFiles: Array<{ buffer: Buffer; fileName: string }> = [];
    for (const item of urls) {
      let buffer: Buffer | null = null;
      const localPath = this.resolveLocalUploadedFilePath(item.url);
      if (localPath) {
        try {
          buffer = await fs.readFile(localPath);
        } catch (_error) {}
      }
      if (!buffer) {
        const resolvedUrl = await this.resolveFileUrl(item.url, req);
        if (!resolvedUrl) continue;
        const response = await axios.get(resolvedUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          validateStatus: () => true,
        });
        if (response.status >= 400) {
          throw new HttpException(`文件下载失败(${response.status})`, HttpStatus.BAD_GATEWAY);
        }
        buffer = Buffer.from(response.data);
      }
      if (!buffer) continue;
      const fileName = item.name || path.basename(localPath || item.url.split('?')[0]) || 'file';
      preparedFiles.push({ buffer, fileName });
    }
    if (!preparedFiles.length) return '';

    let lastError: any = null;
    for (const baseUrl of this.getAcademicBaseUrls()) {
      const form = new FormData();
      preparedFiles.forEach(file => {
        form.append('files', file.buffer, { filename: file.fileName });
      });
      form.append('user_name', userName);

      try {
        const timeout = this.getAcademicTimeout(baseUrl, 120000);
        const response = await axios.post(`${baseUrl}/academic/upload`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout,
          validateStatus: () => true,
        });
        if (response.status < 400) {
          return response.data?.upload_dir || '';
        }
        lastError = new Error(`academic upload status ${response.status}`);
        this.logger.warn(
          JSON.stringify({
            event: 'academic_upload_failed',
            path: '/academic/upload',
            baseUrl,
            status: response.status,
          }),
        );
      } catch (error) {
        lastError = error;
        this.logger.warn(
          JSON.stringify({
            event: 'academic_upload_error',
            path: '/academic/upload',
            baseUrl,
            message: (error as Error)?.message || 'upload failed',
          }),
        );
      }
    }

    throw lastError || new Error('academic upload failed');
  }
}
