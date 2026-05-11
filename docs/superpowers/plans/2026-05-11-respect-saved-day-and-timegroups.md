# 저장된 day/timeGroups 존중 구현 계획

**Goal:** `loadConfig`에서 저장된 `day`/`timeGroups`를 defaults로 덮어쓰지 않도록 두 줄 제거.

**Spec:** `docs/superpowers/specs/2026-05-11-respect-saved-day-and-timegroups-design.md`

---

## Task 1: `loadConfig`에서 day/timeGroups 덮어쓰기 제거

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js` (`loadConfig` 함수)

- [ ] **Step 1: 두 줄 + 주석 제거**

`olympicPark.js`에서 다음 부분을 찾는다:

```javascript
    function loadConfig() {
        const defaults = getDefaultConfig();
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
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

다음으로 변경 (주석 한 줄 + 코드 두 줄 제거):

```javascript
    function loadConfig() {
        const defaults = getDefaultConfig();
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) {
                const config = JSON.parse(saved);
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

- [ ] **Step 2: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "fix: 저장된 day/timeGroups를 defaults로 덮어쓰지 않도록 변경"
```
