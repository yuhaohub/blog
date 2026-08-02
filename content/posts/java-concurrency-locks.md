---
title: Java 并发编程：synchronized、ReentrantLock 与线程创建
slug: java-concurrency-locks
publishedAt: "2024-12-15"
date: "2024.12.15"
category: 工程实践
excerpt: 梳理 synchronized 与 ReentrantLock 的使用差异，并总结 Java 中创建和管理线程的常见方式。
readTime: 12 分钟
---

## Synchronized与ReentrantLock
解决多线程当中资源竞争问题，保证操作一致性。
![在这里插入图片描述](../assets/posts/java-concurrency-locks/concurrency-notes.png)

| 特性                | `synchronized`                          | `ReentrantLock`                          |
|---------------------|-----------------------------------------|------------------------------------------|
| **锁类型**          | 隐式锁（JVM 管理）                      | 显式锁（手动调用 `lock()`/`unlock()`）   |
| **锁释放**          | 自动释放（退出作用域）                  | 必须手动释放（需在 `finally` 中释放，避免死锁） |
| **公平性**          | 非公平（默认）                          | 可显式设置公平/非公平（默认非公平）      |
| **条件变量**        | 仅一个 `wait()` 队列                    | 支持多个 `Condition` 队列，更灵活        |
| **锁获取方式**      | 阻塞获取                                | 支持非阻塞、超时、可中断获取            |
| **性能**            | 早期版本差，优化后接近                  | 细粒度控制，复杂场景性能更优            |
| **适用场景**        | 简单同步、自动释放锁场景                | 复杂同步（如需要条件变量、可中断锁、公平锁） |

在 Java 中，创建线程主要有以下 **4 种方式**，分别适用于不同的场景。以下是详细的实现方法和示例：
### **一、继承 `Thread` 类（基础方式）**
#### 步骤：
1. 定义一个类继承 `Thread` 类。
2. 重写 `run()` 方法（线程执行的逻辑）。
3. 创建线程实例，调用 `start()` 方法启动线程。

#### 示例代码：
```java
public class MyThread extends Thread {
    @Override
    public void run() {
        System.out.println("线程 " + getName() + " 正在运行");
    }

    public static void main(String[] args) {
        MyThread thread = new MyThread();
        thread.setName("自定义线程"); // 设置线程名称（可选）
        thread.start(); // 启动线程（调用 run() 方法）
    }
}
```

#### 特点：
- **优点**：简单直观，直接操作线程。
- **缺点**：Java 单继承限制，无法同时继承其他类；线程与任务（逻辑）耦合，不利于资源共享。


### **二、实现 `Runnable` 接口（推荐方式）**
#### 步骤：
1. 定义一个类实现 `Runnable` 接口。
2. 实现 `run()` 方法（线程执行的逻辑）。
3. 创建 `Runnable` 实例，作为参数传入 `Thread` 构造器，调用 `start()` 启动线程。

#### 示例代码：
```java
public class MyRunnable implements Runnable {
    @Override
    public void run() {
        System.out.println("Runnable 线程 " + Thread.currentThread().getName() + " 正在运行");
    }

    public static void main(String[] args) {
        Runnable task = new MyRunnable();
        Thread thread = new Thread(task, "Runnable 线程");
        thread.start();
    }
}
```

#### 特点：
- **优点**：
  - 避免单继承限制，可同时继承其他类或实现多个接口。
  - 线程（`Thread`）与任务（`Runnable`）分离，支持 **资源共享**（多个线程可共享同一个 `Runnable` 实例）。
- **适用场景**：多线程共享同一资源（如计数器、共享变量）时使用。


### **三、使用 `Callable` 和 `Future`（带返回值和异常处理）**
#### 步骤：
1. 定义一个类实现 `Callable` 接口（泛型指定返回值类型）。
2. 实现 `call()` 方法（可抛出异常，有返回值）。
3. 通过 `FutureTask` 包装 `Callable` 实例，传入 `Thread` 启动；或通过 `ExecutorService` 提交任务。
4. 使用 `Future` 获取返回值或取消任务。

#### 示例代码：
```java
import java.util.concurrent.Callable;
import java.util.concurrent.FutureTask;

public class MyCallable implements Callable<Integer> {
    @Override
    public Integer call() throws Exception {
        int sum = 0;
        for (int i = 1; i <= 100; i++) {
            sum += i;
        }
        return sum; // 返回计算结果
    }

    public static void main(String[] args) throws Exception {
        // 方式 1：通过 FutureTask 启动
        Callable<Integer> callable = new MyCallable();
        FutureTask<Integer> futureTask = new FutureTask<>(callable);
        Thread thread = new Thread(futureTask, "Callable 线程");
        thread.start();

        // 获取返回值（阻塞直到任务完成）
        Integer result = futureTask.get();
        System.out.println("计算结果：" + result);

        // 方式 2：通过线程池（ExecutorService）提交（见下方线程池部分）
    }
}
```

#### 特点：
- **优点**：
  - `call()` 方法可返回值、抛出受检异常。
  - `Future` 可获取任务状态（是否完成、取消）、阻塞获取结果或设置超时时间。
- **适用场景**：需要线程执行结果或需要更灵活的异步控制时使用。


### **四、使用线程池（`ExecutorService`，推荐）**
通过 **线程池** 管理线程，避免频繁创建和销毁线程的开销，提高性能和资源利用率。

#### 步骤：
1. 通过 `Executors` 工厂类创建线程池（如 `newFixedThreadPool`、`newCachedThreadPool` 等）。
2. 提交任务（`Runnable` 或 `Callable`）到线程池。
3. 任务执行完毕后，关闭线程池（避免资源泄漏）。

#### 示例代码：
```java
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class ThreadPoolDemo {
    public static void main(String[] args) {
        // 创建固定大小的线程池（2 个线程）
        ExecutorService executor = Executors.newFixedThreadPool(2);

        // 提交 Runnable 任务（无返回值）
        executor.submit(() -> {
            System.out.println("线程池中的 Runnable 任务执行");
        });

        // 提交 Callable 任务（有返回值）
        Future<Integer> future = executor.submit(() -> {
            int sum = 0;
            for (int i = 1; i <= 100; i++) {
                sum += i;
            }
            return sum;
        });

        try {
            Integer result = future.get(); // 阻塞获取结果
            System.out.println("Callable 任务结果：" + result);
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            executor.shutdown(); // 关闭线程池（优雅关闭，不再接受新任务，处理完已有任务后退出）
        }
    }
}
```

#### 常用线程池类型：
| 方法                          | 特点                                                                 |
|-------------------------------|----------------------------------------------------------------------|
| `newFixedThreadPool(int n)`   | 固定大小线程池，线程数始终为 `n`，适用于负载均衡的长期任务。         |
| `newCachedThreadPool()`        | 可缓存线程池，线程数动态调整（空闲线程存活 60 秒），适用于短期任务。 |
| `newSingleThreadExecutor()`    | 单线程池，保证任务按顺序执行，相当于单线程串行执行。                 |
| `newScheduledThreadPool(int n)` | 支持定时/周期性任务（如 `scheduleAtFixedRate`）。                   |

#### 特点：
- **优点**：
  - 重用线程，减少创建和销毁线程的开销。
  - 控制线程数量，避免内存溢出（如 `newFixedThreadPool` 限制最大线程数）。
  - 便于管理线程生命周期（通过 `shutdown()` 或 `shutdownNow()`）。
- **最佳实践**：生产环境中优先使用线程池，避免手动创建大量线程。


### **五、匿名内部类与 Lambda 表达式（简化写法）**
#### 1. 匿名内部类（简化 `Runnable`/`Callable` 实现）：
```java
// Runnable 匿名内部类
new Thread(new Runnable() {
    @Override
    public void run() {
        System.out.println("匿名 Runnable 线程");
    }
}).start();

// Callable 匿名内部类（需配合 FutureTask）
FutureTask<Integer> futureTask = new FutureTask<>(new Callable<Integer>() {
    @Override
    public Integer call() throws Exception {
        return 100;
    }
});
new Thread(futureTask).start();
```

#### 2. Lambda 表达式（Java 8+，进一步简化）：
```java
// Runnable Lambda
new Thread(() -> System.out.println("Lambda 线程")).start();

// Callable Lambda（需显式指定类型）
Callable<Integer> callable = () -> {
    Thread.sleep(100);
    return 200;
};
```


### **六、关键区别与选择**
| 方式                | 继承 `Thread` | 实现 `Runnable` | `Callable`+`Future` | 线程池                  |
|---------------------|---------------|------------------|---------------------|-------------------------|
| **返回值**          | 无            | 无               | 有（通过 `Future`） | 支持（`Callable`）      |
| **异常处理**        | 仅支持非受检  | 仅支持非受检     | 支持受检异常        | 支持                    |
| **资源共享**        | 不支持（需静态变量） | 支持（共享实例） | 支持                | 支持                    |
| **线程管理**        | 手动管理      | 手动管理         | 手动管理            | 自动管理（重用线程）    |
| **推荐场景**        | 简单场景      | 多线程共享资源   | 需要返回值/异常处理 | 高并发、大量短期任务    |


### **七、注意事项**
1. **启动线程用 `start()` 而非 `run()`**：
   - `start()` 会创建新线程并调用 `run()`，而直接调用 `run()` 只是普通方法调用，不会启动新线程。

2. **线程命名**：
   - 为线程设置有意义的名称（如 `new Thread(task, "订单处理线程")`），方便调试和排查问题。

3. **线程池关闭**：
   - 生产环境中必须调用 `shutdown()` 或 `shutdownNow()`，避免程序无法退出。

4. **避免过度创建线程**：
   - 手动创建大量线程可能导致内存溢出或上下文切换开销过大，优先使用线程池。


### **总结**
- **简单任务**：使用 `Runnable` + Lambda（简洁灵活，推荐）。
- **需要返回值或处理异常**：使用 `Callable` + `Future`。
- **高并发场景**：使用线程池（`ExecutorService`）管理线程，提升性能和稳定性。
- **面向对象设计**：优先选择 `Runnable` 而非继承 `Thread`，遵循“组合优于继承”原则。

通过合理选择创建方式，可有效解决多线程开发中的性能、资源共享和异常处理问题。
