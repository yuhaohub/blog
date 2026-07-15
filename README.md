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

- `index.html`：首页
- `articles/index.html`：文章列表
- `articles/<slug>.html`：每篇文章的独立页面
- `about/index.html`：关于页

这些 HTML 会同时同步到 `public/`，供线上站点使用。

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
content/posts/          Markdown 文章源文件
scripts/build-static.mjs  HTML 生成器与公共模板
app/globals.css         全站统一样式
index.html              生成的首页
articles/               生成的文章页面
about/                  生成的关于页面
public/                 部署时使用的静态文件
```

站点仍保留轻量的 vinext 外壳，用于 Sites 托管；访客实际阅读的是生成后的多页面 HTML。
