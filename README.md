# 📘 수학 문제집 대시보드

Notion에 기록한 문제집 점수를 **1시간마다 자동으로 Firebase에 올리고**, GitHub Pages 사이트에서 차트로 보여줍니다.

```
Notion DB  ──(GitHub Actions, 매시)──▶  Firestore  ──(웹 SDK)──▶  GitHub Pages 사이트
```

## 파일 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 사이트 전체 (스크롤 애니메이션 · 마우스 효과 · 차트 · 목록) |
| `config.js` | **여기만 채우면 됩니다.** Firebase 웹 설정 + Notion 링크 |
| `scripts/sync.js` | Notion → Firestore 동기화 스크립트 |
| `.github/workflows/sync.yml` | 매시 17분 자동 실행 |

> `config.js` 를 비워두면 사이트가 **데모 데이터**로 뜹니다. 먼저 화면부터 확인해 보세요.

---

## 설치 순서

### ✅ 1~2단계는 이미 완료되었습니다
저장소 생성 + GitHub Pages 활성화가 끝났습니다.

**사이트 주소: https://funbox-io.github.io/math-quiz-dashboard/**

현재는 **데모 데이터**로 동작 중입니다. 아래 3~6단계를 마치면 실제 Notion 기록이 표시됩니다.

### 3. Firebase 프로젝트 만들기
1. https://console.firebase.google.com → **프로젝트 추가**
2. 좌측 **빌드 → Firestore Database → 데이터베이스 만들기**
   - 위치: `asia-northeast3 (서울)`
   - 모드: **프로덕션 모드**
3. **규칙** 탭에서 아래로 교체 → 게시

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사이트는 읽기만. 쓰기는 서비스 계정(Admin SDK)만 가능.
    match /{document=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

4. **프로젝트 설정 ⚙️ → 내 앱 → 웹 앱 추가(`</>`)**
   → 나오는 `firebaseConfig` 값을 `config.js` 에 붙여넣고 커밋

### 4. Firebase 서비스 계정 키 만들기
**프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** → JSON 파일 다운로드

> ⚠️ 이 JSON 은 **절대 저장소에 커밋하지 마세요.** 다음 단계에서 Secret 으로만 넣습니다.

### 5. GitHub Secrets 등록
저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `NOTION_TOKEN` | `ntn_...` (Notion Integration Secret) |
| `NOTION_DATABASE_ID` | Notion DB 주소의 32자리 ID |
| `FIREBASE_SERVICE_ACCOUNT` | 4단계 JSON 파일의 **전체 내용을 그대로 붙여넣기** |

### 6. 첫 동기화 실행
저장소 → **Actions** 탭 → `Notion → Firebase 동기화` → **Run workflow**

성공하면 로그에 `🎉 동기화 완료` 가 뜨고, 사이트를 새로고침하면 실제 데이터가 보입니다.

---

## Notion DB 필수 속성

동기화 스크립트가 **이 이름 그대로** 찾습니다.

| 속성 | 타입 | 필수 |
|---|---|---|
| 문제집 | Title | ✅ |
| 날짜 | Date | ✅ |
| 주제 | Select | ✅ |
| 난이도 | Select (`상`/`중`/`하`) | ✅ |
| 점수 | Number | ✅ |
| 평균 | Number | ⬜ (스크립트가 채움) |
| 문제집 링크 | URL | ⬜ |
| 상태 | Select (`시작 전`/`진행 중`/`완료`) | ⬜ |
| 학년 | Select | ⬜ |
| 문항수 | Number | ⬜ |

**점수가 비어 있는 행은 차트에서 자동으로 제외**됩니다. 아직 안 푼 문제집을 미리 넣어둬도 안전합니다.

---

## 로컬에서 테스트

```bash
npm install

# Firestore 에 쓰지 않고 결과만 확인
NOTION_TOKEN=ntn_... NOTION_DATABASE_ID=... npm run sync:dry

# 사이트 미리보기
npm run dev
```

## 자주 나는 오류

| 증상 | 원인 |
|---|---|
| `object_not_found` | Notion DB 에 Integration 을 **Connections** 로 연결하지 않음 |
| `Could not find property` | Notion 속성 이름이 위 표와 다름 (띄어쓰기 포함) |
| 사이트가 계속 데모 데이터 | `config.js` 의 `projectId` 가 비어 있음 |
| 차트가 안 보임 | Chart.js CDN 차단 — `vendor/chart.umd.js` 를 올리고 `index.html` 의 script src 를 바꾸세요 |
| `PERMISSION_DENIED` (사이트) | Firestore 규칙에 `allow read: if true` 가 없음 |
