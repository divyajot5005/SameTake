(() => {
  if (location.hostname !== "www.linkedin.com") {
    return;
  }

  const SameTakeCore = (() => {
    const STOPWORDS = new Set([
      "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "for", "from",
      "has", "have", "he", "her", "his", "i", "if", "in", "into", "is", "it", "its", "just",
      "me", "my", "not", "of", "on", "or", "our", "out", "she", "so", "that", "the", "their",
      "them", "they", "this", "to", "was", "we", "were", "will", "with", "you", "your", "about"
    ]);

    const TOPICS = [
      {
        label: "AI video model launch hype",
        terms: ["sora", "video", "generation", "openai", "model", "cinematic", "launch", "veo", "runway", "film", "clips"]
      },
      {
        label: "AI agents replacing SaaS",
        terms: ["agent", "agents", "saas", "workflow", "automation", "enterprise", "copilot", "autonomous", "software", "replace"]
      },
      {
        label: "internship and career advice",
        terms: ["internship", "intern", "placement", "career", "resume", "interview", "job", "recruiter", "offer", "hiring"]
      }
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

  const storageArea = chrome.storage.local;
  const memory = SameTakeCore.createMemory();
  let processed = new WeakSet();
  let settings = { enabled: true, allowedRepeats: 3, resetVersion: 0 };
  let scheduled = false;
  let memoryReady = false;
  let saveScheduled = false;
  let lastResetVersion = 0;
  const stats = {
    detected: 0,
    processed: 0,
    collapsed: 0,
    skippedShort: 0
  };
  let metricsScheduled = false;

  function isExtensionAlive() {
    return Boolean(chrome && chrome.runtime && chrome.runtime.id);
  }

  function safeGet(keys, callback) {
    if (!isExtensionAlive()) return;
    try {
      storageArea.get(keys, (result) => {
        if (!isExtensionAlive() || chrome.runtime.lastError) return;
        callback(result || {});
      });
    } catch (_error) {
      // Ignore stale callbacks after an unpacked-extension reload.
    }
  }

  function safeSet(values) {
    if (!isExtensionAlive()) return;
    try {
      storageArea.set(values, () => {
        chrome.runtime.lastError;
      });
    } catch (_error) {
      // Ignore stale callbacks after an unpacked-extension reload.
    }
  }

  function safeRemove(keys) {
    if (!isExtensionAlive()) return;
    try {
      storageArea.remove(keys, () => {
        chrome.runtime.lastError;
      });
    } catch (_error) {
      // Ignore stale callbacks after an unpacked-extension reload.
    }
  }

  function publishMetrics() {
    if (metricsScheduled) return;
    metricsScheduled = true;
    window.setTimeout(() => {
      metricsScheduled = false;
      safeSet({
        sameTakeMetrics: {
          scanned: stats.detected,
          topics: memory.clusters.length,
          blocked: stats.collapsed,
          processed: stats.processed,
          detected: stats.detected,
          skippedShort: stats.skippedShort,
          active: true,
          url: location.href,
          updatedAt: Date.now()
        }
      });
    }, 250);
  }

  function serializeMemory() {
    return {
      nextId: memory.nextId,
      clusters: memory.clusters.map((cluster) => ({
        id: cluster.id,
        count: cluster.count,
        examples: cluster.examples,
        keywords: Array.from(cluster.keywords),
        topicLabel: cluster.topicLabel
      }))
    };
  }

  function hydrateMemory(saved) {
    if (!saved || !Array.isArray(saved.clusters)) return;
    memory.nextId = Number(saved.nextId) || 1;
    memory.clusters = saved.clusters.map((cluster) => ({
      id: String(cluster.id),
      count: Number(cluster.count) || 0,
      examples: Array.isArray(cluster.examples) ? cluster.examples.slice(0, 3) : [],
      keywords: new Set(Array.isArray(cluster.keywords) ? cluster.keywords : []),
      topicLabel: cluster.topicLabel || "this topic"
    }));
  }

  function saveMemory() {
    if (saveScheduled) return;
    saveScheduled = true;
    window.setTimeout(() => {
      saveScheduled = false;
      safeSet({ sameTakeMemory: serializeMemory() });
    }, 400);
  }

  function getPostText(node) {
    const selectors = [
      ".update-components-update-v2__commentary",
      ".feed-shared-update-v2__commentary",
      ".feed-shared-update-v2__description",
      ".update-components-text",
      ".feed-shared-inline-show-more-text",
      ".break-words",
      "span[dir='ltr']",
      "[data-test-id='main-feed-activity-card']"
    ];
    const parts = selectors
      .flatMap((selector) => Array.from(node.querySelectorAll(selector)))
      .map((el) => el.innerText || el.textContent || "")
      .filter(Boolean);
    const text = (parts.length ? parts.join(" ") : (node.innerText || node.textContent || "")).trim();
    return text.replace(/\s+/g, " ");
  }

  function findPosts(root = document) {
    const selectors = [
      "div.feed-shared-update-v2",
      ".occludable-update",
      "[data-finite-scroll-hotkey-item]",
      "[data-view-name='feed-full-update']",
      "div[data-urn*='activity']",
      "[data-id*='urn:li:activity']",
      "main div[role='listitem']",
      "article"
    ];
    const candidates = new Set();
    selectors.forEach((selector) => {
      if (root instanceof Element && root.matches(selector)) candidates.add(root);
      root.querySelectorAll(selector).forEach((node) => candidates.add(node));
    });

    const posts = Array.from(candidates).filter((node, _index, all) => {
      if (!isLikelyFeedPost(node)) return false;
      return !all.some((other) => other !== node && other.contains(node) && isLikelyFeedPost(other));
    });
    stats.detected = posts.length;
    document.documentElement.dataset.sametakeDetected = String(stats.detected);
    publishMetrics();
    return posts;
  }

  function isLikelyFeedPost(node) {
    if (node.matches(".feed-shared-update-v2, .occludable-update, [data-finite-scroll-hotkey-item], [data-view-name='feed-full-update'], [data-id*='urn:li:activity'], [data-urn*='activity'], article")) {
      return true;
    }

    const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length < 40) return false;

    return text.startsWith("Feed post") || Boolean(node.querySelector([
      "button[aria-label^='Open control menu for post']",
      "button[aria-label^='Hide post']",
      "button[aria-label='Comment']",
      "button[aria-label='Repost']"
    ].join(",")));
  }

  function createCollapsedCard(post, cluster) {
    const card = document.createElement("div");
    card.className = "sametake-card";
    card.setAttribute("role", "note");
    card.innerHTML = `
      <div class="sametake-card__title">SameTake collapsed this post</div>
      <div class="sametake-card__body">You have already seen ${settings.allowedRepeats} similar posts about: <strong></strong></div>
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
      if (button.dataset.action === "reset") {
        SameTakeCore.resetCluster(memory, cluster.id);
        saveMemory();
      }
      post.classList.remove("sametake-hidden-original");
      card.remove();
    });
    return card;
  }

  function processPost(post) {
    if (!memoryReady) return;
    if (processed.has(post) || post.closest(".sametake-card")) return;
    processed.add(post);
    post.dataset.sametakeProcessed = "true";
    const text = getPostText(post);
    post.dataset.sametakeTextLength = String(text.length);
    if (text.length < 40) {
      stats.skippedShort += 1;
      document.documentElement.dataset.sametakeSkippedShort = String(stats.skippedShort);
      publishMetrics();
      return;
    }

    const cluster = SameTakeCore.classify(memory, text);
    saveMemory();
    stats.processed += 1;
    post.dataset.sametakeClusterId = cluster.id;
    post.dataset.sametakeTopic = cluster.topicLabel;
    post.dataset.sametakeClusterCount = String(cluster.count);
    document.documentElement.dataset.sametakeProcessed = String(stats.processed);
    publishMetrics();
    if (settings.enabled && cluster.count > settings.allowedRepeats) {
      const card = createCollapsedCard(post, cluster);
      post.classList.add("sametake-hidden-original");
      post.insertAdjacentElement("beforebegin", card);
      stats.collapsed += 1;
      document.documentElement.dataset.sametakeCollapsed = String(stats.collapsed);
      publishMetrics();
    }
  }

  function processAll() {
    scheduled = false;
    if (!memoryReady) return;
    if (settings.resetVersion !== lastResetVersion) {
      memory.clusters.length = 0;
      memory.nextId = 1;
      processed = new WeakSet();
      lastResetVersion = settings.resetVersion;
      stats.detected = 0;
      stats.processed = 0;
      stats.collapsed = 0;
      stats.skippedShort = 0;
      delete document.documentElement.dataset.sametakeDetected;
      delete document.documentElement.dataset.sametakeProcessed;
      delete document.documentElement.dataset.sametakeCollapsed;
      delete document.documentElement.dataset.sametakeSkippedShort;
      safeRemove(["sameTakeMemory"]);
      safeSet({ sameTakeMetrics: { scanned: 0, topics: 0, blocked: 0, detected: 0, skippedShort: 0, active: true, url: location.href, updatedAt: Date.now() } });
      document.querySelectorAll(".sametake-card").forEach((card) => card.remove());
      document.querySelectorAll("[data-sametake-processed]").forEach((post) => {
        delete post.dataset.sametakeProcessed;
        delete post.dataset.sametakeTextLength;
        delete post.dataset.sametakeClusterId;
        delete post.dataset.sametakeTopic;
        delete post.dataset.sametakeClusterCount;
      });
      document.querySelectorAll(".sametake-hidden-original").forEach((post) => post.classList.remove("sametake-hidden-original"));
    }
    findPosts().forEach(processPost);
  }

  function scheduleProcess() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(processAll);
  }

  safeGet(["sameTakeSettings"], (result) => {
    settings = { ...settings, ...(result.sameTakeSettings || {}) };
    lastResetVersion = settings.resetVersion;
    safeGet(["sameTakeMemory"], (memoryResult) => {
      hydrateMemory(memoryResult.sameTakeMemory);
      memoryReady = true;
      publishMetrics();
      scheduleProcess();
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!["session", "local"].includes(areaName) || !changes.sameTakeSettings) return;
    const previous = settings;
    settings = { ...settings, ...changes.sameTakeSettings.newValue };
    if (previous.allowedRepeats !== settings.allowedRepeats || previous.enabled !== settings.enabled) {
      memory.clusters.length = 0;
      memory.nextId = 1;
      processed = new WeakSet();
      stats.detected = 0;
      stats.processed = 0;
      stats.collapsed = 0;
      stats.skippedShort = 0;
      safeSet({ sameTakeMetrics: { scanned: 0, topics: 0, blocked: 0, detected: 0, skippedShort: 0, active: true, url: location.href, updatedAt: Date.now() } });
      document.querySelectorAll(".sametake-card").forEach((card) => card.remove());
      document.querySelectorAll("[data-sametake-processed]").forEach((post) => {
        delete post.dataset.sametakeProcessed;
        delete post.dataset.sametakeTextLength;
        delete post.dataset.sametakeClusterId;
        delete post.dataset.sametakeTopic;
        delete post.dataset.sametakeClusterCount;
      });
      document.querySelectorAll(".sametake-hidden-original").forEach((post) => post.classList.remove("sametake-hidden-original"));
    }
    scheduleProcess();
  });

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length)) scheduleProcess();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
