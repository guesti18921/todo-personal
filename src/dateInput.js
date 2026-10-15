// Keep the existing ISO date field and its change/save handlers. Android opens
// its own calendar instead of relying on OEM WebView date-segment editing.
export function attachNativeDatePicker(input, { pickDate, getOwner }) {
    input.readOnly = true;
    input.inputMode = 'none';
    input.setAttribute('aria-haspopup', 'dialog');
    input.style.userSelect = 'none';
    let busy = false;
    const open = async event => {
        event.preventDefault();
        if (busy || input.disabled) return;
        const owner = getOwner();
        busy = true;
        try {
            const result = await pickDate(input.value);
            if (getOwner() !== owner || !input.isConnected || input.disabled || !result || result.cancelled) return;
            const value = result.date;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Invalid date');
            const parsed = new Date(value + 'T12:00:00Z');
            if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
            input.value = value;
            input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
        } finally { busy = false; }
    };
    input.addEventListener('pointerdown', event => event.preventDefault());
    input.addEventListener('click', event => { open(event).catch(() => input.dispatchEvent(new input.ownerDocument.defaultView.Event('datepickererror', { bubbles: true }))); });
    input.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) open(event).catch(() => input.dispatchEvent(new input.ownerDocument.defaultView.Event('datepickererror', { bubbles: true }))); });
}
