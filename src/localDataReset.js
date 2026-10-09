// A whole-app reset needs its own native confirmation: other accounts may have
// unsynced offline copies. It is offered only after confirmed account deletion.
export async function offerDeletedAccountReset({ native, plugin, getOwner, localize = text => text }) {
    if (!native || getOwner()) return { resetRequested: false, offered: false };
    const result = await plugin.offerReset({
        title: localize('Очистить данные приложения?'),
        message: localize('Аккаунт удалён. Чтобы убрать остатки записей из файлов телефона, можно полностью очистить данные приложения. Также будут удалены локальные копии других аккаунтов, несинхронизированные записи и настройки на этом устройстве. Облачные данные других аккаунтов сохранятся. Приложение закроется — затем откройте его снова.'),
        cancel: localize('Оставить локальные данные'),
        confirm: localize('Очистить и закрыть'),
    });
    return { ...result, offered: true };
}
