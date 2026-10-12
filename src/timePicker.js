import { Capacitor, registerPlugin } from '@capacitor/core';
import { getTimeFormat, setDeviceTimeFormat, syncClockInputs } from './timeInput.js';
import { t } from './i18n.js';

const picker = registerPlugin('TimePicker');
export async function refreshDeviceTimeFormat() {
    if (Capacitor.getPlatform() !== 'android') return;
    try { const result = await picker.deviceFormat(); setDeviceTimeFormat(result.is24Hour ? '24' : '12'); }
    catch (_) { /* Browser locale remains the fallback. */ }
}

export async function showClockPicker(group) {
    const canonical = group.querySelector('input');
    if (canonical.disabled) return;
    const value = canonical.value || '09:00';
    const apply = next => {
        if (!group.isConnected || canonical.disabled) return;
        canonical.value = next; syncClockInputs(group.parentElement);
        canonical.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (Capacitor.getPlatform() === 'android') {
        const result = await picker.pick({ hour: Number(value.slice(0, 2)), minute: Number(value.slice(3)), is24Hour: getTimeFormat() === '24' });
        if (!result.cancelled) apply(`${String(result.hour).padStart(2, '0')}:${String(result.minute).padStart(2, '0')}`);
        return;
    }
    const dialog = document.createElement('dialog'); dialog.className = 'mn-time-dialog'; dialog.setAttribute('aria-label', group.getAttribute('aria-label')); 
    const heading = document.createElement('h2'); heading.textContent = group.getAttribute('aria-label');
    const controls = group.querySelector('.mn-clock-controls').cloneNode(true);
    dialog.append(heading, controls); controls.hidden = false;
    const actions = document.createElement('div'); actions.className = 'mn-suggestion-actions';
    for (const [label, accept] of [['Отмена', false], ['Готово', true]]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = accept ? 'mn-primary' : 'mn-secondary'; button.textContent = t(label);
        button.addEventListener('click', () => {
            if (accept) {
                const hour = controls.querySelector('[data-clock-part="hour"]').value;
                if (hour === '') { controls.querySelector('select').focus(); return; }
                const minute = controls.querySelector('[data-clock-part="minute"]').value;
                const period = controls.querySelector('[data-clock-part="period"]');
                const h = period ? Number(hour) % 12 + (period.value === 'PM' ? 12 : 0) : Number(hour);
                apply(`${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
            }
            dialog.close();
        }); actions.append(button);
    }
    dialog.append(actions); document.body.append(dialog);
    dialog.addEventListener('close', () => {
        delete group.dataset.value; syncClockInputs(group.parentElement);
        dialog.remove(); group.querySelector('[data-clock-open]')?.focus();
    }, { once: true });
    // Start with the canonical value (or 09:00) without changing the entry on cancel.
    const hour = controls.querySelector('[data-clock-part="hour"]');
    const h = Number(value.slice(0, 2)); hour.value = String(getTimeFormat() === '12' ? h % 12 || 12 : h);
    controls.querySelector('[data-clock-part="minute"]').value = String(Number(value.slice(3)));
    const period = controls.querySelector('[data-clock-part="period"]'); if (period) period.value = h >= 12 ? 'PM' : 'AM';
    dialog.showModal(); hour.focus();
}
