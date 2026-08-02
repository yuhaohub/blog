---
title: 项目部署记录：使用 Linux 宝塔面板部署前后端
slug: baota-linux-project-deployment
publishedAt: "2025-06-22"
date: "2025.06.22"
category: 工程实践
excerpt: 记录使用宝塔面板部署 Spring Boot 后端和前端项目的完整流程，从打包、上传到 Nginx 反向代理联调。
readTime: 8 分钟
---

这篇文章记录一次使用 Linux 宝塔面板部署前后端项目的过程。整体流程可以拆成四部分：本地准备、服务器环境、项目启动和最终联调。

## 一、本地准备

### 后端项目

部署前先梳理生产环境配置，通常包括数据库地址、Redis 地址、文件存储路径、日志目录和跨域配置。建议单独创建 `application-prod.yml`，不要把生产环境密码直接写入开发配置。

```yaml
spring:
  profiles:
    active: prod
```

然后使用 Maven 打包：

```bash
mvn clean package -DskipTests
```

打包完成后得到可部署的 JAR 文件，例如 `app-0.0.1-SNAPSHOT.jar`。

### 前端项目

前端需要先修改 `request.ts` 等请求封装文件，将 API 地址指向服务器域名或反向代理路径，再执行生产构建：

```bash
npm install
npm run build
```

构建产物通常位于 `dist/` 或 `build/` 目录，部署时上传目录中的静态文件，而不是上传整个开发工程。

## 二、准备服务器环境

### 安装基础软件

登录宝塔面板后，根据项目需要安装 Nginx、MySQL、Java 运行环境、Node.js 等软件。面板提供 LNMP/LAMP 等组合安装方式：

![宝塔面板安装服务器环境](../assets/posts/baota-linux-project-deployment/install-environment.png)

生产环境应根据项目实际版本选择 JDK、MySQL 和 Nginx，不要因为面板提供了旧版本就直接使用。安装完成后，记录 JDK 路径和 MySQL 连接信息，后续创建 Java 项目时会用到。

### 初始化数据库

在宝塔数据库页面创建数据库和用户，并导入项目初始化 SQL。导入后检查字符集、表数量和初始数据，确认后端配置中的数据库名、用户名、密码与服务器实际配置一致。

### 上传项目文件

可以通过宝塔文件管理、SFTP 或其他安全传输方式上传：

- 后端 JAR 文件；
- 前端构建后的静态文件；
- 配置文件、初始化 SQL 和必要的资源目录。

![上传前后端项目文件](../assets/posts/baota-linux-project-deployment/upload-artifacts.png)

建议为不同项目建立独立目录，并限制目录权限，避免把 `.env`、密钥和源码仓库暴露给 Web 服务器。

## 三、启动项目

### 添加 Java 项目

在宝塔的 Java 项目中选择 Spring Boot 类型，填写 JAR 路径、项目端口、项目名称和 JDK：

![宝塔面板添加 Java 项目](../assets/posts/baota-linux-project-deployment/add-java-project.png)

启动命令需要指定生产环境 profile：

```bash
/www/server/java/jdk-11.0.19/bin/java \
  -Xms256M -Xmx1024M \
  -jar /www/wwwroot/app/app.jar \
  --spring.profiles.active=prod
```

也可以通过环境变量指定：

```text
SPRING_PROFILES_ACTIVE=prod
```

项目端口应只在服务器内部使用，外部访问统一交给 Nginx 反向代理。启动后先查看项目日志，确认 Spring Boot 已完成初始化并成功连接数据库。

### 添加前端项目

在宝塔网站中添加站点，根目录指向前端构建产物：

![宝塔面板添加前端站点](../assets/posts/baota-linux-project-deployment/add-frontend-site.png)

配置域名和 SSL 后，确认站点首页能够打开。前端是单页应用时，还要配置路由回退到 `index.html`，避免刷新子路由出现 404。

### 配置 Nginx 反向代理

前端页面和后端服务通常使用同一个域名，通过 Nginx 将 API 请求转发到本机 Java 端口：

```nginx
location /api {
    proxy_pass http://127.0.0.1:8123;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_set_header Connection "";
}

location /api/ws {
    proxy_pass http://127.0.0.1:8123;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 86400s;
}
```

![Nginx 反向代理配置](../assets/posts/baota-linux-project-deployment/nginx-proxy-config.png)

如果前端请求使用 `/api` 前缀，`proxy_pass` 的路径写法会影响最终转发 URL，配置后应结合浏览器 Network 面板和后端访问日志确认请求路径没有被重复拼接或截断。

## 四、联调测试

部署完成后按以下顺序验证：

1. 直接访问域名，确认前端静态资源加载正常；
2. 在浏览器 Network 面板检查 API 请求状态码和响应内容；
3. 检查后端日志，确认请求已经转发到 Spring Boot；
4. 测试数据库读写、文件上传、WebSocket 等关键功能；
5. 使用未登录、异常参数和刷新子路由等场景进行回归。

![前后端部署联调成功](../assets/posts/baota-linux-project-deployment/deployment-result.png)

## 部署检查清单

- [ ] 后端使用生产 profile，敏感配置没有提交到仓库；
- [ ] 数据库初始化完成，账号权限符合最小权限原则；
- [ ] JDK 版本与项目编译版本匹配；
- [ ] Java 项目端口仅对本机或内网开放；
- [ ] Nginx 已配置 API 和 WebSocket 转发；
- [ ] 前端路由刷新不会 404；
- [ ] 已配置 HTTPS、日志、备份和健康检查；
- [ ] 防火墙只开放必要端口。

## 总结

宝塔面板降低了服务器环境和进程管理的门槛，但部署仍然需要明确区分本地构建、服务器运行和公网访问三个边界。后端由 Java 项目管理，前端由网站托管，Nginx 负责统一入口和反向代理，最后通过日志与浏览器请求完成联调验证。
