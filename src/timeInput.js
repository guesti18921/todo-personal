// Storage and scheduling always use HH:mm. Only the presentation changes.
export function formatClock(value, language) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return '';
    if (language !== 'en') return value;
    const hour = Number(value.slice(0, 2));
    return `${hour % 12 || 12}:${value.slice(3)} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function timeInput(name, value, label, language) {
    const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? value : '';
    const english = language === 'en';
    const options = (count, offset, pad) => Array.from({ length: count }, (_, i) => {
        const n = String(i + offset), text = pad ? n.padStart(2, '0') : n;
        return `<option value="${n}">${text}</option>`;
    }).join('');
    return `<div class="mn-clock" data-clock="${name}" data-clock-format="${english ? '12' : '24'}" role="group" aria-label="${label}">
        <input type="time" name="${name}" value="${clock}" hidden>
        <select class="mn-input" data-clock-part="hour" aria-label="${label}: ${english ? 'hour' : 'часы'}"><option value="">—</option>${options(english ? 12 : 24, english ? 1 : 0, !english)}</select>
        <span aria-hidden="true">:</span>
        <select class="mn-input" data-clock-part="minute" aria-label="${label}: ${english ? 'minute' : 'минуты'}">${options(60, 0, true)}</select>
        ${english ? `<select class="mn-input" data-clock-part="period" aria-label="${label}: AM or PM"><option value="AM">AM</option><option value="PM">PM</option></select>` : ''}
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
