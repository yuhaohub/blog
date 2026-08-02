---
title: ArrayList 集合为什么不安全？
slug: arraylist-thread-safety
publishedAt: "2025-01-26"
date: "2025.01.26"
category: 工程实践
excerpt: 从 ArrayList 的 add 源码出发，分析多线程并发写入时的竞态条件、数据覆盖和 size 不一致问题。
readTime: 5 分钟
---

`ArrayList` 是一个基于动态数组的集合，单线程使用时简单高效，但它没有为写操作提供同步保护。当多个线程同时修改同一个 `ArrayList` 时，就可能出现数据丢失、索引异常或集合状态不一致。

## 从源码看问题

`ArrayList` 的核心添加逻辑大致如下：

![ArrayList add 方法源码](../assets/posts/arraylist-thread-safety/arraylist-add-source.png)

```java
private void add(E element, Object[] elementData, int size) {
    if (size == elementData.length) {
        elementData = grow();
    }
    elementData[size] = element;
    this.size = size + 1;
}
```

可以看到，`add` 方法没有加锁。一次添加操作至少包含“读取 size、检查扩容、写入数组、更新 size”等多个步骤，而这些步骤不是一个不可分割的原子操作。

## 并发写入时的潜在问题

### 数据覆盖或写入数量减少

假设当前 `size` 为 5，线程 A 和线程 B 几乎同时读取到这个值：

1. 线程 A 将元素写入下标 5；
2. 线程 B 也将自己的元素写入下标 5；
3. 后写入的元素覆盖先写入的元素；
4. 两个线程都把 `size` 更新为 6。

最终集合只增加了一个元素，另一个元素已经丢失。

### size 与实际添加数量不一致

`size = size + 1` 不是原子操作，它包含读取、计算和写回三个步骤。多个线程同时更新时可能发生覆盖，导致 `size` 小于实际调用 `add` 的次数。

这属于典型的竞态条件：最终结果取决于线程的执行时序。

### 扩容与索引异常

扩容判断和写入之间也可能被其他线程插入。如果多个线程同时接近容量上限，可能出现：

- 多次扩容，造成不必要的数组复制；
- 一个线程基于旧数组继续写入；
- 并发修改时抛出 `ArrayIndexOutOfBoundsException` 等索引相关异常。

具体表现会因 JDK 版本、数组容量和线程调度时机而不同，但根本原因都是复合操作缺乏同步保护。

## 如何保证线程安全

### 使用同步包装

如果读写规模不大，可以使用 `Collections.synchronizedList`：

```java
List<Integer> list = Collections.synchronizedList(new ArrayList<>());

list.add(1);

synchronized (list) {
    for (Integer value : list) {
        System.out.println(value);
    }
}
```

对集合的遍历仍然需要在同一个锁上进行同步，否则迭代过程中仍可能发生并发修改。

### 使用 CopyOnWriteArrayList

如果读操作远多于写操作，可以考虑 `CopyOnWriteArrayList`：

```java
CopyOnWriteArrayList<Integer> list = new CopyOnWriteArrayList<>();
list.add(1);
```

它在写入时复制底层数组，读操作不需要加锁，适合配置快照、监听器列表等“读多写少”的场景。但写入成本较高，不适合频繁修改或元素数量很大的集合。

### 使用并发队列

如果业务本质是生产者和消费者之间传递数据，应优先选择并发队列，而不是让多个线程直接写 `ArrayList`：

```java
BlockingQueue<Integer> queue = new LinkedBlockingQueue<>();
queue.put(1);
Integer value = queue.take();
```

并发队列不仅保证线程安全，还能提供阻塞、限流和生产消费协作能力。

## 选择建议

| 场景 | 推荐方案 |
| --- | --- |
| 单线程读写 | `ArrayList` |
| 多线程读写，逻辑简单 | `Collections.synchronizedList` |
| 读多写少 | `CopyOnWriteArrayList` |
| 生产者/消费者模型 | `BlockingQueue` |
| 需要高并发映射关系 | 根据场景选择 `ConcurrentHashMap` 等并发容器 |

## 总结

`ArrayList` 不安全的核心原因不是数组本身，而是 `add` 操作中的多个步骤没有被锁保护。多个线程可能同时写入同一个下标、覆盖彼此的更新，或在更新 `size` 时发生竞态。

不要仅仅因为“调用的是集合方法”就默认它是线程安全的。应根据访问模式选择同步包装、写时复制集合或并发队列；如果必须共享 `ArrayList`，则需要明确设计锁的范围和遍历策略。
