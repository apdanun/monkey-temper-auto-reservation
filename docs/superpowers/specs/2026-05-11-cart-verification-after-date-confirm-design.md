# 카트 검증 시점 이동 (date_confirm 클릭 이후) 설계

## 배경

지난 카트 검증 로직은 `a.click()` 직후에 카트 항목 수를 확인했는데, 실제 사이트 동작은 다음과 같다:

1. 코트 클릭 → 캡차만 뜨고 `#aplictn_info`는 비어있음
2. OCR 입력 후 사용자가 `#date_confirm` (확인 버튼) 클릭 → 그제서야 카트 채워짐
3. 그 다음 사용자가 `#direct_payment` (바로결제) 클릭 → 최종 결제

즉 검증 시점이 잘못되어 항상 `cartItems.length = 0`으로 잡혀 불일치 처리되고, 삭제 로직이 동작하면서 사이트가 시간 선택까지 초기화하는 부작용이 발생.

## 목표

- 카트 검증을 `#date_confirm` 클릭 후로 옮긴다.
- 검증 통과 시 사용자에게 `#direct_payment` 포커스로 안내.
- 검증 실패 시 카트 삭제 + 시간 슬롯 재체크 + 다음 코트 시도.
- 시간 재체크 실패 시 다음 시간 그룹으로.

## 흐름 변경 (시간 우선 모드)

```
for (courtNum of courts):
    1. href에 '예약이 완료된 코트입니다' 포함 → 다음 코트
    2. a.click()
    3. randomDelay
    4. setStatus(`${courtNum}번 코트, ${label} 캡차 인식중...`)
    5. await solveCaptcha()           // OCR 자동 입력
    6. isRunning 체크
    7. setStatus(`OCR 완료 — 확인 버튼 클릭하면 카트 검증`)
       focus #date_confirm
    8. await waitForCartPopulation()  // 사용자가 확인 누르면 카트 채워짐
    9. isRunning 체크
   10. cartItems.length === hours.length?
       YES:
         - setStatus(`${courtNum}번 코트, ${label} 예약 가능! 바로결제 누르세요`, 'success')
         - focus #direct_payment, 종료(return)
       NO:
         - setStatus(`${courtNum}번 코트 사이트 버그(${cartItems.length}/${hours.length}시간만 잡힘), 다음 코트 시도`)
         - 각 .delete 클릭 + randomDelay
         - trySelectTimeGroup(hours) 재실행
           - 성공: continue (다음 코트)
           - 실패: setStatus(`${label} 마감, 다음 시간 시도`), timeExhausted=true, break

if (timeExhausted) continue (outer)
모든 코트 실패: uncheckTimeGroup(hours) → 다음 시간 그룹
```

## 새 헬퍼: `waitForCartPopulation`

```javascript
async function waitForCartPopulation() {
    while (isRunning) {
        const items = document.querySelectorAll('#aplictn_info ul.list_info > li');
        if (items.length > 0) return;
        await delay(300);
    }
}
```

300ms 폴링 (DOM 변경 빈도 대비 충분히 빠르고 가벼움). `isRunning`이 false면 즉시 빠져나옴.

## 변경 외 유지

- `solveCaptcha`는 그대로. 내부에서 `#direct_payment`를 잠시 포커스하지만 직후 `startTimeFirstFlow`가 `#date_confirm`으로 재포커스하므로 사용자에게는 `#date_confirm`이 보임.
- `startCourtFirstFlow` 변경 없음.
- `uncheckTimeGroup`, `trySelectTimeGroup` 변경 없음.

## 엣지 케이스

- 사용자가 `#date_confirm`을 누르지 않음: `waitForCartPopulation`이 무한 대기. 중지 버튼으로 종료 가능.
- `#date_confirm` 클릭 후 카트가 0개: 불일치 분기로 진입. 삭제 루프 0회, 시간 재체크 진행. 다음 코트 시도.
- `trySelectTimeGroup` 재체크 시 일부 슬롯 마감: 시간 마감 처리.
- 사용자가 `#direct_payment`를 `#date_confirm`보다 먼저 누름: 비정상 경로. 스크립트는 그 상태를 모르므로 계속 대기. 사용자가 알아서 처리.

## 검증 (수동)

1. 시간 우선 모드에서 정상 2시간 그룹이 가능한 코트가 있을 때, 코트 클릭 후 OCR 자동 입력 → 사용자가 확인 클릭 → 카트에 정상 2개 항목 → 바로결제 버튼 포커스되는지
2. 사이트 버그로 1시간만 잡힌 경우, 확인 클릭 후 자동으로 삭제되고 다음 코트로 진행되는지
3. 다음 코트 시도 전에 시간 슬롯이 자동으로 다시 체크되는지
4. 중지 버튼으로 대기 중인 상태를 빠져나갈 수 있는지
