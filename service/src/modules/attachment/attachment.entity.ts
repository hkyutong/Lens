import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('attachment')
@Index(['ownerId', 'id'])
export class AttachmentEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'int' })
  ownerId: number;

  @Column({ type: 'varchar', length: 40 })
  storageKey: string;

  @Column({ type: 'varchar', length: 180 })
  filename: string;

  @Column({ type: 'varchar', length: 100 })
  contentType: string;

  @Column({ type: 'int', unsigned: true })
  byteSize: number;

  @CreateDateColumn()
  createdAt: Date;
}
