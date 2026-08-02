---
title: HTTP 与 HTTPS：记录网站从 HTTP 升级 HTTPS
slug: http-https-nginx
publishedAt: "2025-10-26"
date: "2025.10.26"
category: 网络基础
excerpt: 介绍 HTTP 状态码、HTTPS 的混合加密与数字证书，并记录使用 Nginx 为网站申请和配置 HTTPS 的过程。
readTime: 10 分钟
---

很多网站都会从 HTTP 升级到 HTTPS。升级之前，先理解 HTTP 的工作方式，以及 HTTPS 如何解决明文传输带来的窃听、篡改和冒充问题。

## 什么是 HTTP

HTTP（HyperText Transfer Protocol，超文本传输协议）是计算机之间传输超文本的通信规范。

- **超文本**：文字、图片、音乐、视频和 HTML 等内容；
- **传输**：在客户端和服务器之间交换数据；
- **协议**：通信双方共同遵守的格式和规则。

## 常见 HTTP 状态码

| 分类 | 状态码 | 含义 | 典型场景 |
| --- | --- | --- | --- |
| 1xx 信息性 | 100 | 请求的前半部分已收到，客户端可以继续发送 | 大文件分段上传 |
|  | 101 | 切换协议 | 升级到 WebSocket |
| 2xx 成功 | 200 | 请求成功并返回内容 | 查询接口成功 |
|  | 201 | 请求成功并创建资源 | 注册用户、上传文件 |
|  | 202 | 已接受请求，但尚未完成处理 | 提交异步后台任务 |
|  | 204 | 请求成功但没有响应内容 | 删除资源后无需返回数据 |
|  | 206 | 成功处理范围请求 | 视频分片下载、断点续传 |
| 3xx 重定向 | 301 | 永久重定向 | 旧域名迁移到新域名 |
|  | 302 / 307 | 临时重定向 | 表单提交后跳转结果页 |
|  | 303 | 使用另一个 URL 获取结果，常用于 POST 转 GET | 提交表单后展示详情 |
|  | 304 | 资源未修改，客户端可使用缓存 | 静态资源协商缓存 |
| 4xx 客户端错误 | 400 | 请求格式或参数无效 | JSON 格式错误、缺少参数 |
|  | 401 | 未认证或认证信息无效 | Token 缺失或过期 |
|  | 403 | 已认证但没有权限 | 普通用户访问管理页面 |
|  | 404 | 资源不存在 | URL 错误或资源已删除 |
|  | 405 | 请求方法不支持 | 对只支持 GET 的接口发送 POST |
|  | 413 | 请求体过大 | 上传文件超过限制 |
|  | 414 | URI 过长 | URL 超出服务器处理范围 |
|  | 429 | 请求过于频繁 | 触发接口限流 |
| 5xx 服务器错误 | 500 | 服务器内部错误 | 代码异常、数据库连接失败 |
|  | 502 | 网关从上游收到无效响应 | Nginx 无法获得后端正常响应 |
|  | 503 | 服务暂时不可用 | 维护或过载 |
|  | 504 | 网关等待上游超时 | 后端处理过慢 |

## 为什么需要 HTTPS

HTTP 默认以明文传输，攻击者在网络链路上可能：

- 窃听请求和响应中的隐私数据；
- 篡改传输内容；
- 伪装成目标服务器，诱导用户发送信息。

HTTPS 可以理解为 HTTP 加上 TLS（历史上也称 SSL）。TLS 在 HTTP 数据传输前完成身份验证和密钥协商，再对后续通信进行保护。

## HTTPS 如何保证安全

### 混合加密：防止窃听

HTTPS 结合使用非对称加密和对称加密：

1. 建立连接时，使用非对称密码算法完成身份验证和会话密钥协商；
2. 握手完成后，使用性能更高的对称会话密钥加密实际业务数据。

这样既利用了非对称加密便于安全协商的特点，又避免用它加密大量数据带来的性能开销。

### 摘要与数字签名：保证完整性和来源

摘要算法可以把消息计算成固定长度的摘要值。接收方重新计算摘要，可以发现内容是否被修改。

仅传输“内容 + 摘要”仍然不够，因为攻击者可以同时替换两者。数字签名因此使用私钥对摘要进行签名，接收方用证书中的公钥验证签名，从而确认内容没有被篡改，并确认签名来自对应私钥持有者。

### 数字证书：验证服务器身份

数字证书由受信任的 CA（Certificate Authority，证书颁发机构）签发，包含域名、服务器公钥、有效期和 CA 签名等信息。客户端验证证书链、域名和有效期后，才能确认拿到的公钥属于目标服务器，降低中间人替换公钥的风险。

## HTTP 与 HTTPS 对比

| 对比项 | HTTP | HTTPS |
| --- | --- | --- |
| 全称 | HyperText Transfer Protocol | HyperText Transfer Protocol Secure |
| 默认端口 | 80 | 443 |
| 传输方式 | 明文 | 通过 TLS 加密 |
| 证书 | 不需要 | 通常需要 CA 证书 |
| URL 前缀 | `http://` | `https://` |
| 身份验证 | 没有服务器身份验证 | 通过证书验证服务器身份 |
| 适用场景 | 公开且不敏感的内部测试内容 | 登录、支付、个人信息和现代网站 |
| 性能 | 没有加密开销 | 有握手和加解密开销，可通过 TLS 1.3、连接复用等方式降低影响 |

## 将网站从 HTTP 升级到 HTTPS

### 申请 SSL/TLS 证书

可以从 [FreeSSL](https://freessl.cn/) 或其他受信任的证书服务申请证书。申请过程中通常需要在域名 DNS 中添加主机记录，完成域名所有权验证后再下载证书文件。

### 上传证书

将证书解压后上传到服务器 Nginx 配置目录下的 `cert` 子目录。目录不存在时可以创建，但要确保 Nginx 运行用户具备读取权限，并妥善保护私钥文件。

### 配置 Nginx

下面是一个静态站点的 HTTPS 配置示例。证书路径、域名和站点根目录需要替换为实际值：

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     cert/full_chain.pem;
    ssl_certificate_key cert/private.key;

    ssl_session_timeout 5m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    root /var/www-data/site;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

如果网站包含 PHP 或后端 API，需要额外配置对应的 `location`、反向代理或 FastCGI 规则。截图中的 Nginx 配置展示了证书、协议和站点根目录的设置：

![Nginx HTTPS 配置](../assets/posts/http-https-nginx/nginx-ssl-config.png)

### 可选：HTTP 重定向到 HTTPS

确认 HTTPS 正常后，可以将 80 端口的请求永久重定向到 HTTPS：

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

### 重载 Nginx

修改配置后先检查语法，再平滑重载：

```bash
nginx -t
nginx -s reload
```

### 前端 API 使用相对路径

如果前端使用 Axios，建议统一使用相对路径，让浏览器自动沿用当前页面的协议，避免 HTTPS 页面请求 HTTP API 造成混合内容：

```javascript
const instance = axios.create({
  baseURL: '/',
});

instance.get('/api/notice/pull');
```

如果必须使用绝对地址，应确保 API 域名也使用 `https://`。

### 验证升级结果

浏览器访问 HTTPS 域名，检查地址栏的证书信息、页面资源是否全部通过 HTTPS 加载，以及登录和 API 请求是否正常：

![HTTPS 网站访问成功](../assets/posts/http-https-nginx/https-site-success.png)

## 小结

HTTP 解决了数据传输问题，但默认不提供机密性、完整性和服务器身份验证。HTTPS 通过 TLS、混合加密、数字签名和 CA 证书建立可信通信。部署时重点检查证书链、私钥权限、Nginx 配置、HTTP 重定向和前端 API 协议，逐项验证后再切换流量。
