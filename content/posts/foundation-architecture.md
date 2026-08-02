---
title: 互联网应用基础架构：从 DNS 到消息中间件
slug: foundation-architecture
publishedAt: "2026-01-18"
date: "2026.01.18"
category: 系统架构
excerpt: 从单机房内部架构出发，完整梳理 DNS、HTTP DNS、Nginx、LVS、服务发现、RPC、MySQL、Redis 和消息中间件。
readTime: 25 分钟
---

# 基础架构
## 1. 单机房的内部架构
![在这里插入图片描述](../assets/posts/foundation-architecture/single-datacenter.png)

各角色的功能
- DNS服务器负责将用户访问Friendy的域名映射为公网IP地址(或称为整个机房的入口 IP地址),然后用户请求就可以通过IP协议进入机房了。  
-  LVS提供对外的公网IP地址作为机房的入口,同时作为四层负载均衡器将用户请  求分发到Nginx集群。  
- Nginx作为七层负载均衡器,根据HTTP(S)请求的协议头或URL路径规则将用户请求转发到对应的业务HTTP服务器。  
- 业务服务层的HTTP服务真正处理用户请求,根据不同的HTTP URL向RPC服务发送业务逻辑处理请求。
- 业务服务层的RPC服务执行核心业务逻辑。如果业务逻辑涉及读/写数据,那么它会进一步访问数据层;如果业务逻辑涉及与其他RPC服务的交互,那么它也会调用其他RPC服务。
- 存储层是所有存储系统的集合,包括分布式缓存、关系型数据库、NoSQL数据库等。分布式缓存提供数据缓存,用于应对高并发的读请求访问;关系型数据库作为持久化存储保存用户数据,常见的关系型数据库包括MySQL、SQLite. SQL  Server等;NoSQL数据库是一个大类,被应用于关系型数据库无法发挥作用的场景。
- 服务发现负责保存每个服务的动态访问地址列表,以便其他服务可以快速查找到  某服务的访问地址。其功能与DNS相似。
- 消息中间件作为常用的研发中间件,用于请求异步执行、服务间解耦、请求削峰 填谷。
## 2. 客户端连接机房：DNS
DNS的实现了域名到IP地址的映射，域名相对于IP地址更便于人们记忆。
### 2.1 DNS的意义
- 便于用户记忆，打造公司IP。
- 通过维护域名与多个IP地址的映射关系，DNS可以将针对同一个域名的不同用户  请求解析到不同的IP地址,从而缓解单一后台服务器的资源压力。
- 当服务器IP地址变更只需在DNS重新配置IP地址。
- 实现负载均衡
### 2.2 域名结构
![在这里插入图片描述](../assets/posts/foundation-architecture/domain-hierarchy.png)
### 2.3 域名解析
域名解析采用递归查询的方式。
![在这里插入图片描述](../assets/posts/foundation-architecture/dns-resolution.png)
## 3. 客户端连接机房的技术：HTTP DNS
### 3.1 DNS的不足
- 解析域名需要递归查询可能存在延迟。
- DNS 劫持。
### 3.2 HTTP DNS 的原理
通过将域名解析协议有 DNS 协议换成了 HTTP，带来了如下好处。

- 降低域名解析延迟，避免递归查询。
- 防止域名劫持：将域名解析请求直接通过IP地址发送至 HTTP DNS服务器,绕过运营商本地 DNS 服务器,避免了域名劫持问题。
- 调度精准性更高：HTTP DNS 服务器获取的是真实客户端的IP地址,而不是本地DNS服务器的IP地址,即能够基于精确的客户端位置、运营商信息,将域名解析到更精准的、距离更近的IP地址,让客户端就近接入后台服务节点。
### 3.3 最佳实践

通过设计多级策略，当 HTTP DNS 失败时降级到 DNS 技术。
## 4. 接入层
当客户端已经知道如何接入机房后，下一步则是请求调度处理问题。对于简单的个人小型互联网服务后台 HTTP 服务直接绑定公网 IP 地址与客户端建立连接，DNS 服务器对其域名的解析结果就是 HTTP 服务器的一个公网IP地址。对于一个大企业来说或许有些许不足。

- 可用性低：DNS 无法感知 IP 地址的可用性。
- 扩展性差
- 安全风险：IP地址暴露在公网。
为了解决上述问题没有什么是加一层中间层解决不了的，Nginx。
### 4.1 Nginx
Nginx 是一种自由的、开源的、高性能的 HTTP 服务器和反向代理服务器。
#### 4.1.1 正向代理与反向代理
正向代理与反向代理的核心区别在于：正向代理的是客户端，反向代理的是服务器。
![在这里插入图片描述](../assets/posts/foundation-architecture/proxy-comparison.png)

强大的路由转发功能，只需对配置文件 nginx.conf 简单配置就可以搭建一台反向代理服务器。

```bash
# 工作进程数（建议与CPU核心数匹配，或根据负载调整）
worker_processes 3;

# 事件模块：配置工作进程的连接处理能力
events {
    worker_connections 1024;  # 每个工作进程最大并发连接数
}

# HTTP 核心模块：配置反向代理、upstream 集群等
http {
    keepalive_timeout 60;  # HTTP长连接超时时间（秒）

    # ---------- 定义后端服务集群（Upstream） ----------
    # 好友动态 Feed API 集群
    upstream api_friendly_feed {
        server 10.1.0.1:8080;  # 后端服务1
        server 10.1.0.2:8080;  # 后端服务2（负载均衡会在多个服务间分配请求）
        # 可选：添加负载均衡策略，如 weight=5（权重）、ip_hash（基于IP会话保持）等
    }

    # 好友点赞 API 集群
    upstream api_friendly_like {
        server 10.2.0.1:8081;  # 后端服务1
        server 10.2.0.2:8081;  # 后端服务2
    }

    # 好友评论 API 集群
    upstream api_friendly_comment {
        server 10.3.0.1:8082;  # 后端服务1
        server 10.3.0.2:8082;  # 后端服务2
    }

    # ---------- 前端代理服务器（Server 块） ----------
    server {
        listen 80;  # 监听 HTTP 默认端口 80
        server_name example.com;  # 你的域名（本地测试可填 localhost 或留空）

        # 代理“好友动态 Feed”请求（路径以 /api/feed/ 开头）
        location /api/feed/ {
            proxy_pass http://api_friendly_feed/;  # 转发到 upstream 集群
            # 传递客户端信息给后端（便于后端获取真实IP、Host等）
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # 代理“好友点赞”请求（路径以 /api/like/ 开头）
        location /api/like/ {
            proxy_pass http://api_friendly_like/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # 代理“好友评论”请求（路径以 /api/comment/ 开头）
        location /api/comment/ {
            proxy_pass http://api_friendly_comment/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # 【可选】代理静态资源（如前端页面、图片等）
        # location /static/ {
        #     root /path/to/your/static/files;  # 静态文件存放目录
        #     expires 30d;  # 静态文件缓存30天，减少重复请求
        # }
    }
}
```
#### 4.1.2 负载均衡策略

1. **轮询策略（默认）**
   - 特点：按顺序轮流将请求分配到不同后端服务器
   - 适用场景：所有后端服务器配置相同、性能相近的情况
   - 优点：配置简单，无需额外参数

2. **权重策略**
   - 特点：通过`weight`参数设置权重，权重越高的服务器接收请求越多
   - 适用场景：服务器性能不均衡，希望性能好的服务器承担更多负载
   - 额外配置：`max_fails`和`fail_timeout`用于自动处理服务器故障

3. **IP哈希策略**
   - 特点：基于客户端IP地址的哈希值分配请求，同一客户端会固定访问同一服务器
   - 适用场景：需要会话保持的应用，如用户登录状态维持
   - 注意：不建议与`weight`参数同时使用

4. **最少连接策略**
   - 特点：将新请求分配给当前活跃连接数最少的服务器
   - 适用场景：请求处理时间差异较大的应用，如包含复杂计算的API

5. **响应时间策略**
   - 特点：优先选择响应时间短的服务器
   - 适用场景：对响应速度敏感的应用
   - 注意：需要安装第三方模块`nginx-upstream-fair`

6. **URL哈希策略**
   - 特点：基于请求URL的哈希值分配请求
   - 适用场景：静态资源服务器、缓存服务器，可提高缓存命中率
   - 注意：需要安装第三方模块`nginx-upstream-hash`

Nginx 的负载均衡功能决定了一个 HTTP 请求最终被路由到哪个服务器实例,而 HTTP  位于 OSI 七层模型的第七层(应用层),所以 Nginx 作为反向代理也常被称为“七层负载均衡器”。
#### 4.1.3 配置文件热更新
当服务发生变化我们需要频繁的修改配置文件，通过从注册中心动态的获取配置文件变更通过 ` ngx_http_dyups_module`来实现热更新,不用重启 Nginx 服务。
#### 4.1.4 Nginx 反向代理优势
- DNS 指向 Nginx 服务器，业务服务地址变更无需配置 DNS。
- 负载均衡
- 对外只暴露一个公网IP。
- 服务保护，外网只能看到 Nginx 服务器，看不到业务服务器。
- 可扩展性，业务服务器可扩容。
- 可用性，业务服务实例挂掉可迁移到其他实例。
### 4.2 LVS
 Nginx 是应用层软件，单台能承载的请求有限，当请求规模持续扩大时需要使用集群。LVS 负责协调将请求转发到哪台 Nginx 服务器。这个协调者需要有比 Nginx 更高的性能,它就是本节的主角: LVS ( Linux Virtual Server, Linux虚拟服务器)是一个虚拟的服务器集群系统,从 Linux 2.6 版本开始它已经成为 Linux 内核的一部分,即 LVS 运行于操作系统层面。
 #### 4.2.1 LVS 与 Nginx 在请求转发时的区别
 - Nginx 基于应用层协议开发，采用异步转发形式，强调 " 代理"。
 - LVS 基于网络层协议开发，采用同步转发，强调 " 转发"。
 #### 转发模式
 LVS 用于网络接入层也被称为四层负载均衡器，LVS 的主要工作是转发，哪有哪些转发模式呢？
 
 1. NAT 模式
- **原理**：Director（调度器）接收客户端请求后，修改数据包的目标IP为后端Real Server的IP；Real Server处理后将响应发回Director，Director再修改源IP为自身IP，最终转发给客户端。  
- **流量路径**：请求和响应都经过Director（双向流量）。  
- **网络要求**：Real Server的网关必须指向Director，确保响应流量回流。  
- **性能**：受限于Director的带宽和CPU（需处理所有进出流量），适合小规模场景。  
- **适用场景**：小型网站、内部系统，服务器数量少且流量压力不大。 
2. FULLNAT（全地址转换）模式  
FULLNAT 是 LVS NAT 模式的改进版，核心特点是**同时修改请求的源 IP 和目标 IP**，解决了传统 NAT 模式中 Real Server（RS）必须与 Director 同网段的限制。  
- **原理**：Director同时修改请求数据包的源IP（改为自身内网IP）和目标IP（改为Real Server的IP）；Real Server处理后将响应发回Director，Director再修改源IP为VIP（DS的公网IP）、目标IP为客户端IP后转发。  
- **流量路径**：请求和响应均经过Director（双向流量均需经Director处理）。  
- **网络要求**：Real Server与Director可处于不同网段甚至不同IDC，无需将网关指向Director；需为Director编译特定内核补丁（LVS原生不支持，需额外适配）。  
- **性能**：因需进行两次NAT转换且双向流量经Director，性能低于DR和TUN模式，但高于传统NAT模式。  
- **适用场景**：大规模跨网段集群（如多区域数据中心）、云平台租户服务负载均衡、需隐藏Real Server真实IP的高安全场景（如金融系统）。
 
3. TUN（IP隧道）模式  
- **原理**：Director将客户端请求封装在IP隧道中发送到Real Server；Real Server解封装后直接响应客户端，无需经过Director。  
- **流量路径**：请求经Director，响应由Real Server直达客户端（单向流量）。  
- **网络要求**：Real Server需支持IP隧道（如`tunl0`接口），且Director与Real Server间需支持IPIP协议。  
- **性能**：响应流量不经过Director，适合高流量场景，但隧道封装会增加一定延迟。  
- **适用场景**：跨地域分布式系统、CDN（内容分发网络）或高吞吐量场景。  
4. DR（直接路由）模式  
- **原理**：Director和Real Server在同一局域网内共享虚拟IP（VIP）；Director仅修改请求数据包的目标MAC地址为Real Server的MAC地址，Real Server处理后直接响应客户端。  
- **流量路径**：请求经Director，响应由Real Server直达客户端。  
- **网络要求**：Director与Real Server必须在同一物理网络（二层网络），Real Server需配置VIP（通常通过`lo`接口），且需调整ARP设置避免冲突。  
- **性能**：Director仅负责请求分发，响应完全由Real Server处理，性能极致。  
- **适用场景**：高并发、高流量场景（如大型电商、视频流媒体平台）。  
## 5. 服务发现
业务服务在处理请求过程中需要与其他下游服务通信，可能会调用其他业务服务，所以业务服务需要知道下游服务部署的可用地址，而手动维护地址是不现实的，需要为每个服务提供自动发现下游服务地址列表的能力，这就是服务发现。
### 5.1 注册与发现
通常通过一个注册中心来维护每个服务的地址列表。
![在这里插入图片描述](../assets/posts/foundation-architecture/service-discovery.png)
### 5.2 可用地址管理
由于服务的创建、销毁、升级、扩容/缩容都会造成服务地址列表的变更,所以服务  的每个实例在启动时都需要向服务注册中心注册自己的地址,并在退出时注销地址。只有这样,才能使得服务注册中心一直在维护最新的服务地址列表。同时针对异常情况，当实例突然挂掉，来不及向注册中心注销时就需要注册中心主动的去发现。

- 主动探活。注册中心周期性的向每个注册的地址发起探测请求，成功则可用失败则剔除该地址。
- 心跳检测。服务周期性的向注册中心提交自己的健康状态，当超过制定时间未收到服务的健康推送则认为该服务不可用主动剔除。
### 5.3 地址变更推送
当服务的地址列表变更时，为了让调用者尽快感知，注册中心需要及时推送最新的地址列表给调用者。推送过程可能会遭遇 "推送风暴 "，如果某服务有100个调用者，每个调用者有1000个实例，就要给100000节点推送数据；如果有多个服务地址变更，则推送的节点会更多，占用网络带宽。如何解决该问题?
首先，推送形式采取增量模式，“新增了哪些地址” “哪些地址已废弃”。
其次，注册中心多实例部署。
最后，可以采取推拉结合的方式
## 6. RPC
RPC 服务强调后台服务内部之间的相互调用，而 HTTP 强调的是与用户请求的交互。
### 6.1 为什么选择 RPC 协议进行服务通信？
RPC（Remote Procedure Call，远程过程调用）的目标是屏蔽网络细节，像调用本地方法一样调用远程方法。
如果不使用 RPC 时，调用另一个服务时我们需要编写一大段 TCP 或者 HTTP 收发请求的代码，为了简化这个问题，让服务调用者像调用本地方法一样进行远程过程调用，即对网络通信无感，这就是 RPC 需要做的事。
### 6.2 RPC 通信流程
![在这里插入图片描述](../assets/posts/foundation-architecture/rpc-serialization.png)
## 7. 存储层 MySQL
由于MySQL可以展开的有很多故不在此详细展开，只讨论器高可用架构。
### 7.1 主从模式
![在这里插入图片描述](../assets/posts/foundation-architecture/mysql-replication.png)
Master（主库）：负责写操作（数据更新、插入、删除等），并生成二进制日志（binlog）记录写操作。
Slave（从库）：通过 “同步” 机制（实际是复制 Master 的 binlog 并重放），与 Master 保持数据一致；同时对外提供读操作服务。
![在这里插入图片描述](../assets/posts/foundation-architecture/mysql-binlog-replication.png)
### 7.2 MHA（Master High Availability）
基于主从复制的自动故障切换工具，通过监控主节点状态，在主库宕机时将最接近主库数据（binlog）的从库提升为新主，并同步其他从库。
![在这里插入图片描述](../assets/posts/foundation-architecture/mysql-mha.png)
### 7.3 MMM（Master-Master Replication Manager）
双主复制架构（逻辑上 “双主”，但同一时间仅一个主可写），通过虚拟 IP（VIP）实现读写负载均衡与故障切换。
![在这里插入图片描述](../assets/posts/foundation-architecture/mysql-mmm.png)
### 7.4 MGR（MySQL Group Replication）
基于 Paxos 协议的分布式组复制，支持多节点（通常奇数个）数据强一致性同步，自动选举主节点（单主或多主模式）。
## 8. 存储层 Redis
### 8.1 主从模式
![在这里插入图片描述](../assets/posts/foundation-architecture/redis-replication.png)
主从复制的流程
![在这里插入图片描述](../assets/posts/foundation-architecture/redis-replication-process.png)
（1）Slave 连接到 Master 后，发送 `SYNC` 或 `PSYNC` 命令发起复制请求。若为首次同步或主从断开后无法续传，命令携带特定标识表示需要全量数据；若为断点续传，则携带上次同步到的偏移量，请求增量命令。  
（2）Master 收到命令后，若需全量同步，执行 `BGSAVE` 命令在后台生成当前全量数据的 RDB 快照文件，同时创建**命令缓冲区**，记录 `BGSAVE` 开始后所有新执行的写命令（如 SET、HSET 等），避免这些增量操作因 RDB 生成耗时而丢失。  
（3）Master 向当前发起请求的 Slave 发送 RDB 快照文件（每个 Slave 独立同步，Master 对不同 Slave 单独处理 RDB 发送），且在发送 RDB 期间，持续将新的写命令记录到命令缓冲区。  
（4）Slave 收到 RDB 快照文件后，先将其保存到本地磁盘，接着清空自身现有数据，再从磁盘加载 RDB 快照数据到内存，完成基础数据同步；之后启动**接收线程**，专门用于接收 Master 后续发送的增量命令。  
（5）Master 发送完 RDB 快照文件后，会将命令缓冲区中记录的、从 `BGSAVE` 开始到 RDB 发送结束期间的所有写命令，发送给 Slave；此后，Master 每执行新的写命令，会实时将命令发送给 Slave（或由 Slave 主动拉取），进入实时增量同步阶段。  
（6）Slave 收到增量命令后，按顺序在本地重新执行这些命令（即“重放”操作），确保 Slave 数据与 Master 保持一致。且 Slave 的接收线程（负责接收命令）和执行线程（负责重放命令）异步工作，提升同步效率。  
### 8.2 哨兵模式
Redis 哨兵模式（Sentinel Mode）是基于主从复制架构的**高可用解决方案**，核心作用是实现主节点故障后的**自动化故障转移**，解决单纯主从复制中主节点宕机需手动切换的问题，保障服务连续性。
#### 1. 核心功能
哨兵（Sentinel）是独立于主从节点的特殊进程，主要承担 4 大职责：
1.  **监控（Monitoring）**：通过心跳检测（定期发送 PING 命令）实时监控主节点（Master）和从节点（Slave）的运行状态，判断节点是否存活。
2.  **自动故障转移（Automatic Failover）**：当主节点宕机且被确认“客观下线”后，自动选举新主节点、切换从节点复制关系，并通知客户端新主地址。
3.  **通知（Notification）**：当节点状态发生变化（如主节点下线、故障转移完成）时，通过配置的脚本或 API 通知管理员或客户端。
4.  **配置提供者（Configuration Provider）**：客户端启动时可连接哨兵集群，获取当前主节点的地址，无需硬编码主节点信息（适配故障转移后的地址变更）。


#### 2. 架构组成
哨兵模式由 3 类角色组成，通常需部署**奇数个哨兵节点**（如 3 个，避免脑裂）：
-   **哨兵节点（Sentinel Nodes）**：1 个或多个独立运行的哨兵进程（非 Redis 数据节点），通过集群协作判断主节点状态、执行故障转移，奇数个可避免投票分歧。
-   **主从节点（Master/Slave Nodes）**：基于原有的 Redis 主从复制架构，主节点负责写操作，从节点负责读操作和数据备份。
-   **客户端（Client）**：通过哨兵集群获取主节点地址，与主节点交互写操作、与从节点交互读操作，故障转移后自动连接新主节点。


#### 3. 关键流程：自动故障转移
当主节点宕机，哨兵集群会按以下步骤完成故障转移（核心逻辑）：
1.  **状态检测**：单个哨兵通过 PING 命令检测主节点，若超时未响应，标记主节点为“主观下线”（仅自身判断）。
2.  **集群协商**：该哨兵向其他哨兵发送“判断主节点是否下线”的请求，若超过 **quorum（法定票数，如 3 个哨兵中 2 个同意）** 认为主节点下线，则标记主节点为“客观下线”（集群共识，避免误判）。
3.  **选举领导者哨兵**：通过 Raft 协议在哨兵集群中选举 1 个“领导者哨兵”，仅由它执行后续故障转移操作（避免重复操作）。
4.  **选择新主节点**：领导者哨兵从所有健康的从节点中，按“优先级（slave-priority）→ 复制进度（偏移量）→ 运行 ID 大小”的顺序选举最优从节点作为新主节点。
5.  **切换复制关系**：
    - 向新主节点发送 `SLAVEOF NO ONE` 命令，使其脱离从节点身份，成为主节点；
    - 向其他从节点发送 `SLAVEOF 新主节点地址` 命令，让它们复制新主节点数据；
    - 若原主节点恢复，自动变为新主节点的从节点。
6.  **通知客户端**：哨兵集群向客户端推送新主节点地址，客户端更新连接信息，恢复正常读写。


#### 4. 核心工作原理
1.  **心跳与下线判断**：
    - 哨兵与所有主从节点保持心跳（默认每 1 秒 PING 一次），节点若在 `down-after-milliseconds` 时间内未响应（如 3000 毫秒），触发“主观下线”；
    - 客观下线需满足“主观下线 + 超过 quorum 哨兵同意”，quorum 可配置（如 3 个哨兵配 2，确保多数共识）。
2.  **Raft 选举领导者**：哨兵集群通过“投票选举”产生领导者，确保同一时刻仅 1 个哨兵执行故障转移，避免冲突。
3.  **配置同步**：哨兵之间通过 Pub/Sub 机制（订阅 `__sentinel__:hello` 频道）同步主从节点状态、下线判断、故障转移进度等信息，保持集群数据一致。

## 9. 消息中间件
消息队列事分布式系统的最重要的中间件，主要涉及三个重要角色生产者、消息中间件、消费者。
### 9.1 用途
1. 异步化
对于那些费时的操作但不要求同步的业务逻辑中可以通过引入消息队列来提高系统的响应时间。
![在这里插入图片描述](../assets/posts/foundation-architecture/sync-chain.png)
引入消息队列
![在这里插入图片描述](../assets/posts/foundation-architecture/async-mq.png)

2. 流量削峰
消费者根据自己的消费能力从消息队列中慢慢拉取消息消费。
![在这里插入图片描述](../assets/posts/foundation-architecture/traffic-shaping.png)
3. 解耦
![在这里插入图片描述](../assets/posts/foundation-architecture/decoupling.png)
## 10. 小结
在一个互联网应用内,用户在 pc 端、移动端的任何点击行为几乎都会通过互联网发  出网络请求到应用后台机房,从发出请求到请求被响应的时间虽然非常短,但在这短短的  时间内却涉及很多事情。 
 1. 用户请求以 HTTP 形式发出,并通过域名指定应用所在机房的地址; DNS、HTTP DNS 等技术提供了域名解析服务,使得用户请求的目的地指向应用机房的接入层IP地址。  
 2. 用户请求进入机房后到达四层负载均衡器 LVS, LVS 将用户请求进一步转发到七层负载均衡器 Nginx。
 3. Nginx 根据用户请求的 URL 与已配置的 URL 转发规则进行匹配,将用户请求进一步转发到相关业务层的 HTTP 服务。  
 4. HTTP 服务处理用户请求,并根据业务逻辑继续向相关业务层的RPC 服务发起调用。  
 5. RPC 服务处理请求,在处理逻辑中可能需要调用其他RPC服务,或者从存储层的 Redis、MySQL 等中获取相关业务数据。
