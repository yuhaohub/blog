---
title: K8S 基础与实战
slug: k8s-basics
publishedAt: "2026-03-22"
date: "2026.03.22"
category: 云原生
excerpt: 介绍 Kubernetes 的核心功能、架构、核心对象、集群搭建和基础实战操作。
readTime: 15 分钟
---

# K8S
## 一、什么是K8S？
大规模容器管理编排系统
### 1、容器管理存在的问题
- 服务挂了怎么办
- 流量太大抗不住
- 更新需要停机
- 容器放在哪台机器合适
### 2、K8S核心功能
- 自我修复：一旦某一个容器崩溃，能够在1秒中左右迅速启动新的容器
-  弹性伸缩：可以根据需要，自动对集群中正在运行的容器数量进行调整
- 滚动更新：它会自动“一个个替换”，新版本启动成功后再关掉旧版本
-  服务发现：服务可以通过自动发现的形式找到它所依赖的服务
-  负载均衡：如果一个服务起动了多个容器，能够自动实现请求的负载均衡
-  版本回退：如果发现新发布的程序版本有问题，可以立即回退到原来的版本
- 存储编排：可以根据容器自身的需求自动创建存储卷
## 二、核心架构
K8S 遵循主从架构（Master-Worker），理解各组件的职责是入门的关键：
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/3ed843e5dd9744b096c4ea3076d3a7f8.png)

- **Control Plane (Master 节点)**:

	- **kube-apiserver**: 整个集群的“大脑”和入口，所有指令都通过它转发。

	- **etcd**: 数据库，存储集群的所有状态数据（高可用集群中非常关键）。

	- **kube-scheduler**: “调度员”，决定 Pod 应该运行在哪个 Node 上。
	- **kube-controller-manager**: “管家”，负责维持集群状态（如副本数量、节点健康）。


- Node (Worker 节点):

	- **kubelet**: 驻守在节点上的“代理”，负责与 Master 通信并管理容器生命周期。

	- **kube-proxy**: “网络交警”，负责实现 Service 的网络代理和负载均衡。

	- **Container Runtime**: 真正的容器运行环境。
## 三、核心对象
| 对象名称 | 理论定义 | 通俗理解 |
| :--- | :--- | :--- |
| **Pod** | K8S 的最小调度单位 | 容器的“马甲”，一个 Pod 内部可以起多个容器 |
| **Deployment** | 控制 Pod 的控制器 | 规定“我要运行 3 个 Nginx 副本”，它负责维持这个状态 |
| **Service** | 定义一组 Pod 的访问规则 | Pod 的 IP 会变，Service 提供一个稳定的 VIP 供外部访问 |
| **Namespace** | 资源隔离机制 | 类似于虚拟机的“分区”，把开发、测试环境隔离开 |
## 四、基础环境搭建
准备三台服务器，一台用作Master，两台worker。Master节点推荐配置2核4G及以上，worker节点推荐配置2核2G及以上。
### 1、预备环境
1. 为每台服务器安装上docker
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/057e6c9d03644c93b16cc57ab47ad25e.png)
2. 替换为国内镜像源加速下载
```shell
sudo tee /etc/docker/daemon.json <<-'EOF'
{
    "registry-mirrors": [
        "https://docker.registry.cyou/",
        "https://docker-cf.registry.cyou/",
        "https://dockercf.jsdelivr.fyi/",
        "https://docker.jsdelivr.fyi/",
        "https://dockertest.jsdelivr.fyi/",
        "https://mirror.aliyuncs.com/",
        "https://dockerproxy.com/",
        "https://mirror.baidubce.com/",
        "https://docker.m.daocloud.io/",
        "https://docker.nju.edu.cn/",
        "https://docker.mirrors.sjtug.sjtu.edu.cn/",
        "https://docker.mirrors.ustc.edu.cn/",
        "https://mirror.iscas.ac.cn/",
        "https://docker.rainbond.cc/"
    ]
}
EOF
```
3. 重启docker，查看更新后信息

```shell
sudo systemctl daemon-reload
sudo systemctl restart docker
docker info
```
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/0a49fd60d2c44165b945b0c24384850b.png)
### 2、安装3大件
- kubeadm ： 用于集群管理
- kubelet: 采集节点数据汇报给 master 用
- kubectl: 管理集群资源对象环境用
Debian / Ubuntu系统在各节点执行以下命令
```shell
# 先安装 curl 和依赖
sudo apt-get update && sudo apt-get install -y apt-transport-https curl

# 下载 Kubernetes 密钥
curl -fsSL https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.28/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

# 添加 Kubernetes 源
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.28/deb/ /" | sudo tee /etc/apt/sources.list.d/kubernetes.list

# 更新并安装 k8s 组件
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl

# 锁定版本，防止自动更新
sudo apt-mark hold kubelet kubeadm kubectl

```
CentOS
```shell
cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://mirrors.aliyun.com/kubernetes/yum/repos/kubernetes-el7-x86_64/
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://mirrors.aliyun.com/kubernetes/yum/doc/yum-key.gpg https://mirrors.aliyun.com/kubernetes/yum/doc/rpm-package-key.gpg
EOF
setenforce 0
yum install -y kubelet kubeadm kubectl
systemctl enable kubelet && systemctl start kubelet
```
查看K8S版本信息
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/b4d42d13d3bc421199627a6540139054.png)
### 3、初始化Matser节点
先把域名及ip地址映射加入到hosts配置文件当中,**各子节点执行同样操作**，后续可以直接通过访问k8s-master互相通信。
```shell
sudo tee -a /etc/hosts << EOF
192.168.181.129 k8s-master
192.168.181.131 k8s-node-1
192.168.181.132 k8s-node-2
EOF
```
执行初始化前检查防火墙和swap是否关闭等，避免初始化错误
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/a33900b5117a4a2495b9e58db5da6fac.png)

```shell
# 加载桥接内核模块
modprobe br_netfilter
# 开机自动加载模块
echo "br_netfilter" >> /etc/modules-load.d/k8s.conf
# 配置 K8s 必需的内核参数
cat > /etc/sysctl.d/k8s.conf << EOF
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
EOF
# 生效内核参数
sysctl --system

# 关闭swap
sudo sed -i '/swap/s/^/#/' /etc/fstab

# 关闭防火墙
sudo systemctl stop ufw
sudo systemctl disable ufw

# 生成默认配置文件
# 创建缺失的 containerd 配置目录
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml
# 修改 Cgroup 为 systemd（K8s 强制要求）
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g' /etc/containerd/config.toml
# 将 containerd 默认的国外 pause 镜像，改为阿里云镜像
sed -i 's#registry.k8s.io/pause#registry.aliyuncs.com/google_containers/pause#g' /etc/containerd/config.toml
# 插入镜像加速器（定位到 mirrors 这一行并在其后插入）
sudo sed -i '/\[plugins."io.containerd.grpc.v1.cri".registry.mirrors\]/a \        [plugins."io.containerd.grpc.v1.cri".registry.mirrors."docker.io"]\n          endpoint = ["https://docker.m.daocloud.io", "https://mirror.baidubce.com"]' /etc/containerd/config.toml
# 重启 containerd 并设置开机自启
systemctl restart containerd
systemctl enable containerd
```
在主节点执行（*只需在主节点执行*）
```shell
kubeadm init \
  --kubernetes-version=v1.28.15 \
  --apiserver-advertise-address=192.168.181.129 \
  --pod-network-cidr=10.244.0.0/16 \
  --service-cidr=10.96.0.0/12 \
  --control-plane-endpoint="k8s-master" \
  --image-repository=registry.aliyuncs.com/google_containers
```
初始化成功
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/3eded53789e147d4ac7147a76eefcbe4.png)
在Master节点执行命令
```shell
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```
部署pod网络，K8S 节点间通信需要网络插件（CNI）
```shell
# 科学上网下载calico配置文件
curl -LO https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml

# 修改配置文件地址保持与节点初始化pod-network-cidr一致
   value: "10.244.0.0/16"
# 部署
kubectl apply -f kube-flannel.yml
```
查看各组件状态
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/895df7a179764a96b0750feb5ae106ff.png)
### 4、worker节点加入到集群
```shell
kubeadm join k8s-master:6443 --token xxxxxxxxxxxxxxxxxxx \
--discovery-token-ca-cert-hash xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/2ea69221361140cf95a7fa3fa6831222.png)
### 5、环境搭建小结
1. 首先需要准备三台服务器
2. 安装预备环境docker
3. 安装3大件 kubeadm、kubectl、kubelet
4. 初始化Master节点，同时部署pod网络
5. 工作节点加入到集群
## 五、实战
### 1、Namespace
1）直接命令行创建
```shell
kubectl create ns dev
```
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/e39ff94f7a184ea6b9dc9a44cc9781d4.png)

2）通过编写yaml文件创建
```shell
kubectl apply -f dev.yaml
```
```yaml
# dev.yaml
apiVersion: v1
kind: Namespace
metadata:
	name: dev
```
### 2、Pod
1） 直接命令行创建
```shell
kubectl run mynginx --image=nginx
# 查看创建过程的详细信息
kubectl describe pod mynginx
```
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/8a7558b369434ad9a5aa02d42ef11427.png)
2) 配置文件
```yaml
apiVersion: v1
kind: pod
metadata:
	name: mynginx
	labels:
    run: mynginx
   namespace: dev
spec:
  containers:
  - image: nginx
    name: mynginx
```
### 3、Deployment
#### 1)多副本
```shell
kubectl create deploy myapp --images=nginx --replica=3
```
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/877f1819648f45d89b9d35abc6ea6e15.png)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: my-dep
  name: my-dep
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-dep
  template:
    metadata:
      labels:
        app: my-dep
    spec:
      containers:
      - image: nginx
        name: nginx
```
#### 2) 扩缩容
```shell
kubectl scale deploy/myapp --replica=4
```
#### 4、自愈
当pod发生故障时，会自动尝试修复。
#### 5、滚动更新
```shell
kubectl set image deployment/my-dep nginx=nginx:1.16.1 --record
kubectl rollout status deployment/my-dep
```
#### 6)、回滚
```shell
# 历史记录
kubectl rollout history deployment/my-dep


# 查看某个历史详情
kubectl rollout history deployment/my-dep --revision=2

# 回滚(回到上次)
kubectl rollout undo deployment/my-dep

# 回滚(回到指定版本)
kubectl rollout undo deployment/my-dep --to-revision=2
```
### 4、Service
#### 1) ClusterIP
```shell
kubectl expose deployment my-dep --port=8000 --target-port=80
```
#### 2) NodePort
```shell
kubectl expose deployment my-dep --port=8000 --target-port=80 --type=NodePort
```
| 特性 | ClusterIP | NodePort |
| :--- | :--- | :--- |
| **暴露范围** | 仅集群内部 | 集群外部 + 内部 |
| **访问方式** | `ClusterIP:Port` | `NodeIP:NodePort` |
| **默认端口范围** | 无限制 | 30000-32767 |
| **包含关系** | 基础组件 | **包含**了一个 ClusterIP |
| **适用场景** | 内部微服务调用 | 外部访问测试、Ingress 入口 |
### 5、Ingress
Service的统一网关入口
## 六、遇到的问题
### 1、创建pod时发现存在一个节点网络错误
#### 错误信息
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/3e854b14cf8f405192f6f969522ca15f.png)
查询网络创建在各节点运行状况，node2存在问题
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/c88314f2f9c7468f93bd595eb9092e31.png)
查看具体日志信息
*br_netfilter 核心模块没有加载成功，或者相关的内核参数没有生效。Flannel 启动时会检查这个文件，如果找不到，它就会崩溃重启。*
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/594ad18048844fd587f9ff28d2f01011.png)
#### 修复
```shell
# 加载内核模块
modprobe br_netfilter
# 开机自动加载模块
echo "br_netfilter" >> /etc/modules-load.d/k8s.conf
# 配置 K8s 必需的内核参数
cat > /etc/sysctl.d/k8s.conf << EOF
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
EOF
# 生效内核参数
sysctl --system
```
再次查看插件日志，成功启动
![在这里插入图片描述](https://i-blog.csdnimg.cn/direct/a8cc5d29c1f64bfdb54384cb84329d2a.png)
