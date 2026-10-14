# Codex 项目配置

`config.toml` 仅设置项目指令读取上限为 64 KiB，给根目录和子目录的 `AGENTS.md` 留出空间。它不是上下文总量设置，也不会自动读取所有项目文档。

规范入口为 `../AGENTS.md`，开发流程与目录说明见 `../docs/ai/README.md`。本目录不存放 API Key、登录信息、运行日志或恢复快照。

项目配置是否加载取决于客户端版本和项目信任状态；不在项目里自行设置全局信任。新会话检查加载的指令，已有会话不要假定配置已经热更新。若复制到其他电脑，使用当地可用的 Node 环境，不照搬个人运行时绝对路径。

没有指定模型、服务商、审批策略、沙箱、网络权限、MCP、自动执行钩子或多代理；这些继续遵循用户/组织/客户端设置。项目配置不能覆盖高优先级要求。

依据：[OpenAI 配置说明](https://learn.chatgpt.com/docs/config-file/config-basic)、[配置项参考](https://learn.chatgpt.com/docs/config-file/config-reference)。仅核对所需字段，不依赖未经验证的实验选项。
