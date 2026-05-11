# 진입 페이지 설정 + sessionStorage 전환 설계

## 배경

`olympicPark.js`는 현재 예약 페이지(`resrvtn_aplictn.do`)에서만 동작하며 설정을 `localStorage`에 저장한다. `localStorage`는 명시적으로 삭제하지 않으면 영구 보존되므로, 다음과 같은 문제가 발생한다:

1. 어제 설정한 값이 오늘까지 남아 스크립트의 새 기본값(`getDefaultConfig`)이 무시된다.
2. 설정 변경은 예약 페이지에서만 가능해서, 진입 페이지(`index.do`)에서 미리 조정해두고 들어갈 수 없다.

## 목표

- 진입 페이지(`index.do`)에서도 설정 패널 표시
- 설정 저장소를 `sessionStorage`로 전환하여 탭을 닫으면 자동 초기화
- 같은 탭 내에서 `index.do` → `resrvtn_aplictn.do` 이동 시 설정 유지
- 예약 페이지에서는 기존과 동일하게 자동 실행

## 사용자 흐름

1. 사용자가 `index.do` 진입 → 우측 상단 패널 표시 (저장 버튼만)
2. 사용자가 모드/코트/요일/시간을 조정하고 "저장" 클릭 → `sessionStorage`에 저장
3. 사이트 메뉴를 통해 예약 페이지(`resrvtn_aplictn.do`)로 이동
4. 같은 탭이므로 `sessionStorage` 유지 → 자동 실행이 그 설정으로 동작
5. 탭 닫으면 `sessionStorage` 자동 클리어 → 다음 진입 시 기본값으로 시작

## 변경 항목

### 1. `@match` 헤더 추가

```
// @match  https://www.ksponco.or.kr/online/tennis/index.do
// @match  https://www.ksponco.or.kr/online/tennis/index.do*
```

기존 `resrvtn_aplictn.do` 두 줄은 유지.

### 2. 저장소 교체

`loadConfig`/`saveConfig`에서 `localStorage` → `sessionStorage`. `STORAGE_KEY`(`'olympic_tennis_config'`)는 그대로.

### 3. 현재 페이지 감지

스크립트 상단(상수 영역)에 추가:

```javascript
const IS_RESERVATION_PAGE = window.location.pathname.includes('resrvtn_aplictn');
```

### 4. UI 분기

`createUI`의 `panel.innerHTML` 안에서 "실행"/"중지" 버튼의 `style`을 페이지별로 분기:

- `IS_RESERVATION_PAGE === true`: 기존 그대로 (실행 표시, 중지 숨김)
- `IS_RESERVATION_PAGE === false`: 실행/중지 모두 `display:none` 으로 고정

`updateButtons(running)`은 예약 페이지에서만 토글 동작하도록 가드:

```javascript
function updateButtons(running) {
    if (!IS_RESERVATION_PAGE) return;
    // 기존 로직
}
```

### 5. 자동 실행 분기

스크립트 끝부분:

```javascript
createUI();
const autoConfig = loadConfig();
if (IS_RESERVATION_PAGE) {
    startReservation(autoConfig);
}
```

## 엣지 케이스

- **`resrvtn_aplictn.do`를 새 탭에서 직접 열기**: `sessionStorage`가 비어있어 `getDefaultConfig()` 값으로 자동 실행. 기존 동작과 동일.
- **페이지 새로고침**: 같은 탭이므로 `sessionStorage` 유지됨. 한 번 설정한 값은 새로고침 후에도 사용 가능.
- **`index.do`에서 페이지 새로고침**: 패널 다시 그려지고 저장된 값이 그대로 표시됨.
- **`index.do`에서 다른 사이트로 이동했다가 돌아옴**: 같은 탭이면 `sessionStorage` 유지.

## 비목표

- localStorage 마이그레이션 (기존 localStorage 값 무시. 사용자가 직접 `index.do`나 `resrvtn_aplictn.do`에서 다시 저장)
- 자동 만료 로직 (sessionStorage가 알아서 처리)
- "실행" 버튼이 예약 페이지로 navigate하는 동작 (이번 범위 외)

## 검증 (수동)

1. `index.do` 진입 → 패널 표시, "실행"/"중지" 버튼 안 보임
2. 설정 변경 + "저장" → DevTools에서 sessionStorage에 값 확인
3. 사이트 메뉴로 `resrvtn_aplictn.do` 이동 → 자동 실행이 설정값 사용
4. 탭 닫고 새 탭에서 `index.do` 다시 열기 → sessionStorage 비어있음 → 기본값 표시
5. `resrvtn_aplictn.do`를 새 탭으로 직접 열기 → 기본값으로 자동 실행
