# 雅思阅读词汇速背系统

这是一个基于 `阅读考点词真经538.pdf` 制作的纯前端背词网页，重点支持：

- 按 PDF 中的重要性分层背诵
- 艾宾浩斯节奏复习：`0 / 1 / 2 / 4 / 7 / 15 / 30` 天
- 做错自动回放，加密复习
- 同义替换专项测速
- 本地保存学习进度，适合直接部署到静态托管平台

## 双击打开

直接双击：

```text
start.bat
```

或者直接双击 `index.html` 也可以。

## 命令行启动

```powershell
npx serve .
```

## 重新生成题库

```powershell
python .\scripts\extract_vocab.py
```

## 云端同步部署

推荐方案：

- `GitHub`：存代码
- `Vercel`：部署网页和 `api/state.js`
- `Supabase`：存唯一一份学习进度

### 1. 创建 Supabase 表

在 Supabase SQL Editor 运行：

```sql
\i supabase/schema.sql
```

如果控制台不支持 `\i`，直接把 [schema.sql](D:\codex_project\yasi\supabase\schema.sql) 内容粘进去执行即可。

### 2. 配置 Vercel 环境变量

在 Vercel 项目里添加：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

可以参考 [.env.example](D:\codex_project\yasi\.env.example)

### 3. 上传到 GitHub

把整个项目推到 GitHub 仓库。

### 4. 在 Vercel 导入仓库

Vercel 连上 GitHub 后会自动部署这个项目。

### 5. 使用方式

以后你在手机、平板、电脑上打开同一个网址，页面会：

- 先读取云端进度
- 本地保留缓存
- 做题后自动同步到云端
