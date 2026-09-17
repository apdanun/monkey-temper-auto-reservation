// ==UserScript==
// @name         올림픽공원 테니스장 자동예약 (cluade)
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  코트/요일/시간 설정 UI + 다중 코트 우선순위 자동예약 (2026 개편 사이트 대응)
// @author       You
// @match        https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do
// @match        https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do*
// @match        https://www.ksponco.or.kr/online/tennis/index.do
// @match        https://www.ksponco.or.kr/online/tennis/index.do*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    // ─── 상수 ───────────────────────────────────────
    const STORAGE_KEY = 'olympic_tennis_config';
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
    const IS_RESERVATION_PAGE = window.location.pathname.includes('resrvtn_aplictn');
    let isRunning = false;
    // 오늘 요일 기준으로 예약 대상 요일 & 시간 우선순위 자동 결정
    // 예약은 6일 뒤 대상: 금→목, 토→금, 일→토, ...
    function getDefaultConfig() {
        const today = new Date().getDay(); // 0=일, 1=월, ..., 6=토
        const targetDay = (today + 6) % 7;

        let timeGroups;
        if (targetDay === 0 || targetDay === 6) {
            // 주말 (토/일): 오후 1~6시 (2시간 단위)
            // timeGroups = '8-10, 6-8';
            timeGroups = '1-3, 2-4, 3-5, 4-6';
        } else if (targetDay === 5) {
            // 금요일: 6~10시, 8~10시 우선
            timeGroups = '7-9, 8-10, 6-8';
        } else {
            // 월~목: 18~21시
            timeGroups = '18-20, 19-21';
        }
        // return { courts: '5,7,6,8', day: targetDay, timeGroups, mode: 'court-first' };
        return { courts: '5,7,6,8', day: targetDay, timeGroups, mode: 'time-first' };
    }

    // ─── 설정 저장/로드 ──────────────────────────────
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

    function saveConfig(config) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }

    function getConfigFromUI() {
        return {
            courts: document.querySelector('#tap-courts').value.trim(),
            day: parseInt(document.querySelector('input[name="tap-day"]:checked')?.value ?? '6'),
            timeGroups: document.querySelector('#tap-times').value.trim(),
            mode: document.querySelector('input[name="tap-mode"]:checked')?.value ?? 'court-first'
        };
    }

    // ─── 파싱 ────────────────────────────────────────
    function parseCourts(str) {
        // 1번 코트는 의도적으로 제외한다 (사이트 도면에는 존재하지만 예약 대상에서 뺀 코트).
        return str.split(',').map(s => parseInt(s.trim())).filter(n => n >= 2 && n <= 19);
    }

    function parseTimeGroups(str) {
        return str.split(',').map(group => {
            const parts = group.trim().split('-').map(s => parseInt(s.trim()));
            if (parts.length === 2) {
                const hours = [];
                for (let h = parts[0]; h < parts[1]; h++) hours.push(h);
                return hours;
            }
            return parts.filter(n => !isNaN(n));
        }).filter(g => g.length > 0);
    }

    // ─── DOM 유틸 ────────────────────────────────────
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function randomDelay() {
        const ms = 300 + Math.random() * 300; // 0.3~0.6초
        return delay(ms);
    }

    function setStatus(message, type = 'info') {
        const el = document.querySelector('#tap-status');
        if (!el) return;
        el.textContent = message;
        const styles = {
            info:    { bg: '#f8f9fa', color: '#666' },
            success: { bg: '#d4edda', color: '#155724' },
            error:   { bg: '#f8d7da', color: '#721c24' },
            working: { bg: '#fff3cd', color: '#856404' }
        };
        const s = styles[type] || styles.info;
        el.style.background = s.bg;
        el.style.color = s.color;
    }

    // ─── UI 생성 ─────────────────────────────────────
    function createUI() {
        const config = loadConfig();

        const panel = document.createElement('div');
        panel.id = 'tennis-auto-panel';
        panel.style.cssText = 'position:fixed;top:10px;right:10px;width:280px;background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:99999;font-family:-apple-system,\"Malgun Gothic\",sans-serif;';

        panel.innerHTML = `
            <div id="tap-header" style="cursor:move;padding:10px 14px;background:#2c3e50;color:#fff;font-weight:bold;font-size:14px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;">
                <span>테니스장 예약 설정</span>
                <span id="tap-toggle" style="cursor:pointer;font-size:18px;user-select:none;">−</span>
            </div>
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
                    <input type="text" id="tap-courts" value="${config.courts}"
                        style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
                    <div style="font-size:11px;color:#888;margin-top:2px;">쉼표 구분, 앞쪽이 높은 순위 (2~19번)</div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:6px;">요일</label>
                    <div id="tap-days" style="display:flex;gap:4px;flex-wrap:wrap;">
                        ${DAY_NAMES.map((name, i) => {
                            const checked = config.day === i;
                            return `<label style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:2px solid ${checked ? '#3498db' : '#ddd'};border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;background:${checked ? '#3498db' : '#fff'};color:${checked ? '#fff' : '#333'};transition:all 0.15s;">
                                <input type="radio" name="tap-day" value="${i}" ${checked ? 'checked' : ''} style="display:none;">
                                ${name}
                            </label>`;
                        }).join('')}
                    </div>
                </div>

                <div style="margin-bottom:14px;">
                    <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">시간 우선순위</label>
                    <input type="text" id="tap-times" value="${config.timeGroups}"
                        style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
                    <div style="font-size:11px;color:#888;margin-top:2px;">시작-종료 쉼표 구분 (예: 8-10 = 8,9시) · 최대 2칸</div>
                </div>

                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button id="tap-save" style="flex:1;padding:8px;background:#27ae60;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">저장</button>
                    <button id="tap-run" style="flex:1;padding:8px;background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;display:${IS_RESERVATION_PAGE ? 'block' : 'none'};">실행</button>
                    <button id="tap-stop" style="flex:1;padding:8px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;display:none;">중지</button>
                </div>

                <div id="tap-status" style="padding:8px 10px;background:#f8f9fa;border-radius:6px;font-size:12px;color:#666;text-align:center;">
                    대기중
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        makeDraggable(panel, panel.querySelector('#tap-header'));
        bindUIEvents(panel);
    }

    function bindUIEvents(panel) {
        // 접기/펼치기
        const toggle = panel.querySelector('#tap-toggle');
        const body = panel.querySelector('#tap-body');
        toggle.addEventListener('click', () => {
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? 'block' : 'none';
            toggle.textContent = hidden ? '−' : '+';
        });

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

        // 저장 버튼
        panel.querySelector('#tap-save').addEventListener('click', () => {
            saveConfig(getConfigFromUI());
            setStatus('설정 저장 완료', 'success');
        });

        // 실행 버튼
        panel.querySelector('#tap-run').addEventListener('click', () => {
            const config = getConfigFromUI();
            saveConfig(config);
            startReservation(config);
        });

        // 중지 버튼
        panel.querySelector('#tap-stop').addEventListener('click', () => {
            isRunning = false;
        });
    }

    function updateButtons(running) {
        if (!IS_RESERVATION_PAGE) return;
        const runBtn = document.querySelector('#tap-run');
        const stopBtn = document.querySelector('#tap-stop');
        if (runBtn) runBtn.style.display = running ? 'none' : 'block';
        if (stopBtn) stopBtn.style.display = running ? 'block' : 'none';
    }

    function makeDraggable(el, handle) {
        let ox, oy, dragging = false;
        handle.addEventListener('mousedown', e => {
            dragging = true;
            ox = e.clientX - el.getBoundingClientRect().left;
            oy = e.clientY - el.getBoundingClientRect().top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            el.style.left = (e.clientX - ox) + 'px';
            el.style.top = (e.clientY - oy) + 'px';
            el.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    // ─── 개편 사이트(2026) DOM 셀렉터 ────────────────
    // 탭      : #tennisReserveTab > ul.first-depth > li  (0 = 날짜별/DATE, 1 = 코트별/COURT)
    // 달력    : FullCalendar — #calendar(DATE) / #calendar2(COURT)
    // 시간    : .schedule-check-list ul > li > label > input[type=checkbox]  (data-max-check 개까지)
    // 코트    : .place-selector[data-tab-mode] .place-hotspot  (인덱스 + 1 = 코트번호)
    // 캡차    : #captchaModal 모달 (#captchaImage / #captchaInput / [data-role=captcha-submit])
    // 결제대기: [data-role="basket-wrap-date|court"] ul.list_info > li
    const SEL = {
        tabButton:        '#tennisReserveTab > ul.first-depth > li > button.tab',
        calDate:          '#calendar',
        calCourt:         '#calendar2',
        timeConfirmDate:  '.js-time-confirm-date',
        timeConfirmCourt: '.js-time-confirm-court',
        courtConfirmDate: '.js-court-confirm-date',
        courtSectionDate: '.js-court-select-section-date',
        courtTabDateWrap: '.js-court-tab-date-wrap',
        captchaModal:     '#captchaModal',
        captchaImg:       '#captchaImage',
        captchaInput:     '#captchaInput',
        captchaRefresh:   '[data-role="captcha-refresh"]',
        captchaSubmit:    '[data-role="captcha-submit"]',
        basketDate:       '[data-role="basket-wrap-date"] ul.list_info > li',
        basketCourt:      '[data-role="basket-wrap-court"] ul.list_info > li',
        directPayment:    '.js-direct-payment'
    };
    const FC_DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    const q = sel => document.querySelector(sel);
    const qa = sel => [...document.querySelectorAll(sel)];
    const isVisible = el => !!el && el.getClientRects().length > 0;

    function waitFor(fn, timeout = 10000, interval = 100) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            (function tick() {
                let value = null;
                try { value = fn(); } catch { value = null; }
                if (value) { resolve(value); return; }
                if (Date.now() - started >= timeout) { reject(new Error('Timeout')); return; }
                setTimeout(tick, interval);
            })();
        });
    }

    // ─── 사이트 알림(alert) 가로채기 ─────────────────
    // 개편 사이트는 "다른 사용자가 예약 진행중", "예약가능 기간이 아닙니다" 등 실패 사유를
    // 전부 alert() 로만 알려준다. alert 은 JS 스레드를 멈추므로 그대로 두면 자동화가 진행되지 않는다.
    // 내용은 패널 상태줄 + 콘솔에 그대로 남긴다.
    const siteAlerts = [];

    function installDialogHooks() {
        if (window.__tapDialogHooked) return;
        window.__tapDialogHooked = true;
        window.alert = function (msg) {
            const text = String(msg);
            siteAlerts.push({ text, at: Date.now() });
            console.log('[예약 알림]', text);
            setStatus('사이트 알림: ' + text.replace(/\s*\n\s*/g, ' '), 'error');
        };
        window.confirm = () => true;
    }

    function lastAlertSince(mark) {
        for (let i = siteAlerts.length - 1; i >= 0; i--) {
            if (siteAlerts[i].at >= mark) return siteAlerts[i].text.replace(/\s*\n\s*/g, ' ');
        }
        return null;
    }

    // ─── 탭 / 영역 조회 ──────────────────────────────
    function selectTab(mode) {
        const btn = qa(SEL.tabButton)[mode === 'DATE' ? 0 : 1];
        if (!btn) return false;
        const li = btn.closest('li');
        if (li && !li.classList.contains('active')) btn.click();
        return true;
    }

    function calendarEl(mode) {
        return q(mode === 'DATE' ? SEL.calDate : SEL.calCourt);
    }

    function scheduleList(mode) {
        const cal = calendarEl(mode);
        const wrap = cal && cal.closest('.enrollment-wrap');
        return wrap ? wrap.querySelector('.schedule-check-list') : null;
    }

    function basketItems(mode) {
        return qa(mode === 'DATE' ? SEL.basketDate : SEL.basketCourt);
    }

    // ─── 날짜 선택 (요일 기반) ───────────────────────
    // 예약 가능한 날짜에만 '가능/진행/마감' 이벤트가 렌더된다(= dateToEncDay 에 등록된 날짜).
    // 이벤트가 없는 셀은 클릭해도 사이트가 무시하므로, 이벤트 유무를 가용 판정으로 쓴다.
    function findTargetDateCell(mode, targetDay) {
        const cal = calendarEl(mode);
        if (!cal) return null;
        const cells = cal.querySelectorAll(`td.fc-daygrid-day.fc-day-${FC_DOW[targetDay]}`);
        for (const td of cells) {
            if (td.querySelector('.fc-event')) return td;
        }
        return null;
    }

    function clickTargetDate(mode, targetDay) {
        const td = findTargetDateCell(mode, targetDay);
        if (!td) return false;
        // FullCalendar 의 eventClick 은 위임된 click 핸들러라 element.click() 으로 동작한다.
        // (dateClick 은 pointer drag 기반이라 합성 click 으로는 발화하지 않는다.)
        const ev = td.querySelector('.fc-event');
        if (!ev) return false;
        ev.click();
        return true;
    }

    // ─── 시간 선택 ───────────────────────────────────
    function readTimeSlots(mode) {
        const list = scheduleList(mode);
        if (!list) return [];
        return [...list.querySelectorAll('ul > li')].map(li => {
            const input = li.querySelector('input[type="checkbox"]');
            const timeText = (li.querySelector('.sch-time') || li).textContent || '';
            // "9월 24일(18~19)" 형태에서 시작/종료 시각을 뽑는다.
            const m = timeText.match(/\(([^)]*)\)/);
            const parts = m ? m[1].split('~') : [];
            const badge = li.querySelector('.badge');
            return {
                li,
                input,
                startH: parseInt(parts[0], 10),
                endH: parseInt(parts[1], 10),
                badge: badge ? badge.textContent.trim() : '',
                available: !!input && !input.disabled
            };
        }).filter(s => !isNaN(s.startH));
    }

    function maxCheck(mode) {
        const list = scheduleList(mode);
        const n = list ? parseInt(list.getAttribute('data-max-check'), 10) : NaN;
        return n > 0 ? n : 2;
    }

    function uncheckAllTimes(mode) {
        const list = scheduleList(mode);
        if (!list) return;
        list.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    function trySelectTimeGroup(mode, hours) {
        const slots = readTimeSlots(mode);
        if (slots.length === 0) return false;
        // 사이트가 허용하는 동시 선택 개수(현재 2개)를 넘으면 체크가 되돌려지고 alert 이 뜬다.
        if (hours.length > maxCheck(mode)) return false;

        const picked = [];
        for (const hour of hours) {
            const slot = slots.find(s => s.startH === hour);
            if (!slot || !slot.available) return false;
            picked.push(slot);
        }

        uncheckAllTimes(mode);
        for (const slot of picked) {
            slot.input.checked = true;
            slot.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return picked.every(s => s.input.checked);
    }

    function groupLabel(hours) {
        return hours.length === 1
            ? `${hours[0]}시`
            : `${hours[0]}~${hours[hours.length - 1] + 1}시`;
    }

    // ─── 코트 선택 ───────────────────────────────────
    function courtHotspot(mode, courtNum) {
        // 핫스팟 DOM 순서 그대로 인덱스 + 1 이 코트번호다 (사이트 applyCourtAvailability 와 동일).
        return qa(`.place-selector[data-tab-mode="${mode}"] .place-hotspot`)[courtNum - 1] || null;
    }

    function isCourtBlocked(el) {
        return !el
            || el.disabled
            || el.classList.contains('is-disabled')
            || el.getAttribute('aria-disabled') === 'true';
    }

    function courtBlockReason(el) {
        const reason = el && el.getAttribute('data-reason');
        return reason ? reason.replace(/\s*\n\s*/g, ' ') : '선택 불가';
    }

    function selectCourt(mode, courtNum) {
        const el = courtHotspot(mode, courtNum);
        if (isCourtBlocked(el)) return false;
        // 이미 선택된 코트를 다시 누르면 선택이 해제된다.
        if (!el.classList.contains('is-selected')) el.click();
        return el.classList.contains('is-selected');
    }

    function focusPayment() {
        const btn = qa(SEL.directPayment).filter(isVisible)[0];
        if (btn) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            btn.focus();
        }
    }

    function finish(message, type) {
        setStatus(message, type);
        isRunning = false;
        updateButtons(false);
    }

    // 담기 실패 시 사이트가 시간 목록/코트 도면을 ajax 로 다시 그린다.
    // 바로 다음 후보를 고르면 갱신 전 DOM 을 보거나 선택이 덮어써지므로 반영될 때까지 기다린다.
    async function settleAfterFailure(mode) {
        await delay(1000);
        try {
            if (mode === 'COURT') {
                await waitFor(() => readTimeSlots('COURT').length > 0, 8000);
            } else {
                await waitFor(() => isVisible(q(SEL.courtSectionDate)), 8000);
            }
        } catch { /* 갱신이 안 와도 다음 후보에서 다시 판정한다 */ }
        await randomDelay();
    }

    // ─── 예약 진입점 (모드 분기) ─────────────────────
    function startReservation(config) {
        if (config.mode === 'time-first') {
            return startTimeFirstFlow(config);
        }
        return startCourtFirstFlow(config);
    }

    // ─── 코트 우선: [코트별 예약] 탭 ─────────────────
    // 코트 선택 → 날짜 → 시간 → 확인 → 캡차
    async function startCourtFirstFlow(config) {
        const courts = parseCourts(config.courts);
        const timeGroups = parseTimeGroups(config.timeGroups);
        const targetDay = config.day;

        if (courts.length === 0) { setStatus('코트 번호를 입력해주세요', 'error'); return; }
        if (timeGroups.length === 0) { setStatus('시간을 입력해주세요', 'error'); return; }

        isRunning = true;
        updateButtons(true);
        installDialogHooks();
        setStatus('예약 시작... [코트별 예약]', 'working');

        if (!selectTab('COURT')) { finish('코트별 예약 탭을 찾을 수 없습니다', 'error'); return; }

        try {
            await waitFor(() => courtHotspot('COURT', courts[0]), 15000);
        } catch {
            finish('코트 도면 로딩 실패', 'error');
            return;
        }
        await randomDelay();

        for (let i = 0; i < courts.length; i++) {
            if (!isRunning) { finish('중지됨', 'info'); return; }
            const courtNum = courts[i];
            setStatus(`${courtNum}번 코트 시도중... (${i + 1}/${courts.length})`, 'working');

            const spot = courtHotspot('COURT', courtNum);
            if (isCourtBlocked(spot)) {
                setStatus(`${courtNum}번 코트: ${courtBlockReason(spot)}`, 'working');
                continue;
            }
            if (!selectCourt('COURT', courtNum)) continue;

            // 코트를 고르면 달력이 열리고 해당 코트의 예약 가능 날짜가 채워진다.
            // 먼저 달력 응답이 도착했는지(이벤트가 하나라도 그려졌는지)만 기다린 뒤 요일을 판정한다.
            // 요일까지 waitFor 로 기다리면 그 코트에 해당 요일이 없을 때 타임아웃만큼 헛되이 지연된다.
            try {
                await waitFor(() => isVisible(q(SEL.courtTabDateWrap)) && calendarEl('COURT').querySelector('.fc-event'), 8000);
            } catch {
                setStatus(`${courtNum}번 코트: 예약 가능한 날짜가 없습니다`, 'working');
                continue;
            }
            if (!clickTargetDate('COURT', targetDay)) {
                setStatus(`${courtNum}번 코트: ${DAY_NAMES[targetDay]}요일 예약 가능 날짜 없음`, 'working');
                continue;
            }

            try {
                await waitFor(() => readTimeSlots('COURT').length > 0, 10000);
            } catch {
                setStatus(`${courtNum}번 코트: 시간 목록 로딩 실패`, 'working');
                continue;
            }
            await randomDelay();

            for (const hours of timeGroups) {
                if (!isRunning) { finish('중지됨', 'info'); return; }
                if (!trySelectTimeGroup('COURT', hours)) continue;

                const what = `${courtNum}번 코트, ${groupLabel(hours)}`;
                setStatus(`${what} 선택 완료! 캡차 인식중...`, 'working');

                const result = await runCaptchaStage('COURT', SEL.timeConfirmCourt, hours, what);
                if (result === 'done') return;
                if (result === 'stopped') { finish('중지됨', 'info'); return; }

                await settleAfterFailure('COURT');
                uncheckAllTimes('COURT');
            }

            if (i < courts.length - 1) {
                setStatus(`${courtNum}번 코트 시간 마감, 다음 코트 시도...`, 'working');
            }
        }

        finish('모든 코트/시간이 마감되었습니다', 'error');
    }

    // ─── 시간 우선: [날짜별 예약] 탭 ─────────────────
    // 날짜 → 시간 → 확인 → 코트 → 확인 → 캡차
    async function startTimeFirstFlow(config) {
        const courts = parseCourts(config.courts);
        const timeGroups = parseTimeGroups(config.timeGroups);
        const targetDay = config.day;

        if (courts.length === 0) { setStatus('코트 번호를 입력해주세요', 'error'); return; }
        if (timeGroups.length === 0) { setStatus('시간을 입력해주세요', 'error'); return; }

        isRunning = true;
        updateButtons(true);
        installDialogHooks();
        setStatus('예약 시작... [날짜별 예약]', 'working');

        if (!selectTab('DATE')) { finish('날짜별 예약 탭을 찾을 수 없습니다', 'error'); return; }

        try {
            await waitFor(() => findTargetDateCell('DATE', targetDay), 15000);
        } catch {
            finish(`${DAY_NAMES[targetDay]}요일 예약 가능 날짜 없음`, 'error');
            return;
        }
        if (!clickTargetDate('DATE', targetDay)) { finish('날짜 클릭 실패', 'error'); return; }

        try {
            await waitFor(() => readTimeSlots('DATE').length > 0, 10000);
        } catch {
            finish('시간 목록 로딩 실패', 'error');
            return;
        }
        await randomDelay();

        for (let gi = 0; gi < timeGroups.length; gi++) {
            if (!isRunning) { finish('중지됨', 'info'); return; }
            const hours = timeGroups[gi];
            const label = groupLabel(hours);
            setStatus(`${label} 시도중... (${gi + 1}/${timeGroups.length})`, 'working');

            if (!trySelectTimeGroup('DATE', hours)) {
                setStatus(`${label} 마감, 다음 시간 시도...`, 'working');
                continue;
            }

            // 시간 '확인' → 해당 시간대의 코트별 가용 상태를 받아 도면에 칠한다.
            const mark = Date.now();
            const timeConfirm = q(SEL.timeConfirmDate);
            if (!timeConfirm) { finish('시간 확인 버튼을 찾을 수 없습니다', 'error'); return; }

            // 코트 영역은 인라인 display:none 으로 감춰져 있다가 court_state 응답 콜백에서 show() 된다.
            // 두 번째 시간대부터는 이미 열려 있어 그냥 기다리면 '이전 시간대의' 코트 현황을 읽게 되므로,
            // 다시 감춰두고 사이트가 열어줄 때까지 기다려 응답 도착을 확인한다.
            const courtSection = q(SEL.courtSectionDate);
            if (courtSection) courtSection.style.display = 'none';
            timeConfirm.click();

            try {
                await waitFor(() => isVisible(q(SEL.courtSectionDate)) && isVisible(q(SEL.courtConfirmDate)), 10000);
            } catch {
                setStatus(lastAlertSince(mark) || `${label}: 코트 현황 로딩 실패`, 'error');
                uncheckAllTimes('DATE');
                continue;
            }
            await randomDelay();

            let tried = false;
            for (const courtNum of courts) {
                if (!isRunning) { finish('중지됨', 'info'); return; }

                const spot = courtHotspot('DATE', courtNum);
                if (isCourtBlocked(spot)) continue;
                if (!selectCourt('DATE', courtNum)) continue;
                tried = true;

                const what = `${courtNum}번 코트, ${label}`;
                setStatus(`${what} 예약 가능! 캡차 인식중...`, 'working');

                const result = await runCaptchaStage('DATE', SEL.courtConfirmDate, hours, what);
                if (result === 'done') return;
                if (result === 'stopped') { finish('중지됨', 'info'); return; }

                // 담기 실패 시 사이트가 코트 현황을 다시 그린다. 시간 선택은 유지되므로 다음 코트로.
                await settleAfterFailure('DATE');
            }

            setStatus(tried
                ? `${label}: 담기에 실패했습니다, 다음 시간 시도...`
                : `${label}: 예약 가능한 코트 없음, 다음 시간 시도...`, 'working');
            uncheckAllTimes('DATE');
            await randomDelay();
        }

        finish('모든 시간/코트가 마감되었습니다', 'error');
    }

    // ─── 확인 클릭 → 캡차 → (사용자가 담기) → 검증 ──
    // 개편 사이트에서 캡차 모달의 '확인' 이 곧 결제대기 담기다.
    // OCR 로 입력값만 채워두고 담기 클릭은 사용자에게 맡긴다.
    async function runCaptchaStage(mode, confirmSel, hours, what) {
        const mark = Date.now();
        const confirmBtn = q(confirmSel);
        if (!confirmBtn) { setStatus(`${what}: 확인 버튼을 찾을 수 없습니다`, 'error'); return 'failed'; }
        confirmBtn.click();

        try {
            await waitFor(() => isVisible(q(SEL.captchaModal)), 10000);
        } catch {
            setStatus(lastAlertSince(mark) || `${what}: 캡차 창이 열리지 않았습니다`, 'error');
            return 'failed';
        }

        for (let attempt = 1; attempt <= 3; attempt++) {
            if (!isRunning) return 'stopped';

            const digits = await solveCaptcha();
            const before = basketItems(mode).length;

            const submit = q(SEL.captchaSubmit);
            if (submit) {
                submit.scrollIntoView({ block: 'center' });
                submit.focus();
            }
            setStatus(digits
                ? `${what} — 캡차 ${digits} 입력 완료, '확인'을 눌러 담아주세요`
                : `${what} — 캡차 자동인식 실패, 직접 입력 후 '확인'을 눌러주세요`, digits ? 'success' : 'error');
            if (!digits) q(SEL.captchaInput)?.focus();

            const res = await waitForBasketHandoff(mode, before);
            if (res === 'stopped') return 'stopped';
            if (res === 'retry') continue;          // 캡차 오인식 → 사이트가 모달을 다시 연다
            if (res === 'closed') {
                setStatus(lastAlertSince(mark) || `${what}: 담기가 취소되었습니다`, 'error');
                return 'failed';
            }

            const delta = basketItems(mode).length - before;
            if (delta === hours.length) {
                finish(`${what} 담기 완료! '바로결제' 버튼을 눌러주세요`, 'success');
            } else {
                finish(`${what}: ${delta}/${hours.length}건만 담겼습니다 — 결제대기 내역을 확인해주세요`, 'error');
            }
            focusPayment();
            return 'done';
        }

        setStatus(`${what}: 캡차를 3회 통과하지 못했습니다`, 'error');
        return 'failed';
    }

    // 캡차 '확인'(담기) 결과를 기다린다: 'added' | 'retry' | 'closed' | 'stopped'
    async function waitForBasketHandoff(mode, before) {
        // 모달이 열려 있는 동안에도 alert 이 날 수 있다(예: 빈 캡차로 확인 → '캡차를 입력해주세요').
        // 그래서 실패 판정용 기준점은 함수 진입 시점이 아니라 '모달이 닫힌 시점'에 잡아야 한다.
        while (isRunning) {
            if (basketItems(mode).length !== before) return 'added';
            if (!isVisible(q(SEL.captchaModal))) break;   // 모달이 닫혔다 = 담기 요청 전송
            await delay(150);
        }
        if (!isRunning) return 'stopped';

        const alertsAtSubmit = siteAlerts.length;
        const deadline = Date.now() + 8000;
        while (isRunning && Date.now() < deadline) {
            if (basketItems(mode).length !== before) return 'added';
            // ssCheck === -2 (캡차 실패) 면 사이트가 alert 직후 모달을 다시 연다.
            if (isVisible(q(SEL.captchaModal))) return 'retry';
            // 그 밖의 실패는 사유 alert 로만 통지된다. 타임아웃을 기다리지 않고 바로 넘어간다.
            if (siteAlerts.length > alertsAtSubmit) return 'closed';
            await delay(150);
        }
        return isRunning ? 'closed' : 'stopped';
    }

    // ─── 캡차 OCR ─────────────────────────────────────
    const MAX_CAPTCHA_RETRY = 5;

    async function solveCaptcha(attempt = 1) {
        setStatus(`캡차 인식중... (${attempt}/${MAX_CAPTCHA_RETRY})`, 'working');

        const img = q(SEL.captchaImg);
        if (!img) { setStatus('캡차 이미지를 찾을 수 없습니다', 'error'); return null; }
        await waitForImageLoad(img);

        const digits = await recognizeCaptcha(img);
        if (digits && digits.length === 4) return digits;

        if (attempt < MAX_CAPTCHA_RETRY) {
            setStatus(`캡차 인식 실패, 새로고침 후 재시도... (${attempt}/${MAX_CAPTCHA_RETRY})`, 'working');
            const prevSrc = img.getAttribute('src');
            refreshCaptcha();
            try { await waitFor(() => img.getAttribute('src') !== prevSrc, 3000, 50); } catch { /* ignore */ }
            await waitForImageLoad(img);
            await randomDelay();
            return solveCaptcha(attempt + 1);
        }

        setStatus(`캡차 ${MAX_CAPTCHA_RETRY}회 인식 실패, 수동 입력 필요`, 'error');
        return null;
    }

    async function recognizeCaptcha(img) {
        // 캡차는 150x40 로 작아서 그대로 넘기면 인식률이 떨어진다. 3배로 키운 뒤 흑백 이진화.
        const scale = 3;
        const w = (img.naturalWidth || img.width) * scale;
        const h = (img.naturalHeight || img.height) * scale;
        if (!w || !h) return null;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const px = imageData.data;
        for (let i = 0; i < px.length; i += 4) {
            const gray = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
            const bw = gray < 128 ? 0 : 255;
            px[i] = px[i + 1] = px[i + 2] = bw;
        }
        ctx.putImageData(imageData, 0, 0);

        try {
            const worker = await Tesseract.createWorker('eng');
            await worker.setParameters({ tessedit_char_whitelist: '0123456789' });
            const { data: { text } } = await worker.recognize(canvas);
            await worker.terminate();

            const digits = text.replace(/\D/g, '').slice(0, 4);
            const input = q(SEL.captchaInput);
            if (digits.length === 4 && input) {
                input.value = digits;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return digits;
        } catch (e) {
            console.log('OCR 오류:', e.message);
            return null;
        }
    }

    function refreshCaptcha() {
        // 캡차 이미지는 20회까지만 새로고침된다 (사이트 안내 문구).
        q(SEL.captchaRefresh)?.click();
    }

    function waitForImageLoad(img) {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 3000);
        });
    }


    // ─── 초기화 ──────────────────────────────────────
    createUI();

    // 예약 페이지에서만 자동 실행
    if (IS_RESERVATION_PAGE) {
        const autoConfig = loadConfig();
        startReservation(autoConfig);
    }

})();
