# 시간 우선 모드 카트 검증 설계

## 배경

올림픽공원 테니스장 시간별 예약 탭에 사이트 측 버그가 있다. 사용자가 2시간 시간 그룹(예: 7-9 → 7시·8시 두 슬롯 체크)을 선택한 뒤 코트를 클릭하면, 가끔 한 시간 슬롯만 카트에 들어가는 경우가 있다. 자동화 스크립트는 매번 같은 마감 임박 코트를 다시 잡게 되어 문제가 반복 재현된다.

## 목표

- `startTimeFirstFlow`에서 코트 클릭 직후 카트 상태를 검증
- 카트 항목 수와 사용자가 선택한 시간 개수가 다르면 그 코트를 버리고 다음 코트로 진행
- 카트는 사이트의 정식 삭제 함수(`fn_tennis_basket_del`)를 호출하도록 `<a class="delete">` 클릭으로 정리

## 사이트 DOM 참고

```html
<div id="aplictn_info" class="con_area">
    <ul class="list_info">
        <li>
            <a href="javascript:fn_tennis_basket_del('73', '18')" class="delete">삭제</a>
            2026.05.17 (일) / 18번 / 07:00 ~ 08:00 / ...
        </li>
        <input type="hidden" id="tennis_basket_list1" name="tennis_basket_list" value="73">
    </ul>
    <div class="txt_total">합계: <strong>15,000원</strong></div>
</div>
```

정상이면 시간 개수만큼 `<li>` 항목이 생성된다.

## 흐름 변경

`startTimeFirstFlow`의 코트 루프 안, `a.click()` 직후 (현재 캡차 진입 전):

```
a.click();
await randomDelay();              // 카트 갱신 대기

const items = document.querySelectorAll('#aplictn_info ul.list_info > li');
if (items.length !== hours.length) {
    setStatus(`${courtNum}번 코트 사이트 버그(${items.length}/${hours.length}시간만 잡힘), 삭제 후 다음 코트`, 'working');
    for (const item of items) {
        item.querySelector('a.delete')?.click();
        await randomDelay();
    }
    continue;                     // 다음 코트로
}

// 정상 — 기존 캡차 흐름
setStatus(`${courtNum}번 코트, ${label} 선택 완료! 캡차 인식중...`, 'working');
booked = true;
await solveCaptcha();
isRunning = false;
updateButtons(false);
return;
```

## 엣지 케이스

- `items.length === 0` (클릭 자체 무반응): 분기에 자연스럽게 포함, 삭제 루프는 0회 돈다.
- `<a class="delete">` 누락된 `<li>`: optional chaining(`?.click()`)으로 안전 통과.
- `hours.length === 1`이고 카트에 1개: 정상.
- 시간 그룹과 카트 개수가 우연히 일치하지만 잘못된 시간이 들어간 경우: 본 검증 범위 밖. (현 사이트 버그 패턴상 개수 불일치만 보고됨.)

## 검증 (수동)

- 시간 우선 모드에서 2시간 그룹을 선택하고, 버그가 발생한 코트가 잡히면 자동으로 삭제되고 다음 코트로 넘어가는지
- 정상 코트에서는 기존처럼 캡차 진입하는지

## 변경 범위

- `olympicPark.js`의 `startTimeFirstFlow` 한 분기만 수정. 신규 헬퍼 없음.
