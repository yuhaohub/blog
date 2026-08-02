---
title: Redis Lua 脚本：原子操作与点赞实践
slug: redis-lua-scripts
publishedAt: "2025-03-30"
date: "2025.03.30"
category: Redis
excerpt: 介绍 Redis Lua 脚本的参数规范、原子性、集群注意事项，并用点赞与取消点赞场景演示 Spring Data Redis 的调用方式。
readTime: 9 分钟
---

---

### **一、Lua脚本操作Redis的优势**
| **特性**         | **说明**                                                                 |
|-------------------|-------------------------------------------------------------------------|
| **原子性**        | Lua脚本在Redis中**单线程执行**，所有操作要么全部成功，要么全部失败。              |
| **减少网络开销**  | 将多个Redis命令合并为一个脚本执行，**减少客户端与服务端的通信次数**。              |
| **复杂逻辑封装**  | 可实现条件判断、循环、计算等复杂逻辑（Redis原生命令无法直接实现）。               |
| **集群兼容性**    | 通过显式声明`KEYS`，保证在Redis集群模式下正确路由到目标节点。                    |

---

### **二、Lua脚本基本规范**
#### **1. 参数传递**
- **`KEYS`数组**：所有操作的Redis键（Key）必须显式声明，通过`KEYS[1]`, `KEYS[2]`访问。
- **`ARGV`数组**：其他参数（如值、标志位）通过`ARGV[1]`, `ARGV[2]`访问。
- **示例**：
  ```lua
  -- KEYS[1]=user:123:likes, ARGV[1]=pic_456
  redis.call('SADD', KEYS[1], ARGV[1])
  ```

#### **2. 返回值**
- Lua脚本的最后一个值会作为执行结果返回给客户端。
- 可返回`nil`、数值、字符串、表（自动转为Redis多行回复）。

#### **3. 脚本编写原则**
- **禁止使用全局变量**：所有变量需用`local`声明。
- **避免长耗时操作**：Lua脚本会阻塞Redis其他请求，需确保高效性。

---

### **三、常用Lua脚本操作**
#### **1. 数据操作**
| **操作**       | **示例代码**                                                                 |
|----------------|-----------------------------------------------------------------------------|
| **String**     | `redis.call('SET', KEYS[1], ARGV[1])`                                      |
| **Hash**       | `redis.call('HSET', KEYS[1], 'field', ARGV[1])`                            |
| **Set**        | `redis.call('SADD', KEYS[1], ARGV[1])`                                     |
| **ZSet**       | `redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])`                            |
| **List**       | `redis.call('LPUSH', KEYS[1], ARGV[1])`                                    |

#### **2. 条件判断**
```lua
if redis.call('EXISTS', KEYS[1]) == 1 then
    return redis.call('GET', KEYS[1])
else
    return nil
end
```

#### **3. 循环操作**
```lua
for i=1, #ARGV do
    redis.call('SADD', KEYS[1], ARGV[i])
end
```

#### **4. 错误处理**
```lua
local ok, err = pcall(redis.call, 'INCRBY', KEYS[1], ARGV[1])
if not ok then
    return {err = err}
end
```

---

### **四、注意事项**
| **场景**                | **解决方案**                                                                 |
|-------------------------|-----------------------------------------------------------------------------|
| **集群模式**            | 确保所有`KEYS`在同一个哈希槽（可通过Hash Tag实现，如`{user}:123:likes`）。   |
| **脚本性能**            | 避免复杂循环或大范围数据遍历，优先用Redis原生命令。                           |
| **脚本缓存**            | 使用`SCRIPT LOAD`预加载脚本，通过`EVALSHA`执行（减少网络传输）。              |
| **调试脚本**            | 通过`redis.log(redis.LOG_DEBUG, 'message')`输出日志（需配置Redis日志级别）。 |

---

### **五、典型应用场景**
| **场景**         | **Lua脚本作用**                                                         |
|------------------|-------------------------------------------------------------------------|
| **分布式锁**     | 原子化实现锁的获取、续期、释放（避免锁误删）。                            |
| **计数器**       | 原子化增减计数（如点赞数、库存扣减）。                                    |
| **排行榜**       | 计算分数并更新ZSet，返回排名结果。                                        |
| **批量操作**     | 合并多个命令（如先检查条件再删除数据）。                                  |

---

### **六、调试与测试**
1. **直接执行脚本**（通过`redis-cli`）：
   ```bash
   redis-cli --eval script.lua key1 key2 , arg1 arg2
   ```
2. **捕获错误**：
   ```lua
   local ok, result = pcall(redis.call, 'COMMAND', params)
   if not ok then
       return {error = result}
   end
   ```

---


### 点赞实现
编写lua脚本
```java
public class RedisLuaScript {

    /**
     * 点赞 Lua 脚本
     * KEYS[1]       -- 临时计数键
     * KEYS[2]       -- 用户点赞状态键
     * ARGV[1]       -- 用户 ID
     * ARGV[2]       -- 壁纸 ID
     * 返回:
     * -1: 已点赞
     * 1: 操作成功
     */
    public static final RedisScript<Long> LIKE_SCRIPT = new DefaultRedisScript<>(
            		"local tempLikeKey = KEYS[1]\n" +
                    "local userLikeKey = KEYS[2]\n" +
                    "local userId = ARGV[1]\n" +
                    "local picId = ARGV[2]\n" +
                    "\n" +
                    "-- 1. 检查是否已点赞（避免重复操作）\n" +
                    "if redis.call('HEXISTS', userLikeKey, picId) == 1 then\n" +
                    "    return -1\n" +
                    "end\n" +
                    "\n" +
                    "-- 2. 获取旧值（不存在则默认为 0）\n" +
                    "local hashKey = userId .. ':' .. picId\n" +
                    "local oldNumber = tonumber(redis.call('HGET', tempLikeKey, hashKey) or 0)\n" +
                    "\n" +
                    "-- 3. 计算新值\n" +
                    "local newNumber = oldNumber + 1\n" +
                    "\n" +
                    "-- 4. 原子性更新：写入临时计数 + 标记用户已点赞\n" +
                    "redis.call('HSET', tempLikeKey, hashKey, newNumber)\n" +
                    "redis.call('HSET', userLikeKey, picId, 1)\n" +
                    "\n" +
                    "return 1", Long.class
    );

    /**
     * 取消点赞 Lua 脚本
     * 参数同上
     * 返回：
     * -1: 未点赞
     * 1: 操作成功
     */
    public static final RedisScript<Long> UNLIKE_SCRIPT = new DefaultRedisScript<>(
            		"local tempLikeKey = KEYS[1]\n" +  // 显式换行
                    "local userLikeKey = KEYS[2]\n" +
                    "local userId = ARGV[1]\n" +
                    "local picId = ARGV[2]\n" +
                    "\n" +  // 空行分隔逻辑块
                    "-- 1. 检查用户是否已点赞（若未点赞，直接返回失败）\n" +
                    "if redis.call('HEXISTS', userLikeKey, picId) ~= 1 then\n" +
                    "    return -1\n" +
                    "end\n" +
                    "\n" +
                    "-- 2. 获取当前临时计数（若不存在则默认为 0）\n" +
                    "local hashKey = userId .. ':' .. picId\n" +
                    "local oldNumber = tonumber(redis.call('HGET', tempLikeKey, hashKey) or 0)\n" +
                    "\n" +
                    "-- 3. 计算新值并更新\n" +
                    "local newNumber = oldNumber - 1\n" +
                    "\n" +
                    "-- 4. 原子性操作：更新临时计数 + 删除用户点赞标记\n" +
                    "redis.call('HSET', tempLikeKey, hashKey, newNumber)\n" +
                    "redis.call('HDEL', userLikeKey, picId)\n" +
                    "\n" +  // 确保return前有换行
                    "return 1",  // 最后一行无需\n（Redis会自动补全）
            Long.class
    );
}
```
执行lua脚本
```java
redisTemplate.execute(
				RedisLuaScriptConstant.LIKE_SCRIPT,
				Arrays.asList(tempLikeKey,userLikeKey),
				loginUser.getId(),
				picId
);
redisTemplate.execute(
				RedisLuaScriptConstant.LIKE_SCRIPT,
				Arrays.asList(tempLikeKey,userLikeKey),
				loginUser.getId(),
				picId
);
```
