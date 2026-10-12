// Storage and scheduling always use HH:mm. Only the presentation changes.
const TIME_FORMAT_KEY = 'todo-personal:time-format';
let deviceFormat = null;
export function getTimePreference() {
    try { const value = localStorage.getItem(TIME_FORMAT_KEY); return ['12', '24'].includes(value) ? value : 'device'; }
    catch (_) { return 'device'; }
}
export function setTimePreference(value) {
    if (!['device', '12', '24'].includes(value)) return false;
    try { localStorage.setItem(TIME_FORMAT_KEY, value); return true; } catch (_) { return false; }
}
export function setDeviceTimeFormat(value) { deviceFormat = value === '12' ? '12' : '24'; }
export function getTimeFormat(language) {
    const chosen = getTimePreference();
    if (chosen !== 'device') return chosen;
    if (deviceFormat) return deviceFormat;
    const locale = typeof navigator !== 'undefined' ? (navigator.languages?.[0] || navigator.language) : language;
    return new Intl.DateTimeFormat(locale || undefined, { hour: 'numeric' }).resolvedOptions().hour12 ? '12' : '24';
}
export const clockHourCycle = () => getTimeFormat() === '12' ? 'h12' : 'h23';
export function formatClock(value, language, format = getTimeFormat(language)) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return '';
    if (format !== '12') return value;
    const hour = Number(value.slice(0, 2));
    return `${hour % 12 || 12}:${value.slice(3)} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function timeInput(name, value, label, language) {
    const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? value : '';
    const english = getTimeFormat(language) === '12';
    const options = (count, offset, pad) => Array.from({ length: count }, (_, i) => {
        const n = String(i + offset), text = pad ? n.padStart(2, '0') : n;
        return `<option value="${n}">${text}</option>`;
    }).join('');
    return `<div class="mn-clock" data-clock="${name}" data-clock-format="${english ? '12' : '24'}" role="group" aria-label="${label}">
        <input type="time" name="${name}" value="${clock}" hidden>
        <button type="button" class="mn-input mn-clock-button" data-clock-open>${formatClock(clock, language) || (language === 'en' ? 'Choose time' : 'Выбрать время')}</button>
        <div class="mn-clock-controls" hidden>
        <select class="mn-input" data-clock-part="hour" aria-label="${label}: ${language === 'en' ? 'hour' : 'часы'}"><option value="">—</option>${options(english ? 12 : 24, english ? 1 : 0, !english)}</select>
        <span aria-hidden="true">:</span>
        <select class="mn-input" data-clock-part="minute" aria-label="${label}: ${language === 'en' ? 'minute' : 'минуты'}">${options(60, 0, true)}</select>
        ${english ? `<select class="mn-input" data-clock-part="period" aria-label="${label}: ${language === 'en' ? 'AM or PM' : 'AM или PM'}"><option value="AM">AM</option><option value="PM">PM</option></select>` : ''}
        </div>
    </div>`;
}

export function syncClockInputs(root) {
    root.querySelectorAll('[data-clock]').forEach(group => {
        const canonical = group.querySelector('input');
        if (group.dataset.value !== canonical.value) {
            const hour = Number(canonical.value.slice(0, 2));
            group.querySelector('[data-clock-part="hour"]').value = canonical.value ? String(group.dataset.clockFormat === '12' ? hour % 12 || 12 : hour) : '';
            group.querySelector('[data-clock-part="minute"]').value = canonical.value ? String(Number(canonical.value.slice(3))) : '0';
            const period = group.querySelector('[data-clock-part="period"]');
            if (period) period.value = hour >= 12 ? 'PM' : 'AM';
            group.dataset.value = canonical.value;
        }
        group.querySelectorAll('select').forEach(select => { select.disabled = canonical.disabled; });
        const button = group.querySelector('[data-clock-open]');
        if (button) { button.disabled = canonical.disabled; button.textContent = formatClock(canonical.value, null, group.dataset.clockFormat) || (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'Choose time' : 'Выбрать время'); }
    });
}

export function readClockInput(target) {
    const group = target.closest('[data-clock]');
    if (!group || !target.hasAttribute('data-clock-part')) return target;
    const canonical = group.querySelector('input');
    if (canonical.disabled) return canonical;
    const hour = group.querySelector('[data-clock-part="hour"]').value;
    const minute = group.querySelector('[data-clock-part="minute"]').value;
    const period = group.querySelector('[data-clock-part="period"]');
    const convertedHour = period ? Number(hour) % 12 + (period.value === 'PM' ? 12 : 0) : Number(hour);
    canonical.value = hour ? `${String(convertedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : '';
    // Keep AM/PM and minutes chosen before the hour while the value is empty.
    group.dataset.value = canonical.value;
    return canonical;
}
