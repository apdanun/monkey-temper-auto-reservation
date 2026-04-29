---
name: monkey-auto-click
description: 테니스장 예약 페이지에서 자동으로 코트/시간을 선점하는 Tampermonkey userscript 모음. 메인은 올림픽공원(`olympicPark.js`), 보조로 서울시 공공예약 장충(`seoulPublicJangchung.js`).
---

# monkey-auto-click

Tampermonkey 환경에서 동작하는 단일 파일 userscript들. 빌드/번들/테스트 도구 없음. 파일을 Tampermonkey에 붙여넣어 사용.

## 파일 구조

```
.
├── olympicPark.js              # 메인: 올림픽공원 테니스장 예약 자동화
├── seoulPublicJangchung.js     # 보조: 서울시 공공 예약(장충) — 단순 체크박스 자동 클릭
├── README.md
└── docs/superpowers/           # spec/plan 문서들
    ├── specs/
    └── plans/
```

대상 사이트:
- 올림픽공원: `https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do`
- 장충: `https://yeyak.seoul.go.kr/web/reservation/insertFormReserve.do`

## olympicPark.js — 핵심 동작

### 사용자 흐름

1. 페이지 로드 시 우측 상단에 설정 패널이 자동 생성되고, 저장된 설정으로 즉시 자동 실행 (`startReservation(autoConfig)` at IIFE 끝).
2. 사용자는 패널에서 모드/코트/요일/시간을 조정하고 **저장** 또는 **실행** 버튼 사용. 실행 중에는 **중지** 버튼이 노출됨.
3. 가용한 코트/시간을 찾으면 캡차 OCR(Tesseract.js) → 캡차 입력 → "바로결제" 버튼 포커스까지 자동.

### 설정 (`config`)

```js
{
    courts: '5,7,6,8',          // 코트 우선순위 (쉼표 구분, 2~19번)
    day: 5,                      // 0=일 ~ 6=토 (오늘 기준 6일 뒤가 디폴트)
    timeGroups: '18-20, 19-21', // "시작-종료" 그룹 우선순위. 18-20 → [18,19]
    mode: 'time-first'           // 'court-first' | 'time-first'
}
```

`localStorage`(`olympic_tennis_config`)에 저장. `loadConfig()`는:
- `day`, `timeGroups`는 항상 오늘 기준으로 재계산 (저장값 무시)
- `mode`는 저장값 유지 (allowlist 검증, 둘 다 아니면 기본값으로 폴백)

`getDefaultConfig()`는 오늘 요일에 따라 timeGroups를 자동 결정:
- 주말(토/일): 오후 1~6시 (2시간 단위 그룹)
- 금요일: 6~10시
- 월~목: 18~21시

기본 모드는 현재 `'time-first'` (line 38). 원래 `'court-first'`였고 line 37에 주석으로 남아있음.

### 두 가지 예약 모드

`startReservation(config)`는 분기 진입점:

```js
function startReservation(config) {
    if (config.mode === 'time-first') return startTimeFirstFlow(config);
    return startCourtFirstFlow(config);
}
```

#### 코트 우선 (`startCourtFirstFlow`)

`#appType02`(코트별) 탭 사용. 코트별로:
1. `#tennis_court_img_a_1_${n}` 클릭
2. 캘린더(`#cal > tbody`)에서 요일 기반 날짜 클릭
3. 시간 슬롯(`#time_con > li`)에서 시간 그룹 우선순위로 시도
4. 모든 시간 마감이면 다음 코트로

#### 시간 우선 (`startTimeFirstFlow`)

`#appType01`(시간별) 탭 사용. 한 번 날짜를 고른 뒤 시간 그룹별로:
1. `trySelectTimeGroup(hours)`로 시간 슬롯 체크
2. 가용한 코트들을 코트 우선순위로 시도 — 마감 코트는 `<a>`의 `href`에 `"예약이 완료된 코트입니다"` 문자열이 들어 있어 그것으로 판별
3. 모든 코트 마감이면 `uncheckTimeGroup(hours)`로 체크 해제 후 다음 시간 그룹

### 주요 DOM Selector (자주 바뀔 수 있는 부분)

| 용도 | Selector |
|---|---|
| 코트별 탭 | `#appType02` |
| 시간별 탭 | `#appType01` |
| 캘린더 | `#cal > tbody > tr > td:nth-child(N)` (N=요일+1, 일=1 … 토=7) |
| 코트 이미지/링크 | `#tennis_court_img_a_1_${courtNum}` |
| 시간 슬롯 리스트 | `#time_con > li:nth-child(index)` (index = hour - 5; 6시=1, 7시=2, …) |
| 마감된 시간 슬롯 표식 | `<li>`에 `end` 클래스 |
| 마감된 코트 표식 (시간별 탭) | `<a>`의 `href`에 `"예약이 완료된 코트입니다"` 포함 |
| 캡차 이미지 | `.captchaImg_wrap img` |
| 캡차 입력 | `#captcha` |
| 결제 버튼 | `#direct_payment` |

### 캡차 처리

- Tesseract.js로 OCR. 흑백 이진화 전처리(threshold 128) 후 숫자 4자리만 인식.
- 실패 시 `.captchaImg_wrap input[type="button"]` 또는 전역 `fn_tennis_captcha()`로 새로고침 후 최대 5회 재시도.
- 자동 입력만 하고 결제 버튼은 클릭하지 않음 — 포커스만 주고 사용자가 최종 확인.

### UI 상태 관리

| 변수/요소 | 역할 |
|---|---|
| `isRunning` (모듈 스코프) | 실행 중 플래그. 중지 버튼이 false로 설정 |
| `updateButtons(running)` | 실행/중지 버튼 토글 |
| `setStatus(msg, type)` | `#tap-status` 메시지 갱신. type: info/success/error/working |

각 분기 종료 시점에 `isRunning = false; updateButtons(false);`를 정리해야 UI 잠김 방지.

### 알려진 사전 버그

`startCourtFirstFlow`에서 첫 코트 이미지 로딩 실패 시(`waitForElement('#tennis_court_img_a_1_${courts[0]}')`) catch 블록이 `isRunning`/`updateButtons` 정리 없이 `return`만 함 → UI가 "실행 중" 상태로 잠김. 별도 후속 작업으로 수정 권장.

## 개발 워크플로

이 레포는 `docs/superpowers/specs/`와 `docs/superpowers/plans/`에 spec/plan 문서를 두는 superpowers 컨벤션을 사용. 새 기능 추가 시:

1. `superpowers:brainstorming`으로 spec 작성 → `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
2. `superpowers:writing-plans`로 단계별 plan 작성 → `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
3. `superpowers:subagent-driven-development` 또는 `executing-plans`로 구현
4. 빌드/테스트 인프라 없음 → 검증은 `node --check olympicPark.js`(문법) + 브라우저 수동 테스트

작은 변경은 직접 편집해도 OK. main 브랜치에 직행하는 개인 프로젝트.

### 디버깅 팁

- 패널 자체가 안 보이면: 페이지 자동 실행 중 에러로 `createUI()` 도달 못 한 가능성. 콘솔 확인.
- 자동 실행이 원치 않으면 IIFE 끝의 `startReservation(autoConfig);` 라인을 임시 주석.
- selector 변동 의심: DevTools에서 `#appType01`, `#tennis_court_img_a_1_5`, `#time_con > li` 직접 확인.
- 캡차 OCR 정확도가 낮으면 전처리 threshold(`gray < 128`)나 whitelist 조정.

## seoulPublicJangchung.js

장충 예약 페이지에서 특정 체크박스를 자동 클릭하는 단순 스크립트. `olympicPark.js`와 코드 공유 없음 — 별도 사이트, 별도 흐름.
