---
title: MySQL 启动失败异常记录：InnoDB 强制恢复
slug: mysql-recovery-record
publishedAt: "2025-02-16"
date: "2025.02.16"
category: 故障复盘
excerpt: 记录虚拟机异常关机后 MySQL 启动失败的排查过程，以及使用 innodb_force_recovery 导出数据的注意事项。
readTime: 5 分钟
---

一次笔记本死机导致虚拟机异常关闭。当时虚拟机中的 MySQL 正在运行，之后再次通过 Docker 启动 MySQL 时，容器无法正常工作。

通过查看日志发现多次出现：

```text
Page log sequence number is in the future
```

同时还出现了类似下面的断言失败：

```text
trx0types.h:579: m_rsegs_n < 2
```

这通常说明 InnoDB 的 redo 日志或事务系统元数据出现异常，可能伴随回滚段信息损坏。此时不应该直接删除数据目录或反复初始化容器，否则可能进一步丢失数据。

## 恢复前先保护数据

在执行任何修复操作前，先停止 MySQL，并完整复制数据目录到安全位置：

```bash
docker stop mysql
cp -a /var/lib/mysql /safe-backup/mysql-$(date +%F)
```

如果 MySQL 数据目录通过 Docker volume 挂载，应先确认真实挂载路径，再备份对应 volume。备份必须保留原始目录的完整结构、权限和文件内容。

## 启用强制恢复

在 MySQL 配置文件（例如 `/etc/my.cnf` 或 `/etc/mysql/my.cnf`）的 `[mysqld]` 段中添加：

```ini
[mysqld]
innodb_force_recovery = 1
```

`innodb_force_recovery` 是用于应急启动和导出数据的恢复模式，不是修复数据的工具。建议从最低级别 `1` 开始尝试：

1. 重新启动 MySQL 并观察日志；
2. 如果仍然无法启动，在完整备份的前提下逐级提高数值；
3. 每次只提高一级，确认能启动后立即导出重要数据；
4. 不要在恢复模式下继续进行正常写入业务。

不同级别会跳过不同的 InnoDB 后台操作，级别越高，数据损坏和数据不完整的风险越大。恢复模式的目标是“尽可能启动并导出”，而不是让实例长期运行。

## 启动并导出数据

如果配置文件已经正确挂载到容器中，可以重新启动容器并查看状态：

```bash
docker start mysql
docker ps
docker logs mysql
```

![Docker 启动 MySQL 后的容器状态](../assets/posts/mysql-recovery-record/docker-mysql-recovery.png)

确认实例能够连接后，优先使用 `mysqldump` 导出逻辑备份：

```bash
mysqldump -uroot -p \
  --all-databases \
  --single-transaction \
  --routines --events --triggers \
  > mysql-recovery.sql
```

如果某些表无法导出，应记录具体表名和错误信息，再结合备份文件、业务重要性和专业恢复工具继续处理。不要为了“让服务启动”而跳过备份步骤。

## 恢复正常配置

数据导出完成后：

1. 停止 MySQL；
2. 删除 `innodb_force_recovery` 配置，或将其设置为 `0`；
3. 使用新的干净数据目录初始化实例；
4. 导入刚才导出的 SQL；
5. 检查表数量、关键业务数据和应用连接情况。

```ini
[mysqld]
innodb_force_recovery = 0
```

不要在强制恢复模式下继续作为生产数据库运行，也不要直接在原损坏目录上反复尝试高等级恢复。

## 后续预防

- 为 MySQL 数据目录和 Docker volume 建立定期备份；
- 同时保留逻辑备份和物理备份；
- 虚拟机或宿主机异常关机后，先检查数据库日志再启动业务；
- 为容器配置健康检查和自动告警；
- 重要环境使用可靠的存储和快照机制，避免只依赖容器本身。

## 总结

`Page log sequence number is in the future` 和事务系统断言失败，通常意味着 InnoDB 的日志或元数据存在损坏迹象。正确的处理顺序是：先完整备份数据目录，再从低等级 `innodb_force_recovery` 尝试只读恢复和导出，最后移除恢复配置，在干净实例中导入数据。
