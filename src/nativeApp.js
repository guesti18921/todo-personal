import { Capacitor, registerPlugin } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { offerDeletedAccountReset } from './localDataReset.js';

const localDataReset = registerPlugin('LocalDataReset');
export function resetDeletedAccountData(getOwner, localize) {
    return offerDeletedAccountReset({ native: Capacitor.getPlatform() === 'android', plugin: localDataReset, getOwner, localize });
}

export function isNativeApp() { return Capacitor.isNativePlatform(); }

export async function setupNativeApp({ ui, onResume, onAuthLink }) {
    if (!isNativeApp()) return;
    document.documentElement.classList.add('native-app');
    let resuming = null, again = false;
    const resume = () => {
        if (resuming) { again = true; return resuming; }
        resuming = Promise.resolve().then(onResume).catch(() => {}).finally(() => {
            resuming = null;
            if (again) { again = false; resume(); }
        });
        return resuming;
    };
    await App.addListener('appUrlOpen', ({ url }) => { onAuthLink(url); });
    const launch = await App.getLaunchUrl();
    if (launch?.url) await onAuthLink(launch.url);
    await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) return resume();
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
    // A missing optional network listener must not disable Android's Back button.
    try { await Network.addListener('networkStatusChange', resume); } catch (_) { /* periodic sync remains active */ }
}

export async function openAuthBrowser(url, native = isNativeApp()) {
    if (native) await Browser.open({ url });
    else window.location.assign(url);
}
