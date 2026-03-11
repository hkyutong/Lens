import { formatUrl, removeSpecialCharacters } from '@/common/utils';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ALIOSS from 'ali-oss';
import axios from 'axios';
import * as TENCENTCOS from 'cos-nodejs-sdk-v5';
import type { Response } from 'express';
import * as FormData from 'form-data';
// import * as fs from 'fs';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import * as streamToBuffer from 'stream-to-buffer';
import { Repository } from 'typeorm';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
const blacklist = ['exe', 'sh', 'bat', 'js', 'php', 'py']; // 黑名单

@Injectable()
export class UploadService implements OnModuleInit {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
  ) {}
  private tencentCos: any;

  onModuleInit() {}

  private formatDateSegment(value: number) {
    return String(value).padStart(2, '0');
  }

  private async incrementCounter(key: string, ttlSeconds: number) {
    const raw = await this.redisCacheService.get({ key });
    const count = raw ? Number(raw) : 0;
    const next = count + 1;
    await this.redisCacheService.set({ key, val: String(next) }, ttlSeconds);
    return next;
  }

  private async isAdvancedUser(userId: number): Promise<boolean> {
    const balance = await this.userBalanceEntity.findOne({
      where: { userId },
      select: [
        'packageId',
        'expirationTime',
        'model4Count',
        'drawMjCount',
        'memberModel4Count',
        'memberDrawMjCount',
      ],
    });
    if (!balance) return false;
    const now = new Date();
    const expirationTime = balance.expirationTime ? new Date(balance.expirationTime) : null;
    const hasActiveMember = Boolean(balance.packageId && expirationTime && expirationTime > now);
    const hasSpecialCredits =
      Number(balance.model4Count || 0) > 0 ||
      Number(balance.drawMjCount || 0) > 0 ||
      Number(balance.memberModel4Count || 0) > 0 ||
      Number(balance.memberDrawMjCount || 0) > 0;
    return hasActiveMember || hasSpecialCredits;
  }

  private decodeURIComponentSafe(value: string) {
    const raw = String(value || '');
    try {
      return decodeURIComponent(raw);
    } catch (_error) {
      return raw;
    }
  }

  private sanitizeAttachmentName(value: string, fallback = 'download_file') {
    const normalized = String(value || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized || fallback;
  }

  private getSourceFileName(source: string) {
    const raw = this.decodeURIComponentSafe(String(source || '').trim())
      .replace(/[?#].*$/, '')
      .split(/[\\/]/)
      .pop();
    return raw || '';
  }

  private resolveLocalUploadRelativePath(sourceValue: string) {
    let source = this.decodeURIComponentSafe(String(sourceValue || '').trim());
    if (!source) return '';
    if (/^https?:\/\//i.test(source)) {
      try {
        const parsed = new URL(source);
        source = parsed.pathname || '';
      } catch (_error) {
        return '';
      }
    }
    source = source.split('#')[0].split('?')[0].replace(/\\/g, '/').trim();

    if (source.startsWith('/file/')) {
      source = source.slice('/file/'.length);
    } else if (source.startsWith('file/')) {
      source = source.slice('file/'.length);
    } else if (source.startsWith('/public/file/')) {
      source = source.slice('/public/file/'.length);
    } else if (source.startsWith('public/file/')) {
      source = source.slice('public/file/'.length);
    } else {
      return '';
    }

    source = source.replace(/^\/+/, '');
    if (!source || source.includes('\0')) return '';

    const normalized = path.posix.normalize(source);
    if (!normalized || normalized.startsWith('..')) return '';
    return normalized;
  }

  private resolveLocalUploadAbsolutePath(relativePath: string) {
    const baseDir = path.resolve(process.cwd(), 'public', 'file');
    const absolutePath = path.resolve(baseDir, relativePath);
    const basePrefix = baseDir.endsWith(path.sep) ? baseDir : `${baseDir}${path.sep}`;
    if (absolutePath !== baseDir && !absolutePath.startsWith(basePrefix)) {
      throw new HttpException('下载文件参数无效', HttpStatus.BAD_REQUEST);
    }
    return absolutePath;
  }

  private applyDownloadHeaders(
    res: Response,
    fileName: string,
    contentType = 'application/octet-stream',
    contentLength = 0,
  ) {
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    if (contentLength > 0) {
      res.setHeader('Content-Length', String(contentLength));
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
  }

  private async streamLocalUploadedFile(resolvedPath: string, targetName: string, res: Response) {
    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch (_error) {
      throw new HttpException('下载文件不存在或已过期', HttpStatus.NOT_FOUND);
    }
    if (!stat.isFile()) {
      throw new HttpException('下载文件参数无效', HttpStatus.BAD_REQUEST);
    }

    const contentType = String(mime.lookup(resolvedPath) || 'application/octet-stream');
    this.applyDownloadHeaders(res, targetName, contentType, Number(stat.size || 0));

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(resolvedPath);
      const cleanup = () => {
        stream.removeAllListeners();
        res.removeListener('close', onFinish);
        res.removeListener('finish', onFinish);
      };
      const onFinish = () => {
        cleanup();
        resolve();
      };
      stream.on('error', error => {
        cleanup();
        reject(error);
      });
      res.once('close', onFinish);
      res.once('finish', onFinish);
      stream.pipe(res);
    });
  }

  private async streamRemoteUploadedFile(sourceUrl: string, targetName: string, res: Response) {
    const timeoutMs = Math.max(Number(process.env.UPLOAD_FILE_PROXY_TIMEOUT_MS || 45000), 3000);
    const maxBytes = Math.max(
      Number(process.env.UPLOAD_FILE_PROXY_MAX_BYTES || 50 * 1024 * 1024),
      1024 * 1024,
    );
    const response = await axios.get(sourceUrl, {
      responseType: 'stream',
      timeout: timeoutMs,
      maxRedirects: 3,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      validateStatus: () => true,
      proxy: false,
    });
    if (response.status >= 400) {
      if (response.status === 404) {
        throw new HttpException('下载文件不存在或已过期', HttpStatus.NOT_FOUND);
      }
      if (response.status === 403 || response.status === 401) {
        throw new HttpException('下载文件已失效或无权限访问', HttpStatus.FORBIDDEN);
      }
      throw new HttpException('下载服务异常，请稍后重试', HttpStatus.BAD_GATEWAY);
    }

    const contentType = String(response.headers['content-type'] || 'application/octet-stream');
    const contentLength = Number(response.headers['content-length'] || 0);
    this.applyDownloadHeaders(res, targetName, contentType, contentLength);

    await new Promise<void>((resolve, reject) => {
      const stream = response.data;
      const cleanup = () => {
        stream.removeAllListeners('error');
        res.removeListener('close', onFinish);
        res.removeListener('finish', onFinish);
      };
      const onFinish = () => {
        cleanup();
        resolve();
      };
      stream.on('error', error => {
        cleanup();
        reject(error);
      });
      res.once('close', onFinish);
      res.once('finish', onFinish);
      stream.pipe(res);
    });
  }

  async proxyUploadedFile(sourceValue: string, name: string, res: Response) {
    const source = String(sourceValue || '').trim();
    if (!source) {
      throw new HttpException('下载文件参数无效', HttpStatus.BAD_REQUEST);
    }
    const fallbackName = this.getSourceFileName(source) || 'download_file';
    const targetName = this.sanitizeAttachmentName(name, fallbackName);
    const localRelativePath = this.resolveLocalUploadRelativePath(source);

    try {
      if (localRelativePath) {
        const absolutePath = this.resolveLocalUploadAbsolutePath(localRelativePath);
        await this.streamLocalUploadedFile(absolutePath, targetName, res);
        return;
      }

      if (!/^https?:\/\//i.test(source)) {
        throw new HttpException('下载文件参数无效', HttpStatus.BAD_REQUEST);
      }

      await this.streamRemoteUploadedFile(source, targetName, res);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.warn(
        JSON.stringify({
          event: 'upload_file_proxy_failed',
          message: String((error as Error)?.message || error),
        }),
      );
      throw new HttpException('下载服务异常，请稍后重试', HttpStatus.BAD_GATEWAY);
    }
  }

  // 检查用户上传频率
  private async checkUploadFrequency(userId: number, isAdvanced: boolean): Promise<void> {
    const now = new Date();
    const dateKey = `${now.getFullYear()}${this.formatDateSegment(
      now.getMonth() + 1,
    )}${this.formatDateSegment(now.getDate())}`;
    const hourKey = `${dateKey}${this.formatDateSegment(now.getHours())}`;
    const minuteKey = `${hourKey}${this.formatDateSegment(now.getMinutes())}`;

    if (isAdvanced) {
      const minuteCount = await this.incrementCounter(
        `upload:frequency:minute:${userId}:${minuteKey}`,
        70,
      );
      if (minuteCount > 20) {
        throw new HttpException('上传频率过高（每分钟最多20次）', HttpStatus.TOO_MANY_REQUESTS);
      }

      const hourCount = await this.incrementCounter(
        `upload:frequency:hour:${userId}:${hourKey}`,
        3700,
      );
      if (hourCount > 100) {
        throw new HttpException('上传频率过高（每小时最多100次）', HttpStatus.TOO_MANY_REQUESTS);
      }
      Logger.log(`用户${userId}上传频率: ${minuteCount}/min, ${hourCount}/hour`, 'UploadService');
      return;
    }

    const dayCount = await this.incrementCounter(
      `upload:frequency:day:${userId}:${dateKey}`,
      86400,
    );
    Logger.log(`用户${userId}当日上传次数: ${dayCount}`, 'UploadService');
    if (dayCount > 3) {
      throw new HttpException(
        '普通用户每日最多上传3个文件，请升级会员或获取特殊积分',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async uploadFile(file, dir = 'others', user = null) {
    const isAdvanced = user?.id ? await this.isAdvancedUser(user.id) : false;
    // 如果存在用户信息，则进行频率检查
    if (user && user.id) {
      await this.checkUploadFrequency(user.id, isAdvanced);
    }
    dir = dir || 'others';

    const { buffer, mimetype } = file || {};
    const originalName = file?.originalname || file?.name || '';
    const mimeExtension = mime.extension(mimetype || '') || '';
    const nameExtension = (path.extname(originalName) || '').replace('.', '');
    // Prefer filename extension over mime sniffing to avoid saving known files
    // (e.g. .tex/.docx) as .bin when browser reports generic octet-stream.
    const resolvedExtension = (nameExtension || mimeExtension || '').toLowerCase();
    const effectiveExtension = resolvedExtension || 'bin';

    const fileSize = typeof file?.size === 'number' ? file.size : buffer?.length || 0;
    const isImage =
      String(mimetype || '').startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'].includes(resolvedExtension);
    const maxImageSize = isAdvanced ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    const maxDocumentSize = isAdvanced ? 30 * 1024 * 1024 : 5 * 1024 * 1024;
    const maxSize = isImage ? maxImageSize : maxDocumentSize;
    if (fileSize > maxSize) {
      const limitLabel = isImage ? (isAdvanced ? '10MB' : '5MB') : isAdvanced ? '30MB' : '5MB';
      throw new HttpException(`文件大小超过限制(${limitLabel})`, HttpStatus.BAD_REQUEST);
    }

    if (process.env.ISDEV === 'true') {
      dir = `dev/${dir}`;
    }
    if (!resolvedExtension) {
      Logger.warn('无法识别文件类型，使用默认扩展名', 'UploadService');
    }

    // 检查文件扩展名是否在黑名单中
    if (blacklist.includes(effectiveExtension.toLowerCase())) {
      Logger.error('不允许上传此类型的文件', 'UploadService');
      throw new Error('不允许上传此类型的文件');
    }

    const now = new Date();
    const timestamp = now.getTime(); // 获取当前时间的时间戳
    const randomString = Math.random().toString(36).substring(2, 6); // 生成4位随机字符串
    const filename = `${timestamp}_${randomString}.${effectiveExtension}`; // 生成新的文件名，并添加文件后缀

    const {
      tencentCosStatus = 0,
      aliOssStatus = 0,
      cheveretoStatus = 0,
      localStorageStatus = 0,
      s3Status = 0,
    } = await this.globalConfigService.getConfigs([
      'tencentCosStatus',
      'aliOssStatus',
      'cheveretoStatus',
      'localStorageStatus',
      's3Status',
    ]);

    Logger.log(
      `上传配置状态 - 本地存储: ${localStorageStatus}, S3: ${s3Status}, 腾讯云: ${tencentCosStatus}, 阿里云: ${aliOssStatus}, Chevereto: ${cheveretoStatus}`,
      'UploadService',
    );

    const localEnabled = Number(localStorageStatus);
    const s3Enabled = Number(s3Status);
    const tencentEnabled = Number(tencentCosStatus);
    const aliEnabled = Number(aliOssStatus);
    const cheveretoEnabled = Number(cheveretoStatus);
    const hasAnyUpload =
      localEnabled || s3Enabled || tencentEnabled || aliEnabled || cheveretoEnabled;
    const hasNonImageUpload = localEnabled || s3Enabled || tencentEnabled || aliEnabled;

    if (!hasAnyUpload) {
      Logger.warn('未配置任何上传方式，自动启用本地存储', 'UploadService');
      // fallback to local storage to avoid blocking uploads
      return this.uploadFileToLocal({ filename, buffer, dir });
    }

    if (!isImage && !hasNonImageUpload) {
      Logger.warn('非图片文件不支持图床上传，自动启用本地存储', 'UploadService');
      return this.uploadFileToLocal({ filename, buffer, dir });
    }

    try {
      if (localEnabled) {
        Logger.log('使用本地存储上传文件', 'UploadService');
        const result = await this.uploadFileToLocal({ filename, buffer, dir });
        Logger.log(`文件已上传到本地存储。访问 URL: ${result}`, 'UploadService');
        return result;
      }
      if (s3Enabled) {
        Logger.log('使用 S3 上传文件', 'UploadService');
        const result = await this.uploadFileByS3({ filename, buffer, dir });
        Logger.log(`文件已上传到 S3。访问 URL: ${result}`, 'UploadService');
        return result;
      }
      if (tencentEnabled) {
        Logger.log('使用腾讯云 COS 上传文件', 'UploadService');
        const result = await this.uploadFileByTencentCos({
          filename,
          buffer,
          dir,
        });
        Logger.log(`文件已上传到腾讯云 COS。访问 URL: ${result}`, 'UploadService');
        return result;
      }
      if (aliEnabled) {
        Logger.log('使用阿里云 OSS 上传文件', 'UploadService');
        const result = await this.uploadFileByAliOss({
          filename,
          buffer,
          dir,
        });
        Logger.log(`文件已上传到阿里云 OSS。访问 URL: ${result}`, 'UploadService');
        return result;
      }
      if (isImage && cheveretoEnabled) {
        Logger.log('使用 Chevereto 上传文件', 'UploadService');
        const result = await this.uploadFileByChevereto({
          filename,
          buffer: buffer.toString('base64'),
        });
        Logger.log(`文件已上传到 Chevereto。访问 URL: ${result}`, 'UploadService');
        return result;
      }
    } catch (error) {
      Logger.error(`上传失败: ${error.message}`, 'UploadService');
      throw error; // 重新抛出异常，以便调用方可以处理
    }
  }

  async getUploadType() {
    const {
      tencentCosStatus = 0,
      aliOssStatus = 0,
      cheveretoStatus = 0,
      s3Status = 0,
    } = await this.globalConfigService.getConfigs([
      'tencentCosStatus',
      'aliOssStatus',
      'cheveretoStatus',
      's3Status',
    ]);
    if (Number(s3Status)) {
      return 's3';
    }
    if (Number(tencentCosStatus)) {
      return 'tencent';
    }
    if (Number(aliOssStatus)) {
      return 'ali';
    }
    if (Number(cheveretoStatus)) {
      return 'chevereto';
    }
  }

  async uploadFileFromUrl({ url, dir = 'others' }) {
    if (process.env.ISDEV === 'true') {
      dir = `dev/${dir}`;
    }

    const { buffer, mimeType } = await this.getBufferFromUrl(url);

    return await this.uploadFile({ buffer, mimetype: mimeType }, dir);
  }

  /* 通过腾讯云上传图片 */
  async uploadFileByTencentCos({ filename, buffer, dir }) {
    const { Bucket, Region, SecretId, SecretKey } = await this.getUploadConfig('tencent');
    this.tencentCos = new TENCENTCOS({
      SecretId,
      SecretKey,
      FileParallelLimit: 10,
    });
    try {
      return new Promise(async (resolve, reject) => {
        this.tencentCos.putObject(
          {
            Bucket: removeSpecialCharacters(Bucket),
            Region: removeSpecialCharacters(Region),
            Key: `${dir}/${filename}`,
            StorageClass: 'STANDARD',
            Body: buffer,
          },
          async (err, data) => {
            if (err) {
              Logger.error(`腾讯云COS上传失败: ${err.message}`, 'UploadService');
              return reject(err);
            }
            let locationUrl = data.Location.replace(
              /^(http:\/\/|https:\/\/|\/\/|)(.*)/,
              'https://$2',
            );
            const { acceleratedDomain } = await this.getUploadConfig('tencent');
            if (acceleratedDomain) {
              locationUrl = locationUrl.replace(
                /^(https:\/\/[^/]+)(\/.*)$/,
                `https://${acceleratedDomain}$2`,
              );
              Logger.log(`腾讯云COS已开启全球加速: ${locationUrl}`, 'UploadService');
            }
            return resolve(locationUrl);
          },
        );
      });
    } catch (error) {
      Logger.error(`腾讯云COS上传异常: ${error.message}`, 'UploadService');
      throw new HttpException('上传图片失败[ten]', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过阿里云上传图片 */
  async uploadFileByAliOss({ filename, buffer, dir }) {
    const { region, bucket, accessKeyId, accessKeySecret } = await this.getUploadConfig('ali');
    const client = new ALIOSS({
      region: removeSpecialCharacters(region),
      accessKeyId,
      accessKeySecret,
      bucket: removeSpecialCharacters(bucket),
      authorizationV4: true, // 使用V4签名算法，提供更高的安全性
      secure: true,
    });
    try {
      Logger.log('阿里云OSS开始上传', 'UploadService');
      return new Promise((resolve, reject) => {
        client
          .put(`${dir}/${filename}`, buffer)
          .then(async result => {
            const { acceleratedDomain } = await this.getUploadConfig('ali');
            if (acceleratedDomain) {
              result.url = result.url.replace(
                /^(https:\/\/[^/]+)(\/.*)$/,
                `https://${acceleratedDomain}$2`,
              );
              Logger.log(`阿里云OSS已开启全球加速: ${result.url}`, 'UploadService');
            }
            resolve(result.url);
          })
          .catch(err => {
            reject(err);
          });
      });
    } catch (error) {
      throw new HttpException('上传图片失败[ali]', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过S3上传文件 */
  async uploadFileByS3({ filename, buffer, dir }) {
    const { region, bucket, accessKeyId, secretAccessKey, endpoint, customDomain } =
      await this.getUploadConfig('s3');

    const s3Config: any = {
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    // 区域配置：如果没有设置，使用默认值 'us-east-1'
    // AWS SDK 要求必须有区域，即使是 S3 兼容服务
    if (region) {
      s3Config.region = removeSpecialCharacters(region);
    } else {
      // 为 S3 兼容服务提供默认区域，避免 SDK 报错
      s3Config.region = 'us-east-1';
    }

    // 如果有自定义端点（支持MinIO等S3兼容服务）
    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true; // MinIO等服务通常需要路径样式
    }

    const s3Client = new S3Client(s3Config);

    try {
      Logger.log(
        `S3 开始上传 - 区域: ${s3Config.region}, 存储桶: ${bucket}, 端点: ${endpoint || '默认'}`,
        'UploadService',
      );

      const command = new PutObjectCommand({
        Bucket: removeSpecialCharacters(bucket),
        Key: `${dir}/${filename}`,
        Body: buffer,
        ContentType: mime.lookup(filename) || 'application/octet-stream',
      });

      const result = await s3Client.send(command);

      // 构建文件访问URL
      let fileUrl: string;
      if (customDomain) {
        // 使用自定义域名（CDN等）
        fileUrl = `https://${customDomain}/${dir}/${filename}`;
      } else if (endpoint) {
        // 使用自定义端点
        const endpointUrl = endpoint.replace(/^https?:\/\//, '');
        fileUrl = `https://${endpointUrl}/${bucket}/${dir}/${filename}`;
      } else if (region) {
        // 使用标准AWS S3 URL（需要区域）
        fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${dir}/${filename}`;
      } else {
        // 默认S3 URL格式（无区域）
        fileUrl = `https://${bucket}.s3.amazonaws.com/${dir}/${filename}`;
      }

      Logger.log(`S3上传成功: ${fileUrl}`, 'UploadService');
      return fileUrl;
    } catch (error) {
      Logger.error(`S3上传失败: ${error.message}`, 'UploadService');
      Logger.error(
        `S3配置详情 - 区域: ${s3Config.region}, 存储桶: ${bucket}, 端点: ${
          endpoint || '默认'
        }, 访问密钥: ${accessKeyId ? '已设置' : '未设置'}`,
        'UploadService',
      );
      throw new HttpException(`上传文件失败[S3]: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  // 假设 uploadFileToLocal 是类的一个方法
  async uploadFileToLocal({ filename, buffer, dir = 'others' }) {
    // 确保目录和文件名没有非法字符
    const normalizedDir = path.normalize(dir).replace(/^(\.\.(\/|\\|$))+/, '');
    const normalizedFilename = path.basename(filename);

    const projectRoot = process.cwd(); // 获取项目根目录
    const uploadDir = path.join(projectRoot, 'public', 'file', normalizedDir);
    const filePath = path.join(uploadDir, normalizedFilename);

    // 确保最终路径在预期的目录内
    if (!filePath.startsWith(path.join(projectRoot, 'public', 'file'))) {
      throw new Error('非法路径，禁止访问目录之外的位置');
    }

    // 确保目录存在
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (err) {
      Logger.error(`创建目录失败: ${uploadDir}`, err);
      throw err;
    }

    // // 将文件buffer写入到指定路径
    // try {
    //   await fs.writeFile(filePath, buffer);
    // } catch (err) {
    //   Logger.error(`文件保存失败: ${filePath}`, err);
    //   throw err;
    // }

    // 将文件buffer写入到指定路径并设置为只读
    try {
      await fs.writeFile(filePath, buffer, { mode: 0o444 }); // 设置文件为只读
    } catch (err) {
      Logger.error(`文件保存失败: ${filePath}`, err);
      throw err;
    }

    // 使用环境变量中定义的基础URL来构建完整的文件访问URL
    let fileUrl = `file/${normalizedDir}/${normalizedFilename}`;
    const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
    if (siteUrl) {
      const url = formatUrl(siteUrl);
      fileUrl = `${url}/${fileUrl}`;
    }
    // 返回文件访问的URL
    return fileUrl;
  }

  /* 通过三方图床上传图片 */
  async uploadFileByChevereto({ filename = '', buffer }) {
    const { key, uploadPath } = await this.getUploadConfig('chevereto');
    const url = uploadPath.endsWith('/') ? uploadPath.slice(0, -1) : uploadPath;
    const formData = new FormData();
    const fromBuffer = buffer.toString('base64');
    formData.append('source', fromBuffer);
    formData.append('key', key);
    formData.append('title', filename);
    try {
      const res = await axios.post(url, formData, {
        headers: { 'X-API-Key': key },
      });
      if (res?.status === 200) {
        return res.data.image.url;
      } else {
        Logger.error(
          `Chevereto上传失败 - 状态码: ${res?.data.code}, 错误信息: ${res?.data.error.message}`,
          'UploadService',
        );
        Logger.error('上传图片失败[Chevereto]', JSON.stringify(res.data));
      }
    } catch (error) {
      Logger.error(`Chevereto上传异常: ${error.message}`, 'UploadService');
      throw new HttpException(
        `上传图片失败[Chevereto|buffer] --> ${error.response?.data.error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 获取cos上传配置 */
  async getUploadConfig(type) {
    if (type === 'ali') {
      const {
        aliOssRegion: region,
        aliOssBucket: bucket,
        aliOssAccessKeyId: accessKeyId,
        aliOssAccessKeySecret: accessKeySecret,
        aliOssAcceleratedDomain: acceleratedDomain,
      } = await this.globalConfigService.getConfigs([
        'aliOssRegion',
        'aliOssBucket',
        'aliOssAccessKeyId',
        'aliOssAccessKeySecret',
        'aliOssAcceleratedDomain',
      ]);

      return {
        region,
        bucket,
        accessKeyId,
        accessKeySecret,
        acceleratedDomain,
      };
    }
    if (type === 'tencent') {
      const {
        cosBucket: Bucket,
        cosRegion: Region,
        cosSecretId: SecretId,
        cosSecretKey: SecretKey,
        tencentCosAcceleratedDomain: acceleratedDomain,
      } = await this.globalConfigService.getConfigs([
        'cosBucket',
        'cosRegion',
        'cosSecretId',
        'cosSecretKey',
        'tencentCosAcceleratedDomain',
      ]);
      return { Bucket, Region, SecretId, SecretKey, acceleratedDomain };
    }
    if (type === 's3') {
      const {
        s3Region: region,
        s3Bucket: bucket,
        s3AccessKeyId: accessKeyId,
        s3SecretAccessKey: secretAccessKey,
        s3Endpoint: endpoint,
        s3CustomDomain: customDomain,
      } = await this.globalConfigService.getConfigs([
        's3Region',
        's3Bucket',
        's3AccessKeyId',
        's3SecretAccessKey',
        's3Endpoint',
        's3CustomDomain',
      ]);
      return { region, bucket, accessKeyId, secretAccessKey, endpoint, customDomain };
    }
    if (type === 'chevereto') {
      const { cheveretoKey: key, cheveretoUploadPath: uploadPath } =
        await this.globalConfigService.getConfigs(['cheveretoKey', 'cheveretoUploadPath']);
      return { key, uploadPath };
    }
  }

  async getBufferFromUrl(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const response = await axios.get(url, { responseType: 'stream' });

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      streamToBuffer(response.data, (err, buffer) => {
        if (err) {
          reject(new HttpException('获取图片资源失败，请重新试试吧！', HttpStatus.BAD_REQUEST));
        } else {
          resolve(buffer);
        }
      });
    });

    const mimeType = response.headers['content-type'];
    return { buffer, mimeType };
  }
}
