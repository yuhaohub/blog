const posts = [
  {
    date: "2026.07.12",
    category: "工程实践",
    title: "我如何设计一个可靠的任务调度系统",
    excerpt:
      "从状态流转、失败重试到最终收敛，拆解一个真实系统如何把复杂性关进边界里。",
    number: "01",
    readTime: "8 分钟",
  },
  {
    date: "2026.06.28",
    category: "AI 探索",
    title: "把 AI 助手接进真实业务之后",
    excerpt:
      "真正困难的从来不是接通模型，而是让答案可信、动作可控、结果能够被验证。",
    number: "02",
    readTime: "6 分钟",
  },
  {
    date: "2026.06.09",
    category: "生活随笔",
    title: "从一次线上故障学到的三件事",
    excerpt:
      "复盘不只是寻找犯错的人。好的复盘会让下一次判断更快，也让团队更有底气。",
    number: "03",
    readTime: "5 分钟",
  },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#content">
        跳到主要内容
      </a>

      <header className="site-header">
        <a className="brand" href="#" aria-label="JUICE. 首页">
          JUICE<span className="brand-dot">.</span>
        </a>
        <nav className="main-nav" aria-label="主导航">
          <a className="active" href="#">
            首页
          </a>
          <a href="#articles">文章</a>
          <a href="#about">关于</a>
        </nav>
        <a className="header-cta" href="#about">
          认识 Juice
          <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main id="content">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span aria-hidden="true" />
              一杯新鲜思考
            </p>
            <h1 id="hero-title">
              把复杂问题，
              <br />
              写成<span className="highlight">清晰答案</span>
            </h1>
            <p className="hero-description">
              关于工程、AI 与持续成长的个人记录。
              <br />
              不追逐噪声，只分享那些真正想明白的事。
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#articles">
                开始阅读 <span aria-hidden="true">↓</span>
              </a>
              <a className="text-link" href="#about">
                关于这个博客 <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="sun" />
            <div className="leaf leaf-one" />
            <div className="leaf leaf-two" />
            <div className="glass">
              <div className="juice">
                <span className="bubble bubble-one" />
                <span className="bubble bubble-two" />
                <span className="bubble bubble-three" />
              </div>
              <div className="straw" />
              <div className="orange-slice" />
            </div>
            <div className="note">
              <span>今日鲜榨</span>
              <strong>Stay curious.</strong>
              <em>— Juice</em>
            </div>
            <span className="spark spark-one">✦</span>
            <span className="spark spark-two">✦</span>
          </div>
        </section>

        <section className="articles-section" id="articles" aria-labelledby="articles-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span aria-hidden="true" />
                最近更新
              </p>
              <h2 id="articles-title">新鲜文章</h2>
            </div>
            <a className="text-link all-posts" href="#articles">
              查看全部 <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className="posts">
            {posts.map((post) => (
              <article className="post" key={post.number}>
                <div className="post-number" aria-hidden="true">
                  {post.number}
                </div>
                <div className="post-meta">
                  <span className="post-category">{post.category}</span>
                  <time dateTime={post.date.replaceAll(".", "-")}>{post.date}</time>
                </div>
                <h3>
                  <a href={"#post-" + post.number}>{post.title}</a>
                </h3>
                <p>{post.excerpt}</p>
                <div className="post-footer">
                  <span>{post.readTime}</span>
                  <a
                    href={"#post-" + post.number}
                    aria-label={"阅读文章：" + post.title}
                  >
                    阅读文章 <span aria-hidden="true">→</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section" id="about" aria-labelledby="about-title">
          <div className="about-mark" aria-hidden="true">
            J<span>.</span>
          </div>
          <div className="about-copy">
            <p className="eyebrow">
              <span aria-hidden="true" />
              关于我
            </p>
            <h2 id="about-title">你好，我是 Juice。</h2>
            <p>
              我喜欢把复杂系统拆成清晰的结构，也喜欢记录技术之外那些让人持续成长的瞬间。这里没有标准答案，只有经过实践、复盘和重新思考后的个人经验。
            </p>
          </div>
          <div className="topics" aria-label="博客主题">
            <span>工程实践</span>
            <span>AI 探索</span>
            <span>生活随笔</span>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#">
          JUICE<span className="brand-dot">.</span>
        </a>
        <p>把想明白的事，认真写下来。</p>
        <p>© 2026 Juice</p>
      </footer>
    </>
  );
}
