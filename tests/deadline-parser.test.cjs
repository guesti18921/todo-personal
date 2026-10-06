const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
async function parser() {
    const module = new vm.SourceTextModule(readFileSync('src/deadlineParser.js', 'utf8'));
    await module.link(() => { throw new Error('Parser must work without dependencies/network'); });
    await module.evaluate();
    return module.namespace.suggestDeadline;
}
const now = new Date(2026, 9, 6, 17, 30);
test('explicit dates and times in ten languages preserve equivalent local deadlines', async () => {
    const parse = await parser();
    for (const text of ['Завтра в 18:00 купить продукты', 'Tomorrow at 6 pm call',
        'Morgen um 18 Uhr einkaufen', 'Domani alle 18 chiamare', 'Mañana a las 18 llamar',
        '明天下午6点打电话', '明日午後6時電話する', 'Demain à 18 appeler',
        'Amanhã às 18 ligar', '내일 오후6시 전화']) {
        const result = parse(text, now);
        assert.ok(result, text);
        assert.equal(result.date, '2026-10-07', text);
        assert.equal(result.time, '18:00', text);
        assert.equal(result.inferredDate, false);
    }
    assert.equal(parse('Завтра в 6 вечера', now).time, '18:00');
    assert.equal(parse('Today at 12 am', now).time, '00:00');
    assert.equal(parse('Today at 12 pm', now).time, '12:00');
    assert.equal(parse('明日１８：００電話', now).time, '18:00');
    assert.equal(parse('DAY   AFTER   TOMORROW at 6 pm', now).date, '2026-10-08');
});
test('long phrases, word boundaries and competing dates avoid arbitrary guesses', async () => {
    const parse = await parser();
    for (const text of ['послезавтра', 'day after tomorrow', 'übermorgen', 'dopodomani',
        'pasado mañana', 'après-demain', 'depois de amanhã', '後天', '明後日']) {
        assert.equal(parse(text, now)?.date, '2026-10-08', text);
    }
    for (const text of ['todayland', 'посегодня', '123', 'Купить 6 яблок',
        'today or tomorrow', 'завтра 18:00 или 19:00', 'Version 1.2.3',
        '31.02.2026', '2026-04-31', 'завтра в 25:00', 'tomorrow 6:99', 'tomorrow at 13 pm']) {
        assert.equal(parse(text, now), null, text);
    }
});
test('calendar validation, year rollover and time-only suggestions are explicit', async () => {
    const parse = await parser();
    assert.equal(parse('Сдать 07.10', now).date, '2026-10-07');
    assert.equal(parse('Сдать 05.10', now).date, '2027-10-05');
    assert.equal(parse('2028-02-29 09:30', now).date, '2028-02-29');
    assert.equal(parse('2027-02-29', now), null);
    assert.equal(parse('7/10/2026 09:30', now).date, '2026-10-07');
    assert.equal(parse('2026年10月7日午後6時', now).time, '18:00');
    assert.equal(parse('10月7日 18:00', now).date, '2026-10-07');
    assert.equal(parse('завтра', new Date(2026, 11, 31, 23, 59)).date, '2027-01-01');
    assert.equal(parse('tomorrow', new Date(2026, 2, 28, 23, 59)).date, '2026-03-29');
    assert.equal(parse('At 18:00', now).date, '2026-10-06');
    assert.equal(parse('At 16:00', now).date, '2026-10-07');
    assert.equal(parse('At 16:00', now).inferredDate, true);
    assert.equal(parse('сегодня в 16:00', now).past, true);
    assert.equal(parse('вчера', now).past, true);
    assert.equal(parse('завтра 2026-10-08', now), null);
});

test('dotted clock notation after a time preposition does not consume calendar dates', async () => {
 const parse = await parser();
 for (const text of ['Завтра в 18.00 позвонить', 'Tomorrow at 18.00 call', 'Morgen um 18.00 anrufen']) {
  assert.equal(parse(text, now)?.date, '2026-10-07', text); assert.equal(parse(text, now)?.time, '18:00', text);
 }
 assert.equal(parse('Сдать 07.10.2026', now)?.date, '2026-10-07');
 assert.equal(parse('Завтра в 25.00', now), null); assert.equal(parse('Завтра в 18.99', now), null);
});

test('numeric durations in ten languages calculate hours, calendar days and weeks without network', async () => {
 const parse = await parser();
 for (const text of ['Через 2 часа позвонить', 'Call in 2 hours', 'In 2 Stunden anrufen', 'Tra 2 ore chiamare', 'Llamar dentro de 2 horas', 'Dans 2 heures appeler', 'Daqui a 2 horas ligar', '2小时后打电话', '2時間後電話する', '2시간 후 전화']) {
  assert.equal(parse(text, now)?.date, '2026-10-06', text); assert.equal(parse(text, now)?.time, '19:30', text); assert.equal(parse(text, now)?.interpretation, 'relative');
 }
 for (const text of ['через 3 дня', 'in 3 days', 'in 3 Tagen', 'tra 3 giorni', 'en 3 días', 'dans 3 jours', 'em 3 dias', '3天后', '3日後', '3일 후']) {
  assert.equal(parse(text, now)?.date, '2026-10-09', text); assert.equal(parse(text, now)?.time, '', text);
 }
 assert.equal(parse('через 2 недели', now)?.date, '2026-10-20');
 assert.equal(parse('Через 30 минут', new Date(2026, 9, 6, 23, 50))?.date, '2026-10-07');
 assert.equal(parse('Через 1 минуту', new Date(2026, 9, 6, 17, 30, 59))?.time, '17:32');
 assert.equal(parse('Через 3 дня в 18:00', now)?.time, '18:00');
});
test('weekdays in ten languages distinguish nearest, next and current calendar weeks', async () => {
 const parse = await parser();
 for (const text of ['В пятницу в 18:00', 'Friday at 18:00', 'Freitag um 18:00', 'Venerdì alle 18:00', 'Viernes a las 18:00', 'Vendredi à 18:00', 'Sexta-feira às 18:00', '星期五18:00', '金曜日18:00', '금요일 18:00']) {
  assert.equal(parse(text, now)?.date, '2026-10-09', text); assert.equal(parse(text, now)?.time, '18:00', text);
 }
 for (const text of ['В следующую пятницу', 'Next Friday', 'Nächsten Freitag', 'Venerdì prossimo', 'Próximo viernes', 'Vendredi prochain', 'Na próxima sexta-feira', '下周五', '来週の金曜日', '다음 주 금요일']) assert.equal(parse(text, now)?.date, '2026-10-16', text);
 assert.equal(parse('This Monday', now)?.date, '2026-10-05'); assert.equal(parse('This Monday', now)?.past, true);
 assert.equal(parse('Во вторник в 16:00', now)?.date, '2026-10-13');
 assert.equal(parse('Во вторник в 18:00', now)?.date, '2026-10-06');
 assert.equal(parse('2026-10-06 Tuesday at 16:00', now)?.date, '2026-10-06', 'explicit calendar date does not shift automatically');
});
test('invalid, competing and unsupported compound durations never create partial suggestions', async () => {
 const parse = await parser();
 for (const text of ['через 0 минут', 'через -1 час', 'через 1.5 дня', 'in 999999999 days', 'через 1 час 30 минут', 'in 1 hour and 30 minutes', 'через 2 часа или через 3 часа', 'Monday or Friday', 'Завтра в пятницу']) assert.equal(parse(text, now), null, text);
});
