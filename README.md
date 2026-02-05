# OpenClaw DingTalk Channel Plugin

钉钉 Stream 机器人 Channel 插件 for OpenClaw。支持文本、Markdown 消息以及双向通信。

✨ **功能特性**
- 使用钉钉 Stream 模式，无需公网 IP/Webhook 地址即可接收消息。
- 支持文本自动检测并转换为 Markdown 渲染。
- 支持 OpenClaw 标准配置和向导。

📦 **安装**
在 OpenClaw 安装目录下运行：
```bash
npm install openclaw-channel-dingtalk
```

⚙️ **配置**
安装后，可以通过 OpenClaw 的配置向导进行配置：
```bash
openclaw setup dingtalk
```
或者手动在 `openclaw.config.json` 中配置：
```json
{
  "channels": {
    "dingtalk": {
      "accounts": {
        "my-bot": {
          "enabled": true,
          "clientId": "your-app-key",
          "clientSecret": "your-app-secret",
          "robotCode": "your-robot-code"
        }
      }
    }
  }
}
```

🚀 **快速开始**
1. 在[钉钉开发者后台](https://open-dev.dingtalk.com/)创建机器人。
2. 开启 **机器人能力**。
3. 在版本管理与发布中选择 **Stream 模式** 并发布。
4. 获取 `AppKey` (clientId) 和 `AppSecret` (clientSecret)。
5. 配置并启动 OpenClaw。

📄 **License**
MIT
