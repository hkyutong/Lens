import 'reflect-metadata';
import { DynamicModule, FactoryProvider } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TYPEORM_MODULE_OPTIONS } from '@nestjs/typeorm/dist/typeorm.constants';
import { DataSource } from 'typeorm';
import { AttachmentEntity } from '../attachment/attachment.entity';
import { DatabaseModule } from './database.module';

declare const describe: any;
declare const it: any;
declare const expect: any;

describe('attachment database registration', () => {
  it('builds owner-bound attachment metadata from the configured root entities without connecting', async () => {
    const imports = Reflect.getMetadata('imports', DatabaseModule) as DynamicModule[];
    const root = imports.find(module => module.module === TypeOrmModule);
    const core = root?.imports?.find(module => typeof module === 'object' && 'providers' in module) as DynamicModule;
    const optionsProvider = core.providers?.find(provider =>
      typeof provider === 'object' && 'provide' in provider && provider.provide === TYPEORM_MODULE_OPTIONS,
    ) as FactoryProvider<TypeOrmModuleOptions>;
    const configured = await optionsProvider.useFactory();
    const dataSource = new DataSource({
      type: 'mysql',
      database: 'synthetic_attachment_metadata',
      entities: configured.entities,
      synchronize: false,
      logging: false,
    });
    const metadataBuilder = dataSource as unknown as { buildMetadatas(): Promise<void> };

    await metadataBuilder.buildMetadatas();

    expect(dataSource.isInitialized).toBe(false);
    expect(dataSource.hasMetadata(AttachmentEntity)).toBe(true);
    const attachment = dataSource.getMetadata(AttachmentEntity);
    expect(attachment.primaryColumns.map(column => column.propertyName)).toEqual(['id']);
    expect(attachment.columns.some(column => column.propertyName === 'ownerId')).toBe(true);
  });
});
