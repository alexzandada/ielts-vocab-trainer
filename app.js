const STORAGE_KEY = "ielts-vocab-trainer-progress-v8";
const DEFAULT_SETTINGS = {
  targetDays: 45,
  dailyCap: 80,
  todayNew: 12,
  mode: "mixed",
  tier: "all",
  timerSeconds: 12,
  ratio: "1:2",
};

const state = {
  dataset: null,
  progress: {},
  settings: { ...DEFAULT_SETTINGS },
  queue: [],
  currentCard: null,
  currentIndex: 0,
  selectedAnswer: null,
  timerId: null,
  timerRemaining: 0,
  questionResolved: false,
  sync: {
    status: "local",
    lastSyncedAt: null,
    isSyncing: false,
  },
};

const els = {
  homePage: document.querySelector("#home-page"),
  studyPage: document.querySelector("#study-page"),
  vocabPage: document.querySelector("#vocab-page"),
  summaryPage: document.querySelector("#summary-page"),
  settingsSheet: document.querySelector("#settings-sheet"),
  settingsBackdrop: document.querySelector("#settings-backdrop"),
  openSettings: document.querySelector("#open-settings"),
  closeSettings: document.querySelector("#close-settings"),
  backHome: document.querySelector("#back-home"),
  backHomeFromVocab: document.querySelector("#back-home-from-vocab"),
  backHomeFromSummary: document.querySelector("#back-home-from-summary"),
  openVocabList: document.querySelector("#open-vocab-list"),
  openSummaryPage: document.querySelector("#open-summary-page"),
  summaryGrid: document.querySelector("#summary-grid"),
  dailyPlan: document.querySelector("#daily-plan"),
  homeOverview: document.querySelector("#home-overview"),
  hardWordsList: document.querySelector("#hard-words-list"),
  weekForecast: document.querySelector("#week-forecast"),
  syncStatusChip: document.querySelector("#sync-status-chip"),
  planInsights: document.querySelector("#plan-insights"),
  modeSelect: document.querySelector("#mode-select"),
  tierSelect: document.querySelector("#tier-select"),
  timerSelect: document.querySelector("#timer-select"),
  targetDaysInput: document.querySelector("#target-days-input"),
  dailyCapInput: document.querySelector("#daily-cap-input"),
  todayTargetInput: document.querySelector("#today-target-input"),
  ratioSelect: document.querySelector("#ratio-select"),
  startStudy: document.querySelector("#start-study"),
  resetProgress: document.querySelector("#reset-progress"),
  cardEmpty: document.querySelector("#card-empty"),
  studyCard: document.querySelector("#study-card"),
  taskChip: document.querySelector("#task-chip"),
  newOldChip: document.querySelector("#new-old-chip"),
  timerChip: document.querySelector("#timer-chip"),
  queueProgress: document.querySelector("#queue-progress"),
  questionMain: document.querySelector("#question-main"),
  questionSub: document.querySelector("#question-sub"),
  questionMeta: document.querySelector("#question-meta"),
  optionList: document.querySelector("#option-list"),
  resultBox: document.querySelector("#result-box"),
  showAnswer: document.querySelector("#show-answer"),
  nextCard: document.querySelector("#next-card"),
  loadMoreNew: document.querySelector("#load-more-new"),
  vocabList: document.querySelector("#vocab-list"),
  vocabSearch: document.querySelector("#vocab-search"),
  vocabCount: document.querySelector("#vocab-count"),
  todaySummaryStats: document.querySelector("#today-summary-stats"),
  todaySummaryList: document.querySelector("#today-summary-list"),
  summaryDate: document.querySelector("#summary-date"),
};

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);
const todayKey = () => new Date().toISOString().slice(0, 10);

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/\s+([，。；：！？）])/g, "$1")
    .trim();
}

function formatMeaning(entry) {
  return normalizeText(entry.meaning);
}

function formatSynonyms(entry) {
  const values = (entry.synonyms || []).map(normalizeText).filter(Boolean);
  return values.length ? values.join(" / ") : "暂无同义替换";
}

function importanceText(entry) {
  return entry.importanceRank ? `第${entry.importanceRank}个` : `第${entry.bookOrder}个`;
}

function parseRatio(value) {
  const [newPart, reviewPart] = String(value || "1:2").split(":").map(Number);
  return {
    newPart: newPart || 1,
    reviewPart: reviewPart || 2,
  };
}

function getEntryProgress(entryId) {
  if (!state.progress[entryId]) {
    state.progress[entryId] = {
      stage: -1,
      dueDate: null,
      seen: false,
      correct: 0,
      wrong: 0,
      streak: 0,
      lapses: 0,
      lastResult: null,
      lastReviewedAt: null,
      history: [],
    };
  }
  return state.progress[entryId];
}

function getPersistedState() {
  return {
    progress: state.progress,
    settings: state.settings,
    lastSyncedAt: state.sync.lastSyncedAt,
  };
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState()));
}

function loadLocalState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      progress: raw.progress || {},
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      lastSyncedAt: raw.lastSyncedAt || null,
    };
  } catch {
    return {
      progress: {},
      settings: { ...DEFAULT_SETTINGS },
      lastSyncedAt: null,
    };
  }
}

async function fetchRemoteState() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function pushRemoteState() {
  if (state.sync.isSyncing) return;
  state.sync.isSyncing = true;
  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progress: state.progress,
        settings: state.settings,
      }),
    });
    if (!response.ok) throw new Error("sync failed");
    const data = await response.json();
    state.sync.status = "cloud";
    state.sync.lastSyncedAt = data.updatedAt || new Date().toISOString();
    saveLocalState();
  } catch {
    state.sync.status = "local";
    saveLocalState();
  } finally {
    state.sync.isSyncing = false;
    renderSyncStatus();
  }
}

function openSettings() {
  els.settingsSheet.classList.remove("hidden");
}

function closeSettings() {
  els.settingsSheet.classList.add("hidden");
}

function showPage(page) {
  closeSettings();
  [els.homePage, els.studyPage, els.vocabPage, els.summaryPage].forEach((view) => {
    view.classList.add("hidden");
  });
  page.classList.remove("hidden");
}

function renderSyncStatus() {
  if (!els.syncStatusChip) return;
  els.syncStatusChip.textContent = state.sync.status === "cloud" ? "云端已同步" : "本地缓存";
  els.syncStatusChip.classList.toggle("light", state.sync.status !== "cloud");
}

function createStatCard(label, value, detail) {
  const card = document.createElement("div");
  card.className = "stat-card";
  card.innerHTML = `<span>${label}</span><strong>${value}</strong><p>${detail}</p>`;
  return card;
}

function createDailyCard(title, body, extra, highlight = false) {
  const card = document.createElement("article");
  card.className = `daily-item${highlight ? " highlight" : ""}`;
  card.innerHTML = `<h3>${title}</h3><p>${body}</p><p>${extra}</p>`;
  return card;
}

function matchesTier(entry, tier) {
  if (tier === "all") return true;
  if (tier === "high") return entry.level <= 2;
  return String(entry.level) === tier;
}

function entryWeight(entry) {
  const progress = getEntryProgress(entry.id);
  const base = entry.level === 1 ? 12 : entry.level === 2 ? 7 : 3;
  const rankBoost = entry.importanceRank ? Math.max(0, 24 - entry.importanceRank / 5) : 0;
  const errorBoost = progress.wrong * 2 + progress.lapses * 2.5;
  const synonymBoost = (entry.synonyms || []).length ? 2 : 0;
  return base + rankBoost + errorBoost + synonymBoost;
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + entryWeight(item), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= entryWeight(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function weightedSample(items, limit) {
  const pool = [...items];
  const result = [];
  while (pool.length && result.length < limit) {
    const chosen = weightedPick(pool);
    result.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return result;
}

function dueEntries(tier) {
  return state.dataset.entries
    .filter((entry) => matchesTier(entry, tier))
    .filter((entry) => {
      const dueDate = getEntryProgress(entry.id).dueDate;
      return dueDate && dueDate <= todayKey();
    })
    .sort((a, b) => entryWeight(b) - entryWeight(a));
}

function unseenEntries(tier) {
  return state.dataset.entries
    .filter((entry) => matchesTier(entry, tier))
    .filter((entry) => !getEntryProgress(entry.id).seen);
}

function newEntries(limit, tier) {
  return weightedSample(unseenEntries(tier), limit);
}

function getTodayTargets() {
  const dueList = dueEntries(state.settings.tier);
  const unseenList = unseenEntries(state.settings.tier);
  const ratio = parseRatio(state.settings.ratio);
  const totalParts = ratio.newPart + ratio.reviewPart;
  const dailyCap = Number(state.settings.dailyCap);
  const byRatioReview = Math.floor((dailyCap * ratio.reviewPart) / totalParts);
  const reviewTarget = Math.min(dueList.length, byRatioReview);
  const newTarget = Math.min(
    unseenList.length,
    Math.max(0, Math.min(Number(state.settings.todayNew), dailyCap - reviewTarget))
  );

  return {
    dueList,
    reviewTarget,
    newTarget,
    unseenCount: unseenList.length,
  };
}

function pickDistractors(entry, count, extractor) {
  return shuffle(state.dataset.entries.filter((item) => item.id !== entry.id))
    .map(extractor)
    .map(normalizeText)
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, count);
}

function pickMode(entry, selectedMode) {
  if (selectedMode !== "mixed") return selectedMode;
  const modes = ["en_to_zh", "en_to_zh", "zh_to_en"];
  if ((entry.synonyms || []).length) modes.push("synonym", "synonym");
  return shuffle(modes)[0];
}

function classifyEntry(entry) {
  return getEntryProgress(entry.id).seen ? "复习词" : "新词";
}

function buildCard(entry, selectedMode) {
  const mode = pickMode(entry, selectedMode);

  if (mode === "en_to_zh") {
    return {
      entry,
      mode,
      kind: classifyEntry(entry),
      prompt: normalizeText(entry.word),
      subPrompt: "看到英文，快速识别中文意思。",
      metaBefore: `重要顺序：${importanceText(entry)}`,
      metaAfter: `同义替换：${formatSynonyms(entry)}`,
      answer: formatMeaning(entry),
      choices: shuffle([formatMeaning(entry), ...pickDistractors(entry, 3, formatMeaning)]).slice(0, 4),
    };
  }

  if (mode === "zh_to_en") {
    return {
      entry,
      mode,
      kind: classifyEntry(entry),
      prompt: formatMeaning(entry),
      subPrompt: "看到中文，快速选出英文单词。",
      metaBefore: `重要顺序：${importanceText(entry)}`,
      metaAfter: `同义替换：${formatSynonyms(entry)}`,
      answer: normalizeText(entry.word),
      choices: shuffle([normalizeText(entry.word), ...pickDistractors(entry, 3, (item) => item.word)]).slice(0, 4),
    };
  }

  const answer = normalizeText((entry.synonyms || [entry.word])[0]);
  const synonymPool = state.dataset.entries
    .flatMap((item) => item.synonyms || [])
    .map(normalizeText)
    .filter(Boolean)
    .filter((value) => value !== answer)
    .filter((value, index, array) => array.indexOf(value) === index);

  return {
    entry,
    mode: "synonym",
    kind: classifyEntry(entry),
    prompt: normalizeText(entry.word),
    subPrompt: "从替换表达里选出最贴近这个词的一项。",
    metaBefore: `重要顺序：${importanceText(entry)}`,
    metaAfter: `中文：${formatMeaning(entry)}`,
    answer,
    choices: shuffle([answer, ...shuffle(synonymPool).slice(0, 3)]).slice(0, 4),
  };
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function setActionState({ nextEnabled = false, answerEnabled = true } = {}) {
  els.nextCard.disabled = !nextEnabled;
  els.showAnswer.disabled = !answerEnabled;
}

function recordResult(correct) {
  const progress = getEntryProgress(state.currentCard.entry.id);
  progress.seen = true;
  progress.lastResult = correct ? "correct" : "wrong";
  progress.lastReviewedAt = new Date().toISOString();
  progress.history.push({ date: todayKey(), correct });

  if (correct) {
    progress.correct += 1;
    progress.streak += 1;
  } else {
    progress.wrong += 1;
    progress.streak = 0;
    progress.lapses += 1;
  }

  const intervals = state.dataset.reviewIntervalsDays;
  if (correct) {
    progress.stage = Math.min(progress.stage + 1, intervals.length - 1);
  } else {
    progress.stage = Math.max(progress.stage - 1, 0);
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + intervals[Math.max(progress.stage, 0)]);
  progress.dueDate = dueDate.toISOString().slice(0, 10);

  if (!correct) {
    const replay = buildCard(state.currentCard.entry, state.settings.mode);
    state.queue.splice(Math.min(state.currentIndex + 2, state.queue.length), 0, replay);
  }

  saveLocalState();
  void pushRemoteState();
}

function revealAnswer(selected, forced = false) {
  if (state.questionResolved || !state.currentCard) return;

  const card = state.currentCard;
  const chosen = normalizeText(selected || "未选择");
  const correct = !forced && chosen === normalizeText(card.answer);

  els.optionList.classList.add("hidden");
  els.resultBox.classList.remove("hidden", "correct-result", "wrong-result");
  els.resultBox.classList.add(correct ? "correct-result" : "wrong-result");
  els.resultBox.innerHTML = `
    <div class="result-hero">
      <span class="result-status">${correct ? "回答正确" : "回答错误"}</span>
      <div class="result-answer">${normalizeText(card.answer)}</div>
    </div>
    <div class="result-detail"><strong>中文义</strong><span>${formatMeaning(card.entry)}</span></div>
    <div class="result-detail"><strong>同义替换</strong><span>${formatSynonyms(card.entry)}</span></div>
    <div class="result-detail"><strong>重要顺序</strong><span>${importanceText(card.entry)}</span></div>
    <div class="result-detail"><strong>你的选择</strong><span>${chosen}</span></div>
  `;

  els.optionList.querySelectorAll("button").forEach((button) => {
    const value = normalizeText(button.dataset.value);
    if (value === normalizeText(card.answer)) button.classList.add("correct");
    if (selected && value === normalizeText(selected) && value !== normalizeText(card.answer)) {
      button.classList.add("wrong");
    }
    button.disabled = true;
  });

  els.questionMeta.textContent = card.metaAfter;
  recordResult(correct);
  state.questionResolved = true;
  stopTimer();
  setActionState({ nextEnabled: true, answerEnabled: false });
  renderHome();
  renderPlanInsights();
  renderTodaySummary();
}

function startTimer(seconds) {
  stopTimer();
  if (!seconds) {
    els.timerChip.textContent = "不限时";
    return;
  }

  state.timerRemaining = seconds;
  els.timerChip.textContent = `${state.timerRemaining} 秒`;
  state.timerId = setInterval(() => {
    state.timerRemaining -= 1;
    els.timerChip.textContent = `${Math.max(state.timerRemaining, 0)} 秒`;
    if (state.timerRemaining <= 0) {
      revealAnswer(state.selectedAnswer, true);
    }
  }, 1000);
}

function modeLabel(mode) {
  if (mode === "en_to_zh") return "英文识义";
  if (mode === "zh_to_en") return "中文选词";
  return "同义替换";
}

function renderCurrentCard() {
  const card = state.queue[state.currentIndex];

  if (!card) {
    stopTimer();
    state.currentCard = null;
    els.studyCard.classList.add("hidden");
    els.cardEmpty.classList.remove("hidden");
    els.loadMoreNew.hidden = false;
    return;
  }

  state.currentCard = card;
  state.selectedAnswer = null;
  state.questionResolved = false;

  els.cardEmpty.classList.add("hidden");
  els.loadMoreNew.hidden = true;
  els.studyCard.classList.remove("hidden");
  els.optionList.classList.remove("hidden");
  els.resultBox.classList.add("hidden");
  els.resultBox.innerHTML = "";
  els.resultBox.classList.remove("correct-result", "wrong-result");

  els.taskChip.textContent = modeLabel(card.mode);
  els.newOldChip.textContent = card.kind;
  els.queueProgress.textContent = `第 ${state.currentIndex + 1} / ${state.queue.length} 题`;
  els.questionMain.textContent = normalizeText(card.prompt);
  els.questionSub.textContent = card.subPrompt;
  els.questionMeta.textContent = card.metaBefore;
  els.optionList.innerHTML = "";
  setActionState({ nextEnabled: false, answerEnabled: true });

  card.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "option-button";
    button.textContent = normalizeText(choice);
    button.dataset.value = normalizeText(choice);
    button.addEventListener("click", () => {
      if (state.questionResolved) return;
      state.selectedAnswer = normalizeText(choice);
      revealAnswer(choice, false);
    });
    els.optionList.append(button);
  });

  startTimer(Number(state.settings.timerSeconds));
}

function buildStudyQueue({ moreNew = false } = {}) {
  const { dueList, reviewTarget, newTarget } = getTodayTargets();
  const reviewList = moreNew ? [] : dueList.slice(0, reviewTarget);
  const newList = newEntries(newTarget, state.settings.tier);
  const queueEntries = weightedSample([...reviewList, ...newList], reviewList.length + newList.length);
  return queueEntries.map((entry) => buildCard(entry, state.settings.mode));
}

function countTodayStats(progress) {
  const today = todayKey();
  const todayHistory = (progress.history || []).filter((item) => item.date === today);
  return {
    seen: todayHistory.length,
    wrong: todayHistory.filter((item) => !item.correct).length,
  };
}

function getSevenDayForecast() {
  const forecast = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    const key = day.toISOString().slice(0, 10);
    const count = state.dataset.entries.filter((entry) => getEntryProgress(entry.id).dueDate === key).length;
    forecast.push({
      key,
      label: day.toLocaleDateString(undefined, { month: "numeric", day: "numeric", weekday: "short" }),
      count,
    });
  }
  return forecast;
}

function renderHome() {
  const entries = state.dataset.entries;
  const { dueList, reviewTarget, newTarget, unseenCount } = getTodayTargets();
  const learnedCount = entries.filter((entry) => getEntryProgress(entry.id).seen).length;
  const hardEntries = entries
    .map((entry) => ({ entry, progress: getEntryProgress(entry.id) }))
    .filter(({ progress }) => progress.wrong > 0)
    .sort((a, b) => b.progress.wrong - a.progress.wrong || b.progress.lapses - a.progress.lapses)
    .slice(0, 6);
  const forecast = getSevenDayForecast();
  const reviewPreview = dueList.slice(0, 8).map((entry) => entry.word);
  const newPreview = newEntries(Math.min(8, newTarget), state.settings.tier).map((entry) => entry.word);
  const todayStudied = entries.filter((entry) => countTodayStats(getEntryProgress(entry.id)).seen > 0).length;

  els.summaryGrid.innerHTML = "";
  els.summaryGrid.append(
    createStatCard("今日复习", reviewTarget, dueList.length ? `共有 ${dueList.length} 个到期复习词` : "今天暂无到期复习"),
    createStatCard("今日新词", newTarget, `按当前计划今天建议学 ${newTarget} 个新词`),
    createStatCard("今日已学", todayStudied, "今天已经练过的单词数"),
    createStatCard("累计已学", learnedCount, `还剩 ${entries.length - learnedCount} 个未开始`)
  );

  els.dailyPlan.innerHTML = "";
  els.dailyPlan.append(
    createDailyCard(
      "今天先复习什么",
      reviewTarget ? `先复习 ${reviewTarget} 个词` : "今天可以先冲新词",
      reviewPreview.length ? reviewPreview.join(" / ") : "暂无到期复习词",
      true
    ),
    createDailyCard(
      "今天再背什么",
      newTarget ? `再学 ${newTarget} 个新词` : "今天的新词任务已经压到最低",
      newPreview.length ? newPreview.join(" / ") : "建议先把复习清完"
    ),
    createDailyCard(
      "当前节奏",
      `目标 ${state.settings.targetDays} 天完成，比例 ${state.settings.ratio}`,
      `每日上限 ${state.settings.dailyCap} 题，未学 ${unseenCount} 个`
    )
  );

  els.homeOverview.innerHTML = "";
  [
    `今天优先级最高的是第1类和错题词，系统不会按题库原顺序机械出题。`,
    `答错的词会退回更短间隔，并在当前队列里插入一次短期回放。`,
    `设置和进度都会一起同步，最近同步时间：${state.sync.lastSyncedAt ? new Date(state.sync.lastSyncedAt).toLocaleString() : "尚未同步"}`,
  ].forEach((text) => {
    const item = document.createElement("article");
    item.className = "daily-item";
    item.innerHTML = `<p>${text}</p>`;
    els.homeOverview.append(item);
  });

  els.hardWordsList.innerHTML = "";
  if (!hardEntries.length) {
    const empty = document.createElement("article");
    empty.className = "vocab-item";
    empty.innerHTML = `<div class="subtle-text">还没有明显的易错词，继续做题后这里会越来越有参考价值。</div>`;
    els.hardWordsList.append(empty);
  } else {
    hardEntries.forEach(({ entry, progress }) => {
      const item = document.createElement("article");
      item.className = "vocab-item";
      item.innerHTML = `
        <div class="vocab-item-head">
          <div class="vocab-word">${normalizeText(entry.word)}</div>
          <span class="chip light">错 ${progress.wrong} 次</span>
        </div>
        <div><strong>中文：</strong>${formatMeaning(entry)}</div>
        <div><strong>同义替换：</strong>${formatSynonyms(entry)}</div>
      `;
      els.hardWordsList.append(item);
    });
  }

  els.weekForecast.innerHTML = "";
  forecast.forEach((item, index) => {
    els.weekForecast.append(
      createDailyCard(index === 0 ? "今天" : item.label, `${item.count} 个复习词到期`, item.count ? "建议优先清理复习" : "这一天压力相对轻")
    );
  });

  renderSyncStatus();
}

function renderPlanInsights() {
  const ratio = parseRatio(state.settings.ratio);
  const forecast = getSevenDayForecast();
  const unseenCount = state.dataset.entries.filter((entry) => !getEntryProgress(entry.id).seen).length;
  const suggestedNew = Math.max(5, Math.ceil(unseenCount / Math.max(Number(state.settings.targetDays), 1)));
  const reviewTarget = Math.floor((Number(state.settings.dailyCap) * ratio.reviewPart) / (ratio.newPart + ratio.reviewPart));
  const newTarget = Math.max(0, Number(state.settings.dailyCap) - reviewTarget);

  els.planInsights.innerHTML = "";
  els.planInsights.append(
    createDailyCard("比例说明", `你现在选的是 ${state.settings.ratio}`, `按这个比例，今天建议复习 ${reviewTarget} 个，新学 ${newTarget} 个`, true),
    createDailyCard("目标完成天数", `${state.settings.targetDays} 天跑完当前词库`, `按这个速度建议每天至少新学 ${suggestedNew} 个`),
    createDailyCard("7天预估", "未来一周复习量会按到期日期滚动", forecast.map((item) => `${item.label} ${item.count}个`).join(" / "))
  );
}

function renderVocabList(filter = "") {
  const keyword = normalizeText(filter).toLowerCase();
  const list = state.dataset.entries.filter((entry) => {
    if (!keyword) return true;
    return [entry.word, formatMeaning(entry), formatSynonyms(entry), importanceText(entry)]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  els.vocabCount.textContent = `${list.length} / ${state.dataset.entries.length} 个词`;
  els.vocabList.innerHTML = "";
  list.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "vocab-item";
    item.innerHTML = `
      <div class="vocab-item-head">
        <div class="vocab-word">${normalizeText(entry.word)}</div>
        <span class="chip light">${importanceText(entry)}</span>
      </div>
      <div><strong>中文：</strong>${formatMeaning(entry)}</div>
      <div><strong>同义替换：</strong>${formatSynonyms(entry)}</div>
    `;
    els.vocabList.append(item);
  });
}

function renderTodaySummary() {
  const items = state.dataset.entries
    .map((entry) => ({ entry, stats: countTodayStats(getEntryProgress(entry.id)) }))
    .filter(({ stats }) => stats.seen > 0);

  const wrongItems = items.filter(({ stats }) => stats.wrong > 0);
  const maxWrong = wrongItems.reduce((max, item) => Math.max(max, item.stats.wrong), 0);

  els.summaryDate.textContent = todayKey();
  els.todaySummaryStats.innerHTML = "";
  els.todaySummaryStats.append(
    createStatCard("今日已学", items.length, "今天做过题的单词数"),
    createStatCard("今日错词", wrongItems.length, "至少错过一次的单词数"),
    createStatCard("最高错次", maxWrong, maxWrong ? "今天单词的最高单日错误次数" : "今天暂时没有错题")
  );

  els.todaySummaryList.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("article");
    empty.className = "vocab-item";
    empty.innerHTML = "<div>今天还没有学习记录。</div>";
    els.todaySummaryList.append(empty);
    return;
  }

  items
    .sort((a, b) => b.stats.wrong - a.stats.wrong || b.stats.seen - a.stats.seen)
    .forEach(({ entry, stats }) => {
      const item = document.createElement("article");
      item.className = "vocab-item";
      item.innerHTML = `
        <div class="vocab-item-head">
          <div class="vocab-word">${normalizeText(entry.word)}</div>
          <span class="chip light">${stats.wrong > 0 ? `错 ${stats.wrong} 次` : "今天较稳"}</span>
        </div>
        <div><strong>中文：</strong>${formatMeaning(entry)}</div>
        <div><strong>同义替换：</strong>${formatSynonyms(entry)}</div>
        <div><strong>今日作答：</strong>${stats.seen} 次</div>
      `;
      els.todaySummaryList.append(item);
    });
}

function applySettingsFromControls() {
  state.settings = {
    ...state.settings,
    targetDays: Number(els.targetDaysInput.value || DEFAULT_SETTINGS.targetDays),
    dailyCap: Number(els.dailyCapInput.value || DEFAULT_SETTINGS.dailyCap),
    todayNew: Number(els.todayTargetInput.value || DEFAULT_SETTINGS.todayNew),
    ratio: els.ratioSelect.value,
    mode: els.modeSelect.value,
    tier: els.tierSelect.value,
    timerSeconds: Number(els.timerSelect.value || DEFAULT_SETTINGS.timerSeconds),
  };
  saveLocalState();
  void pushRemoteState();
}

function hydrateControls() {
  els.targetDaysInput.value = state.settings.targetDays;
  els.dailyCapInput.value = state.settings.dailyCap;
  els.todayTargetInput.value = state.settings.todayNew;
  els.ratioSelect.value = state.settings.ratio;
  els.modeSelect.value = state.settings.mode;
  els.tierSelect.value = state.settings.tier;
  els.timerSelect.value = String(state.settings.timerSeconds);
}

function startSession(moreNew = false) {
  applySettingsFromControls();
  state.queue = buildStudyQueue({ moreNew });
  state.currentIndex = 0;
  state.currentCard = null;
  showPage(els.studyPage);
  renderCurrentCard();
}

function goHome() {
  stopTimer();
  state.queue = [];
  state.currentCard = null;
  state.currentIndex = 0;
  state.selectedAnswer = null;
  state.questionResolved = false;
  els.optionList.innerHTML = "";
  els.resultBox.innerHTML = "";
  els.resultBox.classList.add("hidden");
  els.studyCard.classList.add("hidden");
  els.cardEmpty.classList.remove("hidden");
  els.loadMoreNew.hidden = true;
  renderHome();
  renderPlanInsights();
  renderTodaySummary();
  showPage(els.homePage);
}

async function init() {
  state.dataset = window.VOCAB_DATA;
  if (!state.dataset) return;

  const localState = loadLocalState();
  state.progress = localState.progress;
  state.settings = localState.settings;
  state.sync.lastSyncedAt = localState.lastSyncedAt;

  const remoteState = await fetchRemoteState();
  if (remoteState && typeof remoteState === "object") {
    state.progress = remoteState.progress || state.progress;
    state.settings = { ...state.settings, ...(remoteState.settings || {}) };
    state.sync.status = "cloud";
    state.sync.lastSyncedAt = remoteState.updatedAt || state.sync.lastSyncedAt;
    saveLocalState();
  }

  hydrateControls();
  renderHome();
  renderPlanInsights();
  renderVocabList();
  renderTodaySummary();
  showPage(els.homePage);
}

els.startStudy.addEventListener("click", () => startSession(false));
els.loadMoreNew.addEventListener("click", () => startSession(true));
els.showAnswer.addEventListener("click", () => revealAnswer(state.selectedAnswer, true));
els.nextCard.addEventListener("click", () => {
  if (!state.questionResolved) return;
  state.currentIndex += 1;
  renderCurrentCard();
});
els.openSettings.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", closeSettings);
els.settingsBackdrop.addEventListener("click", closeSettings);
els.openVocabList.addEventListener("click", () => {
  renderVocabList(els.vocabSearch.value);
  showPage(els.vocabPage);
});
els.openSummaryPage.addEventListener("click", () => {
  renderTodaySummary();
  showPage(els.summaryPage);
});
els.backHome.addEventListener("click", goHome);
els.backHomeFromVocab.addEventListener("click", goHome);
els.backHomeFromSummary.addEventListener("click", goHome);
els.vocabSearch.addEventListener("input", (event) => renderVocabList(event.target.value));

[els.targetDaysInput, els.dailyCapInput, els.todayTargetInput, els.ratioSelect, els.modeSelect, els.tierSelect, els.timerSelect].forEach((input) => {
  input.addEventListener("input", () => {
    applySettingsFromControls();
    renderHome();
    renderPlanInsights();
  });
});

els.resetProgress.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.progress = {};
  saveLocalState();
  renderHome();
  renderPlanInsights();
  renderTodaySummary();
  void pushRemoteState();
});

init();
