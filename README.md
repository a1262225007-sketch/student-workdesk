# 学生部门工作台（GitHub Pages 版）

这个版本可以免费托管在 GitHub Pages。部署完成后：

- 你的电脑关机，网站仍然在线
- 同学不需要安装程序，直接打开网址
- 公共通知和星期排班由你通过后台修改
- 活动处理登记跳转到外部无需登录的表单

## 首次部署

1. 登录 GitHub，新建一个 **Public** 仓库。
2. 把这个目录里的所有文件上传到仓库根目录。
3. 打开仓库的 `Settings` -> `Pages`。
4. 在 `Build and deployment` 中选择：
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
5. 保存后等待 1-2 分钟。公开地址通常是：

   `https://你的用户名.github.io/仓库名/`

6. 后台地址是同一地址后面加 `admin.html`：

   `https://你的用户名.github.io/仓库名/admin.html`

公开页面不显示后台入口，知道后台地址但没有访问令牌的人不能修改内容。

## 配置后台

1. 打开后台地址。
2. 填写 GitHub 用户名、仓库名、分支和数据文件路径。
   - 数据文件路径保持 `data/content.json`
3. 创建 Fine-grained Personal Access Token：
   - 地址：https://github.com/settings/personal-access-tokens/new
   - Repository access：只选择这个工作台仓库
   - Permissions：`Contents` 选择 `Read and write`
4. 把令牌粘贴到后台并点击“连接并读取”。

令牌只保存在当前浏览器标签页，不会提交到 GitHub。关闭标签页后需要重新连接。

## 日常维护

在后台可以：

- 添加、删除、置顶公共通知
- 添加、删除星期排班
- 设置外部活动处理登记表单的标题、说明、按钮文字和网址

修改后点击“提交到 GitHub”。GitHub Pages 通常需要 1-2 分钟更新公开页面。

## 外部快速登记表单

可以使用腾讯问卷、金山表单、Microsoft Forms 或其它支持匿名提交的服务。创建表单后：

1. 把表单权限设置为“无需登录”或“允许匿名填写”。
2. 复制公开填写链接。
3. 在后台的“活动处理快速登记”里粘贴链接并提交。

本网站只负责跳转，不再自己维护处理登记表。

## 可选：绑定自己的域名

先在阿里云、腾讯云等域名商购买域名，再在 GitHub Pages 的 `Custom domain` 中填写域名，并按 GitHub 提示配置 DNS。域名需要按域名商要求完成实名认证。
