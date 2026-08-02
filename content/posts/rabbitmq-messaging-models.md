---
title: RabbitMQ 消息模型：Work 与订阅模型
slug: rabbitmq-messaging-models
publishedAt: "2024-11-03"
date: "2024.11.03"
category: 工程实践
excerpt: 了解 RabbitMQ 中 Work 模型与订阅模型的消息流转方式、角色分工和典型使用场景。
readTime: 8 分钟
---

# RabbitMQ
消息队列，对于那些异步的一些操作，我们可以将信息存放到消息队列当中，提高系统的并发能力。
## 1、work模型
消息直接发送到队列，多个消费者共同消费一个队列
### 角色
- 生产者：发布消息
- 队列：接收和缓存消息
- 消费者：订阅队列，处理消息

![在这里插入图片描述](../assets/posts/rabbitmq-messaging-models/work-model.png)

## 2、订阅模型
消息不是直接发送到队列而是发送到交换机，**Exchange（交换机）只负责转发消息，不具备存储消息的能力**，因此如果没有任何队列与Exchange绑定，或者没有符合路由规则的队列，那么消息会丢失！
### 角色
- 生产者：发布消息
- 交换机：负责消息转发
- 队列：接收和缓存消息
- 消费者：订阅队列，处理消息

![在这里插入图片描述](../assets/posts/rabbitmq-messaging-models/publish-subscribe-model.png)

常见交换机的类型：
- Fanout：广播，将消息交给所有绑定到交换机的队列。我们最早在控制台使用的正是Fanout交换机
- Direct：订阅，基于RoutingKey（路由key）发送给订阅了消息的队列
- Topic：通配符订阅，与Direct类似，只不过RoutingKey可以使用通配符


## **3. Work 模型 vs 订阅模型对比**
| **对比维度**       | **Work 模型**                                | **订阅模型**                                  |
|--------------------|---------------------------------------------|---------------------------------------------|
| **消息分发目标**   | 单一队列，多个消费者竞争消费                 | 多个队列，每个消费者独立接收消息副本         |
| **消费者关系**     | 消费者处理相同任务的不同实例（竞争关系）     | 消费者处理同一消息的不同副本（合作关系）     |
| **典型应用**       | 负载均衡、任务并行处理                       | 事件广播、动态路由、微服务解耦               |
| **交换机参与**     | 无（直接发往队列）                           | 必需（通过交换机路由消息）                   |
| **消息副本数量**   | 每条消息仅被一个消费者处理                   | 每条消息可能被多个消费者处理（广播或过滤）   |

---
## 4、实现
- 1）
实例RabbitTemplate，调用convertAndSend方法实现消息发布，使用@RabbitListener注解监听队列
- 2）声明交换机和队列
基于@Bean的方式声明队列和交换机比较麻烦，Spring还提供了基于注解方式来声明。
```java
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(name = "direct.queue1"),
    exchange = @Exchange(name = "hmall.direct", type = ExchangeTypes.DIRECT),
    key = {"red", "blue"}
))
```

```java
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(name = "topic.queue1"),
    exchange = @Exchange(name = "hmall.topic", type = ExchangeTypes.TOPIC),
    key = "china.#"
))
public void listenTopicQueue1(String msg){
    System.out.println("消费者1接收到topic.queue1的消息：【" + msg + "】");
}

@RabbitListener(bindings = @QueueBinding(
    value = @Queue(name = "topic.queue2"),
    exchange = @Exchange(name = "hmall.topic", type = ExchangeTypes.TOPIC),
    key = "#.news"
))
public void listenTopicQueue2(String msg){
    System.out.println("消费者2接收到topic.queue2的消息：【" + msg + "】");
}
```

 **RabbitMQ**、**RocketMQ** 和 **Kafka** 的差异：

---

|       | **RabbitMQ**                                                                 | **RocketMQ**                                                                 | **Kafka**                                                                  |
|--------------------|------------------------------------------------------------------------------|------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| **核心定位**       | 企业级通用消息队列，强调灵活路由和低延迟                                     | 金融级高可靠消息队列，平衡高吞吐与强一致性                                   | 高吞吐分布式流处理平台，专为大数据场景设计                                 |
| **协议支持**       | 支持 AMQP、STOMP、MQTT 等                                                    | 自定义协议（兼容 JMS 规范）                                                 | 自定义协议（基于 TCP）                                                     |
| **架构模型**       | Broker + Exchange/Queue（基于生产者→Exchange→Queue→消费者）                  | Broker + Topic/Queue（支持 Tag 过滤）                                       | Broker + Topic/Partition（分区并行消费）                                   |
| **集群模式**       | 镜像队列（主从异步复制）                                                     | 多副本主从架构（DLedger 选主，同步复制）                                     | 分区多副本（ISR 机制，异步同步）                                           |
| **数据一致性**     | 弱一致性（依赖镜像队列异步复制）                                             | 强一致性（同步刷盘 + 多副本同步）                                           | 最终一致性（ISR 机制保证）                                                 |
| **吞吐量**         | 万级 TPS（适合中小规模场景）                                                 | 十万级 TPS（高负载场景优化）                                                | 百万级 TPS（吞吐量王者）                                                   |
| **消息延迟**       | 毫秒级（实时性最佳）                                                         | 毫秒级（低延迟优化）                                                         | 毫秒至秒级（依赖批量配置）                                                 |
| **消息顺序**       | 单队列有序                                                                   | 分区（Shard）内严格有序                                                     | 分区（Partition）内有序                                                    |
| **事务消息**       | 不支持                                                                       | 支持（二阶段提交，金融场景强依赖）                                           | 支持（0.11+ 版本）                                                         |
| **消息回溯**       | 不支持                                                                       | 支持（按时间或偏移量回溯）                                                  | 支持（按偏移量回溯）                                                       |
| **死信队列**       | 支持（自动转发）                                                             | 支持（重试队列 + 死信队列）                                                 | 需手动实现                                                                 |
| **持久化能力**     | 内存 + 磁盘（队列需显式声明持久化）                                           | 磁盘存储（高可靠设计）                                                       | 磁盘持久化（默认保留 7 天，可配置）                                         |
| **多语言支持**     | 广泛（Erlang/Java/Python 等）                                                | 主推 Java（社区提供部分其他语言客户端）                                      | 广泛（Scala/Java/Python 等）                                               |
| **典型应用场景**   | 企业级异步任务、复杂路由（如支付通知、订单路由）                             | 电商交易、金融支付（高一致性要求场景）                                       | 日志收集、实时流处理（Flink/Spark 集成）、事件溯源                          |

---
