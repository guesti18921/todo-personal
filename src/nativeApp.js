import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export function isNativeApp() { return Capacitor.isNativePlatform(); }

export async function setupNativeApp({ ui, onResume }) {
    if (!isNativeApp()) return;
    document.documentElement.classList.add('native-app');
    await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onResume();
        else ui.saveDraft();
    });
    await App.addListener('backButton', () => {
        const active = document.activeElement;
        if (active?.matches('input, textarea, [contenteditable="true"]')) {
            active.blur();
            return;
        }
        if (!ui.back()) App.minimizeApp();
    });
}
