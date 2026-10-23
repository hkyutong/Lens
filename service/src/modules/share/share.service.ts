import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { Share } from './share.entity';

@Injectable()
export class ShareService {
  constructor(
    @InjectRepository(Share)
    private shareRepository: Repository<Share>,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  private generateShareCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private sanitizeHtmlContent(htmlContent: string) {
    return String(htmlContent || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
  }

  async createShare(htmlContent: string): Promise<string> {
    let shareCode: string;
    let isUnique = false;

    while (!isUnique) {
      shareCode = this.generateShareCode();
      const existing = await this.shareRepository.findOne({
        where: { shareCode },
      });
      if (!existing) {
        isUnique = true;
      }
    }

    const share = new Share();
    share.shareCode = shareCode;
    share.htmlContent = this.sanitizeHtmlContent(htmlContent);

    try {
      await this.shareRepository.save(share);
      const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
      return `${siteUrl}/?shareCode=${shareCode}`;
    } catch (error) {
      Logger.error('分享内容保存失败', ShareService.name);
      throw new HttpException('创建分享失败，请稍后重试', HttpStatus.BAD_REQUEST);
    }
  }

  async getShareByCode(shareCode: string): Promise<Share> {
    return await this.shareRepository.findOne({ where: { shareCode } });
  }
}
