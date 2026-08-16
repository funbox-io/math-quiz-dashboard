/* ============================================================
   설정 파일 — 여기만 채우면 됩니다.
   데이터는 GitHub Actions 가 Notion 을 읽어 만든 data.json 에서
   불러옵니다. 브라우저에 Notion 토큰을 넣을 필요가 없습니다.
   ============================================================ */

window.APP_CONFIG = {
  // ── 1. 데이터 파일 경로 ────────────────────────────────
  // GitHub Actions(scripts/sync.js)가 1시간마다 갱신합니다.
  // 파일이 없거나 비어 있으면 자동으로 "데모 데이터" 모드로 뜹니다.
  dataUrl: "./data.json",

  // ── 2. Notion 문제집 DB 주소 (헤더 버튼 링크용) ──────────
  notionDbUrl: "https://www.notion.so/3bea79df73cf80b68287f47f982eb4be",

  // ── 3. 사이트 표시 설정 ────────────────────────────────
  siteTitle: "수학 문제집 대시보드",
  siteSubtitle: "Notion → GitHub Actions → 시각적 데이터 마이닝",

  // 점수 구간 정의 (tier). 경계를 바꾸면 scripts/sync.js 의 값도 같이 바꾸세요.
  tiers: [
    { key: "최상", min: 90, label: "최상 (90~100)" },
    { key: "상",   min: 80, label: "상 (80~89)" },
    { key: "중",   min: 70, label: "중 (70~79)" },
    { key: "하",   min: 0,  label: "하 (0~69)" }
  ]
};
