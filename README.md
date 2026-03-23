# 智能批分助手

一个简单易用的答题卡自动批阅工具。

## 🚀 快速启动

### 方法1：双击启动（推荐）
1. 双击 `start.bat` 文件
2. 等待编译完成
3. 在浏览器中访问：`http://localhost:3000`

### 方法2：手动启动
```bash
cd backend
npm run build
npm start
```
然后在浏览器中访问：`http://localhost:3000`

## 📖 使用说明

1. **系统配置**：点击"系统配置"，输入豆包LLM API Key
2. **标准答案管理**：添加试题的标准答案
3. **答题卡处理**：上传答题卡图片进行自动批阅
4. **成绩展示**：查看批阅结果并导出CSV

## 🔧 技术栈

- 前端：HTML + CSS + JavaScript
- 后端：Node.js + Express + TypeScript
- AI：豆包LLM

## 📝 注意事项

- 需要配置豆包LLM API Key才能使用批阅功能
- 支持JPG和PNG格式的答题卡图片
- 所有数据保存在本地，不上传到第三方服务器

---

现在只需要一个服务，简单多了！🎉