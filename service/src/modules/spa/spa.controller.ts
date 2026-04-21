import { Controller, Get, Logger, Next, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { join } from 'path';
import { formatUrl } from '@/common/utils/fromatUrl';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';

@ApiTags('spa')
@Controller()
export class SpaController {
  private readonly logger = new Logger(SpaController.name);
  private readonly indexPath = join(process.cwd(), 'public/chat/index.html');
  private readonly publicPath = join(process.cwd(), 'public/chat');
  private readonly exists: boolean;
  private readonly adminPath: string;
  private readonly legacyAdminPath = '/admin';

  constructor(private readonly globalConfigService: GlobalConfigService) {
    // 检查index.html是否存在
    this.exists = fs.existsSync(this.indexPath);

    // 获取管理后台路径
    this.adminPath = process.env.ADMIN_SERVE_ROOT || '/admin';
    Logger.log(`管理后台路径已配置: ${this.adminPath}`, 'SpaController');
  }

  private escapeXml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private async resolveBaseUrl(req: Request) {
    const config = await this.globalConfigService.getConfigs(['siteUrl']);
    const configuredSiteUrl = typeof config === 'string' ? config : config?.siteUrl;
    if (configuredSiteUrl) {
      return formatUrl(String(configuredSiteUrl));
    }

    const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
      .split(',')[0]
      .trim();
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || '')
      .split(',')[0]
      .trim();

    return host ? `${protocol}://${host}` : '';
  }

  @Get('sitemap.xml')
  async serveSitemap(@Req() req: Request, @Res() res: Response) {
    const baseUrl = await this.resolveBaseUrl(req);
    const routes = [
      { path: '/', changefreq: 'daily', priority: '1.0' },
      { path: '/llms.txt', changefreq: 'weekly', priority: '0.4' },
      { path: '/llms-full.txt', changefreq: 'weekly', priority: '0.4' },
      { path: '/seo/research-workspace.html', changefreq: 'weekly', priority: '0.8' },
      { path: '/seo/paper-summary.html', changefreq: 'weekly', priority: '0.8' },
      { path: '/seo/arxiv-summary.html', changefreq: 'weekly', priority: '0.8' },
      { path: '/seo/latex-translation.html', changefreq: 'weekly', priority: '0.8' },
      { path: '/seo/academic-polishing.html', changefreq: 'weekly', priority: '0.8' },
      { path: '/seo/faq.html', changefreq: 'weekly', priority: '0.7' },
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(route => {
    const loc = this.escapeXml(`${baseUrl}${route.path === '/' ? '' : route.path}`);
    return `  <url>
    <loc>${loc || this.escapeXml(route.path)}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`;
  })
  .join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(xml);
  }

  @Get('*')
  serveClient(@Req() req: Request, @Res() res: Response, @Next() next) {
    // 记录请求路径
    this.logger.debug(`收到请求: ${req.path}`);

    // 跳过API请求和静态资源目录请求
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/file') ||
      req.path.startsWith(this.adminPath) ||
      (this.adminPath !== this.legacyAdminPath && req.path.startsWith(this.legacyAdminPath))
    ) {
      return next();
    }

    // 检查是否为静态资源请求（如js、css等文件）
    const filePath = join(this.publicPath, req.path);
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      return next();
    }

    // 检查index.html是否存在
    if (!this.exists) {
      return res.status(500).send({ code: 500, message: 'SPA入口文件不存在', data: null });
    }

    // 返回SPA入口文件
    return res.sendFile(this.indexPath, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  }
}
