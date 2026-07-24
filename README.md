# JUICE. 静态博客

这是一个可维护的多页面 HTML 博客。最终产物是普通 `.html` 文件，文章内容使用 Markdown 编写，由统一模板自动生成首页、文章归档、关于页和文章详情页。

## 日常维护

### 新增文章

1. 在 `content/posts/` 新建一个 `.md` 文件。
2. 复制现有文章顶部的 frontmatter，修改标题、slug、日期、分类、摘要和阅读时间。
3. 在 frontmatter 下方使用 Markdown 写正文。
4. 运行：

```bash
npm run generate
```

生成后会得到：

- `public/index.html`：首页
- `public/articles/index.html`：文章列表
- `public/articles/<slug>.html`：每篇文章的独立页面
- `public/about/index.html`：关于页

本地可以直接打开 `public/index.html`。所有 HTML 都生成到 `public/`，不再维护第二套重复文件。

### 修改样式

统一修改 `app/globals.css`，然后运行 `npm run generate`。不要直接修改生成后的 HTML，否则下次生成时会被覆盖。

### 修改公共结构

页头、页脚、首页、列表页和文章页模板集中在 `scripts/build-static.mjs`。修改一次即可影响所有页面。

## 常用命令

```bash
npm run generate  # 从 Markdown 生成全部 HTML
npm run dev       # 生成并启动本地预览
npm run build     # 生成并验证线上构建
npm test          # 验证页面数量、链接和文章输出
```

## 项目结构

```text
content/posts/            Markdown 文章源文件
scripts/build-static.mjs  HTML 生成器与公共模板
app/globals.css           全站统一样式
public/index.html         生成的首页
public/articles/          生成的文章页面
public/about/             生成的关于页面
```

站点保留轻量的 vinext 外壳用于 Sites 托管；访客实际阅读的是 `public/` 中生成的多页面 HTML。

## GitHub Pages

项目已经包含 `.github/workflows/pages.yml`。推送到 GitHub 后：

1. 打开仓库的 **Settings → Pages**。
2. 将 **Source** 选择为 **GitHub Actions**。
3. 推送到 `main`，或在 Actions 页面手动运行 `Deploy GitHub Pages`。

工作流会安装依赖、运行 HTML 生成器，并把 `public/` 发布到 GitHub Pages。它会自动区分：

- 用户站点：`https://<用户名>.github.io`
- 项目站点：`https://<用户名>.github.io/<仓库名>`

页面链接均为相对路径，因此项目站点部署在子目录时也能正常跳转。生成器通过 `SITE_URL` 接收最终域名，用于 canonical 和 Open Graph 地址；本地未设置时继续使用当前 Sites 地址。

如果以后绑定自定义域名，需要同时在 GitHub Pages 设置中配置域名；只添加 `CNAME` 文件并不会自动完成域名配置。
