# 学生部门工作台

纯静态单页工作台，可在本地预览并部署到 GitHub Pages。公开首页提供素拓平台、163 邮箱入口、公共通知、活动处理登记、星期值班、注意事项和三周轮换的巡逻值班。

## 本地预览

在 Windows 上双击 `start-preview.bat`，或在项目目录运行：

```bash
python -m http.server 4173 --bind 127.0.0.1
```

- 首页：`http://127.0.0.1:4173/`
- 后台：`http://127.0.0.1:4173/admin.html`
- 本地草稿预览：`http://127.0.0.1:4173/?preview=1`

后台的“本地试用”只在 localhost 上显示。草稿仅存放在当前浏览器的 localStorage，不会修改仓库文件或线上网站；确认后可导出 JSON，手动替换 `data/content.json`。

## 数据结构

数据来自 `data/content.json`：

- `notices`：公共通知，支持标题、内容、置顶和创建时间。
- `duty`：星期值班，每项只保存 `id`、周一至周日索引 `day`（0–6）和人员数组 `people`。
- `patrolDuty`：巡逻值班，`week` 为第 1、2、3 周，另有小组名称 `group` 和人员数组 `people`。三周轮换，第 4 周从第一组重新开始。
- `attention`：注意事项，支持标题、内容和创建时间。
- `externalRegistration`：外部登记卡片的标题、说明、按钮文字和链接。

公开页面只读；修改数据须在后台保存本地预览，或连接 GitHub 后提交到仓库。公共通知过多时可在通知卡片内滚动。

## GitHub Pages 部署

将 `index.html`、`styles.css`、`config.js`、`app.js`、`admin.html`、`admin.css`、`admin.js`、`data/content.json`、`.nojekyll` 和本 README 上传至公开仓库根目录。在仓库 `Settings → Pages` 选择 `Deploy from a branch`、`main`、`/(root)`。

公开页：`https://a1262225007-sketch.github.io/student-workdesk/`

后台页：`https://a1262225007-sketch.github.io/student-workdesk/admin.html`

## 后台连接 GitHub

在后台填写 GitHub 用户名、仓库、分支、文件路径和 Fine-grained Personal Access Token：

```text
用户名：a1262225007-sketch
仓库：student-workdesk
分支：main
文件路径：data/content.json
```

Token 应仅授权此仓库，Repository permissions 的 `Contents` 设为 `Read and write`。Token 只保存在当前浏览器标签页的 sessionStorage，不写入仓库。连接并读取后编辑，点击“提交到 GitHub”写回 JSON；GitHub Pages 通常需要约 1–2 分钟部署更新。

请勿把 Token 粘贴到聊天、截图或仓库文件中。公开后台地址并不等于身份验证，真正的写入权限依赖 Token。
