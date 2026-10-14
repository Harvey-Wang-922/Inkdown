# Inkdown

一个本地优先、采用 Typora 风格实时编辑方式的 Windows Markdown 桌面编辑器。

面向 Windows 10/11，支持离线写作、技术文档整理和 Markdown 文件管理。应用采用 Electron，编辑界面为 HTML/CSS/JavaScript。无需账号，也没有内置 AI 对话或云同步服务。开发配置与应用用户配置相互独立。

## 功能

- Typora 风格单编辑区实时 Markdown：H1～H6、引用、列表、任务、代码、表格、分隔线和目录
- 中文输入法安全的块级输入引擎，第一行与任意后续行使用相同规则
- 粗体、斜体、删除线、代码、高亮、链接和图片的即时行内格式
- YAML Front Matter、公式块、脚注、GFM 提示块和自动更新目录
- 文件树、大纲、文件夹全文搜索、快速打开、命令面板和最近文件
- 多标签拖动、关闭恢复、草稿会话恢复和手动保存（不会自动覆盖文档文件）
- 导入 Markdown、纯文本、HTML/HTM、Word DOCX；HTML/Word 自动转换为不覆盖原文件的 Markdown 草稿
- 导出 Markdown、纯文本、独立 HTML、PDF、Word DOCX；HTML/PDF 自动内嵌本地图片
- 选择文本时的浮动工具栏、编辑器右键菜单、查找替换
- 明亮、深色、暖色与系统主题；字号、行高、正文宽度和字体可调
- 专注模式、源码模式、字数与阅读时间统计
- 图片选择或拖放后自动复制到文档旁的 `assets` 文件夹
- Markdown 是文档、历史、会话、保存与导出的唯一数据源；HTML 只作为当前画面的临时渲染投影
- 切标签、保存、导出和切源码模式只读取已提交 Markdown，未编辑的源码不会因投影往返被规范化
- 列表 Enter、Tab、Shift+Tab 与 Backspace 保持源码前序；任务列表和连续 Tab 可跨标签重建
- 可视与源码模式共用 Markdown 撤销历史；粘贴、图片和保存均校验文档 revision，过期异步结果不会落入其他标签

## 离线安装

运行 `release` 目录中的 Windows 安装包，在安装向导中选择安装目录，并可选择将 Inkdown 配置为 Markdown 文件的默认打开程序。安装结束后不会自动打开系统设置。Windows 10/11 可能仍要求用户确认默认应用，此时请自行通过文件的“打开方式”或 Windows 默认应用设置选择 Inkdown；安装程序不会绕过系统保护强制修改。安装程序会检测已有安装并处理原位安装，无需主动删除用户数据。安装包自带 Chromium、Word 转换组件和全部运行组件，安装及使用都不需要联网。

安装包仅保留简体中文、繁体中文及英文原生语言资源，并排除依赖库的开发工具、测试、源码映射和重复浏览器构建。文档中的其他语言文字仍可正常显示；运行组件、许可证及 Word/PDF 功能保留。

AI 辅助开发从 [AGENTS.md](AGENTS.md) 开始，目录说明、验证流程及任务交接模板见 [AI 开发指南](docs/ai/README.md)。这些是开发配置，不是应用内 AI 功能，也不进入安装包。

文档内查找会高亮所有匹配项，并平滑滚动到当前关键词。文件夹搜索查找已保存的文件，点击结果会进入源码模式，准确选中该处内容（包括链接地址等可视模式中隐藏的内容）。如果文档在搜索后已发生变化，会提示重新搜索。

文件夹搜索结果按文件分组，显示相对路径、各文件匹配数及总数。输入框中按 `↓` / `↑` 进入首项 / 末项，结果中按方向键连续选择、`Home` / `End` 到首末项，`Enter` 打开，`Esc` 返回搜索输入框。输入关键词后可直接按 `Enter` 搜索并打开结果，也可一键清空。

粘贴 Markdown 会按语法渲染，不会把粘贴内容自动转义。`Ctrl+Shift+V` 可粘贴为字面纯文本；代码块中保留原文和换行。空文档/全选粘贴保留原始 Markdown；局部可视选区仍经过现有转换桥，周围源码可能被规范化。

状态栏只常驻保存状态、专注开关和字数；点击字数查看词数、行数和阅读时间。版本号位于偏好设置中。打开文件、快速打开和侧栏切换仍可通过菜单/快捷键访问。拼写检查产生的红色下划线可在偏好设置中关闭。

从 GPT 或网页复制带 HTML 结构的内容时，普通粘贴会转换标题、列表、粗体、链接、表格和代码块为 Markdown；菜单粘贴和源码模式也支持。页面样式与复制按钮不会写入源码。只有纯文本、且没有 Markdown 标记的剪贴板无法恢复原页面格式。

## 导出与安全说明

安全加固版限制导出自动内嵌图片：只接受文档目录内的 PNG/JPEG/GIF/WebP，单张不超过 16 MiB，合计不超过 64 MiB。目录外图片请先复制进文档的 `assets` 目录；SVG 请先转换为受支持的位图。PDF 导出不访问网络，远程图片请先下载到本地。编辑器只允许 HTTPS 远程图片。

未提供可信代码签名证书时，本地生成的安装包仍未签名，不能保证通过企业内部扫描。正式签名发布使用 `pnpm dist:signed`，缺少有效签名配置会失败；证书和密码不得提交到源码。

## 自定义样式

安装后的 Inkdown 会在 `Inkdown.exe` 同级的 `config` 目录创建 `markdown-style.json` 和高级 `custom.css`。通过“视图 → 打开 Markdown 样式配置”定位文件，修改后选择“重新加载 Markdown 样式”即可应用。`unorderedMarkers` 与 `orderedStyles` 是数组，超过数组长度的列表层级会从头循环；标题和引用前缀也可以配置为 Emoji。配置只影响显示，不会写入 Markdown 源码。开发模式使用独立用户数据目录，避免在源码或 Electron 运行时目录生成配置。

## Typora 风格快捷键

- `Ctrl+0`：正文；`Ctrl+1`～`Ctrl+6`：标题 1～6
- `Ctrl+B` / `Ctrl+I` / `Ctrl+U`：粗体 / 斜体 / 下划线
- `Alt+Shift+5`：删除线；`Ctrl+Shift+反引号`：行内代码
- `Ctrl+Shift+K`：代码块；`Ctrl+Shift+Q`：引用
- `Ctrl+Shift+[` / `Ctrl+Shift+]`：有序 / 无序列表
- `Ctrl+Shift+X`：任务列表；`Ctrl+T`：表格
- `Ctrl+K`：链接；`Ctrl+Shift+I`：图片
- `Ctrl+/`：源码模式；`Ctrl+F` / `Ctrl+H`：查找 / 替换
- `Ctrl+P`：快速打开；`Ctrl+Shift+P`：命令面板；`Ctrl+,`：偏好设置
- `Ctrl+Shift+1` / `Ctrl+Shift+3`：大纲 / 文件树；`Ctrl+Shift+F`：全局搜索
- `Ctrl+Tab`：切换文档；`F8` / `F11`：专注 / 全屏
- 表格内 `Tab` / `Shift+Tab`：前后单元格；`Enter`：同列下一行；`Ctrl+Enter`：下方插入行
- 表格内 `Ctrl+Shift+Backspace`：删除当前行；`Ctrl+E`：选择单元格；`Ctrl+L`：选择当前行
- `F1`：快捷键速查

## 开发

### 环境与运行

在 Windows 上开发和编译，使用 Node.js 22.12 或以上版本；包管理器按 `package.json` 的 `packageManager` 字段配置（当前为 pnpm 11.16.0）。依赖版本由 `pnpm-lock.yaml` 固定，补丁与覆盖项位于 `pnpm-workspace.yaml`。首次安装开发依赖可能需要联网，安装后的应用不依赖联网。

在项目根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

`pnpm start` 启动源码 Electron；`pnpm test` 运行核心回归，不等于完成真实编辑与发行验证。新维护者先阅读 [AGENTS.md](AGENTS.md)，核对 [当前项目状态](docs/PROJECT_STATE.md)，修改编辑行为前阅读 [架构文档](docs/ARCHITECTURE.md)。

### 项目目录

```text
Inkdown/
├── src/
│   ├── main.js、preload.js       主进程与受限 IPC 接口
│   ├── renderer/                界面与编辑器
│   │   └── core/                源码、输入、投影、历史和搜索模型
│   ├── services/                文件搜索、渲染、导出与图片策略
│   ├── shared/                  跨进程共享 Markdown 转换
│   └── assets/                  默认 Markdown 样式模板
├── tests/                       单元、Electron/CDP 和打包检查
├── build/                       图标与 NSIS 安装配置源文件
├── docs/                        架构、项目状态与 AI 开发说明
├── .codex/                      项目级 AI 开发工具配置
├── AGENTS.md                    共同开发约束入口
└── release/                     生成的安装包与 win-unpacked
```

`.test-profiles/` 是测试隔离数据，`.test-artifacts/` 是测试截图/输出，`.build-backups/` 保存构建前的用户配置备份。它们不是应用功能目录；不要随意删除配置备份或终止用户正在运行的实例。`tests` 和 AI 开发指令不会进入安装包。

### 测试与发布

核心测试通过后，使用自动创建独立数据目录和调试端口的回归入口：

```powershell
node tests/run-cdp-suite.mjs source
node tests/run-export-runtime-test.cjs
pnpm audit
pnpm audit --prod
```

确认源码通过后编译安装包：

```powershell
pnpm dist
node tests/run-cdp-suite.mjs packaged
node tests/packaged-resources-test.cjs
node tests/run-export-runtime-test.cjs --packaged
```

构建输出为 `release/Inkdown-<版本>-Windows-Setup.exe` 和 `release/win-unpacked/`。构建前保护已有 `release/win-unpacked/config`，构建后验证恢复内容。不要手改生成文件；资源清理应通过打包规则完成。

发行前还要核对版本/README/产物名称、源码与 ASAR 一致性、运行时 fuses、许可证和用户配置。完成打包回归后再计算最终安装包哈希：

```powershell
$installers = Get-ChildItem -LiteralPath "release" -File -Filter "Inkdown-*-Windows-Setup.exe"
$installers | Get-FileHash -Algorithm SHA256
```

该命令计算目录中所有匹配安装包的哈希，交接时按实际文件路径核对。完整发布约束见 [架构文档的发行清单](docs/ARCHITECTURE.md)。仅修改文档或 AI 开发配置时无需升级应用版本或重新编译。

### AI 辅助开发

[AI 开发指南](docs/ai/README.md) 说明各目录职责、任务边界及验证要求；[任务模板](docs/ai/templates/task.md) 和 [交接模板](docs/ai/templates/handoff.md) 用于记录目标、证据、实际测试和遗留问题。根目录和子目录的 `AGENTS.md` 是开发规范，不是用户文档中的可执行指令。

项目配置不包含 API Key，不覆盖模型、沙箱或审批设置，不自动连接外部服务。个人登录、凭据和签名证书不得写进项目。AI 开发相关配置与应用内的 `config/custom.css`、`config/markdown-style.json` 不要混用。

## 已知限制

- 普通可视编辑使用块级源码范围提交，但特殊 HTML、引用定义、公式、目录或脚注等投影仍可能走整篇转换兼容路径；不是完整无损的 Markdown 语法树编辑器。
- 修改大型列表或表格时仍可能转换整个块；大文档投影期间尚未实现输入意图队列。
- 恢复快照不是原文件自动保存。正常退出等待异步恢复写入，但强制结束进程或系统异常退出仍可能丢失最近恢复数据。
- 文件夹搜索针对已保存文件，结果进入源码模式；尚未实现任意源码位置到可视位置的双向映射。
- 自定义样式只影响编辑器显示，当前不随 HTML/PDF 导出。未签名安装包及企业扫描状态不等于安全验证已全部完成。

更完整的边界与剩余工作见 [已知架构债务](docs/ARCHITECTURE.md)。
