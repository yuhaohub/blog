---
title: Kafka 入门、安装与常用工具
slug: kafka-installation-and-usage
publishedAt: "2025-08-24"
date: "2025.08.24"
category: 消息队列
excerpt: 从 Kafka 基本概念出发，整理二进制安装、ZooKeeper 与 KRaft 启动方式、Docker 使用、命令行收发消息及 EFAK 图形化管理。
readTime: 10 分钟
---

## 什么是 Kafka

Kafka 是一个分布式事件流平台，支持发布/订阅消息、持久化事件以及实时处理数据流，适合吞吐量大、需要水平扩展的场景。

## Kafka 安装

### 下载二进制包

可以从 [Kafka 官网](https://kafka.apache.org/downloads) 下载二进制压缩包。本文示例使用 Kafka 4.0.0。

![Kafka 官方下载页面](../assets/posts/kafka-installation-and-usage/kafka-download.png)

### 解压安装

在 Linux 终端执行：

```bash
tar -xvf kafka_2.13-4.0.0.tgz -C /usr/local/
```

Kafka 使用 Scala 开发，运行前需要准备 JDK。安装目录和版本号可以按实际环境调整。

### 使用 ZooKeeper 启动（旧版本）

较早版本的 Kafka 依赖 ZooKeeper 管理集群状态。Kafka 4.x 默认使用 KRaft，通常不再附带 ZooKeeper 启动脚本；只有在维护旧版本集群时才采用本节方式。

如果系统没有 ZooKeeper，需要先从 [Apache ZooKeeper 官网](https://zookeeper.apache.org/releases.html) 下载并解压：

![ZooKeeper 下载页面](../assets/posts/kafka-installation-and-usage/zookeeper-download.png)

在 ZooKeeper 的 `conf` 目录创建配置文件并启动：

```bash
cp conf/zoo_sample.cfg conf/zoo.cfg
bin/zkServer.sh start
```

随后进入 Kafka 目录：

```bash
bin/kafka-server-start.sh -daemon config/server.properties
```

关闭 Kafka：

```bash
bin/kafka-server-stop.sh
```

### 使用 KRaft 启动（Kafka 4.x 推荐）

KRaft 用 Kafka 自身的 Raft 协议管理元数据，不再依赖 ZooKeeper。首次启动前，需要生成集群 ID、格式化存储目录，再以后台方式启动：

```bash
# 生成集群 ID
KAFKA_CLUSTER_ID=$(bin/kafka-storage.sh random-uuid)
echo "$KAFKA_CLUSTER_ID"

# 格式化存储目录
bin/kafka-storage.sh format \
  -t "$KAFKA_CLUSTER_ID" \
  -c config/kraft/server.properties

# 启动 Kafka
bin/kafka-server-start.sh -daemon config/kraft/server.properties
```

`format` 通常只需要在初始化数据目录时执行一次；重复格式化前应确认不会删除已有数据。

### 使用 Docker 安装

Kafka 官方文档提供了镜像，拉取示例：

```bash
docker pull apache/kafka:4.0.0
```

![拉取 Kafka Docker 镜像](../assets/posts/kafka-installation-and-usage/kafka-docker-pull.png)

运行容器时，需要根据单机或集群环境配置监听器（`listeners`）和对外公布地址（`advertised.listeners`）。这两个地址必须与客户端实际访问地址一致；生产环境还应配置数据卷、端口映射和重启策略，具体参数建议以对应版本的官方 Docker 文档为准。

## Kafka 简单使用

### 创建 Topic

```bash
bin/kafka-topics.sh \
  --create \
  --topic hello \
  --bootstrap-server localhost:9092
```

### 启动生产者

```bash
bin/kafka-console-producer.sh \
  --topic hello \
  --bootstrap-server localhost:9092
```

在命令行输入内容并回车，即可向 `hello` 发送消息。

### 启动消费者

```bash
bin/kafka-console-consumer.sh \
  --topic hello \
  --bootstrap-server localhost:9092 \
  --from-beginning
```

`--from-beginning` 表示从最早的可用消息开始消费；如果只需要接收启动后的新消息，可以省略该参数。

![Kafka 生产者与消费者终端](../assets/posts/kafka-installation-and-usage/console-producer-consumer.png)

## Kafka 图形化工具：EFAK

[EFAK（Eagle For Apache Kafka）](https://www.kafka-eagle.org/) 可以查看 Topic、消费者组和集群运行状态。它更适合与 ZooKeeper 模式的旧版 Kafka 配套使用，使用前应确认 EFAK 版本与 Kafka 版本兼容。

### 安装与配置

下载并解压后，目录结构通常包含 `bin`、`conf`、`db`、`logs` 等目录：

![EFAK 安装目录](../assets/posts/kafka-installation-and-usage/efak-files.png)

EFAK 依赖 MySQL 保存元数据。使用 ZooKeeper 模式时，还需要在 `conf/system-config.properties` 中配置 ZooKeeper 地址和 MySQL 连接信息，并创建对应的 `ke` 数据库。

可以将 EFAK 加入环境变量：

```bash
export KE_HOME=/usr/local/efak-web-3.0.1
export PATH="$PATH:$KE_HOME/bin"
```

### 启动与访问

```bash
bin/ke.sh start
```

启动日志会显示访问地址和默认登录信息。首次登录后请立即修改默认密码，并避免将管理端口直接暴露到公网：

![EFAK 启动日志](../assets/posts/kafka-installation-and-usage/efak-startup.png)

浏览器访问 `http://127.0.0.1:8048`（远程服务器请替换为服务器地址，并确认防火墙已放行端口）：

![EFAK 登录页面](../assets/posts/kafka-installation-and-usage/efak-login.png)

## 常见检查项

- Kafka 默认客户端端口通常是 `9092`，ZooKeeper 默认端口通常是 `2181`，EFAK Web 端口示例为 `8048`；实际值以配置文件为准。
- 客户端连不上时，优先检查 `advertised.listeners`、DNS/主机名解析、安全组和防火墙规则。
- 不要把默认账号、密码和管理端口直接用于生产环境；配置文件中的密码也不要提交到公开仓库。

