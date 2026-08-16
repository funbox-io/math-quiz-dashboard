/**
 * Notion → Firebase Firestore 동기화
 * GitHub Actions 가 1시간마다 실행합니다.
 *
 * 필요한 환경변수 (GitHub Secrets):
 *   NOTION_TOKEN              ntn_... (Notion Internal Integration Secret)
 *   NOTION_DATABASE_ID        32자리 DB ID
 *   FIREBASE_SERVICE_ACCOUNT  서비스 계정 JSON 전체 문자열
 *
 * 로컬 테스트:  node scripts/sync.js --dry
 */

import { Client } from "@notionhq/client";
import admin from "firebase-admin";

const DRY = process.argv.includes("--dry");

const TIERS = [
  { key: "최상", min: 90 },
  { key: "상",   min: 80 },
  { key: "중",   min: 70 },
  { key: "하",   min: 0  }
];
const tierOf = (s) => (TIERS.find((t) => s >= t.min) || TIERS.at(-1)).key;

/* ── Notion 속성 읽기 헬퍼 ───────────────────────────── */
const P = {
  title:  (p) => p?.title?.map((t) => t.plain_text).join("") ?? "",
  text:   (p) => p?.rich_text?.map((t) => t.plain_text).join("") ?? "",
  date:   (p) => p?.date?.start ?? null,
  select: (p) => p?.select?.name ?? null,
  number: (p) => (typeof p?.number === "number" ? p.number : null),
  url:    (p) => p?.url ?? null
};

function mapPage(page) {
  const p = page.properties;
  const score = P.number(p["점수"]);
  const date = P.date(p["날짜"]);
  return {
    notionId:   page.id,
    title:      P.title(p["문제집"]) || "(제목 없음)",
    date,
    dateTs:     date ? new Date(date).getTime() : 0,
    topic:      P.select(p["주제"]) || "기타",
    difficulty: P.select(p["난이도"]) || "중",
    grade:      P.select(p["학년"]) || null,
    score,
    maxScore:   100,
    notionUrl:  P.url(p["문제집 링크"]) || page.url,
    status:     P.select(p["상태"]) || "시작 전",
    itemCount:  P.number(p["문항수"]) ?? 20
  };
}

/* ── 1. Notion 에서 전부 읽기 (페이지네이션 포함) ───────── */
async function fetchNotion() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const rows = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ property: "날짜", direction: "ascending" }]
    });
    rows.push(...res.results.map(mapPage));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  // 점수·날짜가 없는 행(아직 안 푼 문제집)은 차트에서 제외
  return rows.filter((r) => typeof r.score === "number" && r.date);
}

/* ── 2. 누적 평균 계산 ───────────────────────────────── */
// "평균" = 같은 주제에서 이 회차까지의 누적 평균.
// 해당 주제가 처음이면 전체 누적 평균으로 대체합니다.
function withAverages(rows) {
  const sorted = [...rows].sort((a, b) => a.dateTs - b.dateTs);
  const byTopic = new Map();
  let runSum = 0;

  return sorted.map((r, i) => {
    runSum += r.score;
    const t = byTopic.get(r.topic) || { sum: 0, n: 0 };
    t.sum += r.score;
    t.n += 1;
    byTopic.set(r.topic, t);

    const average = t.n >= 2 ? t.sum / t.n : runSum / (i + 1);
    return { ...r, average: +average.toFixed(1), tier: tierOf(r.score) };
  });
}

/* ── 3. 집계(stats/summary) ─────────────────────────── */
function buildSummary(rows) {
  const avgBy = (key) => {
    const m = new Map();
    rows.forEach((r) => {
      const a = m.get(r[key]) || { s: 0, n: 0 };
      a.s += r.score; a.n += 1; m.set(r[key], a);
    });
    return Object.fromEntries([...m].map(([k, a]) => [k, +(a.s / a.n).toFixed(1)]));
  };
  const pick = (r) => ({ title: r.title, score: r.score, date: r.date, topic: r.topic, notionUrl: r.notionUrl });
  const hi = rows.reduce((a, b) => (b.score > a.score ? b : a));
  const lo = rows.reduce((a, b) => (b.score < a.score ? b : a));

  return {
    totalCount: rows.length,
    overallAverage: +(rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(1),
    highest: pick(hi),
    lowest: pick(lo),
    byTopic: avgBy("topic"),
    byDifficulty: avgBy("difficulty"),
    updatedAt: Date.now()
  };
}

/* ── 4. Firestore 쓰기 ──────────────────────────────── */
async function push(rows, summary) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
  const db = admin.firestore();

  // 500개 단위 배치 (Firestore 제한)
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    for (const r of rows.slice(i, i + 400)) {
      batch.set(db.collection("quizzes").doc(r.notionId), { ...r, syncedAt: Date.now() }, { merge: true });
    }
    await batch.commit();
  }
  await db.collection("stats").doc("summary").set(summary);

  // Notion 에서 지워진 행은 Firestore 에서도 정리
  const live = new Set(rows.map((r) => r.notionId));
  const snap = await db.collection("quizzes").get();
  const stale = snap.docs.filter((d) => !live.has(d.id));
  if (stale.length) {
    const batch = db.batch();
    stale.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`🧹 삭제된 행 ${stale.length}건 정리`);
  }
}

/* ── 5. 계산된 평균을 Notion 에 되돌려 쓰기 (선택) ─────────
 */
async function writeBackAverages(rows) {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  for (const r of rows) {
    try {
      await notion.pages.update({
        page_id: r.notionId,
        properties: { "평균": { number: r.average } }
      });
    } catch (e) {
      console.warn(`  ⚠️  평균 되돌려쓰기 실패 (${r.title}): ${e.message}`);
      break;
    }
  }
}

(async () => {
  console.log("📥 Notion 읽기 중･");
  const raw = await fetchNotion();
  if (!raw.length) {
    console.log("⚠️  점수가 입력된 행이 없습니다. 종퉌합니다.");
    return;
  }
  const rows = withAverages(raw);
  const summary = buildSummary(rows);

  console.log(`✅ ${rows.length}건 · 전체 평균 ${summary.overallAverage}점`);
  console.log(`   최고 ${summary.highest.score}점 (${summary.highest.title})`);
  console.log(`   최저 ${summary.lowest.score}점 (${summary.lowest.title})`);

  if (DRY) {
    console.log("\n--dry 모드: Firestore 에 쓰지 않습니다.\n");
    console.log(JSON.stringify({ sample: rows.at(-1), summary }, null, 2));
    return;
  }

  console.log("📤 Firestore 업로드 중･");
  await push(rows, summary);
  await writeBackAverages(rows);
  console.log("🎉 동기화 완료");
})().catch((e) => {
  console.error("❌ 동기화 실패:", e);
  process.exit(1);
});

