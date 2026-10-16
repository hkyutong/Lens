import { AttachmentService } from '../attachment/attachment.service';
import { PublicAssetService, PublicAssetPurpose, PUBLIC_ASSET_PURPOSES } from '../attachment/publicAsset.service';
import { NotFoundException, ForbiddenException, BadRequestException, HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserBalanceService } from '../userBalance/userBalance.service';
import {
  PackageUploadEntitlement,
  resolvePackageUploadEntitlement,
} from '../../common/utils/packageEntitlements';
import { reserveUploadQuota, UploadQuotaReservation, UploadQuotaWindow } from './uploadQuota';

import { formatUrl, removeSpecialCharacters } from '@/common/utils';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { InjectRepository } from '@nestjs/typeorm';
import * as ALIOSS from 'ali-oss';
import axios from 'axios';
import * as TENCENTCOS from 'cos-nodejs-sdk-v5';
import type { Response } from 'express';
import * as FormData from 'form-data';
import { promises as fs } from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import { Repository } from 'typeorm';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';


interface ResolvedUploadPolicy {
  id?: number;
  exempt: boolean;
  legacyMember: boolean;
  upload: PackageUploadEntitlement | null;
}
const blacklist = ['exe', 'sh', 'bat', 'js', 'php', 'py']; // 黑名单

@Injectable()
export class UploadService implements OnModuleInit {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
    private readonly uploadUserBalanceService: UserBalanceService,
    private readonly attachmentService: AttachmentService,
    private readonly publicAssetService: PublicAssetService,

  ) {}
  private tencentCos: any;

  onModuleInit() {}

  private formatDateSegment(value: number) {
    return String(value).padStart(2, '0');
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

  async proxyUploadedFile(sourceValue: string, name: string, res: Response, ownerId: number) {
    const attachment = await this.attachmentService.readOwnedAttachment(sourceValue, ownerId);
    this.applyDownloadHeaders(res, name || attachment.filename, attachment.contentType, attachment.buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(attachment.buffer);
  }

  // 检查用户上传频率
  private async checkUploadFrequency(
    userId: number,
    isAdvanced: boolean,
    upload: PackageUploadEntitlement | null = null,
  ): Promise<UploadQuotaReservation> {
    const now = new Date();
    const dateKey = `${now.getFullYear()}${this.formatDateSegment(
      now.getMonth() + 1,
    )}${this.formatDateSegment(now.getDate())}`;
    const hourKey = `${dateKey}${this.formatDateSegment(now.getHours())}`;
    const minuteKey = `${hourKey}${this.formatDateSegment(now.getMinutes())}`;
    const windows: UploadQuotaWindow[] =
      isAdvanced || upload
        ? [
            {
              key: `upload:frequency:minute:${userId}:${minuteKey}`,
              limit: 20,
              ttlSeconds: 70,
              releaseOnFailure: false,
            },
            {
              key: `upload:frequency:hour:${userId}:${hourKey}`,
              limit: 100,
              ttlSeconds: 3700,
              releaseOnFailure: false,
            },
          ]
        : [{ key: `upload:frequency:day:${userId}:${dateKey}`, limit: 3, ttlSeconds: 86400 }];
    if (upload?.mode === 'limited')
      windows.push({
        key: `upload:frequency:day:${userId}:${dateKey}`,
        limit: upload.dailyLimit!,
        ttlSeconds: 86400,
      });
    const client = this.redisCacheService;
    let reservation: UploadQuotaReservation | null;
    try {
      reservation = await reserveUploadQuota(client, windows);
    } catch {
      throw new HttpException('文件上传暂时无法完成，请稍后再试', 503);
    }
    if (!reservation) throw new HttpException('已达到文件上传次数上限，请稍后再试', 429);
    return reservation;
  }

  async uploadFile(file, dir = 'others', user = null) {
    const uploadPolicy = await this.resolveUploadUserPolicy(user);
    const ownerId = this.assertUploadOwner(user);
    const isAdvanced = uploadPolicy.legacyMember;
    const packageSizeLimit = uploadPolicy.upload?.maxFileSizeMb;
    const physicalSizeLimit = Math.min(
      30 * 1024 * 1024,
      packageSizeLimit !== undefined ? packageSizeLimit * 1024 * 1024 : Number.POSITIVE_INFINITY,
    );
    if (file.size > physicalSizeLimit) throw new HttpException('文件超过允许的上传大小', 400);
    dir = dir || 'others';
    const { buffer, mimetype } = file || {};
    const originalName = file?.originalname || file?.name || '';
    const mimeExtension = mime.extension(mimetype || '') || '';
    const nameExtension = (path.extname(originalName) || '').replace('.', '');
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
      Logger.warn('UPLOAD_OPERATION_FAILED');
    }
    if (blacklist.includes(effectiveExtension.toLowerCase())) {
      Logger.error('UPLOAD_OPERATION_FAILED');
      throw new Error('不允许上传此类型的文件');
    }
    return this.runUploadWithQuota(uploadPolicy, async () => {
      return this.attachmentService.storePrivateAttachment(file.buffer, {
        filename: file.originalname || file.filename || 'attachment',
        contentType: file.mimetype,
      }, ownerId);
    });
  }
  async uploadPublicAsset(file: any, purpose: PublicAssetPurpose, user: { id?: unknown; role?: unknown }): Promise<string> {
    if (user?.role !== 'admin' && user?.role !== 'super') throw new ForbiddenException();
    if (!PUBLIC_ASSET_PURPOSES.includes(purpose)) throw new BadRequestException('Unsupported image upload');
    return this.storePublicRaster(file, purpose, user);
  }

  async uploadAvatar(file: any, user: { id?: unknown; role?: unknown }): Promise<string> {
    return this.storePublicRaster(file, 'avatar', user);
  }

  private assertUploadOwner(user: { id?: unknown } | null | undefined): number {
    const ownerId = Number(user?.id);
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw new NotFoundException();
    return ownerId;
  }

  private async storePublicRaster(file: any, purpose: PublicAssetPurpose | 'avatar', user: { id?: unknown; role?: unknown }): Promise<string> {
    this.assertUploadOwner(user);
    if (!Buffer.isBuffer(file?.buffer)) throw new BadRequestException('Invalid image');
    const policy = await this.resolveUploadUserPolicy(user);
    const packageSize = policy.upload?.maxFileSizeMb;
    const maxBytes = Math.min(10, packageSize && packageSize > 0 ? packageSize : 10) * 1024 * 1024;
    if (file.buffer.length > maxBytes) throw new BadRequestException('Image exceeds upload limit');
    return this.runUploadWithQuota(policy, () => this.publicAssetService.storePublicAsset(file.buffer, purpose));
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
    throw new NotFoundException();
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
              Logger.error('UPLOAD_OPERATION_FAILED');
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
              Logger.log('UPLOAD_OPERATION');
            }
            return resolve(locationUrl);
          },
        );
      });
    } catch (error) {
      Logger.error('UPLOAD_OPERATION_FAILED');
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
      Logger.log('UPLOAD_OPERATION');
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
              Logger.log('UPLOAD_OPERATION');
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
      Logger.log('UPLOAD_OPERATION');

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

      Logger.log('UPLOAD_OPERATION');
      return fileUrl;
    } catch (error) {
      Logger.error('UPLOAD_OPERATION_FAILED');
      Logger.error('UPLOAD_OPERATION_FAILED');
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
      Logger.error('UPLOAD_OPERATION_FAILED');
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
      Logger.error('UPLOAD_OPERATION_FAILED');
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
        Logger.error('UPLOAD_OPERATION_FAILED');
        Logger.error('UPLOAD_OPERATION_FAILED');
      }
    } catch (error) {
      Logger.error('UPLOAD_OPERATION_FAILED');
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
  private async resolveUploadUserPolicy(
    userInfo: { id?: unknown; role?: unknown } | null | undefined,
  ): Promise<ResolvedUploadPolicy> {
    if (userInfo == null) return { exempt: true, legacyMember: false, upload: null };
    const id = Number(userInfo.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpException('请登录后上传文件', 401);
    if (userInfo.role === 'admin' || userInfo.role === 'super')
      return { id, exempt: true, legacyMember: await this.isAdvancedUser(id), upload: null };
    const balance = await this.uploadUserBalanceService.queryUserBalance(id);
    const upload = resolvePackageUploadEntitlement(balance?.packageEntitlements);
    if (upload?.mode === 'disabled') throw new HttpException('当前套餐暂不支持上传文件', 403);
    const legacyMember = upload ? true : await this.isAdvancedUser(id);
    return { id, exempt: false, legacyMember, upload };
  }

  private async runUploadWithQuota<T>(
    policy: ResolvedUploadPolicy,
    operation: () => Promise<T>,
  ): Promise<T> {
    const reservation = policy.exempt
      ? null
      : await this.checkUploadFrequency(policy.id!, policy.legacyMember, policy.upload);
    let result: T;
    try {
      result = await operation();
      if (result == null) throw new HttpException('文件上传未完成，请稍后再试', 500);
    } catch {
      try {
        await reservation?.release();
      } catch {
        throw new HttpException('文件上传暂时无法完成，请稍后再试', 503);
      }
      throw new HttpException('文件上传未完成，请稍后再试', 500);
    }
    // A stored upload remains counted even if the commit acknowledgement fails.
    try {
      await reservation?.commit();
    } catch {
      throw new HttpException('文件上传暂时无法完成，请稍后再试', 503);
    }
    return result;
  }
}
