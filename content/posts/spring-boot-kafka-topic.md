---
title: Spring Boot 集成 Kafka：生产者、消费者与 Topic 实践
slug: spring-boot-kafka-topic
publishedAt: "2025-09-14"
date: "2025.09.14"
category: 消息队列
excerpt: 使用 Spring Kafka 完成项目接入，演示消息发送、ProducerRecord、消费组、offset、批量消费、拦截器和消息转发。
readTime: 12 分钟
---

## 引入 Kafka

### 添加依赖

在 `pom.xml` 中引入 Spring Kafka：

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
    <version>3.3.3</version>
</dependency>
```

### 添加配置

在 `application.yml` 中配置 Kafka 地址。生产环境建议通过环境变量或配置中心注入地址，不要把账号密码直接提交到仓库。

```yaml
server:
  port: 8080

spring:
  application:
    name: kafka-base
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
```

## 生产者

### 发送 String 消息

`KafkaTemplate` 的 `send` 方法默认是异步发送，返回 `CompletableFuture`，可以根据需要注册回调或等待结果。

```java
package com.yuhao.kafkabase.producer;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class EventProducer {
    private final KafkaTemplate<String, String> kafkaTemplate;

    public EventProducer(KafkaTemplate<String, String> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void sendEvent(String topic, String message) {
        kafkaTemplate.send(topic, message);
    }
}
```

测试发送：

```java
@SpringBootTest
class EventProducerTest {
    @Autowired
    private EventProducer eventProducer;

    @Test
    void sendEvent() {
        eventProducer.sendEvent("hello", "hello kafka");
    }
}
```

### 发送 Message 对象

可以通过消息头指定 Topic：

```java
public void sendMessageObject(String topic, String message) {
    Message<String> msg = MessageBuilder
            .withPayload(message)
            .setHeader(KafkaHeaders.TOPIC, topic)
            .build();
    kafkaTemplate.send(msg);
}
```

### 发送 ProducerRecord

`ProducerRecord` 可以同时指定 Topic、分区、Key、Value 和自定义 Header。Kafka 的 `ProducerRecord` 源码也体现了这些核心字段：

![ProducerRecord 的核心字段](../assets/posts/spring-boot-kafka-topic/producer-record-class.png)

```java
public void sendMessageProducerRecord(
        ProducerRecord<String, String> producerRecord) {
    kafkaTemplate.send(producerRecord);
}

@Test
void sendMessageProducerRecord() {
    Headers headers = new RecordHeaders();
    headers.add("name", "yuhao".getBytes(StandardCharsets.UTF_8));

    ProducerRecord<String, String> record = new ProducerRecord<>(
            "hello",
            0,
            null,
            "hello kafka，这是第一次发送 ProducerRecord 消息",
            headers
    );
    eventProducer.sendMessageProducerRecord(record);
}
```

### 发送结果与分区策略

- `send()`、`sendDefault()` 通常都是异步操作；
- 可以使用 `CompletableFuture.get()` 阻塞等待结果，也可以使用 `thenAccept`、`thenApply`、`whenComplete` 等方式异步处理结果；
- 可以在 `ProducerRecord` 中指定分区，也可以使用默认 Topic；
- 默认分区器通常根据 Key 的哈希值选择分区，未指定 Key 时按客户端策略分配；
- 还可以使用 RoundRobin 策略，或实现 `Partitioner` 接口自定义分区规则。

### 生产者发送流程

消息会依次经过拦截器、序列化器和分区器，随后进入按分区组织的 `RecordAccumulator`。ProducerBatch 达到 `batch.size` 或等待时间超过 `linger.ms` 后，由 Sender 线程组装网络请求发送到 Kafka；收到 ACK 后，客户端清理对应的缓冲数据。

![Kafka 生产者发送流程](../assets/posts/spring-boot-kafka-topic/producer-flow.png)

## 使用 IDEA Kafka 插件

可以安装 IDEA 的 Kafka 插件查看 Topic、分区、消息数量和消费者组状态，适合本地开发和排查：

![IDEA Kafka 插件](../assets/posts/spring-boot-kafka-topic/kafka-plugin.png)

## 消费者

### 使用 `@KafkaListener` 读取消息

```java
@Component
public class EventConsumer {
    @KafkaListener(topics = "hello", groupId = "group-1")
    public void receive(String message) {
        System.out.println("接收到消息：" + message);
    }
}
```

消费者组会保存已经提交的 offset。默认情况下，新的消费者组通常从最新消息开始消费，因此消费者启动前已经存在的消息可能不会被读取：

![消费者启动后暂未读取历史消息](../assets/posts/spring-boot-kafka-topic/consumer-no-message.png)

发送新消息后，消费者即可收到：

![消费者收到消息](../assets/posts/spring-boot-kafka-topic/consumer-message.png)

### 从最早 offset 开始消费

在配置文件中设置：

```yaml
spring:
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    consumer:
      auto-offset-reset: earliest
```

注意：`auto-offset-reset` 只在消费组没有已提交 offset 时生效。如果 `group-1` 已经消费过消息，修改配置不会让它重新读取历史数据。可以换一个新的 `groupId`，或使用脚本重置 offset：

```bash
bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group group-1 \
  --reset-offsets \
  --to-earliest \
  --topic hello \
  --execute
```

使用新的消费组读取后，可以在日志中看到多条历史消息：

![从最早 offset 消费消息](../assets/posts/spring-boot-kafka-topic/consumer-messages.png)

### 获取消息头

```java
@KafkaListener(topics = "hello", groupId = "group-1")
public void receiveTopic(
        @Header(KafkaHeaders.RECEIVED_TOPIC) String topic) {
    System.out.println("接收到的 Topic：" + topic);
}
```

### 获取完整消息

```java
@KafkaListener(topics = "hello", groupId = "group-1")
public void receiveRecord(ConsumerRecord<String, String> record) {
    System.out.println("接收到完整消息：" + record);
}
```

### 指定 Topic、Partition 和 offset

```java
@KafkaListener(
        groupId = "group-2",
        topicPartitions = @TopicPartition(
                topic = "hello",
                partitions = "0",
                partitionOffsets = @PartitionOffset(
                        partition = "0",
                        initialOffset = "0")))
public void receiveFromOffset(String message) {
    System.out.println(message);
}
```

### 批量消费

将监听器容器设置为批量模式，并限制每次拉取的最大消息数：

```yaml
spring:
  kafka:
    listener:
      type: batch
    consumer:
      max-poll-records: 20
```

监听方法可以接收 `List<ConsumerRecord<String, String>>`，在一次调用中处理一批消息。

### 消费拦截器

自定义拦截器实现 `ConsumerInterceptor`，可以在消费前检查或修改消息，也可以在 offset 提交时记录监控信息。实现后需要注册到 `ConsumerFactory`，并在 `@KafkaListener` 中指定对应的容器工厂。

```java
public class CustomConsumerInterceptor
        implements ConsumerInterceptor<String, String> {
    @Override
    public ConsumerRecords<String, String> onConsume(
            ConsumerRecords<String, String> records) {
        return records;
    }

    @Override
    public void onCommit(Map offsets) {
        // 记录提交信息
    }

    @Override
    public void configure(Map<String, ?> configs) {
    }

    @Override
    public void close() {
    }
}
```

### 消息转发

监听器处理完消息后，可以使用 `@SendTo` 将返回值发送到另一个 Topic：

```java
@KafkaListener(topics = "hello", groupId = "group-1")
@SendTo("topicB")
public String forward(ConsumerRecord<String, String> record) {
    System.out.println("接收到完整消息：" + record);
    return record.value();
}
```

### 消费者分区分配策略

- **RangeAssignor**：按 Topic 的分区范围分配，分区数不能整除消费者数时，前面的消费者可能多分到一个分区；
- **RoundRobinAssignor**：将订阅的分区轮流分配给消费者；
- **StickyAssignor**：尽量保持已有分配关系，只调整必要的分区；
- **CooperativeStickyAssignor**：在 Sticky 的基础上支持增量式重平衡，减少重新分配时的中断。

## 小结

Spring Kafka 将 Kafka 客户端能力封装成了 `KafkaTemplate` 和 `@KafkaListener`。实际项目中除了完成收发消息，还要关注发送结果、消费组 offset、分区策略、重平衡、批量处理和异常重试，才能让消息链路稳定运行。

