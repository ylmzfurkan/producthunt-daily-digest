const el = {
  daySelect: document.getElementById("day-select"),
  prevDay: document.getElementById("prev-day"),
  nextDay: document.getElementById("next-day"),
  search: document.getElementById("search"),
  topicFilter: document.getElementById("topic-filter"),
  count: document.getElementById("count"),
  status: document.getElementById("status"),
  cards: document.getElementById("cards"),
};

let days = [];
let posts = [];

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function showStatus(msg) {
  el.status.textContent = msg;
  el.status.hidden = !msg;
}

async function loadDays() {
  days = await api("/api/days");
  el.daySelect.innerHTML = "";
  for (const d of days) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
      weekday: "long",
    });
    el.daySelect.appendChild(opt);
  }
}

async function loadDay(date) {
  el.cards.innerHTML = "";
  if (!date) {
    showStatus("No data yet. Come back after the next daily update.");
    el.count.textContent = "";
    return;
  }
  showStatus("Loading...");
  try {
    const data = await api(`/api/day/${date}`);
    posts = data.posts;
    buildTopicFilter();
    showStatus("");
    render();
  } catch (err) {
    showStatus("Error: " + err.message);
  }
}

function buildTopicFilter() {
  const topics = [...new Set(posts.flatMap((p) => p.topics))].sort((a, b) =>
    a.localeCompare(b, "en")
  );
  const current = el.topicFilter.value;
  el.topicFilter.innerHTML = '<option value="">All categories</option>';
  for (const t of topics) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    el.topicFilter.appendChild(opt);
  }
  if (topics.includes(current)) el.topicFilter.value = current;
}

function render() {
  const q = el.search.value.trim().toLowerCase();
  const topic = el.topicFilter.value;

  const filtered = posts.filter((p) => {
    if (topic && !p.topics.includes(topic)) return false;
    if (!q) return true;
    const hay = [p.name, p.tagline, p.summary?.summary, p.summary?.audience]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  el.count.textContent = `${filtered.length} / ${posts.length} products`;
  el.cards.innerHTML = "";
  for (const p of filtered) el.cards.appendChild(renderCard(p));

  if (filtered.length === 0 && posts.length > 0) {
    showStatus("No products match the filter.");
  } else if (posts.length === 0) {
    showStatus("No products found for this day.");
  } else {
    showStatus("");
  }
}

function renderCard(p) {
  const card = document.createElement("article");
  card.className = "card";

  const head = document.createElement("div");
  head.className = "card-head";
  if (p.thumbnail) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = p.thumbnail;
    img.alt = "";
    img.loading = "lazy";
    head.appendChild(img);
  }
  const titleBlock = document.createElement("div");
  titleBlock.className = "title-block";
  const h2 = document.createElement("h2");
  const link = document.createElement("a");
  link.href = p.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = p.name;
  h2.appendChild(link);
  const tagline = document.createElement("p");
  tagline.className = "tagline";
  tagline.textContent = p.tagline;
  titleBlock.append(h2, tagline);
  const votes = document.createElement("div");
  votes.className = "votes";
  votes.innerHTML = `<strong>▲ ${p.votesCount}</strong>votes`;
  head.append(titleBlock, votes);
  card.appendChild(head);

  if (p.summary?.summary) {
    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = p.summary.summary;
    card.appendChild(summary);
    if (p.summary.audience) {
      const who = document.createElement("p");
      who.className = "meta-line";
      who.innerHTML = `<span class="label">👤 Who it's for:</span> `;
      who.appendChild(document.createTextNode(p.summary.audience));
      card.appendChild(who);
    }
    if (p.summary.highlight) {
      const one = document.createElement("p");
      one.className = "meta-line";
      one.innerHTML = `<span class="label">✨ Highlight:</span> `;
      one.appendChild(document.createTextNode(p.summary.highlight));
      card.appendChild(one);
    }
  } else {
    const fallback = document.createElement("p");
    fallback.className = "summary";
    fallback.textContent = p.description || p.tagline;
    card.appendChild(fallback);
    const note = document.createElement("p");
    note.className = "no-summary";
    note.textContent = "AI summary not generated yet.";
    card.appendChild(note);
  }

  if (p.topics.length) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const t of p.topics) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = t;
      chip.onclick = () => {
        el.topicFilter.value = t;
        render();
      };
      chips.appendChild(chip);
    }
    card.appendChild(chips);
  }

  const footer = document.createElement("div");
  footer.className = "card-footer";
  const phLink = document.createElement("a");
  phLink.href = p.url;
  phLink.target = "_blank";
  phLink.rel = "noopener";
  phLink.textContent = "Product Hunt ↗";
  footer.appendChild(phLink);
  if (p.website) {
    const site = document.createElement("a");
    site.href = p.website;
    site.target = "_blank";
    site.rel = "noopener";
    site.textContent = "Website ↗";
    footer.appendChild(site);
  }
  const comments = document.createElement("span");
  comments.className = "comments";
  comments.textContent = `💬 ${p.commentsCount}`;
  footer.appendChild(comments);
  card.appendChild(footer);

  return card;
}

function stepDay(delta) {
  const i = el.daySelect.selectedIndex + delta;
  if (i >= 0 && i < days.length) {
    el.daySelect.selectedIndex = i;
    loadDay(days[i]);
  }
}

el.daySelect.onchange = () => loadDay(el.daySelect.value);
el.prevDay.onclick = () => stepDay(1); // list is sorted newest-to-oldest
el.nextDay.onclick = () => stepDay(-1);
el.search.oninput = render;
el.topicFilter.onchange = render;

(async function init() {
  await loadDays();
  if (days.length > 0) {
    el.daySelect.value = days[0];
    await loadDay(days[0]);
  } else {
    await loadDay(null);
  }
})();
