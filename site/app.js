const RAW_FEED_ROOT = "https://raw.githubusercontent.com/RaresKeY/devlog/main/feed/";
const IS_LOCAL_PREVIEW = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const FEED_ROOT = IS_LOCAL_PREVIEW ? new URL("../feed/", window.location.href) : new URL(RAW_FEED_ROOT);
const FEED_INDEX_URL = new URL("index.json", FEED_ROOT);
const CACHE_KEY = "small-loop-devlog:public-feed:v1";
const LOAD_TOKEN = Date.now().toString(36);
const VALID_STATUSES = ["wip", "feedback", "build", "milestone", "supporter"];
const STATUS_LABELS = {
  all: "All",
  wip: "WIP",
  feedback: "Feedback",
  build: "Build",
  milestone: "Milestone",
  supporter: "Supporter",
};

const state = {
  posts: [],
  status: "all",
  project: "all",
  query: "",
  mediaVersion: LOAD_TOKEN,
};

const elements = {
  updates: document.querySelector("#updates"),
  notice: document.querySelector("#feed-notice"),
  source: document.querySelector("#source-label"),
  search: document.querySelector("#search"),
  project: document.querySelector("#project-filter"),
  statuses: document.querySelector("#status-filters"),
  postCount: document.querySelector("#post-count"),
  projectCount: document.querySelector("#project-count"),
  visibleCount: document.querySelector("#visible-count"),
  lightbox: document.querySelector("#lightbox"),
};

function rawUrl(path) {
  const url = new URL(path, FEED_INDEX_URL);
  url.searchParams.set("v", LOAD_TOKEN);
  return url;
}

async function fetchJson(path) {
  const response = await fetch(rawUrl(path), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Public feed request failed with ${response.status}`);
  }
  return response.json();
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateIndex(index) {
  if (!isRecord(index) || index.schemaVersion !== 1 || index.repository !== "RaresKeY/devlog") {
    throw new Error("Unsupported public feed index");
  }
  if (index.branch !== "main" || !Array.isArray(index.posts) || index.posts.length === 0) {
    throw new Error("Incomplete public feed index");
  }

  const ids = new Set();
  let previousTime = Infinity;
  index.posts.forEach((item) => {
    if (!isRecord(item) || !/^[a-z0-9][a-z0-9-]*$/.test(item.id || "")) {
      throw new Error("Invalid post metadata in public feed index");
    }
    if (ids.has(item.id) || item.path !== `posts/${item.id}.json`) {
      throw new Error("Duplicate or mismatched public post path");
    }
    if (!item.title || !item.project || !VALID_STATUSES.includes(item.status) || !isValidDate(item.createdAt)) {
      throw new Error(`Incomplete public post metadata for ${item.id}`);
    }
    const timestamp = Date.parse(item.createdAt);
    if (timestamp > previousTime) {
      throw new Error("Public feed index is not newest-first");
    }
    previousTime = timestamp;
    ids.add(item.id);
  });
  return index;
}

function validateMedia(item, postId, kind) {
  if (!isRecord(item) || typeof item.id !== "string" || typeof item.fileName !== "string") {
    throw new Error(`Invalid ${kind} metadata in ${postId}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(item.fileName)) {
    throw new Error(`Unsafe ${kind} filename in ${postId}`);
  }
  if (item.path !== `../media/${postId}/${item.fileName}`) {
    throw new Error(`Mismatched ${kind} path in ${postId}`);
  }
  if (kind === "image" && typeof item.alt !== "string") {
    throw new Error(`Missing image alternative text in ${postId}`);
  }
  if (kind === "video" && typeof item.caption !== "string") {
    throw new Error(`Missing video caption in ${postId}`);
  }
}

function validatePost(post, summary = null) {
  if (!isRecord(post) || post.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9-]*$/.test(post.id || "")) {
    throw new Error("Unsupported public post");
  }
  if (
    !post.title ||
    !post.project ||
    typeof post.body !== "string" ||
    !post.body.trim() ||
    !VALID_STATUSES.includes(post.status) ||
    !Array.isArray(post.tags) ||
    !post.tags.every((tag) => typeof tag === "string") ||
    !isValidDate(post.createdAt) ||
    post.visibility !== "public" ||
    !Array.isArray(post.images) ||
    !Array.isArray(post.videos)
  ) {
    throw new Error(`Incomplete public post ${post.id || "unknown"}`);
  }
  if (post.images.length > 4 || post.videos.length > 2) {
    throw new Error(`Too many media items in ${post.id}`);
  }
  post.images.forEach((item) => validateMedia(item, post.id, "image"));
  post.videos.forEach((item) => validateMedia(item, post.id, "video"));
  if (
    summary &&
    ["id", "title", "project", "status", "createdAt"].some((key) => post[key] !== summary[key])
  ) {
    throw new Error(`Index metadata does not match ${post.id}`);
  }
  return post;
}

function validateCachedSnapshot(snapshot) {
  if (!isRecord(snapshot) || snapshot.schemaVersion !== 1 || !isValidDate(snapshot.savedAt)) {
    throw new Error("Invalid saved feed");
  }
  if (!Array.isArray(snapshot.posts) || snapshot.posts.length === 0) {
    throw new Error("Saved feed has no posts");
  }
  const ids = new Set();
  let previousTime = Infinity;
  snapshot.posts.forEach((post) => {
    validatePost(post);
    if (ids.has(post.id) || Date.parse(post.createdAt) > previousTime) {
      throw new Error("Saved feed order is invalid");
    }
    ids.add(post.id);
    previousTime = Date.parse(post.createdAt);
  });
  return snapshot;
}

function saveSnapshot(posts) {
  const snapshot = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    mediaVersion: LOAD_TOKEN,
    posts,
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // The live feed remains usable when storage is disabled or full.
  }
}

function readSnapshot() {
  const value = localStorage.getItem(CACHE_KEY);
  if (!value) return null;
  return validateCachedSnapshot(JSON.parse(value));
}

async function loadFeed() {
  showLoading();
  try {
    const index = validateIndex(await fetchJson("index.json"));
    const posts = await Promise.all(
      index.posts.map(async (summary) => validatePost(await fetchJson(summary.path), summary)),
    );
    state.posts = posts;
    state.mediaVersion = LOAD_TOKEN;
    saveSnapshot(posts);
    elements.source.textContent = IS_LOCAL_PREVIEW ? "Local public feed preview" : "Live from public GitHub";
    elements.notice.textContent = "";
    populateControls();
    renderFeed();
  } catch (liveError) {
    try {
      const snapshot = readSnapshot();
      if (!snapshot) throw new Error("No saved feed");
      state.posts = snapshot.posts;
      state.mediaVersion = snapshot.mediaVersion || "saved";
      const savedDate = new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(snapshot.savedAt));
      elements.source.textContent = "Saved public feed";
      elements.notice.textContent = `Live GitHub feed unavailable. Showing the last complete copy saved ${savedDate}.`;
      populateControls();
      renderFeed();
    } catch {
      showFailure(liveError);
    }
  }
}

function showLoading() {
  elements.updates.replaceChildren(makeState("Loading updates", "Connecting to the public GitHub feed."));
  elements.updates.setAttribute("aria-busy", "true");
}

function showFailure(error) {
  elements.source.textContent = "Public feed unavailable";
  elements.notice.textContent = "The live feed could not be loaded and there is no valid saved copy.";
  elements.updates.replaceChildren(
    makeState("Updates are temporarily unavailable", "Please reload in a moment to try the public feed again."),
  );
  elements.updates.setAttribute("aria-busy", "false");
  console.error(error);
}

function makeState(title, detail) {
  const container = document.createElement("div");
  container.className = "feed-state";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = detail;
  container.append(heading, paragraph);
  return container;
}

function displayProject(project) {
  if (!project.includes("-")) return project;
  return project
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function populateControls() {
  const projects = [...new Set(state.posts.map((post) => post.project))].sort((a, b) =>
    displayProject(a).localeCompare(displayProject(b)),
  );
  elements.project.replaceChildren(new Option("All projects", "all"));
  projects.forEach((project) => elements.project.add(new Option(displayProject(project), project)));

  const filters = ["all", ...VALID_STATUSES];
  elements.statuses.replaceChildren(
    ...filters.map((status) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.status = status;
      button.addEventListener("click", () => {
        state.status = status;
        renderFeed();
      });
      return button;
    }),
  );
  elements.postCount.textContent = String(state.posts.length);
  elements.projectCount.textContent = String(projects.length);
}

function postSearchText(post) {
  return [post.title, post.project, post.body, ...post.tags].join(" ").toLowerCase();
}

function filteredPosts() {
  return state.posts.filter((post) => {
    const matchesStatus = state.status === "all" || post.status === state.status;
    const matchesProject = state.project === "all" || post.project === state.project;
    const matchesQuery = !state.query || postSearchText(post).includes(state.query);
    return matchesStatus && matchesProject && matchesQuery;
  });
}

function renderFeed() {
  const visible = filteredPosts();
  elements.visibleCount.textContent = String(visible.length);
  elements.updates.setAttribute("aria-busy", "false");

  elements.statuses.querySelectorAll("button").forEach((button) => {
    const status = button.dataset.status;
    const count = status === "all" ? state.posts.length : state.posts.filter((post) => post.status === status).length;
    button.classList.toggle("active", state.status === status);
    button.setAttribute("aria-pressed", String(state.status === status));
    button.replaceChildren(document.createTextNode(`${STATUS_LABELS[status]} `));
    const badge = document.createElement("span");
    badge.textContent = String(count);
    button.append(badge);
  });

  if (visible.length === 0) {
    elements.updates.replaceChildren(
      makeState("No notes match those filters", "Try another project, status, or search term."),
    );
    return;
  }
  elements.updates.replaceChildren(...visible.map(createCard));
}

function createCard(post) {
  const article = document.createElement("article");
  article.className = "update-card";

  const header = document.createElement("header");
  header.className = "update-header";
  const titleBlock = document.createElement("div");
  const project = document.createElement("p");
  project.className = "project-name";
  project.textContent = displayProject(post.project);
  const title = document.createElement("h3");
  title.textContent = post.title;
  titleBlock.append(project, title);

  const timing = document.createElement("div");
  timing.className = "update-timing";
  const time = document.createElement("time");
  time.dateTime = post.createdAt;
  time.textContent = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(post.createdAt));
  const reading = document.createElement("span");
  reading.textContent = `${readMinutes(post.body)} min read`;
  timing.append(time, reading);
  header.append(titleBlock, timing);

  const body = renderMarkdown(post.body);
  body.className = "update-body";
  article.append(header, body);

  const media = createMedia(post);
  if (media) article.append(media);

  const footer = document.createElement("footer");
  footer.className = "update-footer";
  const tags = document.createElement("div");
  tags.className = "tag-list";
  tags.setAttribute("aria-label", "Update tags");
  post.tags.forEach((tag) => {
    const item = document.createElement("span");
    item.textContent = `#${tag}`;
    tags.append(item);
  });
  footer.append(tags);

  const aside = document.createElement("div");
  aside.className = "update-links";
  const status = document.createElement("span");
  status.className = `status status-${post.status}`;
  status.textContent = STATUS_LABELS[post.status];
  aside.append(status);
  const ctaUrl = safeExternalUrl(post.ctaUrl);
  if (post.ctaLabel && ctaUrl) {
    const cta = document.createElement("a");
    cta.href = ctaUrl;
    cta.target = "_blank";
    cta.rel = "noreferrer";
    cta.textContent = `${post.ctaLabel} ↗`;
    aside.append(cta);
  }
  footer.append(aside);
  article.append(footer);
  return article;
}

function readMinutes(body) {
  const plain = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[video:[^\]]+\]\([^)]*\)/gi, "")
    .replace(/[#*_>`\[\]()-]/g, " ");
  const words = plain.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function createMedia(post) {
  const items = [
    ...post.images.map((item) => ({ ...item, kind: "image" })),
    ...post.videos.map((item) => ({ ...item, kind: "video" })),
  ];
  if (items.length === 0) return null;

  const gallery = document.createElement("div");
  gallery.className = `media-gallery count-${Math.min(items.length, 4)}`;
  gallery.setAttribute("aria-label", "Update media");
  items.forEach((item) => {
    const figure = document.createElement("figure");
    const url = mediaUrl(post.id, item.path);
    if (item.kind === "image") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "media-button";
      button.setAttribute("aria-label", `View full image: ${item.alt || post.title}`);
      const image = document.createElement("img");
      image.src = url;
      image.alt = item.alt;
      image.loading = "lazy";
      if (/(?:contact|character)[-_ ]sheet/i.test(item.fileName)) image.className = "contain";
      button.append(image);
      button.addEventListener("click", () => openLightbox(url, item.alt));
      figure.append(button);
      if (item.alt) figure.append(makeCaption(item.alt));
    } else {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", item.caption);
      figure.append(video, makeCaption(item.caption));
    }
    gallery.append(figure);
  });
  return gallery;
}

function mediaUrl(postId, path) {
  const postUrl = new URL(`posts/${postId}.json`, FEED_INDEX_URL);
  const url = new URL(path, postUrl);
  url.searchParams.set("v", state.mediaVersion);
  return url.href;
}

function makeCaption(text) {
  const caption = document.createElement("figcaption");
  caption.textContent = text;
  return caption;
}

function openLightbox(url, caption) {
  const image = elements.lightbox.querySelector("img");
  image.src = url;
  image.alt = caption;
  elements.lightbox.querySelector("p").textContent = caption;
  if (typeof elements.lightbox.showModal === "function") {
    elements.lightbox.showModal();
  } else {
    elements.lightbox.setAttribute("open", "");
  }
}

function closeLightbox() {
  if (typeof elements.lightbox.close === "function") elements.lightbox.close();
  else elements.lightbox.removeAttribute("open");
  elements.lightbox.querySelector("img").removeAttribute("src");
}

function renderMarkdown(markdown) {
  const root = document.createElement("div");
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const element = document.createElement("p");
    appendInline(element, paragraph.join(" "));
    root.append(element);
    paragraph = [];
  };
  const clearList = () => {
    list = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      clearList();
      return;
    }
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(line) || /^\[video:[^\]]+\]\([^)]+\)$/i.test(line)) {
      flushParagraph();
      clearList();
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      clearList();
      const level = Math.min(heading[1].length + 3, 6);
      const element = document.createElement(`h${level}`);
      appendInline(element, heading[2]);
      root.append(element);
      return;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const kind = bullet ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== kind) {
        list = document.createElement(kind);
        root.append(list);
      }
      const item = document.createElement("li");
      appendInline(item, (bullet || numbered)[1]);
      list.append(item);
      return;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      clearList();
      const quote = document.createElement("blockquote");
      appendInline(quote, line.slice(2));
      root.append(quote);
      return;
    }

    clearList();
    paragraph.push(line);
  });
  flushParagraph();
  return root;
}

function appendInline(container, text) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    container.append(document.createTextNode(text.slice(offset, match.index)));
    const token = match[0];
    if (token.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      container.append(strong);
    } else if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      container.append(code);
    } else {
      const parts = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const url = parts && safeExternalUrl(parts[2]);
      if (url) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.textContent = parts[1];
        container.append(anchor);
      } else {
        container.append(document.createTextNode(parts ? parts[1] : token));
      }
    }
    offset = match.index + token.length;
  }
  container.append(document.createTextNode(text.slice(offset)));
}

function safeExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderFeed();
});
elements.project.addEventListener("change", (event) => {
  state.project = event.target.value;
  renderFeed();
});
elements.lightbox.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
elements.lightbox.addEventListener("click", (event) => {
  if (event.target === elements.lightbox) closeLightbox();
});

loadFeed();
