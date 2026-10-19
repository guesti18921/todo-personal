import { BACKUP_BYTES } from './backupStore.js';
export function pickWebBackup(doc = document) {
    return new Promise((resolve, reject) => {
        const input = doc.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
        doc.body.append(input);
        const finish = value => { input.remove(); resolve(value); };
        input.addEventListener('cancel', () => finish(null), { once: true });
        input.addEventListener('change', async () => {
            const file = input.files?.[0]; if (!file) { finish(null); return; }
            if (file.size > BACKUP_BYTES) { input.remove(); reject(new Error('Файл слишком большой. Максимальный размер — 8 МБ.')); return; }
            try { finish(await file.text()); } catch (_) { input.remove(); reject(new Error('Не удалось прочитать файл резервной копии.')); }
        }, { once: true });
        try { input.click(); } catch (_) { input.remove(); reject(new Error('Не удалось открыть выбор файла.')); }
    });
}
