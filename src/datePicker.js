import { Capacitor, registerPlugin } from '@capacitor/core';
const calendar = registerPlugin('DatePicker');
export const usesNativeDatePicker = () => Capacitor.getPlatform() === 'android';
export function showDatePicker(value) {
    const now = new Date();
    const fallback = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    return calendar.pick({ date: value || fallback });
}
