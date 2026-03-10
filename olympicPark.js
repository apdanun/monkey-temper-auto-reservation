// ==UserScript==
// @name         올림픽공원 테니스장 자동예약 (cluade)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  코트/요일/시간 설정 UI + 다중 코트 우선순위 자동예약
// @author       You
// @match        https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do
// @match        https://www.ksponco.or.kr/online/tennis/resrvtn_aplictn.do*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    // ─── 상수 ───────────────────────────────────────
    const STORAGE_KEY = 'olympic_tennis_config';
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
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
            // 월~목: 6~10시, 8~10시 우선
            timeGroups = '7-9, 8-10, 6-8';
        }
        return { courts: '5,7,6,8', day: targetDay, timeGroups };
    }

    // ─── 설정 저장/로드 ──────────────────────────────
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

    function saveConfig(config) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }

    function getConfigFromUI() {
        return {
            courts: document.querySelector('#tap-courts').value.trim(),
            day: parseInt(document.querySelector('input[name="tap-day"]:checked')?.value ?? '6'),
            timeGroups: document.querySelector('#tap-times').value.trim()
        };
    }

    // ─── 파싱 ────────────────────────────────────────
    function parseCourts(str) {
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

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) { resolve(el); return; }

            const timer = setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout: ${selector}`)); }, timeout);
            const obs = new MutationObserver(() => {
                const found = document.querySelector(selector);
                if (found) { clearTimeout(timer); obs.disconnect(); resolve(found); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        });
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
                    <div style="font-size:11px;color:#888;margin-top:2px;">시작-종료 쉼표 구분 (예: 8-10 = 8,9시)</div>
                </div>

                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button id="tap-save" style="flex:1;padding:8px;background:#27ae60;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">저장</button>
                    <button id="tap-run" style="flex:1;padding:8px;background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">실행</button>
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

    // ─── 날짜 선택 (요일 기반) ───────────────────────
    function clickTargetDate(targetDay) {
        // targetDay: 0=일, 1=월, ..., 6=토
        // 캘린더 열: td:nth-child(1)=일, ..., td:nth-child(7)=토
        const colIndex = targetDay + 1;
        const rows = document.querySelectorAll('#cal > tbody > tr');
        for (const row of rows) {
            const cell = row.querySelector(`td:nth-child(${colIndex})`);
            if (cell) {
                const link = cell.querySelector('a');
                if (link) {
                    link.click();
                    return true;
                }
            }
        }
        return false;
    }

    // ─── 시간 선택 ───────────────────────────────────
    function trySelectTimeGroup(hours) {
        // 시간→li 인덱스 매핑: 6시=1, 7시=2, 8시=3, 9시=4, ...
        const checkboxes = [];
        for (const hour of hours) {
            const index = hour - 5;
            if (index < 1) return false;
            const li = document.querySelector(`#time_con > li:nth-child(${index})`);
            if (!li || li.classList.contains('end')) return false;
            const cb = li.querySelector('input[type="checkbox"]');
            if (!cb) return false;
            checkboxes.push(cb);
        }

        // 모든 슬롯이 가용하면 체크
        for (const cb of checkboxes) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
    }

    // ─── 시간 슬롯 갱신 대기 (DOM 변경이 안정될 때까지) ──
    function waitForTimeSlotsChange(timeout = 2000) {
        const timeCon = document.querySelector('#time_con');
        if (!timeCon) {
            return waitForElement('#time_con > li', timeout).then(() => randomDelay());
        }

        return new Promise(resolve => {
            let done = false;
            let settleTimer = null;
            const finish = () => {
                if (!done) {
                    done = true;
                    obs.disconnect();
                    if (settleTimer) clearTimeout(settleTimer);
                    resolve();
                }
            };
            const obs = new MutationObserver(() => {
                // 변경이 감지될 때마다 타이머 리셋 — 변경이 멈춘 뒤 400ms 후 완료
                if (settleTimer) clearTimeout(settleTimer);
                settleTimer = setTimeout(finish, 200);
            });
            obs.observe(timeCon, { childList: true, subtree: true, attributes: true });
            setTimeout(finish, timeout);
        });
    }

    // ─── 메인 예약 로직 ──────────────────────────────
    async function startReservation(config) {
        const courts = parseCourts(config.courts);
        const timeGroups = parseTimeGroups(config.timeGroups);
        const targetDay = config.day;

        if (courts.length === 0) { setStatus('코트 번호를 입력해주세요', 'error'); return; }
        if (timeGroups.length === 0) { setStatus('시간을 입력해주세요', 'error'); return; }

        window.confirm = () => true;
        setStatus('예약 시작...', 'working');

        // [코트별] 탭 클릭
        document.querySelector('#appType02')?.click();

        // 코트 이미지 로딩 대기
        try {
            await waitForElement(`#tennis_court_img_a_1_${courts[0]}`);
        } catch {
            setStatus('코트 이미지 로딩 실패', 'error');
            return;
        }

        for (let i = 0; i < courts.length; i++) {
            const courtNum = courts[i];
            setStatus(`${courtNum}번 코트 시도중... (${i + 1}/${courts.length})`, 'working');

            // 코트 클릭
            const courtEl = document.querySelector(`#tennis_court_img_a_1_${courtNum}`);
            if (!courtEl) continue;
            courtEl.click();

            // 캘린더 대기
            if (i === 0) {
                try { await waitForElement('#cal > tbody'); } catch { continue; }
            }
            await randomDelay();

            // 요일에 해당하는 날짜 클릭
            if (!clickTargetDate(targetDay)) {
                setStatus(`${courtNum}번 코트: ${DAY_NAMES[targetDay]}요일 날짜 없음`, 'working');
                continue;
            }

            // 시간 슬롯 로딩/갱신 대기
            if (i === 0) {
                try { await waitForElement('#time_con > li'); } catch { continue; }
                await randomDelay();
            } else {
                await waitForTimeSlotsChange();
            }

            // 시간 그룹 우선순위별 시도
            let found = false;
            for (const hours of timeGroups) {
                if (trySelectTimeGroup(hours)) {
                    const label = hours.length === 1
                        ? `${hours[0]}시`
                        : `${hours[0]}~${hours[hours.length - 1]}시`;
                    setStatus(`${courtNum}번 코트, ${label} 선택 완료! 캡차 인식중...`, 'working');
                    found = true;

                    await randomDelay();
                    await solveCaptcha();
                    return;
                }
            }

            if (!found && i < courts.length - 1) {
                setStatus(`${courtNum}번 코트 시간 마감, 다음 코트 시도...`, 'working');
            }
        }

        setStatus('모든 코트/시간이 마감되었습니다', 'error');
    }

    // ─── 캡차 OCR ─────────────────────────────────────
    const MAX_CAPTCHA_RETRY = 5;

    async function solveCaptcha(attempt = 1) {
        setStatus(`캡차 인식중... (${attempt}/${MAX_CAPTCHA_RETRY})`, 'working');

        const img = document.querySelector('.captchaImg_wrap img');
        if (!img) { setStatus('캡차 이미지를 찾을 수 없습니다', 'error'); return; }

        // 이미지 로드 대기
        if (!img.complete) {
            await new Promise(resolve => { img.onload = resolve; });
        }

        // 캔버스에 그려서 전처리 (흑백 이진화)
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

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

            if (digits.length === 4) {
                const input = document.querySelector('#captcha');
                if (input) {
                    input.value = digits;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    setStatus(`캡차 인식 완료: ${digits} → 바로결제 버튼 포커스`, 'success');
                    document.querySelector('#direct_payment')?.focus();
                }
                return;
            }
        } catch (e) {
            console.log('OCR 오류:', e.message, { attempt });
        }

        // 인식 실패 → 새로고침 후 재시도
        if (attempt < MAX_CAPTCHA_RETRY) {
            setStatus(`캡차 인식 실패, 새로고침 후 재시도... (${attempt}/${MAX_CAPTCHA_RETRY})`, 'working');
            refreshCaptcha();
            await waitForCaptchaImageLoad();
            await solveCaptcha(attempt + 1);
        } else {
            setStatus(`캡차 ${MAX_CAPTCHA_RETRY}회 인식 실패, 수동 입력 필요`, 'error');
            document.querySelector('#captcha')?.focus();
        }
    }

    function refreshCaptcha() {
        const refreshBtn = document.querySelector('.captchaImg_wrap input[type="button"]');
        if (refreshBtn) {
            refreshBtn.click();
        } else if (typeof fn_tennis_captcha === 'function') {
            fn_tennis_captcha();
        }
    }

    function waitForCaptchaImageLoad() {
        return new Promise(resolve => {
            const img = document.querySelector('.captchaImg_wrap img');
            if (!img) { resolve(); return; }

            // src 변경 감지 → 새 이미지 로드 완료 대기
            const obs = new MutationObserver(() => {
                obs.disconnect();
                if (img.complete) { resolve(); return; }
                img.addEventListener('load', () => resolve(), { once: true });
            });
            obs.observe(img, { attributes: true, attributeFilter: ['src'] });

            // src가 안 바뀌는 경우 대비 타임아웃
            setTimeout(() => { obs.disconnect(); resolve(); }, 2000);
        });
    }

    // ─── 초기화 ──────────────────────────────────────
    createUI();

    // 페이지 로드 즉시 자동 실행
    const autoConfig = loadConfig();
    startReservation(autoConfig);

})();
