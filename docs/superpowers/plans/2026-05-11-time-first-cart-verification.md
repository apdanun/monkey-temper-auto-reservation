# 시간 우선 모드 카트 검증 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 시간 우선 모드에서 코트 클릭 후 카트 항목 수가 시간 그룹 길이와 다르면 자동 정리 후 다음 코트로 넘어가도록 한다.

**Architecture:** `startTimeFirstFlow`의 코트 루프 한 분기 인라인 수정.

**Tech Stack:** Vanilla JS (Tampermonkey userscript).

**Spec:** `docs/superpowers/specs/2026-05-11-time-first-cart-verification-design.md`

---

## Task 1: `startTimeFirstFlow` 코트 루프에 카트 검증 추가

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js` (`startTimeFirstFlow` 함수 안, 코트 루프 분기)

- [ ] **Step 1: 기존 분기 찾기**

`olympicPark.js`에서 `startTimeFirstFlow` 내부의 다음 블록을 찾는다 (코트 클릭 ~ 캡차 진입 부분):

```javascript
                a.click();
                setStatus(`${courtNum}번 코트, ${label} 선택 완료! 캡차 인식중...`, 'working');
                booked = true;
                await randomDelay();
                await solveCaptcha();
                isRunning = false;
                updateButtons(false);
                return;
```

- [ ] **Step 2: 분기 교체**

위 블록을 다음으로 교체:

```javascript
                a.click();
                await randomDelay();

                // 사이트 버그 검증: 시간 그룹 개수와 카트 항목 수가 일치해야 함
                const cartItems = document.querySelectorAll('#aplictn_info ul.list_info > li');
                if (cartItems.length !== hours.length) {
                    setStatus(`${courtNum}번 코트 사이트 버그(${cartItems.length}/${hours.length}시간만 잡힘), 삭제 후 다음 코트`, 'working');
                    for (const item of cartItems) {
                        item.querySelector('a.delete')?.click();
                        await randomDelay();
                    }
                    continue;
                }

                setStatus(`${courtNum}번 코트, ${label} 선택 완료! 캡차 인식중...`, 'working');
                booked = true;
                await solveCaptcha();
                isRunning = false;
                updateButtons(false);
                return;
```

변경 사항:
- `a.click()` 직후에 `await randomDelay()` 추가 (카트 갱신 대기). 기존에 캡차 직전에 있던 `randomDelay`를 여기로 이동.
- 카트 항목 수 검증 분기 추가.
- 정상이면 캡차 호출 직전에 별도 `randomDelay`가 더 이상 필요 없음 (이미 위에서 대기했음).

- [ ] **Step 3: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 4: 수동 검증 (사용자가 진행)**

- 시간 우선 모드 + 2시간 그룹 + 버그 발생 코트에서 카트가 자동으로 비워지고 다음 코트로 진행되는지
- 정상 코트에서는 기존과 동일하게 캡차 진입하는지

- [ ] **Step 5: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "fix: 시간 우선 모드 카트 항목 수 검증 후 불일치 시 다음 코트로"
```
