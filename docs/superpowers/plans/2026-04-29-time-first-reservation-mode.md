# 시간 우선 예약 모드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `[코트별]` / `[시간별]` 예약 모드를 사용자가 토글로 선택할 수 있도록 하고, 시간 우선 모드 흐름을 신규 구현한다.

**Architecture:** 단일 파일(`olympicPark.js`) 수정. `config`에 `mode` 필드 추가, UI 토글 추가, `startReservation`을 분기 진입점으로 두고 기존 본문은 `startCourtFirstFlow`로 이동, 신규 `startTimeFirstFlow` 추가. 공통 유틸은 그대로 재사용.

**Tech Stack:** Vanilla JS (Tampermonkey userscript), localStorage.

**Spec:** `docs/superpowers/specs/2026-04-29-time-first-reservation-mode-design.md`

**Note on testing:** 이 프로젝트는 브라우저 userscript로 자동화 테스트 환경이 없다. 각 태스크 끝에 수동 검증 절차를 둔다 (Tampermonkey에 스크립트 갱신 → 페이지 새로고침 → 동작 확인). 코드 단위로 문법 오류는 `node --check olympicPark.js`로 확인 가능.

---

## Task 1: `getDefaultConfig`에 `mode` 기본값 추가

**Files:**
- Modify: `olympicPark.js:21-38` (`getDefaultConfig` 함수)

- [ ] **Step 1: `getDefaultConfig` 반환 객체에 `mode: 'court-first'` 추가**

`olympicPark.js`에서 다음 부분을 찾아서:

```javascript
        return { courts: '5,7,6,8', day: targetDay, timeGroups };
```

다음으로 변경:

```javascript
        return { courts: '5,7,6,8', day: targetDay, timeGroups, mode: 'court-first' };
```

- [ ] **Step 2: 문법 검증**

Run: `node --check olympicPark.js`
Expected: 오류 출력 없음 (exit 0)

- [ ] **Step 3: 커밋**

```bash
git add olympicPark.js
git commit -m "feat: config 기본값에 mode 필드 추가"
```

---

## Task 2: `loadConfig`/`saveConfig`/`getConfigFromUI`에 `mode` 처리 추가

**Files:**
- Modify: `olympicPark.js:41-66` (`loadConfig`, `saveConfig`, `getConfigFromUI`)

- [ ] **Step 1: `loadConfig`에서 저장된 `mode`를 보존하고, 없으면 기본값으로 폴백**

`olympicPark.js`에서 다음 부분을 찾아서:

```javascript
    function loadConfig() {
        const defaults = getDefaultConfig();
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                // day는 항상 오늘 기준으로 재계산 (전날 저장값 무시)
                config.day = defaults.day;
                config.timeGroups = defaults.timeGroups;
                return config;
            }
        } catch { /* ignore */ }
        return defaults;
    }
```

다음으로 변경:

```javascript
    function loadConfig() {
        const defaults = getDefaultConfig();
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                // day는 항상 오늘 기준으로 재계산 (전날 저장값 무시)
                config.day = defaults.day;
                config.timeGroups = defaults.timeGroups;
                // mode는 저장된 값 유지, 없으면 기본값
                if (config.mode !== 'court-first' && config.mode !== 'time-first') {
                    config.mode = defaults.mode;
                }
                return config;
            }
        } catch { /* ignore */ }
        return defaults;
    }
```

- [ ] **Step 2: `getConfigFromUI`에서 모드 라디오 값 읽기**

`olympicPark.js`에서 다음 부분을 찾아서:

```javascript
    function getConfigFromUI() {
        return {
            courts: document.querySelector('#tap-courts').value.trim(),
            day: parseInt(document.querySelector('input[name="tap-day"]:checked')?.value ?? '6'),
            timeGroups: document.querySelector('#tap-times').value.trim()
        };
    }
```

다음으로 변경:

```javascript
    function getConfigFromUI() {
        return {
            courts: document.querySelector('#tap-courts').value.trim(),
            day: parseInt(document.querySelector('input[name="tap-day"]:checked')?.value ?? '6'),
            timeGroups: document.querySelector('#tap-times').value.trim(),
            mode: document.querySelector('input[name="tap-mode"]:checked')?.value ?? 'court-first'
        };
    }
```

- [ ] **Step 3: 문법 검증**

Run: `node --check olympicPark.js`
Expected: 오류 출력 없음

- [ ] **Step 4: 커밋**

```bash
git add olympicPark.js
git commit -m "feat: config 저장/로드/UI 읽기에 mode 필드 처리 추가"
```

---

## Task 3: UI에 모드 토글 추가 (`createUI`)

**Files:**
- Modify: `olympicPark.js:125-180` (`createUI` 함수의 `panel.innerHTML`)

- [ ] **Step 1: 패널 본문 최상단(코트 우선순위 위)에 모드 토글 영역 삽입**

`olympicPark.js`에서 `<div id="tap-body" ...>` 직후의 첫 자식 `<div>` 블록(코트 우선순위 영역) 시작 부분을 찾는다. 즉 다음 위치:

```javascript
            <div id="tap-body" style="padding:14px;">
                <div style="margin-bottom:12px;">
                    <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">코트 우선순위</label>
```

이 사이에 모드 영역을 끼워 넣는다. 변경 후:

```javascript
            <div id="tap-body" style="padding:14px;">
                <div style="margin-bottom:12px;">
                    <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:6px;">모드</label>
                    <div id="tap-modes" style="display:flex;gap:4px;">
                        ${[
                            { value: 'court-first', label: '코트 우선' },
                            { value: 'time-first',  label: '시간 우선' }
                        ].map(m => {
                            const checked = config.mode === m.value;
                            return `<label style="flex:1;display:inline-flex;align-items:center;justify-content:center;height:32px;border:2px solid ${checked ? '#3498db' : '#ddd'};border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;background:${checked ? '#3498db' : '#fff'};color:${checked ? '#fff' : '#333'};transition:all 0.15s;">
                                <input type="radio" name="tap-mode" value="${m.value}" ${checked ? 'checked' : ''} style="display:none;">
                                ${m.label}
                            </label>`;
                        }).join('')}
                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">코트 우선순위</label>
```

- [ ] **Step 2: 문법 검증**

Run: `node --check olympicPark.js`
Expected: 오류 출력 없음

- [ ] **Step 3: 수동 검증 — UI 표시**

Tampermonkey에서 스크립트를 저장하고 예약 페이지를 새로고침한다. 우측 상단 패널의 본문 최상단에 "모드" 라벨과 `[코트 우선] [시간 우선]` 두 버튼이 보여야 한다. 저장된 `mode`가 없으면 기본 `[코트 우선]`이 파란색으로 활성화된 상태여야 한다.

- [ ] **Step 4: 커밋**

```bash
git add olympicPark.js
git commit -m "feat: 모드 선택 토글 UI 추가"
```

---

## Task 4: 모드 토글 이벤트 핸들러 추가 (`bindUIEvents`)

**Files:**
- Modify: `olympicPark.js:182-222` (`bindUIEvents` 함수)

- [ ] **Step 1: 요일 라디오 핸들러 직후에 모드 라디오 핸들러 추가**

`olympicPark.js`에서 다음 블록을 찾는다:

```javascript
        // 요일 라디오 버튼 스타일링
        panel.querySelectorAll('input[name="tap-day"]').forEach(radio => {
            radio.addEventListener('change', () => {
                panel.querySelectorAll('#tap-days label').forEach(label => {
                    const r = label.querySelector('input');
                    const on = r.checked;
                    label.style.background = on ? '#3498db' : '#fff';
                    label.style.borderColor = on ? '#3498db' : '#ddd';
                    label.style.color = on ? '#fff' : '#333';
                });
            });
        });
```

이 블록 직후에 다음 블록을 추가한다:

```javascript
        // 모드 라디오 버튼 스타일링
        panel.querySelectorAll('input[name="tap-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                panel.querySelectorAll('#tap-modes label').forEach(label => {
                    const r = label.querySelector('input');
                    const on = r.checked;
                    label.style.background = on ? '#3498db' : '#fff';
                    label.style.borderColor = on ? '#3498db' : '#ddd';
                    label.style.color = on ? '#fff' : '#333';
                });
            });
        });
```

- [ ] **Step 2: 문법 검증**

Run: `node --check olympicPark.js`
Expected: 오류 출력 없음

- [ ] **Step 3: 수동 검증 — 토글 동작**

페이지를 새로고침한다. `[시간 우선]` 버튼을 클릭하면 파란색으로 활성화되고 `[코트 우선]`은 비활성화 스타일로 바뀌어야 한다. `저장` 버튼을 누르고 페이지를 새로고침했을 때 마지막으로 선택한 모드가 유지되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add olympicPark.js
git commit -m "feat: 모드 라디오 스타일 갱신 핸들러 추가"
```

---

## Task 5: `startReservation`을 분기 진입점으로 만들고 기존 본문을 `startCourtFirstFlow`로 이동

**Files:**
- Modify: `olympicPark.js:317-398` (현 `startReservation` 함수)

- [ ] **Step 1: 기존 `startReservation` 함수 시그니처를 `startCourtFirstFlow`로 변경**

`olympicPark.js`에서 다음 줄을 찾는다:

```javascript
    async function startReservation(config) {
```

다음으로 변경:

```javascript
    async function startCourtFirstFlow(config) {
```

함수 본문은 그대로 둔다.

- [ ] **Step 2: 함수 위에 분기 진입점 `startReservation` 추가**

Step 1에서 변경한 `async function startCourtFirstFlow(config) {` 줄 바로 위에 다음을 삽입:

```javascript
    // ─── 예약 진입점 (모드 분기) ─────────────────────
    function startReservation(config) {
        if (config.mode === 'time-first') {
            return startTimeFirstFlow(config);
        }
        return startCourtFirstFlow(config);
    }

```

이 시점에는 `startTimeFirstFlow`가 아직 정의되어 있지 않지만, 함수 호이스팅 대상은 아니어도 호출 시점이 되어서야 평가되므로 다음 태스크에서 정의를 추가하면 정상 동작한다. 단, 토글이 `time-first`로 설정된 상태에서 실행하면 `ReferenceError`가 난다는 점을 인지하고 다음 태스크 전에는 `time-first`로 실행하지 않는다.

- [ ] **Step 3: 문법 검증**

Run: `node --check olympicPark.js`
Expected: 오류 출력 없음

- [ ] **Step 4: 수동 검증 — 코트 우선 모드 회귀 없음 확인**

`코트 우선` 모드로 두고 페이지 새로고침 + 자동 실행이 기존과 동일하게 동작하는지 확인한다. (예: 코트별 탭 클릭, 캘린더 표시, 시간 시도 흐름)

- [ ] **Step 5: 커밋**

```bash
git add olympicPark.js
git commit -m "refactor: startReservation을 모드 분기 진입점으로 변경"
```

---

## Task 6: `uncheckTimeGroup` 헬퍼 추가

**Files:**
- Modify: `olympicPark.js:268-287` (`trySelectTimeGroup` 함수 영역)

- [ ] **Step 1: `trySelectTimeGroup` 함수 직후에 `uncheckTimeGroup` 헬퍼 추가**

`olympicPark.js`에서 다음 함수의 끝을 찾는다:

```javascript
    function trySelectTimeGroup(hours) {
        // ... 기존 본문 ...
        return true;
    }
```

(닫는 `}` 바로 다음 빈 줄에) 다음 함수를 추가:

```javascript
    function uncheckTimeGroup(hours) {
        for (const hour of hours) {
            const index = hour - 5;
            if (index < 1) continue;
            const li = document.querySelector(`#time_con > li:nth-child(${index})`);
            const cb = li?.querySelector('input[type="checkbox"]');
            if (cb && cb.checked) {
                cb.checked = false;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }
```

- [ ] **Step 2: 문법 검증**

Run: `node --check olympicPark.js`
Expected: 오류 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add olympicPark.js
git commit -m "feat: uncheckTimeGroup 헬퍼 추가"
```

---

## Task 7: `startTimeFirstFlow` 신규 구현

**Files:**
- Modify: `olympicPark.js` (`startCourtFirstFlow` 함수 직후, 캡차 섹션 직전)

- [ ] **Step 1: `startCourtFirstFlow` 함수 끝과 `// ─── 캡차 OCR ───` 주석 사이에 `startTimeFirstFlow` 추가**

`olympicPark.js`에서 다음 부분을 찾는다:

```javascript
        setStatus('모든 코트/시간이 마감되었습니다', 'error');
        isRunning = false;
        updateButtons(false);
    }

    // ─── 캡차 OCR ─────────────────────────────────────
```

위 코드 사이(첫 번째 `}`의 다음 빈 줄과 캡차 OCR 주석 사이)에 다음을 삽입한다:

```javascript
    async function startTimeFirstFlow(config) {
        const courts = parseCourts(config.courts);
        const timeGroups = parseTimeGroups(config.timeGroups);
        const targetDay = config.day;

        if (courts.length === 0) { setStatus('코트 번호를 입력해주세요', 'error'); return; }
        if (timeGroups.length === 0) { setStatus('시간을 입력해주세요', 'error'); return; }

        isRunning = true;
        updateButtons(true);
        window.confirm = () => true;
        setStatus('예약 시작...', 'working');

        // [시간별] 탭 클릭
        document.querySelector('#appType01')?.click();

        // 캘린더 대기
        try {
            await waitForElement('#cal > tbody');
        } catch {
            setStatus('캘린더 로딩 실패', 'error');
            isRunning = false;
            updateButtons(false);
            return;
        }
        await randomDelay();

        // 요일에 해당하는 날짜 클릭
        if (!clickTargetDate(targetDay)) {
            setStatus(`${DAY_NAMES[targetDay]}요일 날짜 없음`, 'error');
            isRunning = false;
            updateButtons(false);
            return;
        }

        // 시간 슬롯 대기
        try {
            await waitForElement('#time_con > li');
        } catch {
            setStatus('시간 슬롯 로딩 실패', 'error');
            isRunning = false;
            updateButtons(false);
            return;
        }
        await randomDelay();

        // 시간 그룹 우선순위별 시도
        for (let gi = 0; gi < timeGroups.length; gi++) {
            if (!isRunning) { setStatus('중지됨', 'info'); updateButtons(false); return; }
            const hours = timeGroups[gi];
            const label = hours.length === 1
                ? `${hours[0]}시`
                : `${hours[0]}~${hours[hours.length - 1]}시`;

            setStatus(`${label} 시도중... (${gi + 1}/${timeGroups.length})`, 'working');

            // 시간 선택 시도 — 슬롯 마감이면 다음 그룹
            if (!trySelectTimeGroup(hours)) {
                setStatus(`${label} 마감, 다음 시간 시도...`, 'working');
                continue;
            }

            // 코트 영역 갱신 대기
            await randomDelay();

            // 코트 우선순위별 시도
            let booked = false;
            for (const courtNum of courts) {
                if (!isRunning) { setStatus('중지됨', 'info'); updateButtons(false); return; }
                const a = document.querySelector(`#tennis_court_img_a_1_${courtNum}`);
                if (!a) continue;
                const href = a.getAttribute('href') || '';
                if (href.includes('예약이 완료된 코트입니다')) continue;

                a.click();
                setStatus(`${courtNum}번 코트, ${label} 선택 완료! 캡차 인식중...`, 'working');
                booked = true;
                await randomDelay();
                await solveCaptcha();
                isRunning = false;
                updateButtons(false);
                return;
            }

            if (!booked) {
                // 모든 코트 마감 → 체크 해제 후 다음 시간 그룹
                uncheckTimeGroup(hours);
                await randomDelay();
            }
        }

        setStatus('모든 시간/코트가 마감되었습니다', 'error');
        isRunning = false;
        updateButtons(false);
    }

```

- [ ] **Step 2: 문법 검증**

Run: `node --check olympicPark.js`
Expected: 오류 출력 없음

- [ ] **Step 3: 수동 검증 — 시간 우선 모드 동작**

UI에서 `시간 우선`으로 토글을 바꾸고 `저장` → 페이지 새로고침. 자동 실행이 다음 흐름으로 진행되는지 확인:

1. 시간별 탭(`#appType01`)이 활성화된다.
2. 요일에 해당하는 날짜가 캘린더에서 자동 선택된다.
3. 첫 번째 시간 그룹의 슬롯들이 체크된다.
4. 코트 우선순위 순으로 첫 번째 가용 코트(`href`에 마감 메시지가 없는)가 클릭된다.
5. 캡차 인식이 시작된다.

엣지 케이스:
- 첫 시간 그룹의 슬롯 일부가 마감(`end` 클래스): 두 번째 시간 그룹으로 자동 이동, 콘솔/상태에 마감 메시지 표시
- 첫 시간 그룹은 가용하지만 우선순위 코트가 모두 마감: 다음 시간 그룹으로 넘어가기 전에 체크박스가 모두 해제되는지 확인

- [ ] **Step 4: 커밋**

```bash
git add olympicPark.js
git commit -m "feat: 시간 우선 예약 흐름 startTimeFirstFlow 구현"
```

---

## Task 8: 통합 수동 검증

**Files:**
- (변경 없음, 검증 단계)

- [ ] **Step 1: 코트 우선 모드 회귀 확인**

UI에서 `코트 우선`으로 설정 → 저장 → 새로고침. 자동 실행이 기존 동작과 동일한지 확인한다 (코트별 탭 활성화, 코트→날짜→시간 순서).

- [ ] **Step 2: 시간 우선 모드 정상 흐름 확인**

UI에서 `시간 우선`으로 설정 → 저장 → 새로고침. Task 7 Step 3의 흐름이 모두 동작하는지 재확인한다.

- [ ] **Step 3: localStorage 영속성 확인**

브라우저 개발자 도구 > Application > Local Storage에서 `olympic_tennis_config` 값을 확인한다. JSON에 `"mode":"time-first"` (또는 선택한 값)가 들어있어야 한다.

- [ ] **Step 4: 중지 버튼 동작 확인**

시간 우선 모드 실행 중 `중지` 버튼을 누르면 진행이 즉시 멈추고 상태가 `중지됨`으로 표시되는지 확인한다.

- [ ] **Step 5: 검증 완료 후 정리**

이상 없으면 추가 커밋 없이 종료. 문제가 있다면 디버깅 후 수정 커밋을 별도 추가한다.

---

## 자가 검토 체크리스트 (구현 후)

- [ ] `node --check olympicPark.js` 통과
- [ ] 두 모드 모두 정상 동작
- [ ] localStorage에 `mode` 필드가 저장/복원됨
- [ ] 코트 우선 모드는 기존과 동일하게 동작 (회귀 없음)
- [ ] 시간 우선 모드에서 시간 그룹 → 코트 순서로 시도됨
- [ ] 시간 그룹 마감 시 다음 그룹으로 이동, 체크박스 해제됨
- [ ] 중지 버튼이 두 모드 모두에서 동작