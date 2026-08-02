---
title: Kafka 集群：核心概念与 ZooKeeper、KRaft 搭建实践
slug: kafka-cluster-deployment
publishedAt: "2025-10-05"
date: "2025.10.05"
category: 消息队列
excerpt: 梳理 Kafka Broker、Partition、ISR、LEO、HW 等核心概念，并在单机上模拟三节点集群，分别演示 ZooKeeper 与 KRaft 模式。
readTime: 14 分钟
---

Kafka 集群通过 Broker、Partition 和副本机制实现消息的分布式存储、负载均衡与故障转移。本文先梳理核心概念，再使用一台机器模拟三个 Broker，最后用 Spring Boot 创建带副本的 Topic 验证集群状态。

## Kafka 核心概念

### Broker

Broker 是 Kafka 的服务器节点，负责接收和存储消息、处理生产者与消费者请求。一个集群由多个 Broker 组成，每个节点通过唯一的 `broker.id`（KRaft 中还包括唯一的 `node.id`）进行标识。

### Topic

Topic 是消息的逻辑分类，类似消息队列中的队列名。生产者向 Topic 写入消息，消费者从 Topic 读取消息；一个 Topic 可以拆分为多个 Partition。

### Partition

Partition 是 Topic 的物理分段，本质上是一个有序、追加写入的消息日志。消息在分区内按 offset 编号，多个分区可以分布在不同 Broker 上，从而提高并行处理能力。

### Offset

Offset 是消息在所属分区中的位置编号。生产者写入位置会不断向后推进，消费者则通过提交 offset 记录消费进度，因此同一条消息可能被重新消费，但一个消费组会从自己的 offset 继续读取。

### Producer 与 Consumer

- **Producer**：向指定 Topic 写入消息，可以通过 Key、分区器或显式 Partition 选择目标分区；
- **Consumer**：从 Topic 拉取消息并处理；多个消费者可以组成 Consumer Group。

### Consumer Group

同一个消费者组内，一个 Partition 在同一时刻只会分配给一个消费者，因此组内消费者是负载均衡关系。不同消费者组互不影响，都会各自消费 Topic 的完整消息流，因此组与组之间表现为广播消费。

### ZooKeeper 与 KRaft

旧版 Kafka 使用 ZooKeeper 保存集群元数据、注册 Broker 并协调控制器。Kafka 2.8 开始引入 KRaft，Kafka 4.x 已以 KRaft 为主，用内置的 Raft 元数据仲裁替代 ZooKeeper，架构更简单。

### Replication、Leader 与 Follower

每个 Partition 可以配置多个副本。副本中有一个 Leader，负责处理读写请求；其余 Follower 从 Leader 同步数据。Leader 故障时，Kafka 会从健康副本中选举新的 Leader。

### Retention 与 Log

Kafka 不会因为消费者读取就立即删除消息，而是按时间或空间策略保留。默认保留时间通常为 7 天，具体以 `log.retention.*` 配置为准。每个 Partition 对应一组磁盘日志文件，采用顺序追加写入，适合高吞吐场景。

### ISR、LEO 与 HW

- **ISR（In-Sync Replicas）**：与 Leader 保持同步的副本集合，包含 Leader 本身和追上进度的 Follower。Leader 故障时，通常从 ISR 中选择新的 Leader；
- **LEO（Log End Offset）**：某个副本下一条待写入消息的位置。例如最后一条消息 offset 为 12，则 LEO 为 13；
- **HW（High Watermark）**：分区中已被 ISR 副本确认的消息边界。消费者最多只能读取 HW 之前的消息。

可以这样理解：LEO 表示“这个副本写到哪里”，HW 表示“哪些消息已经被同步副本共同确认”。

## 单机模拟三节点 Kafka 集群

生产环境通常将不同 Broker 部署在不同机器上。受资源限制，本文在一台 Linux 机器上复制三份 Kafka 目录，通过不同端口和日志目录模拟三个节点。示例版本为 Kafka 3.7.0。

![三个 Kafka 节点目录](../assets/posts/kafka-cluster-deployment/cluster-directories.png)

## Kafka + ZooKeeper 模式

### 准备 Kafka 与 ZooKeeper

从 [Kafka 官网](https://kafka.apache.org/downloads) 下载压缩包并解压，然后复制两份目录。ZooKeeper 的安装过程可参考 [ZooKeeper 安装记录](https://blog.csdn.net/qq_62877881/article/details/147818518?spm=1011.2415.3001.5331)。

### 配置三个 Broker

每个节点都需要单独的配置文件，至少修改以下内容：

```properties
broker.id=1
listeners=PLAINTEXT://0.0.0.0:9091
advertised.listeners=PLAINTEXT://<服务器地址>:9091
log.dirs=/tmp/kafka-logs/cluster/kafka-3.7.0-1
zookeeper.connect=localhost:2181
```

第二、第三个节点分别使用 `broker.id=2/3`、端口 `9092/9093` 和不同的 `log.dirs`。三个 Broker 的 `broker.id` 必须唯一，客户端实际连接的地址要与 `advertised.listeners` 一致。

![ZooKeeper 模式 Broker 配置](../assets/posts/kafka-cluster-deployment/zookeeper-broker-config.png)

### 启动并检查端口

先启动 ZooKeeper，再分别启动三个 Kafka Broker：

```bash
bin/zkServer.sh start

kafka-3.7.0-1/bin/kafka-server-start.sh -daemon kafka-3.7.0-1/config/server.properties
kafka-3.7.0-2/bin/kafka-server-start.sh -daemon kafka-3.7.0-2/config/server.properties
kafka-3.7.0-3/bin/kafka-server-start.sh -daemon kafka-3.7.0-3/config/server.properties
```

使用 `ss -lntp` 或 `netstat -nlpt` 检查 `2181`、`9091`、`9092`、`9093` 是否监听：

![ZooKeeper 与三个 Kafka Broker 端口](../assets/posts/kafka-cluster-deployment/cluster-ports.png)

ZooKeeper 客户端中可以看到 Broker 注册信息，例如 `/brokers/ids/1`、`/brokers/ids/2` 和 `/brokers/ids/3`：

![ZooKeeper 中的 Broker 注册信息](../assets/posts/kafka-cluster-deployment/zookeeper-tree.png)

## 使用 KRaft 管理集群

KRaft 集群中的每个节点都需要唯一 `node.id`。多节点部署时，应让节点配置中的 `controller.quorum.voters` 完全一致，并为每个节点设置不同的监听端口和日志目录：

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@localhost:9081,2@localhost:9082,3@localhost:9083

listeners=PLAINTEXT://0.0.0.0:9091,CONTROLLER://0.0.0.0:9081
inter.broker.listener.name=PLAINTEXT
advertised.listeners=PLAINTEXT://<服务器地址>:9091
controller.listener.names=CONTROLLER
listener.security.protocol.map=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
log.dirs=/tmp/kraft-combined-logs-1
```

节点 2、3 需要分别使用 `node.id=2/3`、客户端端口 `9092/9093`、控制器端口 `9082/9083` 和不同的日志目录。

![KRaft 节点配置](../assets/posts/kafka-cluster-deployment/kraft-config.png)

首次初始化 KRaft 存储时生成一次集群 ID，并在三个节点上使用同一个 ID 格式化各自的数据目录：

```bash
KAFKA_CLUSTER_ID=$(bin/kafka-storage.sh random-uuid)
echo "$KAFKA_CLUSTER_ID"

bin/kafka-storage.sh format \
  -t "$KAFKA_CLUSTER_ID" \
  -c config/kraft/server.properties

bin/kafka-server-start.sh -daemon config/kraft/server.properties
```

不同节点应使用各自的配置文件启动。不要对已有数据目录重复执行 `format`，否则可能破坏集群元数据。

## 在 Spring Boot 中验证 Kafka 集群

可以使用 Spring Kafka 声明一个包含 3 个分区、每个分区 3 个副本的 Topic。副本数不能超过集群中的 Broker 数：

```java
@Configuration
public class KafkaConfig {
    @Bean
    public NewTopic clusterTopic() {
        return new NewTopic("cluster-topic", 3, (short) 3);
    }
}
```

在 Kafka 客户端或管理工具中，可以看到每个分区的 Leader 和 Replicas 分布在不同 Broker 上：

![Topic 分区与副本分布](../assets/posts/kafka-cluster-deployment/topic-replicas.png)

向 `cluster-topic` 发送消息后，消息会根据分区策略写入其中一个分区：

![向 Kafka 集群发送消息](../assets/posts/kafka-cluster-deployment/topic-message.png)

再次查看 Topic，可以看到对应分区的消息数量和 offset 已经发生变化。

## Kafka 集群架构

生产者将消息发送到分区 Leader，Follower 负责同步副本；消费者从分区读取消息，ZooKeeper 或 KRaft Controller 负责集群元数据管理和控制器选举。

![Kafka 集群架构](../assets/posts/kafka-cluster-deployment/cluster-architecture.png)

## 小结

- **分布式架构**：通过分区和副本实现数据分片，支持高吞吐和水平扩展；
- **持久化存储**：消息按分区顺序写入磁盘，支持回溯和按 offset 重复消费；
- **高可用**：Leader/Follower 副本配合 ISR 实现故障转移，降低单点故障风险；
- **部署选择**：旧版集群可使用 ZooKeeper，新版 Kafka 优先使用 KRaft，减少外部依赖。

