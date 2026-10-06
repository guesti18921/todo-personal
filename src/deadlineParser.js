// Offline suggestions, deliberately limited to explicit calendar expressions.
// The original text is never rewritten and the caller must ask for confirmation.
const relativeDays = [
    [2, ['послезавтра', 'day after tomorrow', 'übermorgen', 'dopodomani', 'pasado mañana', 'après-demain', 'depois de amanhã', '后天', '後天', '明後日']],
    [1, ['завтра', 'tomorrow', 'morgen', 'domani', 'mañana', 'demain', 'amanhã', '明天', '明日', '내일']],
    [0, ['сегодня', 'today', 'heute', 'oggi', 'hoy', "aujourd’hui", "aujourd'hui", 'hoje', '今天', '今日', '오늘']],
    [-1, ['вчера', 'yesterday', 'gestern', 'ieri', 'ayer', 'hier', 'ontem', '昨天', '昨日', '어제']]
];
const formatDate = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function calendarDate(year, month, day) {
    if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function suggestDeadline(value, now = new Date()) {
    const text = String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
        // A time preposition distinguishes 18.00 from a day/month date.
        .replace(/(?<!\p{L})(в|at|um|alle|a las|à|às)\s+(\d{1,2})\.(\d{2})(?![\d.])/gu, '$1 $2:$3');
    if (!text.trim() || Number.isNaN(now.getTime())) return null;
    const dates = new Set(), times = new Set(), evidence = [];
    let invalid = false;
    const addDate = (year, month, day, raw, explicitYear = true) => {
        let date = calendarDate(year, month, day);
        if (!date) { invalid = true; return; }
        if (!explicitYear && formatDate(date) < formatDate(now)) {
            date = calendarDate(year + 1, month, day);
            if (!date) { invalid = true; return; }
        }
        dates.add(formatDate(date)); evidence.push(raw);
    };
    // Consume longer phrases before shorter ones ("day after tomorrow").
    let remaining = text;
    for (const [offset, phrases] of relativeDays) {
        for (const phrase of phrases) {
            const asian = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Hangul}]/u.test(phrase);
            const pattern = asian ? escaped(phrase) : `(?<![\\p{L}\\p{N}])${escaped(phrase)}(?![\\p{L}\\p{N}])`;
            remaining = remaining.replace(new RegExp(pattern, 'gu'), raw => {
                const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
                date.setDate(date.getDate() + offset);
                dates.add(formatDate(date)); evidence.push(raw);
                return ' '.repeat(raw.length);
            });
        }
    }
    remaining = remaining.replace(/(?<![\p{L}\d])(\d{4})-(\d{2})-(\d{2})(?![\d-])/gu, (raw, y, m, d) => {
        addDate(+y, +m, +d, raw); return ' '.repeat(raw.length);
    });
    remaining = remaining.replace(/(?<![\p{L}\d./])(\d{1,2})([./])(\d{1,2})\2(\d{4})(?![\d./])/gu, (raw, d, sep, m, y) => {
        addDate(+y, +m, +d, raw); return ' '.repeat(raw.length);
    });
    remaining = remaining.replace(/(?<![\p{L}\d./])(\d{2})\.(\d{2})(?![\d./])/gu, (raw, d, m) => {
        addDate(now.getFullYear(), +m, +d, raw, false); return ' '.repeat(raw.length);
    });
    remaining = remaining.replace(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号號]/gu, (raw, y, m, d) => {
        addDate(y ? +y : now.getFullYear(), +m, +d, raw, Boolean(y)); return ' '.repeat(raw.length);
    });
    const addTime = (hour, minute, raw, period = '') => {
        if (period) {
            if (hour < 1 || hour > 12) { invalid = true; return; }
            hour = hour % 12 + (/pm|вечера|дня|下午|晚上|午後|오후/.test(period) ? 12 : 0);
        }
        if (hour > 23 || minute > 59) { invalid = true; return; }
        times.add(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`); evidence.push(raw);
    };
    remaining = remaining.replace(/(?<![\p{L}\d:])(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?!\p{L})/gu, (raw, h, m, p) => {
        addTime(+h, +(m || 0), raw, p); return ' '.repeat(raw.length);
    });
    remaining = remaining.replace(/(上午|下午|晚上|午前|午後|오전|오후)\s*(\d{1,2})(?::(\d{2})|[点點時时시](?:(\d{1,2})[分분])?)?/gu, (raw, p, h, colon, minute) => {
        addTime(+h, +(colon || minute || 0), raw, p); return ' '.repeat(raw.length);
    });
    remaining = remaining.replace(/(?<!\p{L})в\s+(\d{1,2})(?::(\d{2}))?\s+(утра|дня|вечера|ночи)(?!\p{L})/gu, (raw, h, m, p) => {
        addTime(+h, +(m || 0), raw, p); return ' '.repeat(raw.length);
    });
    remaining = remaining.replace(/(?<![\p{L}\d:])(\d{1,2}):(\d{2})(?![\d:])/gu, (raw, h, m) => {
        addTime(+h, +m, raw); return ' '.repeat(raw.length);
    });
    // Bare hours need a time preposition, not just any number in a note.
    remaining = remaining.replace(/(?<!\p{L})(?:в|at|um|alle|a las|à|às)\s+(\d{1,2})(?:\s*(?:час(?:а|ов)?|uhr|h))?(?![\p{L}\d:.])/gu, (raw, h) => {
        addTime(+h, 0, raw); return ' '.repeat(raw.length);
    });
    remaining.replace(/(?<!\d)(\d{1,2})[点點時时시](?:(\d{1,2})[分분])?/gu, (raw, h, m) => {
        addTime(+h, +(m || 0), raw); return raw;
    });
    // Multiple competing deadlines are not guessed. Invalid dates never roll over.
    if (invalid || dates.size > 1 || times.size > 1 || (!dates.size && !times.size)) return null;
    const time = [...times][0] || '';
    const inferredDate = !dates.size;
    let date = [...dates][0];
    if (!date) {
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
        if (time <= `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`) next.setDate(next.getDate() + 1);
        date = formatDate(next);
    }
    const past = date < formatDate(now) || (date === formatDate(now) && time && time < `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    return { date, time, inferredDate, past: Boolean(past), evidence: [...new Set(evidence)] };
}
