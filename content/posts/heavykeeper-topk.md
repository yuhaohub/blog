---
title: HeavyKeeper 算法：流式 TopK 的实现原理
slug: heavykeeper-topk
publishedAt: "2025-04-20"
date: "2025.04.20"
category: 算法实践
excerpt: 介绍 HeavyKeeper 如何利用二维计数桶、概率衰减和最小堆，在大规模数据流中识别热点 Key。
readTime: 9 分钟
---

# HeavyKeeper 算法介绍与原理
原代码go语言实现出自[Topk](https://github.com/go-kratos/aegis/tree/main/topk)
HeavyKeeper是一种高效的流式TopK检测算法，专为识别大规模数据流中的频繁项（热点Key）而生，它基于Count-Min Sketch算法改进，主要通过以下组件实现：

1. 二维数组：算法维护一个二维数组，里面有 d 个数组，每个数组里有 w 个桶，桶里记录哈希指纹和计数值。

2. 计数衰减机制：核心创新点，当发生哈希冲突时，不是简单的覆盖，而是通过概率衰减原有计数。

3. 堆结构：维护一个大小为 k 的最小堆，用于记录当前观测到的TopK项。

当一个Key到达时：

1. 对Key应用d个哈希函数，映射到d个数组中的对应桶

2. 对每个桶：
- 如果桶为空或已存储的哈希指纹与当前哈希指纹相同，增加计数器

- 如果发生冲突，以概率P(decay) = 1/(b^C)衰减已有计数，b为衰减因子，C 为计数值

维护最小堆，保留最大的k个计数项
```java
public class HeavyKeeper implements TopK {

    // 查找表大小，用于存放衰减概率
    private static final int LOOKUP_TABLE_SIZE = 256;

    private final int k;  // Top-K 的数量
    private final int width;  // 每层桶的宽度
    private final int depth;  // 总共的哈希层数
    private final double[] lookupTable;  // 衰减概率查找表
    private final Bucket[][] buckets;  // 哈希桶二维数组
    private final PriorityQueue<Node> minHeap;  // 最小堆用于维护前K个高频项
    private final BlockingQueue<Item> expelledQueue;  // 被移出 Top-K 的队列
    private final Random random;  // 用于概率衰减
    private long total;  // 总加入项的个数
    private final int minCount;  // 进入 Top-K 的最小频率门槛

    // 构造函数
    public HeavyKeeper(int k, int width, int depth, double decay, int minCount) {
        this.k = k;
        this.width = width;
        this.depth = depth;
        this.minCount = minCount;

        // 初始化查找表，存储每个 count 下的衰减概率
        this.lookupTable = new double[LOOKUP_TABLE_SIZE];
        for (int i = 0; i < LOOKUP_TABLE_SIZE; i++) {
            lookupTable[i] = Math.pow(decay, i);
        }

        // 初始化桶
        this.buckets = new Bucket[depth][width];
        for (int i = 0; i < depth; i++) {
            for (int j = 0; j < width; j++) {
                buckets[i][j] = new Bucket();
            }
        }

        // 初始化最小堆和其他结构
        this.minHeap = new PriorityQueue<>(Comparator.comparingInt(n -> n.count));
        this.expelledQueue = new LinkedBlockingQueue<>();
        this.random = new Random();
        this.total = 0;
    }

    // 返回当前 Top-K 列表
    @Override
    public List<Item> list() {
        synchronized (minHeap) {
            List<Item> result = new ArrayList<>(minHeap.size());
            for (Node node : minHeap) {
                result.add(new Item(node.key, node.count));
            }
            // 按频率降序排序
            result.sort((a, b) -> Integer.compare(b.count(), a.count()));
            return result;
        }
    }

    // 返回被移出 Top-K 的项
    @Override
    public BlockingQueue<Item> expelled() {
        return expelledQueue;
    }

    // 数据衰减操作（定期调用）
    @Override
    public void fading() {
        // 所有桶的计数都右移一位（除以2）
        for (Bucket[] row : buckets) {
            for (Bucket bucket : row) {
                synchronized (bucket) {
                    bucket.count = bucket.count >> 1;
                }
            }
        }

        // Top-K 小堆的值也同步衰减
        synchronized (minHeap) {
            PriorityQueue<Node> newHeap = new PriorityQueue<>(Comparator.comparingInt(n -> n.count));
            for (Node node : minHeap) {
                newHeap.add(new Node(node.key, node.count >> 1));
            }
            minHeap.clear();
            minHeap.addAll(newHeap);
        }

        total = total >> 1;
    }

    // 返回总项数
    @Override
    public long total() {
        return total;
    }

    // 桶结构：记录指纹和频率
    private static class Bucket {
        long fingerprint;
        int count;
    }

    // 小堆节点
    private static class Node {
        final String key;
        final int count;

        Node(String key, int count) {
            this.key = key;
            this.count = count;
        }
    }

    // MurmurHash32 哈希函数
    private static int hash(byte[] data) {
        return HashUtil.murmur32(data);
    }

    // 添加元素逻辑
    @Override
    public AddResult add(String key, int increment) {
        byte[] keyBytes = key.getBytes();
        long itemFingerprint = hash(keyBytes);
        int maxCount = 0;

        // 遍历每层哈希表
        for (int i = 0; i < depth; i++) {
            int bucketNumber = Math.abs(hash(keyBytes)) % width;
            Bucket bucket = buckets[i][bucketNumber];

            synchronized (bucket) {
                if (bucket.count == 0) {
                    // 桶是空的，直接填入
                    bucket.fingerprint = itemFingerprint;
                    bucket.count = increment;
                    maxCount = Math.max(maxCount, increment);
                } else if (bucket.fingerprint == itemFingerprint) {
                    // 命中同一个元素，累加计数
                    bucket.count += increment;
                    maxCount = Math.max(maxCount, bucket.count);
                } else {
                    // 不同元素，进行概率衰减
                    for (int j = 0; j < increment; j++) {
                        double decay = bucket.count < LOOKUP_TABLE_SIZE ?
                                lookupTable[bucket.count] :
                                lookupTable[LOOKUP_TABLE_SIZE - 1];

                        // 随机衰减
                        if (random.nextDouble() < decay) {
                            bucket.count--;
                            if (bucket.count == 0) {
                                // 替换为当前项
                                bucket.fingerprint = itemFingerprint;
                                bucket.count = increment - j;
                                maxCount = Math.max(maxCount, bucket.count);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 总计数累加
        total += increment;

        // 如果未达到最小门槛，不加入 Top-K
        if (maxCount < minCount) {
            return new AddResult(null, false, null);
        }

        // 尝试加入 Top-K 小堆
        synchronized (minHeap) {
            boolean isHot = false;
            String expelled = null;

            // 如果已存在，更新它
            Optional<Node> existing = minHeap.stream()
                    .filter(n -> n.key.equals(key))
                    .findFirst();

            if (existing.isPresent()) {
                minHeap.remove(existing.get());
                minHeap.add(new Node(key, maxCount));
                isHot = true;
            } else {
                // 不存在，则判断是否可以进入 Top-K
                if (minHeap.size() < k || maxCount >= Objects.requireNonNull(minHeap.peek()).count) {
                    Node newNode = new Node(key, maxCount);
                    if (minHeap.size() >= k) {
                        expelled = minHeap.poll().key;
                        expelledQueue.offer(new Item(expelled, maxCount));
                    }
                    minHeap.add(newNode);
                    isHot = true;
                }
            }

            return new AddResult(expelled, isHot, key);
        }
    }
}

```
