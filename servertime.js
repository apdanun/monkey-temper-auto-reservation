// 08:59경 실행 → 그날 서버-로컬 오프셋(ms). 최댓값이 실제 오프셋.
(async () => {
    const u = location.origin + '/online/tennis/index.do';
    const now = () => performance.timeOrigin + performance.now();
    let best = -1e9;
    for (let i=0;i<120;i++){
        const t0 = now();
        const r = await fetch(u,{method:'HEAD',cache:'no-store'});
        const t1 = now();
        const d = Date.parse(r.headers.get('date')) - (t0+t1)/2;
        if (d>best) best = d;
        await new Promise(s=>setTimeout(s,15));
    }
    console.log('server-local offset ≈', Math.round(best), 'ms  → fire at local 09:00:00.'
        + String(Math.max(0, Math.round(30 - best))).padStart(3,'0'));
})();



// 8:59:40쯤 실행. 8:59:57에 핑 자동 중단(클릭 3초 전) → 커넥션 warm & free
const stopAt = new Date(); stopAt.setHours(8, 59, 57, 0);   // 오늘 8:59:57
const ka = setInterval(() => {
    if (Date.now() >= stopAt.getTime()) {
        clearInterval(ka);
        console.log('핑 중단 — 커넥션 warm 유지, 클릭 대기');
        return;
    }
    fetch(location.origin + '/online/tennis/index.do', {method:'HEAD', cache:'no-store'});
}, 5000);   // 5초 간격