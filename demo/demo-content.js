(() => {
  const SameTakeCore = (() => {
    const STOPWORDS = new Set([
      "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "for", "from",
      "has", "have", "he", "her", "his", "i", "if", "in", "into", "is", "it", "its", "just",
      "me", "my", "not", "of", "on", "or", "our", "out", "she", "so", "that", "the", "their",
      "them", "they", "this", "to", "was", "we", "were", "will", "with", "you", "your", "about"
    ]);

    const TOPICS = [
      { label: "AI video model launch hype", terms: ["sora", "video", "generation", "openai", "model", "cinematic", "launch", "veo", "runway", "film", "clips"] },
      { label: "AI agents replacing SaaS", terms: ["agent", "agents", "saas", "workflow", "automation", "enterprise", "copilot", "autonomous", "software", "replace"] },
      { label: "internship and career advice", terms: ["internship", "intern", "placement", "career", "resume", "interview", "job", "recruiter", "offer", "hiring"] }
    ];

    function stem(word) {
      if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
      if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
      if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
      return word;
    }

    function normalize(text) {
      return text
        .toLowerCase()
        .replace(/https?:\/\/\S+|www\.\S+/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map(stem)
        .filter((word) => word.length > 2 && !STOPWORDS.has(word));
    }

    function topicFor(words) {
      let best = null;
      let bestHits = 0;
      const wordSet = new Set(words);
      for (const topic of TOPICS) {
        const hits = topic.terms.reduce((sum, term) => sum + (wordSet.has(stem(term)) ? 1 : 0), 0);
        if (hits > bestHits) {
          best = topic;
          bestHits = hits;
        }
      }
      return bestHits >= 2 ? best : null;
    }

    function keywordsFor(text) {
      const words = normalize(text);
      const keywords = new Set(words);
      const topic = topicFor(words);
      if (topic) topic.terms.forEach((term) => keywords.add(stem(term)));
      return { keywords, topicLabel: topic ? topic.label : "this topic" };
    }

    function jaccard(a, b) {
      let intersection = 0;
      for (const item of a) {
        if (b.has(item)) intersection += 1;
      }
      const union = new Set([...a, ...b]).size || 1;
      return intersection / union;
    }

    function createMemory() {
      return { nextId: 1, clusters: [] };
    }

    function classify(memory, text) {
      const current = keywordsFor(text);
      let bestCluster = null;
      let bestScore = 0;

      // Local semantic-ish clustering: Jaccard overlap plus a boost when both
      // posts hit the same hand-authored topic dictionary.
      for (const cluster of memory.clusters) {
        let score = jaccard(current.keywords, cluster.keywords);
        if (cluster.topicLabel === current.topicLabel && current.topicLabel !== "this topic") score += 0.28;
        if (score > bestScore) {
          bestScore = score;
          bestCluster = cluster;
        }
      }

      if (!bestCluster || bestScore < 0.42) {
        bestCluster = {
          id: String(memory.nextId++),
          count: 0,
          examples: [],
          keywords: new Set(current.keywords),
          topicLabel: current.topicLabel
        };
        memory.clusters.push(bestCluster);
      }

      bestCluster.count += 1;
      if (bestCluster.examples.length < 3) bestCluster.examples.push(text.slice(0, 180));
      current.keywords.forEach((word) => bestCluster.keywords.add(word));
      if (bestCluster.topicLabel === "this topic" && current.topicLabel !== "this topic") {
        bestCluster.topicLabel = current.topicLabel;
      }

      return bestCluster;
    }

    function resetCluster(memory, id) {
      memory.clusters = memory.clusters.filter((cluster) => cluster.id !== id);
    }

    return { createMemory, classify, resetCluster };
  })();

  const LINES = [
    "Same take, different font.",
    "You got the point.",
    "Collapsed: repeated discourse.",
    "You have already survived 3 versions of this opinion.",
    "Feed deja vu prevented."
  ];

  const feed = document.getElementById("feed");
  const repeats = document.getElementById("allowedRepeats");
  const reset = document.getElementById("reset");
  let memory = SameTakeCore.createMemory();
  let observer;
  let scheduled = false;

  function renderPosts() {
    const fragment = document.createDocumentFragment();
    window.SAMETAKE_POSTS.forEach((post, index) => {
      const article = document.createElement("article");
      article.className = "feed-post";
      article.dataset.postId = String(index);
      article.innerHTML = `
        <div class="feed-post__header">
          <div class="avatar">${post.author.slice(0, 1)}</div>
          <div>
            <div class="feed-post__author"></div>
            <div class="feed-post__role"></div>
          </div>
        </div>
        <p class="feed-post__text"></p>
        <div class="feed-post__meta">Like · Comment · Repost</div>
      `;
      article.querySelector(".feed-post__author").textContent = post.author;
      article.querySelector(".feed-post__role").textContent = post.role;
      article.querySelector(".feed-post__text").textContent = post.text;
      fragment.appendChild(article);
    });
    feed.replaceChildren(fragment);
  }

  function createCollapsedCard(post, cluster) {
    const card = document.createElement("div");
    card.className = "sametake-card";
    card.innerHTML = `
      <div class="sametake-card__title">SameTake collapsed this post</div>
      <div class="sametake-card__body">You have already seen ${repeats.value} similar posts about: <strong></strong></div>
      <div class="sametake-card__aside"></div>
      <div class="sametake-card__actions">
        <button type="button" data-action="show">Show post</button>
        <button type="button" data-action="reset">Reset topic</button>
      </div>
    `;
    card.querySelector("strong").textContent = cluster.topicLabel;
    card.querySelector(".sametake-card__aside").textContent = LINES[Math.floor(Math.random() * LINES.length)];
    card.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.action === "reset") SameTakeCore.resetCluster(memory, cluster.id);
      post.classList.remove("sametake-hidden-original");
      card.remove();
    });
    return card;
  }

  function processFeed() {
    scheduled = false;
    document.querySelectorAll(".feed-post:not([data-sametake-processed])").forEach((post) => {
      post.dataset.sametakeProcessed = "true";
      const cluster = SameTakeCore.classify(memory, post.innerText || post.textContent || "");
      if (cluster.count > Number(repeats.value)) {
        post.classList.add("sametake-hidden-original");
        post.insertAdjacentElement("beforebegin", createCollapsedCard(post, cluster));
      }
    });
  }

  function scheduleProcess() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(processFeed);
  }

  function resetDemo() {
    memory = SameTakeCore.createMemory();
    renderPosts();
    scheduleProcess();
  }

  renderPosts();
  observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length)) scheduleProcess();
  });
  observer.observe(feed, { childList: true, subtree: true });
  repeats.addEventListener("change", resetDemo);
  reset.addEventListener("click", resetDemo);
  scheduleProcess();
})();
