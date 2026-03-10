// ==UserScript==
// @name         서울시 공공 예약 - 장충 (cluade)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  코트/요일/시간 설정 UI + 다중 코트 우선순위 자동예약
// @author       You
// @match        https://yeyak.seoul.go.kr/web/reservation/insertFormReserve.do
// @match        https://yeyak.seoul.go.kr/web/reservation/insertFormReserve.do*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

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

    async function autoClickCheckbox(selector) {
        try {
            const checkbox = await waitForElement(selector);
            if (!checkbox.checked) {
                checkbox.click();
                console.log(`[자동예약] ${selector} 체크박스 클릭 완료`);
            } else {
                console.log(`[자동예약] ${selector} 이미 체크됨`);
            }
        } catch (e) {
            console.error(`[자동예약] ${selector} 체크박스를 찾을 수 없습니다:`, e.message);
        }
    }

    async function autoClickButton(selector) {
        try {
            const button = await waitForElement(selector);
            button.click();
            console.log(`[자동예약] ${selector} 버튼 클릭 완료`);
        } catch (e) {
            console.error(`[자동예약] ${selector} 버튼을 찾을 수 없습니다:`, e.message);
        }
    }

    // 체크박스 자동 클릭
    autoClickCheckbox('#chk_info');
    autoClickCheckbox('#chk_agree_all');

    // 이용인원 증가 버튼 클릭
    autoClickButton('.user_plus');

})();
