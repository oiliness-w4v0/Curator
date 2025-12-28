# Curator (策展人)

> **整理您的数字灵感。**

Curator 是一个极简、高端的数字灵感展示空间，专为您的想法、链接和灵感而设计。
它采用“杂志/卢浮宫”式的美学设计，让您可以在无限画布上自由整理您的数字生活。

## 功能特性

- **无限画布**：自由拖拽、放置和整理卡片。
- **丰富内容**：支持文本、图片、链接和 RSS 订阅源。
- **思维连线**：将卡片连接起来，创建思维导图或展示关系。
- **RSS 阅读器**：粘贴 RSS 链接，即可将其可视化为精美的订阅卡片。
- **极简设计**：提供干扰极少的界面，支持深色/浅色模式。
- **Chrome 插件**：一键从网络上的任何地方收集内容。

## 项目结构

- `backend/`: 基于 Deno 的 API 服务器和 SQLite 数据库。
- `frontend/`: Vite + Vanilla TypeScript 前端。
- `extension/`: 用于快速收集的 Chrome 扩展程序。

## 快速开始

### 前置要求

- [Deno](https://deno.land/) (用于后端)
- [Node.js](https://nodejs.org/) (用于前端构建)

### 运行应用

1.  **启动后端**：
    ```bash
    cd backend
    deno task dev
    ```

2.  **启动前端**：
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

3.  **安装扩展程序**：
    - 打开 Chrome -> 扩展程序 (`chrome://extensions/`)
    - 开启右上角的 "开发者模式" (Developer mode)
    - 点击 "加载已解压的扩展程序" (Load unpacked) 并选择 `extension/` 文件夹。

## 使用说明

- **添加卡片**：双击画布空白处。
- **连接卡片**：按住 `Alt` 键 + 从一张卡片拖拽到另一张。
- **移动画布**：按住 `空格键` + 拖拽画布（或使用鼠标中键）。
- **搜索/设置**：按 `Cmd+P` (Mac) 或 `Ctrl+P`。
- **收集内容**：在任意网页右键点击，选择 "保存到 Curator"。

## 许可证

MIT
