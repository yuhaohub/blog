---
title: Spring Cloud Gateway：自定义过滤器
slug: spring-cloud-gateway-custom-filters
publishedAt: "2024-09-01"
date: "2024.09.01"
category: 工程实践
excerpt: 介绍 Spring Cloud Gateway 中 GatewayFilter 与 GlobalFilter 的作用范围、实现方式和基本用法。
readTime: 3 分钟
---

![Spring Cloud Gateway 过滤器链执行流程](../assets/posts/spring-cloud-gateway-custom-filters/gateway-filter.png)

Spring Cloud Gateway 过滤器链中的过滤器主要有两种：`GatewayFilter` 和 `GlobalFilter`。

## GatewayFilter

`GatewayFilter` 是路由过滤器，作用范围比较灵活，可以应用于任意指定的路由（Route）。

### 自定义 GatewayFilter

自定义 `GatewayFilter` 时，不直接实现 `GatewayFilter` 接口，而是继承 `AbstractGatewayFilterFactory`：

```java
@Component
public class PrintAnyGatewayFilterFactory
        extends AbstractGatewayFilterFactory<Object> {

    @Override
    public GatewayFilter apply(Object config) {
        return new GatewayFilter() {
            @Override
            public Mono<Void> filter(
                    ServerWebExchange exchange,
                    GatewayFilterChain chain) {
                // 获取请求
                ServerHttpRequest request = exchange.getRequest();

                // 编写过滤器逻辑
                System.out.println("过滤器执行了");

                // 放行
                return chain.filter(exchange);
            }
        };
    }
}
```

### 使用方式

在配置文件中添加默认过滤器：

```yaml
spring:
  cloud:
    gateway:
      default-filters:
        - PrintAny
```

配置中的 `PrintAny` 对应类名 `PrintAnyGatewayFilterFactory`。Spring Cloud Gateway 会自动识别并省略类名末尾的 `GatewayFilterFactory`。

## GlobalFilter

`GlobalFilter` 是全局过滤器，作用于所有路由，声明后会自动生效。

### 自定义 GlobalFilter

实现 `GlobalFilter` 接口即可定义全局过滤器。还可以同时实现 `Ordered` 接口来控制执行顺序，例如让用户校验在请求转发到微服务之前执行。

```java
@Component
public class MyGlobalFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(
            ServerWebExchange exchange,
            GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        HttpHeaders headers = request.getHeaders();
        System.out.println("headers = " + headers);

        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return 0;
    }
}
```

`getOrder()` 的返回值越小，过滤器的优先级越高。
