// Offline suggestions for explicit calendar, weekday and numeric duration expressions.
// The original text is never rewritten and the caller must ask for confirmation.
const relativeDays = [
    [2, ['послезавтра', 'day after tomorrow', 'übermorgen', 'dopodomani', 'pasado mañana', 'après-demain', 'depois de amanhã', '后天', '後天', '明後日']],
    [1, ['завтра', 'tomorrow', 'morgen', 'domani', 'mañana', 'demain', 'amanhã', '明天', '明日', '내일']],
    [0, ['сегодня', 'today', 'heute', 'oggi', 'hoy', "aujourd’hui", "aujourd'hui", 'hoje', '今天', '今日', '오늘']],
    [-1, ['вчера', 'yesterday', 'gestern', 'ieri', 'ayer', 'hier', 'ontem', '昨天', '昨日', '어제']]
];
const weekdays = [
    [1, ['понедельник', 'monday', 'montag', 'lunedì', 'lunes', 'lundi', 'segunda-feira', '星期一', '周一', '週一', '月曜日', '월요일']],
    [2, ['вторник', 'tuesday', 'dienstag', 'martedì', 'martes', 'mardi', 'terça-feira', '星期二', '周二', '週二', '火曜日', '화요일']],
    [3, ['среда', 'среду', 'wednesday', 'mittwoch', 'mercoledì', 'miércoles', 'mercredi', 'quarta-feira', '星期三', '周三', '週三', '水曜日', '수요일']],
    [4, ['четверг', 'thursday', 'donnerstag', 'giovedì', 'jueves', 'jeudi', 'quinta-feira', '星期四', '周四', '週四', '木曜日', '목요일']],
    [5, ['пятница', 'пятницу', 'friday', 'freitag', 'venerdì', 'viernes', 'vendredi', 'sexta-feira', '星期五', '周五', '週五', '金曜日', '금요일']],
    [6, ['суббота', 'субботу', 'saturday', 'samstag', 'sabato', 'sábado', 'samedi', '星期六', '周六', '週六', '土曜日', '토요일']],
    [0, ['воскресенье', 'sunday', 'sonntag', 'domenica', 'domingo', 'dimanche', '星期日', '星期天', '周日', '周天', '週日', '日曜日', '일요일']]
];
const durationUnits = [
    ['minute', ['минуту', 'минуты', 'минут', 'minute', 'minutes', 'minuten', 'minuto', 'minuti', 'minutos', '分钟', '分鐘', '分', '분']],
    ['hour', ['час', 'часа', 'часов', 'hour', 'hours', 'stunde', 'stunden', 'ora', 'ore', 'hora', 'horas', 'heure', 'heures', '小时', '小時', '時間', '시간']],
    ['day', ['день', 'дня', 'дней', 'day', 'days', 'tag', 'tage', 'tagen', 'giorno', 'giorni', 'día', 'días', 'dia', 'dias', 'jour', 'jours', '天', '日', '일']],
    ['week', ['неделю', 'недели', 'недель', 'week', 'weeks', 'woche', 'wochen', 'settimana', 'settimane', 'semana', 'semanas', 'semaine', 'semaines', '周', '週', '週間', '주']]
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
    let invalid = false, roundedToMinute = false, calendarInterpretation = '', onlyNearestWeekday = true;
    const nearestWeekdays = new Set();
    const addDate = (year, month, day, raw, explicitYear = true) => {
        onlyNearestWeekday = false;
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
    const unitMap = new Map(durationUnits.flatMap(([kind, words]) => words.map(word => [word, kind])));
    const unitPattern = [...unitMap.keys()].sort((a, b) => b.length - a.length).map(escaped).join('|');
    const duration = (raw, quantity, unit, offset, source) => {
        onlyNearestWeekday = false;
        const amount = Number(quantity), kind = unitMap.get(unit);
        const tail = source.slice(offset + raw.length);
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000 || new RegExp(`^\\s*(?:(?:и|and|und|e|y|et)\\s*)?\\d+\\s*(?:${unitPattern})`, 'u').test(tail)) { invalid = true; return ' '.repeat(raw.length); }
        const date = new Date(now);
        if (kind === 'day' || kind === 'week') date.setDate(date.getDate() + amount * (kind === 'week' ? 7 : 1));
        else { date.setTime(date.getTime() + amount * (kind === 'hour' ? 3600000 : 60000)); roundedToMinute = Boolean(date.getSeconds() || date.getMilliseconds()); date.setTime(Math.ceil(date.getTime() / 60000) * 60000); }
        if (date.getFullYear() > 9999) { invalid = true; return ' '.repeat(raw.length); }
        dates.add(formatDate(date));
        if (kind === 'minute' || kind === 'hour') times.add(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
        calendarInterpretation = 'relative'; evidence.push(raw); return ' '.repeat(raw.length);
    };
    const quantity = '[+-]?\\d+(?:[.,]\\d+)?';
    remaining = remaining.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:через|in|tra|fra|dentro de|en|dans|daqui a|em)\\s*(${quantity})\\s*(${unitPattern})(?![\\p{L}\\p{N}])`, 'gu'), duration);
    remaining = remaining.replace(new RegExp(`(?<![\\p{L}\\p{N}])(${quantity})\\s*(${unitPattern})\\s*(?:后|後|후)`, 'gu'), duration);
    const nextPrefix = '(?:следующий|следующую|следующая|следующее|следующем|next|nächsten|nächster|nächste|prossimo|prossima|próximo|próxima|prochain|prochaine|下个|下個|下|来週の|来週|다음 주)';
    const thisPrefix = '(?:этот|эту|эта|это|this|diesen|diese|questo|questa|este|esta|ce|cette|本|这|這|今週の|今週|이번 주)';
    for (const [weekday, names] of weekdays) for (const name of names) {
        const asian = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Hangul}]/u.test(name);
        const boundary = asian ? '' : '(?<![\\p{L}\\p{N}])';
        const end = asian ? '' : '(?![\\p{L}\\p{N}])';
        remaining = remaining.replace(new RegExp(`${boundary}(${nextPrefix}|${thisPrefix})?\\s*${escaped(name)}${end}(?:\\s+(${nextPrefix}|${thisPrefix}))?`, 'gu'), (raw, prefix, suffix) => {
            if (prefix && suffix && prefix !== suffix) invalid = true;
            prefix ||= suffix;
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
            const next = prefix && new RegExp(`^${nextPrefix}$`, 'u').test(prefix);
            if (prefix) {
                onlyNearestWeekday = false;
                const monday = (date.getDay() + 6) % 7;
                date.setDate(date.getDate() - monday + (weekday + 6) % 7 + (next ? 7 : 0));
            } else {
                date.setDate(date.getDate() + (weekday - date.getDay() + 7) % 7);
                nearestWeekdays.add(formatDate(date));
            }
            dates.add(formatDate(date)); evidence.push(raw);
            calendarInterpretation = prefix ? next ? 'next-week' : 'this-week' : 'weekday';
            return ' '.repeat(raw.length);
        });
    }
    for (const [offset, phrases] of relativeDays) {
        for (const phrase of phrases) {
            const asian = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Hangul}]/u.test(phrase);
            const pattern = asian ? escaped(phrase) : `(?<![\\p{L}\\p{N}])${escaped(phrase)}(?![\\p{L}\\p{N}])`;
            remaining = remaining.replace(new RegExp(pattern, 'gu'), raw => {
                onlyNearestWeekday = false;
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
    remaining = remaining.replace(/(?<![\p{L}\d:])(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m(?![\p{L}\d])\.?/gu, (raw, h, m, p) => {
        addTime(+h, +(m || 0), raw, p + 'm'); return ' '.repeat(raw.length);
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
    if (onlyNearestWeekday && nearestWeekdays.has(date) && date === formatDate(now) && time && time <= `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`) {
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12); date = formatDate(next);
    }
    const past = date < formatDate(now) || (date === formatDate(now) && time && time < `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    return { date, time, inferredDate, past: Boolean(past), evidence: [...new Set(evidence)], interpretation: calendarInterpretation, roundedToMinute };
}
