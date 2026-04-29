# 시간 우선 예약 모드 추가 설계

## 배경

현재 `olympicPark.js`의 자동 예약은 `[코트별]` 탭(`#appType02`)을 기준으로 동작한다. 코트 우선순위 순서대로 코트를 선택한 뒤, 각 코트에서 시간 그룹 우선순위로 가능한 슬롯을 시도하는 흐름이다.

이 흐름은 "특정 코트를 잡고 싶을 때"에는 적합하지만, "특정 시간대를 잡고 싶을 때"에는 비효율적이다. 원하는 시간이 코트 1번에서 마감이라도 코트 2~N번을 모두 한 번씩 들어가서 같은 시간을 다시 시도하기 때문에 사용자가 원하지 않는 시간이 다른 코트에서 잡힐 가능성이 있다.

이를 개선하기 위해 `[시간별]` 탭(`#appType01`)을 활용하는 새로운 모드를 추가한다. 사용자는 두 모드 중 어떤 우선순위를 사용할지 UI에서 선택할 수 있다.

## 목표

- 시간 우선 모드 신규 추가: 시간 그룹 → 코트 순서로 시도
- 기존 코트 우선 모드는 그대로 유지 (기본값)
- UI에서 두 모드 중 하나를 선택 가능
- 선택한 모드는 `localStorage`에 저장되어 다음 실행 시 유지

## 비목표

- 코트/요일/시간 그룹 입력 형식 변경 없음
- 캡차 OCR 로직 변경 없음
- 페이지 자동 실행(`startReservation(autoConfig)`) 동작 변경 없음 (단, 저장된 모드에 따라 분기)

## 설정 모델

`config` 객체에 `mode` 필드 추가:

| 값 | 의미 |
|---|---|
| `'court-first'` | 기존 동작 (기본값) |
| `'time-first'` | 신규 시간 우선 동작 |

### 저장/로드

- `loadConfig()`는 저장된 `mode`를 읽어오고, 없으면 `'court-first'`로 폴백
- `saveConfig(config)`는 `mode`를 함께 저장
- `getConfigFromUI()`는 라디오 버튼에서 현재 선택된 모드를 읽어옴

기존 사용자가 처음 신규 버전을 실행해도 `mode` 키가 없을 뿐이므로 자연스럽게 `'court-first'`로 동작한다.

## UI 변경

### 위치

`코트 우선순위` 입력 필드 위, 패널 본문 최상단에 모드 선택 영역 추가.

### 형태

요일 라디오와 동일한 토글 스타일. 두 개의 버튼이 좌우로 배치된다.

```
모드   [코트 우선]  [시간 우선]
```

선택된 버튼은 파란색 배경(`#3498db`), 흰 글씨. 비선택 버튼은 흰 배경, 회색 테두리. 클릭 시 스타일이 즉시 갱신된다.

### 이벤트

- `change` 이벤트로 라디오 스타일 갱신 (요일 라디오와 동일 패턴)
- `저장` 버튼 클릭 시 모드도 같이 저장
- `실행` 버튼 클릭 시 모드를 포함한 config로 분기 실행

## 예약 로직 분기

`startReservation(config)`을 진입점으로 두고, 모드에 따라 분기한다.

```
startReservation(config)
├─ if config.mode === 'time-first'  → startTimeFirstFlow(config)
└─ else                             → startCourtFirstFlow(config)   // 기존 로직 그대로
```

기존 `startReservation` 본문은 `startCourtFirstFlow`로 이름만 바꿔서 그대로 사용한다. 검증된 로직을 건드리지 않는다.

공통 유틸은 양쪽에서 재사용:
- `clickTargetDate(targetDay)`
- `trySelectTimeGroup(hours)` (체크 동작)
- `waitForTimeSlotsChange()`
- `solveCaptcha()`
- `setStatus`, `randomDelay`, `waitForElement` 등

## `startTimeFirstFlow` 흐름

```
1. setStatus('예약 시작...', 'working')
2. window.confirm = () => true
3. #appType01 클릭 (시간별 탭)
4. waitForElement('#cal > tbody')
5. clickTargetDate(targetDay)
   → 실패 시 에러 종료
6. waitForElement('#time_con > li')
7. for (const hours of timeGroups):
     a. isRunning 체크 (중지 시 즉시 종료)
     b. trySelectTimeGroup(hours)
        → false면 다음 그룹으로
        → true면 코트 영역 갱신 대기 (randomDelay)
          ※ `waitForTimeSlotsChange`는 `#time_con`을 관찰하므로
            코트 영역 변화를 감지하지 못한다. 짧은 randomDelay로 처리하고,
            안정성에 문제가 있으면 코트 영역(`#tennis_court_img_a_1_*`의 부모)을
            관찰하는 헬퍼를 추가하는 것을 후속 과제로 둔다.
     c. for (const courtNum of courts):
          - a 태그 조회: #tennis_court_img_a_1_${courtNum}
          - href에 '예약이 완료된 코트입니다' 포함되면 skip
          - 클릭 → 캡차 처리 → 종료(return)
     d. 모든 코트 마감이면:
          - 현재 시간 그룹의 체크박스를 모두 해제 (uncheckTimeGroup)
          - 다음 그룹으로 넘어가기 전에 짧은 대기
8. 모든 시간 그룹 실패 → '모든 시간/코트가 마감되었습니다' 에러
```

### 신규 헬퍼 `uncheckTimeGroup(hours)`

`trySelectTimeGroup`의 반대 동작. 주어진 시간 배열에 대해 체크박스를 해제하고 `change` 이벤트를 디스패치한다.

```js
function uncheckTimeGroup(hours) {
    for (const hour of hours) {
        const index = hour - 5;
        const li = document.querySelector(`#time_con > li:nth-child(${index})`);
        const cb = li?.querySelector('input[type="checkbox"]');
        if (cb && cb.checked) {
            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}
```

### 코트 가용성 판단

시간별 탭에서 마감된 코트는 `a` 태그의 `href`가 다음과 같이 설정된다:

```html
<a href="javascript:alert(&quot;예약이 완료된 코트입니다.&quot;)" id="tennis_court_img_a_1_5">
```

따라서 클릭 가능 여부는 다음으로 판단:

```js
const a = document.querySelector(`#tennis_court_img_a_1_${courtNum}`);
if (!a) continue;
const href = a.getAttribute('href') || '';
if (href.includes('예약이 완료된 코트입니다')) continue;
a.click();
```

가용 코트의 `href`는 별도 함수 호출(예: `javascript:fn_xxx(...)`)이므로 위 문자열 매칭으로 충분히 판별된다.

## 상태 메시지

`startTimeFirstFlow` 실행 중 표시되는 메시지:

| 단계 | 메시지 |
|---|---|
| 진입 | `예약 시작...` |
| 시간 그룹 시도 중 | `${시간라벨} 시도중... (i/n)` |
| 시간 그룹 마감 | `${시간라벨} 마감, 다음 시간 시도...` |
| 코트 선택 성공 | `${courtNum}번 코트, ${시간라벨} 선택 완료! 캡차 인식중...` |
| 모두 마감 | `모든 시간/코트가 마감되었습니다` |
| 중지 | `중지됨` |

`시간라벨`은 기존 `hours.length === 1 ? '${h}시' : '${h0}~${hN}시'` 포맷 재사용.

## 에러/경계 케이스

- **요일에 해당하는 날짜 없음**: 기존과 동일하게 에러 종료
- **시간 슬롯이 아직 로드되지 않음**: `waitForElement('#time_con > li')` 타임아웃 시 에러 종료
- **모든 시간 그룹 첫 슬롯이 `end` 클래스**: 자연스럽게 모든 그룹이 false 반환 → 마지막에 "모든 시간/코트가 마감" 메시지
- **시간 그룹 일부만 가용 (예: 18시는 가용, 19시는 마감)**: `trySelectTimeGroup`이 false 반환 (기존 동작 그대로)
- **중지 버튼 클릭**: 각 시간 그룹 루프 진입부에서 `isRunning` 체크하여 즉시 탈출

## 테스트/검증 계획

자동화 테스트 환경이 없으므로 실제 사이트에서 다음을 수동 검증한다:

1. 모드 토글 UI가 `localStorage`에 정상 저장/복원되는지
2. 코트 우선 모드(기본값)가 기존과 동일하게 동작하는지 (회귀 없음)
3. 시간 우선 모드에서 다음 케이스가 의도대로 동작하는지:
   - 첫 시간 그룹 + 첫 코트가 가용 → 즉시 예약
   - 첫 시간 그룹은 가용, 첫 코트만 마감 → 두 번째 코트로 진행
   - 첫 시간 그룹의 일부 슬롯이 마감 → 두 번째 시간 그룹으로 진행 (체크 해제 확인)
   - 모든 시간/코트 마감 → 에러 메시지

## 변경 파일

- `olympicPark.js` 단일 파일 수정
  - `getDefaultConfig`, `loadConfig`, `saveConfig`, `getConfigFromUI`에 `mode` 필드 추가
  - `createUI`에 모드 토글 영역 추가
  - `bindUIEvents`에 모드 라디오 스타일 핸들러 추가
  - `startReservation`을 분기 진입점으로 만들고, 기존 본문을 `startCourtFirstFlow`로 이동
  - `startTimeFirstFlow`, `uncheckTimeGroup` 신규 추가

스펙상 외부 의존성 추가는 없다.