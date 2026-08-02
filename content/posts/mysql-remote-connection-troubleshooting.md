---
title: IDEA 连接远程 MySQL 失败排查记录
slug: mysql-remote-connection-troubleshooting
publishedAt: "2025-05-11"
date: "2025.05.11"
category: 故障复盘
excerpt: 记录本地 IDEA 连接远程 MySQL 时出现 Communications link failure 的排查过程，定位服务、端口与多层防火墙问题。
readTime: 5 分钟
---

使用本地 IDEA 测试远程 MySQL 连接时，出现了如下错误：

```text
[08S01] Communications link failure
The driver has not received any packets from the server.
```

![IDEA 连接 MySQL 失败](../assets/posts/mysql-remote-connection-troubleshooting/idea-connection-error.png)

这类错误表示客户端没有收到服务器返回的数据包，原因可能是服务未启动、端口未监听、网络策略拦截，或者连接参数不正确。可以按下面的顺序逐层排查。

## 1. 检查 MySQL 服务状态

先登录服务器，确认 MySQL 服务是否正常运行：

```bash
systemctl status mysql
```

如果服务状态是 `active (running)`，说明 MySQL 进程已经启动；如果是 `failed` 或 `inactive`，先查看日志并修复服务本身：

```bash
journalctl -u mysql -n 100 --no-pager
systemctl restart mysql
```

![MySQL 服务运行状态](../assets/posts/mysql-remote-connection-troubleshooting/mysql-service-status.png)

需要注意，服务正常运行只代表进程已经启动，不代表外部网络一定能够访问它。

## 2. 检查端口是否监听

使用 `netstat` 或 `ss` 检查 MySQL 端口：

```bash
sudo netstat -plnt | grep mysql
# 或
sudo ss -lntp | grep 3306
```

如果看到类似下面的输出，说明 MySQL 正在监听 3306 端口：

```text
tcp6  0  0 :::3306  :::*  LISTEN  50013/mysqld
```

![MySQL 端口监听状态](../assets/posts/mysql-remote-connection-troubleshooting/mysql-port-listening.png)

如果只监听 `127.0.0.1:3306`，远程客户端无法直接连接，需要检查 MySQL 的 `bind-address` 配置。但将监听地址改为 `0.0.0.0` 会扩大暴露面，修改前应先规划访问来源和防火墙规则。

## 3. 检查服务器的多层防火墙

排查过程中容易只检查云厂商控制台的安全组，却忽略服务器内部可能还有其他防火墙。一次典型的访问链路可能同时经过：

1. 云厂商安全组；
2. 服务器系统防火墙（如 firewalld、ufw）；
3. 宝塔 Linux 面板的安全规则；
4. MySQL 自身的用户来源限制。

如果服务器安装了宝塔面板，还需要在“安全”页面添加对应端口规则：

![宝塔面板添加端口规则](../assets/posts/mysql-remote-connection-troubleshooting/bt-firewall-rule.png)

系统防火墙也可以用命令检查：

```bash
# firewalld
sudo firewall-cmd --list-ports

# ufw
sudo ufw status
```

如果确实需要开放端口，应尽量只允许固定办公 IP 或 VPN 网段访问，而不是对整个公网开放。

## 4. 检查连接参数和 MySQL 权限

服务、端口和防火墙都正常后，再检查 IDEA 的连接配置：

- 主机地址是否为服务器公网 IP 或域名；
- 端口是否与实际监听端口一致；
- 用户名和密码是否正确；
- MySQL 用户是否允许从当前客户端地址登录；
- 连接是否要求 SSL 或其他认证参数。

可以在 MySQL 中查看用户允许的来源：

```sql
SELECT user, host
FROM mysql.user
WHERE user = 'your_user';
```

不要为了快速解决问题而直接创建允许任意主机访问的高权限账号。应创建权限最小化的业务用户，并限制来源地址。

## 5. 从客户端验证网络连通性

在本地终端先测试 TCP 端口，比直接反复点击 IDEA 的连接测试更容易定位问题：

```bash
nc -vz your-server.example.com 3306
```

如果端口不通，优先回到安全组、系统防火墙和宝塔规则排查；如果端口可达但 MySQL 客户端仍失败，再检查账号权限、认证插件和 SSL 配置。

## 更安全的连接方式

如果只是个人开发或运维，不建议长期把 MySQL 3306 暴露在公网。可以使用 SSH 隧道：

```bash
ssh -N -L 13306:127.0.0.1:3306 user@your-server.example.com
```

然后在 IDEA 中连接本地 `127.0.0.1:13306`。这样 MySQL 仍然只监听服务器本机，外部访问通过 SSH 加密隧道转发，暴露面更小。

## 总结

遇到 `Communications link failure` 时，可以按照“服务状态 → 端口监听 → 云安全组 → 系统防火墙 → 宝塔规则 → MySQL 用户权限 → 客户端参数”的顺序排查。不要只检查其中一层，也不要为了临时连通而长期开放公网数据库端口。
