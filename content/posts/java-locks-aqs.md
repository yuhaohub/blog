---
title: Java 中的锁：Lock、AQS、读写锁与 Condition
slug: java-locks-aqs
publishedAt: "2025-11-16"
date: "2025.11.16"
category: Java 并发
excerpt: 从 Lock 接口出发，理解 AQS 同步队列、ReentrantLock、ReentrantReadWriteLock 和 Condition 的实现原理与使用方式。
readTime: 18 分钟
---

## Lock 接口

早期 Java 主要通过 `synchronized` 实现同步。它由 JVM 隐式获取和释放锁，使用简单，但在中断、超时、尝试获取和读写分离等场景下不够灵活。Java 5 引入 `Lock` 接口，允许开发者显式控制锁的生命周期。

### 核心 API

| 方法 | 说明 |
| --- | --- |
| `void lock()` | 获取锁；锁不可用时阻塞等待 |
| `void lockInterruptibly()` | 可中断地获取锁 |
| `boolean tryLock()` | 立即尝试获取锁，失败返回 `false` |
| `boolean tryLock(long time, TimeUnit unit)` | 在指定时间内尝试获取锁，可响应中断 |
| `void unlock()` | 释放锁，必须放在 `finally` 中 |
| `Condition newCondition()` | 创建与当前锁绑定的条件队列 |

### 基本使用

```java
Lock lock = new ReentrantLock();
lock.lock();
try {
    // 临界区
} finally {
    lock.unlock();
}
```

### `synchronized` 与 `Lock` 对比

| 特性 | `synchronized` | `Lock`（如 `ReentrantLock`） |
| --- | --- | --- |
| 锁管理 | JVM 自动获取和释放 | 显式 `lock()` / `unlock()` |
| 公平性 | 不提供公平策略选择 | 支持公平锁和非公平锁 |
| 中断 | 等待锁时不能主动中断 | 支持 `lockInterruptibly()` |
| 尝试获取 | 不支持 | 支持 `tryLock()` 和超时获取 |
| 读写分离 | 不支持 | 可配合 `ReentrantReadWriteLock` |
| 异常安全 | 自动释放 | 必须在 `finally` 中释放 |
| 适用场景 | 简单同步代码块 | 需要超时、中断或复杂协调的场景 |

## AQS：构建同步器的基础

AQS（AbstractQueuedSynchronizer，抽象队列同步器）是 Java 并发包中构建锁和同步器的基础框架。它维护一个表示同步状态的 `state`，以及一个先进先出（FIFO）的同步队列。子类只需要实现获取和释放状态的逻辑，AQS 负责线程排队、阻塞和唤醒。

AQS 使用模板方法模式：公共方法编排流程，子类通过重写受保护的方法定义具体语义。

![AQS 模板方法](../assets/posts/java-locks-aqs/aqs-template-methods.png)

### 可重写方法

| 方法 | 模式 | 说明 |
| --- | --- | --- |
| `tryAcquire(int arg)` | 独占 | 尝试获取同步状态，成功返回 `true` |
| `tryRelease(int arg)` | 独占 | 尝试释放同步状态，完全释放后返回 `true` |
| `tryAcquireShared(int arg)` | 共享 | 负数失败，0 表示成功但无剩余资源，正数表示成功且仍有资源 |
| `tryReleaseShared(int arg)` | 共享 | 释放共享状态，并判断是否需要唤醒后继线程 |
| `isHeldExclusively()` | 独占 | 判断当前线程是否独占同步器 |

### AQS 节点与同步队列

线程获取同步状态失败后，会被封装成 Node，通过 CAS 加入同步队列。队列中的节点保存前驱、后继、等待状态和线程引用等信息。

![AQS 节点结构](../assets/posts/java-locks-aqs/sync-queue-node.png)

同步队列通常由 `head` 和 `tail` 指针维护，新的等待节点从尾部入队：

![AQS 同步队列](../assets/posts/java-locks-aqs/aqs-wait-status.png)

### 独占式获取

独占获取的大致流程是：先尝试获取状态；失败后创建节点加入队尾；只有排在队首并且再次获取成功的线程才能成为新的头节点，否则继续等待。

![独占式获取同步状态](../assets/posts/java-locks-aqs/exclusive-acquire.png)

### 共享式获取

共享模式允许多个线程同时获取资源，例如 `Semaphore` 和读锁。获取成功后，如果仍有剩余资源，AQS 会继续传播唤醒后继节点。

![共享式获取与释放](../assets/posts/java-locks-aqs/shared-mode.png)

### 独占式超时获取

带超时的获取会根据剩余时间决定阻塞方式：剩余时间较长时使用队列阻塞，接近超时时间时使用自旋，超时或被中断则退出。

![独占式超时获取](../assets/posts/java-locks-aqs/exclusive-timeout.png)

## ReentrantLock：可重入锁

`ReentrantLock` 允许同一个线程重复获取同一把锁。同步状态中会记录重入次数：线程每获取一次，计数器加一；释放时计数器减一，直到归零才真正释放锁。

```java
ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    lock.lock();
    try {
        // 同一线程可以再次进入
    } finally {
        lock.unlock();
    }
} finally {
    lock.unlock();
}
```

它还支持公平和非公平两种策略：非公平锁吞吐量通常更高，但可能造成线程饥饿；公平锁按照同步队列顺序获取，线程切换成本更高。

## ReentrantReadWriteLock：读写锁

`ReentrantLock` 同一时刻只允许一个线程进入，而 `ReentrantReadWriteLock` 将访问分为读锁和写锁：多个读线程可以并发读取，写线程则需要独占资源。

![ReentrantReadWriteLock 特性](../assets/posts/java-locks-aqs/read-write-lock-features.png)

### 示例

```java
public class ReadWriteLockExample {
    private int sharedData;
    private int version;

    private final ReentrantReadWriteLock rwLock =
            new ReentrantReadWriteLock();
    private final Lock readLock = rwLock.readLock();
    private final Lock writeLock = rwLock.writeLock();

    public int readData() {
        readLock.lock();
        try {
            return sharedData;
        } finally {
            readLock.unlock();
        }
    }

    public void writeData(int value) {
        writeLock.lock();
        try {
            sharedData = value;
            version++;
        } finally {
            writeLock.unlock();
        }
    }
}
```

### 实现要点

读写锁仍然基于 AQS，但要在一个整型 `state` 中同时表示写锁状态和读锁计数。通常高位保存共享读计数，低位保存独占写锁重入次数。

![读写锁同步状态](../assets/posts/java-locks-aqs/read-write-state.png)

- 写锁是可重入的独占锁，获取前需要确认没有其他线程持有读锁或写锁；
- 读锁是共享锁，多个线程可以同时获取，但写锁存在时读线程需要等待；
- **锁降级**：持有写锁的线程先获取读锁，再释放写锁。这样可以在完成写入后继续安全读取，同时避免释放写锁后重新竞争读锁。

## Condition：条件等待与通知

`Condition` 通过 `lock.newCondition()` 创建，提供与 `wait()` / `notify()` 类似但更灵活的线程通信机制。一个 `Lock` 可以创建多个 `Condition`，分别表示不同的等待条件。

### 基本用法

```java
Lock lock = new ReentrantLock();
Condition condition = lock.newCondition();

void awaitWork() throws InterruptedException {
    lock.lock();
    try {
        while (!hasWork()) {
            condition.await();
        }
        processWork();
    } finally {
        lock.unlock();
    }
}

void signalWork() {
    lock.lock();
    try {
        addWork();
        condition.signal();
    } finally {
        lock.unlock();
    }
}
```

![Condition 使用示例](../assets/posts/java-locks-aqs/condition-example.png)

### Condition 常用方法

| 方法 | 说明 |
| --- | --- |
| `await()` | 释放关联锁并等待通知，响应中断 |
| `awaitUninterruptibly()` | 等待通知但不响应中断 |
| `awaitNanos(long nanosTimeout)` | 等待通知、中断或超时，并返回剩余时间 |
| `awaitUntil(Date deadline)` | 等待到指定时间或收到通知 |
| `signal()` | 唤醒一个等待线程 |
| `signalAll()` | 唤醒所有等待线程 |

![Condition 方法表](../assets/posts/java-locks-aqs/condition-methods.png)

### 有界队列示例

有界队列通常使用一把锁和两个条件：队列满时生产者等待 `notFull`，队列空时消费者等待 `notEmpty`。

```java
public class BoundedQueue<T> {
    private final Object[] items;
    private int addIndex;
    private int removeIndex;
    private int count;
    private final Lock lock = new ReentrantLock();
    private final Condition notEmpty = lock.newCondition();
    private final Condition notFull = lock.newCondition();

    public BoundedQueue(int capacity) {
        items = new Object[capacity];
    }

    public void add(T value) throws InterruptedException {
        lock.lock();
        try {
            while (count == items.length) {
                notFull.await();
            }
            items[addIndex] = value;
            if (++addIndex == items.length) addIndex = 0;
            count++;
            notEmpty.signal();
        } finally {
            lock.unlock();
        }
    }

    @SuppressWarnings("unchecked")
    public T remove() throws InterruptedException {
        lock.lock();
        try {
            while (count == 0) {
                notEmpty.await();
            }
            T value = (T) items[removeIndex];
            if (++removeIndex == items.length) removeIndex = 0;
            count--;
            notFull.signal();
            return value;
        } finally {
            lock.unlock();
        }
    }
}
```

![有界队列代码](../assets/posts/java-locks-aqs/bounded-queue.png)

### ConditionObject 的实现

`ConditionObject` 是 AQS 的内部类。每个 Condition 都有一个独立的等待队列；调用 `await()` 时，当前线程会被封装成节点加入等待队列，并释放关联锁。

![Condition 等待队列](../assets/posts/java-locks-aqs/condition-wait-queue.png)

Lock 内部通常有一个同步队列和多个 Condition 等待队列。`signal()` 会将等待队列中的节点转移到同步队列，节点重新竞争锁后才能从等待方法返回。

![同步队列与 Condition 等待队列](../assets/posts/java-locks-aqs/sync-and-condition-queues.png)

等待节点转移到同步队列的过程：

![Condition 节点转移](../assets/posts/java-locks-aqs/condition-transfer.png)

通知操作只负责转移节点，不代表线程立即执行；被唤醒的线程仍要重新获得关联锁：

![Condition signal 流程](../assets/posts/java-locks-aqs/condition-signal.png)

## 小结

- `Lock` 提供比 `synchronized` 更灵活的中断、超时、公平和读写控制；
- AQS 通过同步状态和 FIFO 队列抽象出锁、信号量、倒计时门闩等同步器；
- `ReentrantLock` 解决可重入和公平性问题，`ReentrantReadWriteLock` 适合读多写少场景；
- `Condition` 将等待队列从锁中拆分出来，一把锁可以对应多个独立条件；
- 使用显式锁时必须保证 `unlock()` 位于 `finally`，并使用 `while` 循环检查等待条件。
