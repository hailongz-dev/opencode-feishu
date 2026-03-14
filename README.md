# opencode-feishu

OpenCode plugin for Feishu/Lark

将飞书 (Feishu/Lark) 消息与 [OpenCode](https://opencode.ai) AI 会话对接的 OpenCode 插件。

---

## 功能概述

| 功能 | 说明 |
|------|------|
| 新消息触发新会话 | 用户在飞书发送消息时，自动在 OpenCode 创建新的 AI Session |
| 回复消息延续会话 | 用户回复某条消息时，该消息所在线程对应同一个 OpenCode Session |
| 支持多种消息类型 | 文本、图片、语音、附件文件 |
| 自动回复 | OpenCode 的响应自动以飞书消息的形式回复到原消息线程 |

---

## 工作原理

本插件以 **OpenCode 插件** 的形式运行，在 OpenCode 启动时被加载。插件通过飞书 **WebSocket 长连接** 接收事件，无需公网 IP 或独立 HTTP 服务器。OpenCode 运行时提供已配置好的 SDK 客户端，插件直接使用该客户端与 OpenCode 的会话系统交互。

```
飞书用户发消息
     │
     ▼
WSClient（飞书 WebSocket 长连接）
     │
     ▼
FeishuHandler
  ├─ 新消息 (无 root_id)  ──► 创建新 OpenCode Session
  └─ 回复消息 (有 root_id) ──► 复用已有 OpenCode Session
     │
     ▼
OpencodeService.prompt(sessionId, parts)
（使用 PluginInput.client —— 由 OpenCode 运行时注入）
     │
     ▼
等待 OpenCode 响应
     │
     ▼
feishuClient.im.message.reply(...)
     │
     ▼
飞书用户收到 AI 回复
```

---

## 快速开始

### 1. 前置条件

- [OpenCode](https://opencode.ai) >= 0.1（运行中）
- [飞书开放平台](https://open.feishu.cn) 自建应用（需开启机器人能力）

### 2. 安装插件

在项目的 `opencode.json`（或全局 `~/.config/opencode/opencode.json`）中添加：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-feishu"]
}
```

OpenCode 将在启动时自动通过 Bun 安装并加载本插件。

### 3. 配置环境变量

在运行 OpenCode 的环境中设置以下环境变量：

```env
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx        # 飞书应用 ID
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx # 飞书应用密钥
```

> **提示**：可将上述变量添加到 `.env` 文件（需确保 OpenCode 启动前已加载），或直接在 shell 中导出。

### 4. 配置飞书开放平台

1. 在 [飞书开发者后台](https://open.feishu.cn/app) 打开你的应用
2. 进入 **事件订阅** → 选择订阅方式为 **使用长连接接收事件**
3. 添加事件 → 搜索并订阅 `im.message.receive_v1`
4. 在 **权限管理** 中开启以下权限：
   - `im:message.receive_v1`（接收消息）
   - `im:message:send_as_bot`（发送消息）
   - `im:message`（读取消息）

> **注意**：使用长连接模式无需配置公网回调地址，服务器主动连接飞书即可接收事件。

---

## 支持的消息类型

| 飞书消息类型 | 处理方式 |
|------------|---------|
| `text` | 直接作为文本 Prompt 发送给 OpenCode |
| `image` | 下载图片并以 base64 data URL 形式附加到 Prompt |
| `audio` | 下载音频文件并附加，同时添加描述文本 |
| `file` | 下载附件并附加，同时添加文件名描述文本 |
| 其他（贴纸等）| 忽略 |

---

## 项目结构

```
src/
├── index.ts           # 插件入口：导出 FeishuPlugin（Plugin 类型）
├── feishu-handler.ts  # 核心业务逻辑：处理飞书消息事件
├── opencode.ts        # OpenCode SDK 封装：创建 Session、发送 Prompt
├── session-store.ts   # 内存 Session 映射表（飞书消息 ID ↔ OpenCode Session ID）
├── types.ts           # TypeScript 类型定义
└── __tests__/
    ├── feishu-handler.test.ts  # FeishuHandler 单元测试
    └── session-store.test.ts   # SessionStore 单元测试
```

---

## 开发命令

```bash
npm run build   # 编译 TypeScript
npm run lint    # TypeScript 类型检查
npm test        # 运行单元测试
```

---

## 插件 API

本插件遵循 [OpenCode 插件开发规范](https://opencode.ai/docs/plugins/)，导出符合 `Plugin` 接口的函数：

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const FeishuPlugin: Plugin = async (input) => {
  // input.client — OpenCode SDK 客户端（由运行时注入）
  // input.project — 当前项目信息
  // ...
  return {}; // 返回 Hooks 对象
};

export default FeishuPlugin;
```

---

## 会话映射说明

- 飞书消息中的 `root_id` 字段标识消息所在线程的根消息 ID
- 本插件以 `root_id`（若无则取 `message_id`）作为键，映射到对应的 OpenCode Session ID
- 映射数据存储在内存中；如需持久化，替换 `SessionStore` 类为 Redis / SQLite 实现即可

---

## 参考资料

- [OpenCode 插件开发文档](https://opencode.ai/docs/plugins/)
- [OpenCode SDK（@opencode-ai/sdk）](https://www.npmjs.com/package/@opencode-ai/sdk)
- [OpenCode Plugin 包（@opencode-ai/plugin）](https://www.npmjs.com/package/@opencode-ai/plugin)
- [飞书开放平台 SDK（@larksuiteoapi/node-sdk）](https://www.npmjs.com/package/@larksuiteoapi/node-sdk)
- [飞书长连接接收事件说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/notification-v2/server-push/subscription-method)

