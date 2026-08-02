---
title: Java 线程间通信：wait/notify 与 Condition
slug: java-thread-communication
publishedAt: "2025-01-05"
date: "2025.01.05"
category: 工程实践
excerpt: 通过生产者与消费者示例，理解 synchronized 的 wait/notify 机制、虚假唤醒问题，以及 ReentrantLock 配合 Condition 的实现方式。
readTime: 8 分钟
---

# 线程间的通信

## Synchronized
使用object类中提供的wait（）、notify（）、notifyAll（）进行线程通信。
### 1、示例
```java
/**
 * 1、创建资源类，属性和操作方法
 *
 */
class Share{
    private int number =0;

    public  synchronized void incr() throws InterruptedException {
        //number=0,则执行该操作，否则等待
        if(number != 0){
            this.wait();//wait在哪里等待就,就在哪里醒
        }
        number++;
        System.out.println("当前"+Thread.currentThread().getName()+"将number修改为"+ number);
        this.notifyAll();
    }
    public synchronized  void decr() throws InterruptedException {
        //number=1,则执行该操作，否则等待
        if(number != 1){
            this.wait();
        }
        number--;
        System.out.println("当前"+Thread.currentThread().getName()+"将number修改为"+ number);
        this.notifyAll();
    }
}

public class ThreadCommunication {
    public static void main(String[] args) {
        Share share = new Share();
        new Thread(()->{
            for(int i = 0;i<=5;i++){
                try {
                    share.incr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"thread1").start();
        new Thread(()->{
            for(int i = 0;i<=5;i++){
                try {
                    share.decr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"thread2").start();
        new Thread(()->{
            for(int i = 0;i<=5;i++){
                try {
                    share.decr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"thread3").start();
        new Thread(()->{
            for(int i = 0;i<=5;i++){
                try {
                    share.incr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"thread4").start();
    }

}

```
### 2、虚假唤醒问题
可以看到上述代码运行结果，出现了虚假唤醒问题，主要原因在于wait（）方法，当线程进入等待状态，之后被唤醒是从当前位置开始往下执行，if判断失效，导致线程不会再次进入等待状态，从而导致该问题的产生。
![在这里插入图片描述](../assets/posts/java-thread-communication/if-condition-result.png)
### 3、解决办法
使用while（）判断语句，循环判断
```java
/**
 * 1、创建资源类，属性和操作方法
 *
 */
class Share{
    private int number =0;

    public  synchronized void incr() throws InterruptedException {
        //number=0,则执行该操作，否则等待
        while(number != 0){
            this.wait();//wait在哪里等待就,就在哪里醒
        }
        number++;
        System.out.println("当前"+Thread.currentThread().getName()+"将number修改为"+ number);
        this.notifyAll();
    }
    public synchronized  void decr() throws InterruptedException {
        //number=1,则执行该操作，否则等待
        while(number != 1){
            this.wait();
        }
        number--;
        System.out.println("当前"+Thread.currentThread().getName()+"将number修改为"+ number);
        this.notifyAll();
    }
}

public class ThreadCommunication {
    public static void main(String[] args) {
        Share share = new Share();
        new Thread(()->{
            for(int i = 0;i<=5;i++){
                try {
                    share.incr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"thread1").start();
        new Thread(()->{
            for(int i = 0;i<=5;i++){
                try {
                    share.decr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"thread2").start();
        new Thread(()->{
            for(int i = 0;i<=5;i++){
                try {
                    share.decr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"thread3").start();
        new Thread(()->{
            for(int i = 0;i<=5;i++){
                try {
                    share.incr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"thread4").start();
    }

}

```
结果
![在这里插入图片描述](../assets/posts/java-thread-communication/while-condition-result.png)
## Lock接口
ReentrantLock+Condition实现线程间的通信。
### 1、示例
```java
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

class Resource{
    private int number=0;
    private Lock lock = new ReentrantLock();
    private Condition condition = lock.newCondition();
    public void incr() throws InterruptedException {
        lock.lock();
        while(number != 0 ){
            condition.await();
        }
        number++;
        System.out.println("当前"+Thread.currentThread().getName()+"将number修改为"+ number);
        condition.signalAll();
        lock.unlock();

    }
    public void decr() throws InterruptedException {
        lock.lock();
        while(number != 1 ){
            condition.await();
        }
        number--;
        System.out.println("当前"+Thread.currentThread().getName()+"将number修改为"+ number);
        condition.signalAll();
        lock.unlock();
    }

}


public class TreadCommunicationByLock {
    public static void main(String[] args) {
        Resource share = new Resource();

        new Thread(()->{
            for (int i = 0;i<=5;i++){
                try {
                    share.incr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"Thread1").start();
        new Thread(()->{
            for (int i = 0;i<=5;i++){
                try {
                    share.incr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"Thread2").start();
        new Thread(()->{
            for (int i = 0;i<=5;i++){
                try {
                    share.decr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"Thread3").start();
        new Thread(()->{
            for (int i = 0;i<=5;i++){
                try {
                    share.decr();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        },"Thread4").start();
    }

}

```
![在这里插入图片描述](../assets/posts/java-thread-communication/condition-result.png)
