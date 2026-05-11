# 진입 페이지 설정 + sessionStorage 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** `index.do`에서도 설정 가능하도록 `@match` 확장하고, `localStorage`를 `sessionStorage`로 교체해 잔존 문제 해결.

**Architecture:** 단일 파일(`olympicPark.js`) 수정. 페이지 감지 상수 추가, UI/자동실행 분기.

**Tech Stack:** Vanilla JS (Tampermonkey userscript).

**Spec:** `docs/superpowers/specs/2026-05-11-index-page-config-and-session-storage-design.md`

---

## Task 1: `@match` 헤더에 `index.do` 추가

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js:7-8`

- [ ] **Step 1: 헤더에 두 줄 추가**

`olympicPark.js`에서 다음 부분을 찾는다:

```
// @match        https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do
// @match        https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
```

다음으로 변경 (resrvtn_aplictn 두 줄 다음, @require 앞에 index.do 두 줄 추가):

```
// @match        https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do
// @match        https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do*
// @match        https://www.ksponco.or.kr/online/tennis/index.do
// @match        https://www.ksponco.or.kr/online/tennis/index.do*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
```

- [ ] **Step 2: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "feat: @match에 index.do 추가"
```

---

## Task 2: 페이지 감지 상수 추가 + 자동 실행 가드

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js` (상수 영역, IIFE 끝부분)

- [ ] **Step 1: 상수 영역에 `IS_RESERVATION_PAGE` 추가**

`olympicPark.js`에서 다음 줄을 찾는다:

```javascript
    // ─── 상수 ───────────────────────────────────────
    const STORAGE_KEY = 'olympic_tennis_config';
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
    let isRunning = false;
```

`DAY_NAMES` 줄 뒤에 다음을 추가 (`let isRunning` 앞):

```javascript
    const IS_RESERVATION_PAGE = window.location.pathname.includes('resrvtn_aplictn');
```

- [ ] **Step 2: IIFE 끝의 자동 실행을 분기**

`olympicPark.js` 끝부분에서 다음 부분을 찾는다:

```javascript
    // ─── 초기화 ──────────────────────────────────────
    createUI();

    // 페이지 로드 즉시 자동 실행
    const autoConfig = loadConfig();
    startReservation(autoConfig);

})();
```

다음으로 변경:

```javascript
    // ─── 초기화 ──────────────────────────────────────
    createUI();

    // 예약 페이지에서만 자동 실행
    if (IS_RESERVATION_PAGE) {
        const autoConfig = loadConfig();
        startReservation(autoConfig);
    }

})();
```

- [ ] **Step 3: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "feat: 페이지 감지 상수 추가 및 자동 실행을 예약 페이지로 한정"
```

---

## Task 3: `localStorage` → `sessionStorage` 교체

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js` (`loadConfig`, `saveConfig`)

- [ ] **Step 1: `loadConfig`의 `localStorage` 사용 부분 교체**

`olympicPark.js`에서 다음 줄을 찾는다:

```javascript
            const saved = localStorage.getItem(STORAGE_KEY);
```

다음으로 변경:

```javascript
            const saved = sessionStorage.getItem(STORAGE_KEY);
```

- [ ] **Step 2: `saveConfig`의 `localStorage` 사용 부분 교체**

`olympicPark.js`에서 다음 줄을 찾는다:

```javascript
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
```

다음으로 변경:

```javascript
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
```

- [ ] **Step 3: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "feat: 설정 저장소를 localStorage에서 sessionStorage로 변경"
```

---

## Task 4: `createUI`에서 진입 페이지일 때 실행/중지 버튼 숨김

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js` (`createUI` 함수의 `panel.innerHTML`)

- [ ] **Step 1: 실행/중지 버튼의 `style` 인라인을 동적으로 변경**

`olympicPark.js`에서 다음 부분을 찾는다 (`createUI`의 패널 HTML, 버튼 줄):

```javascript
                    <button id="tap-run" style="flex:1;padding:8px;background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">실행</button>
                    <button id="tap-stop" style="flex:1;padding:8px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;display:none;">중지</button>
```

다음으로 변경 (`display` 부분을 `IS_RESERVATION_PAGE` 기반으로 결정):

```javascript
                    <button id="tap-run" style="flex:1;padding:8px;background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;display:${IS_RESERVATION_PAGE ? 'block' : 'none'};">실행</button>
                    <button id="tap-stop" style="flex:1;padding:8px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;display:none;">중지</button>
```

(중지 버튼은 원래도 `display:none`이라 그대로. 실행 버튼만 진입 페이지일 때 숨김.)

- [ ] **Step 2: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "feat: 진입 페이지에서는 실행 버튼 숨김"
```

---

## Task 5: `updateButtons` 가드 추가

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js` (`updateButtons` 함수)

- [ ] **Step 1: 함수 시작부에 가드 추가**

`olympicPark.js`에서 다음 함수를 찾는다:

```javascript
    function updateButtons(running) {
        const runBtn = document.querySelector('#tap-run');
        const stopBtn = document.querySelector('#tap-stop');
        if (runBtn) runBtn.style.display = running ? 'none' : 'block';
        if (stopBtn) stopBtn.style.display = running ? 'block' : 'none';
    }
```

다음으로 변경:

```javascript
    function updateButtons(running) {
        if (!IS_RESERVATION_PAGE) return;
        const runBtn = document.querySelector('#tap-run');
        const stopBtn = document.querySelector('#tap-stop');
        if (runBtn) runBtn.style.display = running ? 'none' : 'block';
        if (stopBtn) stopBtn.style.display = running ? 'block' : 'none';
    }
```

진입 페이지에서는 어떤 호출이 와도 버튼 상태가 바뀌지 않도록 함.

- [ ] **Step 2: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "feat: updateButtons가 진입 페이지에선 no-op이 되도록 가드 추가"
```

---

## Task 6: 통합 수동 검증 (사용자가 진행)

**Files:**
- (변경 없음, 검증 단계)

- [ ] **Step 1: `index.do`에서 패널 표시 확인**

브라우저로 `https://www.ksponco.or.kr/online/tennis/index.do` 진입. 우측 상단 패널 표시, "저장" 버튼 보임, "실행" 버튼 안 보임, 자동 실행 안 됨 확인.

- [ ] **Step 2: 설정 변경 → sessionStorage 저장 확인**

패널에서 모드/코트 등 임의 값으로 변경 + "저장" 클릭. DevTools > Application > Session Storage에서 `olympic_tennis_config` 키 확인.

- [ ] **Step 3: 예약 페이지로 이동하여 자동 실행 확인**

사이트 메뉴로 `resrvtn_aplictn.do` 이동. 패널이 Step 2에서 저장한 값을 반영하고, 자동 실행이 그 값으로 동작.

- [ ] **Step 4: 탭 닫고 새 탭에서 다시 진입**

탭을 닫고 새 탭에서 `index.do` 진입. sessionStorage 비어있고 기본값으로 표시되는지 확인.

- [ ] **Step 5: 예약 페이지를 새 탭에서 직접 열기**

새 탭으로 `resrvtn_aplictn.do` 직접 진입. 기본값으로 자동 실행되는지 확인.
