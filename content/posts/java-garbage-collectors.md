---
title: Java 垃圾收集器：从 GC Roots 到 G1
slug: java-garbage-collectors
publishedAt: "2025-12-07"
date: "2025.12.07"
category: JVM
excerpt: 梳理 Java 垃圾回收的判断依据、引用类型、经典收集算法，以及 Serial、CMS、G1 等垃圾收集器的特点。
readTime: 16 分钟
---

垃圾收集（Garbage Collection，简称 GC）需要回答三个问题：哪些内存需要回收、什么时候回收，以及如何回收。Java 中主要关注堆和方法区中的对象与元数据。

## JVM 内存模型

JVM 由类加载子系统、运行时数据区、执行引擎和本地方法接口等部分组成。堆是垃圾收集器重点管理的区域，方法区（在现代 HotSpot 中对应元空间）也会进行类元数据回收。

![JVM 内存模型与运行时结构](../assets/posts/java-garbage-collectors/jvm-memory-model.png)

## 哪些对象可以回收

### 引用计数算法

引用计数算法在对象中维护一个计数器：每新增一个引用，计数器加一；引用失效时减一。计数为零的对象可以回收。

它实现简单、判断及时，但无法解决循环引用。例如对象 A 引用 B、B 又引用 A，即使它们已经无法从程序访问，计数器仍不为零。

### 可达性分析

HotSpot 主要使用可达性分析判断对象是否存活：从一组 GC Roots 出发沿引用链搜索，能够到达的对象继续存活，无法到达的对象才会进入回收候选范围。

![GC Roots 可达性分析](../assets/posts/java-garbage-collectors/gc-roots.png)

常见 GC Roots 包括：

- 虚拟机栈中局部变量表引用的对象，例如方法参数、局部变量和临时变量；
- 方法区中类静态字段引用的对象；
- 方法区中常量引用的对象，例如字符串常量；
- 本地方法栈中 JNI 引用的对象；
- JVM 内部引用的对象，例如系统类加载器、常驻异常对象和基础类型对应的 Class 对象。

```java
public void example() {
    Object local = new Object(); // 栈帧局部变量引用
}

class MyClass {
    static Object shared = new Object(); // 静态字段引用
}
```

## Java 的引用类型

### 强引用

最常见的对象引用。只要强引用关系存在，垃圾收集器就不会回收对象：

```java
Object object = new Object();
```

### 软引用

软引用适合描述“有用但非必需”的对象。内存即将不足时，收集器会尝试回收软引用对象；如果回收后仍然不足，才可能抛出 `OutOfMemoryError`。

### 弱引用

弱引用比软引用更弱。下一次垃圾收集发生时，无论当前内存是否充足，只被弱引用关联的对象都可能被回收。

### 虚引用

虚引用也称幽灵引用或幻影引用，无法通过它获取对象实例。它的唯一用途是配合引用队列，在对象被回收时收到通知。

## 垃圾收集算法

### 分代收集理论

分代收集建立在两个经验假说上：

1. **弱分代假说**：绝大多数对象都是朝生夕灭的；
2. **强分代假说**：熬过越多次垃圾收集的对象越难消亡。

常见收集范围：

| 类型 | 目标 |
| --- | --- |
| Young GC / Minor GC | 只收集新生代 |
| Old GC / Major GC | 主要收集老年代，CMS 曾支持这种方式 |
| Mixed GC | 收集整个新生代和部分老年代，G1 支持 |
| Full GC | 收集整个 Java 堆和方法区，通常代价较高 |

### 标记-清除

先标记所有存活对象，再清除未标记对象。该算法实现简单，是很多收集器的基础，但存在两个问题：对象多时标记和清除效率不稳定；清除后会产生不连续的内存碎片。

![标记-清除算法](../assets/posts/java-garbage-collectors/mark-sweep.png)

### 标记-复制

将可用内存分成大小相等的两块，每次只使用其中一块。空间用尽后，将存活对象复制到另一块，再整体清理原空间。它适合存活对象较少的新生代，但可用空间会减少，复制成本也取决于存活对象数量。

![标记-复制算法](../assets/posts/java-garbage-collectors/copying.png)

### 标记-整理

标记存活对象后，将存活对象向内存一端移动并清理边界外的空间。与标记-清除相比，标记-整理会移动对象，可以减少内存碎片，但移动和更新引用需要额外开销。

![标记-整理算法](../assets/posts/java-garbage-collectors/mark-compact.png)

## 经典垃圾收集器

收集器是算法在具体 JVM 中的实现。选择收集器时要结合 JDK 版本、堆大小、吞吐量目标和停顿时间目标；以下内容主要用于理解经典 HotSpot 收集器，现代 JDK 默认配置可能已经不同。

### Serial

Serial 是单线程收集器，执行 GC 时会暂停其他工作线程（Stop-The-World）。它实现简单、额外开销小，适合客户端应用或堆较小的场景。

### ParNew

ParNew 是 Serial 的多线程版本，主要用于年轻代复制收集，曾经常与 CMS 搭配。它可以利用多核 CPU 并行回收，但仍然需要 STW。

### Parallel Scavenge

Parallel Scavenge 是强调吞吐量和可控停顿时间的多线程年轻代收集器，可通过 `-XX:MaxGCPauseMillis`、`-XX:GCTimeRatio` 等参数调整目标，通常与 Parallel Old 组成吞吐量优先的组合。

### Serial Old

Serial Old 是 Serial 的老年代版本，使用单线程标记-整理算法，主要用于客户端模式或作为其他收集器的备用方案。

![Serial/Serial Old 运行示意](../assets/posts/java-garbage-collectors/serial-serialold.png)

![ParNew/Serial Old 运行示意](../assets/posts/java-garbage-collectors/parnew-serialold.png)

![Serial/Serial Old 运行示意](../assets/posts/java-garbage-collectors/serialold-serialold.png)

### Parallel Old

Parallel Old 是老年代多线程收集器，使用标记-整理算法，通常与 Parallel Scavenge 配合，适合追求整体吞吐量的后台服务。

![Parallel Scavenge/Parallel Old 运行示意](../assets/posts/java-garbage-collectors/parallel-scavenge-old.png)

### CMS

CMS（Concurrent Mark Sweep）以较短的回收停顿为目标，主要面向老年代。它通过并发标记和并发清除，让用户线程与 GC 线程同时运行。

典型流程如下：

| 阶段 | 是否 STW | 说明 |
| --- | --- | --- |
| 初始标记 | 是 | 标记 GC Roots 直接关联的对象，时间较短 |
| 并发标记 | 否 | 遍历对象图并标记存活对象 |
| 重新标记 | 是 | 修正并发标记期间发生变化的引用 |
| 并发清除 | 否 | 清理未标记对象 |
| 并发重置 | 否 | 重置内部数据结构 |
| 并发预清理 | 否，可选 | 尽量减少重新标记阶段的工作 |

![CMS 收集器运行示意](../assets/posts/java-garbage-collectors/cms.png)

CMS 的优点是低延迟、并发利用多核 CPU；缺点是标记-清除会产生碎片，并且可能发生并发模式失败：并发回收尚未完成时老年代已没有足够空间，最终只能触发 STW 的 Full GC。CMS 已在较新的 JDK 中移除，生产环境应优先评估 G1 或其他现代收集器。

### G1

G1（Garbage First）将堆划分为多个大小相等的 Region，每个 Region 可以在不同时间扮演 Eden、Survivor、Old 或 Humongous 等角色。G1 根据停顿目标优先回收垃圾最多的 Region，减少碎片并控制停顿时间。

![G1 收集器运行示意](../assets/posts/java-garbage-collectors/g1.png)

常见 Region 类型：

| Region 类型 | 说明 |
| --- | --- |
| Eden | 新对象分配区域 |
| Survivor | 新生代幸存对象存放区域 |
| Old | 老年代对象存放区域 |
| Humongous | 超过一个 Region 一半大小的大对象 |
| Free | 尚未分配的空闲区域 |

G1 从 JDK 9 起成为默认收集器之一，但“默认收集器”仍会随 JDK 版本、平台和堆大小变化，不能替代对业务延迟和吞吐量的实际测试。

## 小结

- 可达性分析从 GC Roots 出发判断对象是否存活，是 HotSpot 的核心思路；
- 新生代通常适合复制算法，老年代可使用标记-整理或并发收集算法；
- Serial、Parallel、CMS 和 G1 在并发性、吞吐量、停顿和碎片处理上各有取舍；
- 选型不能只看名称，应结合 JDK 版本、堆大小、对象分配速率和延迟目标，并通过 GC 日志验证。

