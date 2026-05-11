# 카트 검증 시점 이동 구현 계획

**Goal:** 카트 검증을 `#date_confirm` 클릭 후로 옮기고, 불일치 시 카트 삭제 + 시간 재체크 + 다음 코트로 진행.

**Spec:** `docs/superpowers/specs/2026-05-11-cart-verification-after-date-confirm-design.md`

---

## Task 1: `waitForCartPopulation` 헬퍼 추가

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`

- [ ] **Step 1: `uncheckTimeGroup` 함수 직후에 새 헬퍼 추가**

`olympicPark.js`에서 `uncheckTimeGroup` 함수의 닫는 `}` 다음 빈 줄에 다음을 추가:

```javascript
    async function waitForCartPopulation() {
        while (isRunning) {
            const items = document.querySelectorAll('#aplictn_info ul.list_info > li');
            if (items.length > 0) return;
            await delay(300);
        }
    }
```

- [ ] **Step 2: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "feat: waitForCartPopulation 헬퍼 추가"
```

---

## Task 2: `startTimeFirstFlow` 코트 루프 재작성

**Files:**
- Modify: `/Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js` (`startTimeFirstFlow` 함수의 코트 루프)

- [ ] **Step 1: 기존 블록 찾기**

`startTimeFirstFlow` 내부에 다음 블록이 있다 (코트 루프 + 마감 시 정리):

```javascript
            // 코트 우선순위별 시도
            let booked = false;
            for (const courtNum of courts) {
                if (!isRunning) { setStatus('중지됨', 'info'); updateButtons(false); return; }
                const a = document.querySelector(`#tennis_court_img_a_1_${courtNum}`);
                if (!a) continue;
                const href = a.getAttribute('href') || '';
                if (href.includes('예약이 완료된 코트입니다')) continue;

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
            }

            if (!booked) {
                // 모든 코트 마감 → 체크 해제 후 다음 시간 그룹
                uncheckTimeGroup(hours);
                await randomDelay();
            }
```

- [ ] **Step 2: 다음 블록으로 교체**

```javascript
            // 코트 우선순위별 시도
            let timeExhausted = false;
            for (const courtNum of courts) {
                if (!isRunning) { setStatus('중지됨', 'info'); updateButtons(false); return; }
                const a = document.querySelector(`#tennis_court_img_a_1_${courtNum}`);
                if (!a) continue;
                const href = a.getAttribute('href') || '';
                if (href.includes('예약이 완료된 코트입니다')) continue;

                a.click();
                await randomDelay();

                setStatus(`${courtNum}번 코트, ${label} 캡차 인식중...`, 'working');
                await solveCaptcha();
                if (!isRunning) { setStatus('중지됨', 'info'); updateButtons(false); return; }

                // 사용자가 #date_confirm 누르면 카트 채워짐
                setStatus(`${courtNum}번 코트 OCR 완료 — 확인 버튼 클릭하면 카트 검증`, 'working');
                document.querySelector('#date_confirm')?.focus();
                await waitForCartPopulation();
                if (!isRunning) { setStatus('중지됨', 'info'); updateButtons(false); return; }

                const cartItems = document.querySelectorAll('#aplictn_info ul.list_info > li');
                if (cartItems.length === hours.length) {
                    setStatus(`${courtNum}번 코트, ${label} 예약 가능! 바로결제 버튼 누르세요`, 'success');
                    const payBtn = document.querySelector('#direct_payment');
                    if (payBtn) {
                        payBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        payBtn.focus();
                    }
                    isRunning = false;
                    updateButtons(false);
                    return;
                }

                // 불일치 — 카트 삭제 후 시간 재체크
                setStatus(`${courtNum}번 코트 사이트 버그(${cartItems.length}/${hours.length}시간만 잡힘), 다음 코트 시도`, 'working');
                for (const item of cartItems) {
                    item.querySelector('a.delete')?.click();
                    await randomDelay();
                }

                // 사이트가 시간 선택을 초기화하므로 다시 체크
                if (!trySelectTimeGroup(hours)) {
                    setStatus(`${label} 마감, 다음 시간 시도...`, 'working');
                    timeExhausted = true;
                    break;
                }
                await randomDelay();
            }

            if (timeExhausted) continue;

            // 모든 코트 시도했지만 검증 통과한 코트 없음 → 체크 해제 후 다음 시간 그룹
            uncheckTimeGroup(hours);
            await randomDelay();
```

주요 변경:
- `let booked = false` → `let timeExhausted = false`로 변경 (의미 다름)
- 카트 검증 시점을 `a.click()` 직후 → `solveCaptcha()` + `waitForCartPopulation()` 이후로 이동
- 검증 통과 시 `#direct_payment` 포커스 후 종료 (기존엔 검증 없이 바로 솔브캡차 후 종료)
- 불일치 시 카트 삭제 + `trySelectTimeGroup` 재실행
- `if (!booked)` → `if (timeExhausted) continue` 후 무조건 `uncheckTimeGroup`

- [ ] **Step 3: 문법 검증**

Run: `node --check /Users/kakao/Documents/Intellij_workspace/monkey-auto-click/olympicPark.js`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
cd /Users/kakao/Documents/Intellij_workspace/monkey-auto-click
git add olympicPark.js
git commit -m "fix: 카트 검증을 #date_confirm 클릭 후로 옮기고 실패 시 시간 재체크"
```
