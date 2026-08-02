---
title: MySQL 慢 SQL 排查与优化实践
slug: mysql-slow-sql-optimization
publishedAt: "2025-03-09"
date: "2025.03.09"
category: 数据库
excerpt: 从开启慢查询日志开始，构造可复现的慢 SQL，完成日志定位、执行计划分析和常见优化。
readTime: 8 分钟
---

SQL 优化的第一步，通常不是凭经验修改语句，而是先找到真正耗时的查询。MySQL 的慢查询日志可以记录超过阈值的 SQL，再结合执行计划和索引情况进行分析。

## 开启慢查询日志

可以临时通过 SQL 开启慢查询日志，并设置执行时间阈值：

```sql
-- 开启慢查询日志
SET GLOBAL slow_query_log = 'ON';

-- 设置慢查询阈值，单位为秒
SET GLOBAL long_query_time = 5;
```

这类 `SET GLOBAL` 修改通常只对当前 MySQL 实例生效，重启后是否保留取决于配置文件。长期使用时，应将相关配置写入 MySQL 配置文件，并结合 `log_output`、日志轮转和磁盘空间进行管理。

## 构造可复现的慢 SQL

下面的脚本创建测试库、测试表和索引，并插入一批测试数据：

```sql
CREATE DATABASE IF NOT EXISTS test_db;
USE test_db;

SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 5;

SHOW VARIABLES LIKE 'slow_query_log_file';

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    age INT,
    email VARCHAR(255)
);

CREATE INDEX idx_name ON users (name);

DROP PROCEDURE IF EXISTS insert_large_data;
DELIMITER //
CREATE PROCEDURE insert_large_data()
BEGIN
    DECLARE i INT DEFAULT 1;
    WHILE i <= 100000 DO
        INSERT INTO users (name, age, email)
        VALUES (
            CONCAT('User', i),
            FLOOR(RAND() * 100),
            CONCAT('user', i, '@example.com')
        );
        SET i = i + 1;
    END WHILE;
END //
DELIMITER ;

CALL insert_large_data();
```

执行下面的语句可以查看慢查询日志文件路径：

```sql
SHOW VARIABLES LIKE 'slow_query_log_file';
```

![MySQL 慢查询日志文件路径](../assets/posts/mysql-slow-sql-optimization/slow-log-path.png)

## 查看慢查询日志

在服务器上可以使用 `tail` 实时查看日志：

```bash
tail -100f /var/lib/mysql/mysql-slow.log
```

日志中通常包含执行时间、锁等待时间、返回行数、扫描行数以及原始 SQL 等信息。也可以使用 `mysqldumpslow` 对慢查询进行聚合统计：

```bash
mysqldumpslow -s t -t 10 /var/lib/mysql/mysql-slow.log
```

![实时查看 MySQL 慢查询日志](../assets/posts/mysql-slow-sql-optimization/slow-log-tail.png)

需要注意，日志文件的实际路径应以 `slow_query_log_file` 的查询结果为准，容器环境中还要确认该路径是否映射到了宿主机。

## 分析慢 SQL

为了模拟耗时查询，可以执行：

```sql
SELECT
    SLEEP(10) AS delay_time,
    age,
    email
FROM users
WHERE age = 30;
```

`SLEEP(10)` 会让每一行结果都等待 10 秒，测试完成后应立即停止，不要在生产环境执行。慢日志中会记录类似的查询：

![慢查询日志中的 SQL 记录](../assets/posts/mysql-slow-sql-optimization/slow-query-record.png)

实际优化前，应先查看执行计划：

```sql
EXPLAIN
SELECT age, email
FROM users
WHERE age = 30;
```

重点关注 `type`、`possible_keys`、`key`、`rows` 和 `Extra` 等字段，判断是否使用索引、扫描了多少行，以及是否发生了额外排序或临时表操作。

## 常见 SQL 优化方法

### 1. 避免使用 SELECT *

只查询业务需要的字段，减少网络传输、内存占用和回表成本：

```sql
-- 不推荐
SELECT * FROM users WHERE id = 1;

-- 推荐
SELECT id, name, age FROM users WHERE id = 1;
```

### 2. 合理创建索引

- 为经常出现在 `WHERE`、`JOIN`、`ORDER BY` 中的字段评估索引；
- 优先选择区分度较高的字段；
- 设计合理的联合索引，利用最左匹配原则；
- 对覆盖查询考虑覆盖索引，减少回表；
- 对超长字符串字段评估前缀索引；
- 避免创建重复、很少使用或维护成本过高的索引。

索引不是越多越好。每次写入都需要维护索引，索引过多会增加插入、更新和删除的成本。

### 3. 减少索引失效

以下写法可能导致 MySQL 无法有效使用索引：

- `LIKE '%关键字'` 或 `LIKE '%关键字%'` 的前缀模糊查询；
- 在索引字段上使用函数或表达式；
- 索引字段与查询参数发生隐式类型转换；
- 对索引字段进行计算后再比较；
- 联合索引没有遵循最左匹配原则；
- `OR` 两侧条件无法分别利用索引。

是否真正使用索引，不能只凭规则判断，应该结合 `EXPLAIN` 和实际数据分布验证。

### 4. 关注日志中的真实问题

慢查询日志记录的是已经发生的性能问题。优化后应重新执行相同场景，比较执行时间、扫描行数和返回行数，并确认新执行计划符合预期。

## 实验数据清理

测试完成后，可以删除测试存储过程和测试库：

```sql
DROP PROCEDURE IF EXISTS insert_large_data;
DROP DATABASE IF EXISTS test_db;
```

不要在生产数据库直接运行包含 `DROP` 的清理脚本，执行前务必确认当前连接的数据库环境。

## 总结

慢 SQL 优化应该形成闭环：开启日志、定位真实查询、查看执行计划、修改 SQL 或索引、再次验证结果。避免 `SELECT *`、合理设计索引、减少索引失效只是常见起点，最终仍要以实际数据和执行计划为依据。
