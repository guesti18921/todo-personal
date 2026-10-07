import { t, getLanguage, setLanguage, createLanguagePreferences } from './i18n.js';
import { openNotebook, closeNotebook, saveNotebook, onSaveStatus, flushNotebook, hasPendingChanges, isLocallySaved, readCloudChanges, getDraft, getSyncDetails, getRecoveryCopy, inspectConflict, resolveConflict } from './notebookStore.js';
import { supabase, SUPABASE_URL, SUPABASE_PUBLIC_KEY } from './supabaseClient.js';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createReminderEngine } from './reminderEngine.js';
import { listEntries, createMobileNotebook } from './mobileNotebook.js';
import { isNativeApp, setupNativeApp, openAuthBrowser } from './nativeApp.js';
import { readCachedAccount } from './localAccount.js';
import { AUTH_REDIRECT_URL, createAuthLinkHandler } from './authDeepLink.js';
import { boundedFetch } from './networkFetch.js';
import { authErrorMessage, createGoogleLogin, googleProviderEnabled } from './googleAuth.js';
import { createClient } from '@supabase/supabase-js';
import { createEmailConfirmation, EMAIL_CONFIRMATION_URL } from './emailConfirmation.js';
import { requestAccountDeletion, clearDeletedAccount, isAccountDeleted } from './accountDeletion.js';
let mobileUI = null;
let reminderEngine = null;
const retiredAccounts = new Set();
// all major functions are stored in these objects
import {toDosManager, domManipulator, notesManager} from "./todoFunctions.js"

// main window to render to
const display = document.querySelector('.main');
// button that opens form to create a new todo
const openForm = document.querySelector('.new-todo');
// button that closes form
const closeForm = document.querySelector('.create-new__close');
// background overlay behind create new todo form
const overlayNew = document.querySelector('.overlay-new');
// the create new todo form 
const addToDoForm = document.querySelector('.create-new');
// popup div that displays details of a todo
const detailsPopup = document.querySelector('.details-popup');
// background overlay behind details popup
const detailsOverlay = document.querySelector('.overlay-details');
// popup div that allows editing of todo item
const editPopup = document.querySelector('.edit-popup');
// background overlay behind edit popup. i should have used a single overlay but it messed with the positionings
// of all the diferent popups. next time ill make it work with one overlay. probably just need to set display none
// to the irrelevent popops
const editOverlay = document.querySelector('.overlay-edit');
// for some reason i have two variables for the same element. ill leave it for now
const editForm = document.querySelector('.edit-popup');
// each nav item that displays a different sub array of to-dos
const toDoFolders = document.querySelectorAll('.todo-folder');
// button to submit new project creation
const createProject = document.querySelector('.create-new__project-submit');
// button to submit new note creation
const createNote = document.querySelector('.create-new__note-submit');
// nav links to switch between creating a new todo, form and note from within the creation form
const newToDoLink = document.querySelector('#new-todo-link'); 
const newProjectLink = document.querySelector('#new-project-link'); 
const newNoteLink = document.querySelector('#new-note-link'); 
// menus to display when the corresponding creation nav links are clicked
const newToDoMenu = document.querySelector('#new-todo-menu');
const newProjectMenu = document.querySelector('#new-project-menu');
const newNoteMenu = document.querySelector('#new-note-menu');


// Each authenticated account starts with its own empty state.
const todos = Object.assign(Object.create(null), { home: [], today: [], week: [] });
const notes = [];

// initial homescreen render
domManipulator.renderAllToDos(todos, display);
domManipulator.renderProjectNames(todos, display);

// scroll to top of project names on page load
const projectsDiv = document.querySelector('.projects');
projectsDiv.scrollTop = 0;


// naviagtion side bar
// changes current folder to selected nav item
toDoFolders.forEach(folder => {
    folder.addEventListener("click", e => domManipulator.changeFolder(e, todos, display));
})

// control which form menu is open 
newToDoLink.addEventListener('click', () =>{
    // turn off other menus
    newProjectMenu.style.display = "none";
    newNoteMenu.style.display = "none";
    // DISPLAY SELECTED MENU
    newToDoMenu.style.display = "flex";
})

newProjectLink.addEventListener('click', () =>{
    // turn off other menus
    newToDoMenu.style.display = "none";
    newNoteMenu.style.display = "none";
    // DISPLAY SELECTED MENU
    newProjectMenu.style.display = "flex";
})

newNoteLink.addEventListener('click', () =>{
    // turn off other menus
    newToDoMenu.style.display = "none";
    newProjectMenu.style.display = "none";
    // DISPLAY SELECTED MENU
    newNoteMenu.style.display = "flex";
})

// toggles display on for overlay and form when the open form button is clicked
openForm.addEventListener('click', () => {
    overlayNew.classList.toggle('overlay-new-invisible');
    addToDoForm.classList.toggle('create-new-open');
})

// closes the form and toggles the display back 
closeForm.addEventListener('click', () => {
    overlayNew.classList.toggle('overlay-new-invisible');
    addToDoForm.classList.toggle('create-new-open');

    // I want the form to fade out before the inputs are reset.
    // i ended up using this sleep a lot, so next time i will put it into its own function for easier reuse. 
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
      }
    
    sleep(300).then(() => {
        // clear inputs after form closes 
        addToDoForm.reset();
        // removes active status from all priority buttons
        domManipulator.removeActivePriority();

        // resets form popup to shot new todo menu
        document.querySelector('#new-project-menu').style.display = "none";
        document.querySelector('#new-note-menu').style.display = "none";
        document.querySelector('#new-todo-menu').style.display = "flex";

        // resets form navigation to show active new todo link
        domManipulator.resetActiveFormLink();
    })
})

// when the submit new todo button is pressed, grab data from the form and create a new todo
addToDoForm.addEventListener('submit', e => {
    toDosManager.addNewToDo(e, todos, display, overlayNew, addToDoForm);
});

// add new poject
createProject.addEventListener('click', e => {
    toDosManager.addNewProject(e, todos, overlayNew, addToDoForm, display);
    
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
      }
    sleep(300).then(() => {
        // resets form active link back to new todo
        domManipulator.resetActiveFormLink();
    })
})

// add new note
createNote.addEventListener('click', e => {
    notesManager.addNewNote(e, notes, overlayNew, addToDoForm, display);

    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
      }
    sleep(300).then(() => {
        // resets form active link back to new todo
        domManipulator.resetActiveFormLink();
    })
    
})

// button that confirms edit on a todo
editForm.addEventListener('submit', e => {
    toDosManager.editToDo(e, todos, display, editOverlay, editForm);
})

// when a low / medium / high priority button is clicked in the create new todo form,
// then apply styling to that button to signify it has been clicked. also erases styling
// from previously clicked priority button.
const priorityBtns = document.querySelectorAll('.create-new__priority-btn');
    priorityBtns.forEach(btn => {
    btn.addEventListener('click', e =>{
        domManipulator.activePriority(e);
    });
})

// close details popup
const closeDetails = document.querySelector('.details-popup__close');
closeDetails.addEventListener('click', () => {
    detailsPopup.classList.toggle("details-popup-open");
    detailsOverlay.classList.toggle("overlay-details-invisible");
})

// close edit popup
const closeEdit = document.querySelector('.edit-popup__close');
closeEdit.addEventListener('click', () => {
    editPopup.classList.toggle("edit-popup-open");
    editOverlay.classList.toggle("overlay-edit-invisible");
})

// navigate to notes menu
// renders the notes and applys selected styling to the notes nav link
document.querySelector('#notes-nav').addEventListener('click', () => notesManager.arrangeNotes(notes));
document.querySelector('#notes-nav').addEventListener('click', (e) => domManipulator.updateActiveNavMain(e));

// selecting the outer li element so i can change folders by clicking this element as well as the inner li text.
let todoLinks = document.querySelectorAll('.nav__item--link');
todoLinks = Array.from(todoLinks);
// pop off the notes link since it already works without this hack
todoLinks.pop();
// naviagtion 2, for when the surrounding li item is clicked.
// i tried for a long time to make this work in a cleaner way but couldnt make it work.
//
todoLinks.forEach(folder => {
    folder.addEventListener("click", e => domManipulator.changeFolder2(e, todos, display));
})

// hamburger menu for mobile
const mobileMenu = document.querySelector('.menu-btn');
// flag that keeps track of if the menu is open or closed
let mobileMenuOpen = false;
// i couldnt add classes to the before and after divs, so did it inline instead,
// i really should have made it work with toggling classes like i usually do.
// this makes the hamburger icon spin into a cross upon clicking, then spins back when clicked again.
mobileMenu.addEventListener('click', () => {
    mobileMenuOpen = !mobileMenuOpen;
    if (mobileMenuOpen) {
        document.querySelector('.side-bar').style.left = 0;
        document.querySelector('.menu-btn__icon--before').style.transform = "rotate(135deg)";
        document.querySelector('.menu-btn__icon--before').style.top = "2px";
        document.querySelector('.menu-btn__icon--after').style.transform = "rotate(-135deg)";
        document.querySelector('.menu-btn__icon--after').style.top = "-2px";
        document.querySelector('.menu-btn__icon').style.backgroundColor = "transparent";
        
    } else {
        document.querySelector('.side-bar').style.left = "140px";
        document.querySelector('.menu-btn__icon--before').style.transform = "rotate(0)";
        document.querySelector('.menu-btn__icon--before').style.top = "-6px";
        document.querySelector('.menu-btn__icon--after').style.transform = "rotate(0)";
        document.querySelector('.menu-btn__icon--after').style.top = "6px";
        document.querySelector('.menu-btn__icon').style.backgroundColor = "#f7f7f7";
    }
})

// this sets an event listener on each of the todo / project / notes link within the create new form.
// it then sets active link styling to the selected link and removes it from the previous active link.
const createNewOptions = document.querySelectorAll('.create-new__options-items');
createNewOptions.forEach(option => {
    option.addEventListener('click', e => {
        createNewOptions.forEach(option => {
            option.classList.remove('create-new__options-items-active');
        });
        e.target.classList.add('create-new__options-items-active');
    });
})


const authScreen = document.querySelector('#auth-screen');
const todoApp = document.querySelector('#todo-app');
const authForm = document.querySelector('#auth-form');
const authSwitch = document.querySelector('#auth-switch');
const authTitle = document.querySelector('#auth-title');
const authSubmit = document.querySelector('#auth-submit');
const authMessage = document.querySelector('#auth-message');
const authConfirm = document.querySelector('#auth-confirm');
const authConfirmEmail = document.querySelector('#auth-confirm-email');
const authConfirmBack = document.querySelector('#auth-confirm-back');
const authPassword = document.querySelector('#auth-password');
const authGoogle = document.querySelector('#auth-google');
const authGoogleArea = document.querySelector('#auth-google-area');
const passwordToggle = document.querySelector('#auth-password-toggle');
let googleEnabled = false;
let checkingGoogle = false;
const logout = document.querySelector('#logout-btn');
let registering = false;
let activeUser = null;
let activeUserEmail = '';

// A separate non-persistent client prevents a cancelled verification request
// from silently changing the active account when its network response arrives.
const confirmationAuth = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'todo-personal:confirmation-check' },
    global: { fetch: boundedFetch }
});
let confirmationStatus = null;
const confirmationMessages = {
    waiting: 'Ожидаем подтверждение почты. Откройте письмо на любом устройстве. После подтверждения вход здесь завершится автоматически в течение 30 секунд.',
    offline: 'Нет соединения. Продолжим проверку подтверждения, когда появится интернет.',
    expired: 'Ожидание завершено. Если почта подтверждена, вернитесь к входу и введите пароль.',
    limited: 'Слишком много попыток. Подождите немного, затем вернитесь к входу.',
    failed: 'Не удалось завершить вход. Вернитесь к входу и проверьте почту и пароль.'
};
const emailConfirmation = createEmailConfirmation({
    auth: confirmationAuth.auth,
    applySession: session => supabase.auth.setSession(session),
    visible: () => !document.hidden && !authConfirm.hidden,
    onStatus(status) {
        confirmationStatus = status;
        if (confirmationMessages[status]) document.querySelector('#auth-confirm-instructions').textContent = t(confirmationMessages[status]);
    }
});
window.addEventListener('focus', () => emailConfirmation.check());
document.addEventListener('visibilitychange', () => { if (!document.hidden) emailConfirmation.check(); });

const authLanguage = document.querySelector('#auth-language');
function renderAuthLanguage() {
    document.documentElement.lang = getLanguage();
    authLanguage.value = getLanguage();
    document.querySelectorAll('[data-auth-text]').forEach(el => { el.textContent = t(el.dataset.authText); });
    authTitle.textContent = t(registering ? 'Регистрация' : 'Войти');
    authSubmit.textContent = t(registering ? 'Создать аккаунт' : 'Войти');
    authSwitch.textContent = t(registering ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт');
    document.querySelectorAll('.auth-retry').forEach(el => { if (el.dataset.authText) el.textContent = t(el.dataset.authText); });
    passwordToggle.textContent = t(authPassword.type === 'password' ? 'Показать пароль' : 'Скрыть пароль');
    document.querySelector('#auth-confirm-instructions').textContent = t(confirmationMessages[confirmationStatus] || (isNativeApp()
        ? 'Откройте ссылку из письма: после подтверждения вы вернётесь в приложение.'
        : 'Откройте ссылку из письма, затем вернитесь и войдите.'));
}
const languagePreferences = createLanguagePreferences({
    storage: localStorage, languages: navigator.languages || [navigator.language],
    updateUser: options => supabase.auth.updateUser(options),
    onChange(language) {
        setLanguage(language);
        renderAuthLanguage();
        mobileUI?.render();
        reminderEngine?.refresh();
    },
    onStatus(status) {
        if (status === 'error') showAccountMessage(t('Не удалось сохранить язык на устройстве. Освободите место и попробуйте снова.'));
    }
});
setLanguage(languagePreferences.getLanguage());
renderAuthLanguage();
function changeLanguage(language) {
    const before = getLanguage();
    const saved = languagePreferences.choose(language);
    authLanguage.value = getLanguage();
    if (saved && before !== language) {
        // Clear only the obsolete auth status, preserving email/password and registration mode.
        if (!activeUser) authMessage.textContent = '';
        else showAccountMessage(t('Выбор сохранён на устройстве. Отправим в аккаунт при подключении.'));
    }
    if (saved) setTimeout(() => languagePreferences.sync(), 0);
    return saved;
}
authLanguage.addEventListener('change', event => changeLanguage(event.target.value));
window.addEventListener('online', () => languagePreferences.sync());
window.addEventListener('focus', () => languagePreferences.sync());

function updateGoogleVisibility() { authGoogleArea.hidden = !googleEnabled || Boolean(activeUser) || authConfirm.hidden === false || authForm.hidden; }
async function refreshGoogleProvider() {
    if (checkingGoogle || activeUser) return;
    checkingGoogle = true;
    try { googleEnabled = await googleProviderEnabled({ fetch: boundedFetch, serverUrl: SUPABASE_URL, publicKey: SUPABASE_PUBLIC_KEY }); }
    catch (_) { googleEnabled = false; }
    finally { checkingGoogle = false; updateGoogleVisibility(); }
}
const googleLogin = createGoogleLogin({ auth: supabase.auth, native: isNativeApp(),
    serverUrl: SUPABASE_URL,
    redirectTo: isNativeApp() ? AUTH_REDIRECT_URL : location.origin + location.pathname,
    open: openAuthBrowser,
    onStatus(state, message) {
        authGoogle.disabled = authSubmit.disabled = authSwitch.disabled = state === 'pending';
        if (!activeUser) authMessage.textContent = state === 'pending' ? t('Открываем вход через Google…')
            : state === 'opened' ? t('Завершите вход в окне Google. Если закрыли его, можно попробовать снова.') : t(message);
    }
});
authGoogle.addEventListener('click', () => { if (googleEnabled) googleLogin.start(); });
passwordToggle.addEventListener('click', () => {
    const show = authPassword.type === 'password';
    authPassword.type = show ? 'text' : 'password';
    passwordToggle.textContent = show ? t('Скрыть пароль') : t('Показать пароль');
    passwordToggle.setAttribute('aria-pressed', String(show));
});
const authReturnParams = new URLSearchParams(location.hash.slice(1));
if (authReturnParams.has('error')) {
    authMessage.textContent = authReturnParams.get('error') === 'access_denied'
        ? t('Вход отменён. Можно попробовать снова или войти по почте.')
        : t('Не удалось завершить вход. Попробуйте снова или войдите по почте.');
    history.replaceState(null, '', location.pathname + location.search);
}
refreshGoogleProvider();
window.addEventListener('focus', refreshGoogleProvider);
window.addEventListener('online', refreshGoogleProvider);

let generation = 0;
let ready = false;
let polling = false;
let changingAccount = false;

onSaveStatus((message, details) => { mobileUI?.setStatus(message, details); });

function applyState(state) {
    for (const name of Object.keys(todos)) delete todos[name];
    Object.assign(todos, { home: [], today: [], week: [] }, state.todos);
    notes.splice(0, notes.length, ...state.notes);
    toDosManager.changeCurrentProject('home');
    domManipulator.renderAllToDos(todos, display);
    domManipulator.renderProjectNames(todos, display);
    document.querySelectorAll('.nav__selected').forEach(el => el.classList.remove('nav__selected'));
    document.querySelector('.nav').children.item(0).classList.add('nav__selected');
    mobileUI?.render();
    if (ready) reminderEngine?.refresh();
}
function resetScreen() {
    ready = false;
    todoApp.hidden = true;
    todoApp.inert = true;
    closeNotebook();
    applyState({ todos: { home: [], today: [], week: [] }, notes: [] });
    addToDoForm.reset();
    editPopup.querySelector('form').reset();
    detailsPopup.querySelector('.details-popup__content').textContent = '';
    addToDoForm.classList.remove('create-new-open');
    editPopup.classList.remove('edit-popup-open');
    detailsPopup.classList.remove('details-popup-open');
    overlayNew.classList.add('overlay-new-invisible');
    editOverlay.classList.add('overlay-edit-invisible');
    detailsOverlay.classList.add('overlay-details-invisible');
}
const retryLoad = document.createElement('button');
retryLoad.dataset.authText = 'Попробовать снова';
retryLoad.type = 'button';
retryLoad.textContent = t('Попробовать снова');
retryLoad.className = 'auth-retry';
retryLoad.hidden = true;
const switchAccount = document.createElement('button');
switchAccount.dataset.authText = 'Войти в другой аккаунт';
switchAccount.type = 'button';
switchAccount.className = 'auth-retry';
switchAccount.textContent = t('Войти в другой аккаунт');
switchAccount.hidden = true;
authMessage.after(retryLoad, switchAccount);
switchAccount.addEventListener('click', () => signOutAccount());
retryLoad.addEventListener('click', () => { if (activeUser) loadAccount(activeUser, generation); });

async function loadAccount(id, ticket) {
    retryLoad.disabled = switchAccount.disabled = true;
    authMessage.textContent = t('Открываем ваши записи…');
    try {
        const state = await openNotebook(id);
        if (ticket !== generation || !state) return;
        applyState(state);
        ready = true;
        reminderEngine?.refresh();
        authScreen.hidden = true;
        todoApp.hidden = false;
        todoApp.inert = false;
        retryLoad.hidden = switchAccount.hidden = true;
        setTimeout(refreshCloud, 0);
    } catch (error) {
        if (ticket !== generation) return;
        closeNotebook();
        authMessage.textContent = error instanceof SyntaxError || /^(Invalid|Unsupported) (local |notebook)/.test(error?.message || '')
            ? t('Не удалось прочитать сохранённые записи. Данные на устройстве оставлены без изменений. Попробуйте обновить приложение.')
            : t('Не удалось открыть записи. Проверьте интернет и попробуйте снова. Если это первый вход на устройстве, для загрузки записей нужна сеть.');
        retryLoad.hidden = switchAccount.hidden = false;
    } finally {
        if (ticket === generation) retryLoad.disabled = switchAccount.disabled = false;
    }
}
supabase.auth.onAuthStateChange((_event, session) => {
    const id = session?.user?.id || null;
    if (id && (retiredAccounts.has(id) || isAccountDeleted(localStorage, id))) {
        setTimeout(() => supabase.auth.signOut({ scope: 'local' }).catch(() => {}), 0);
        authMessage.textContent = t('Аккаунт удалён. Не удалось полностью очистить данные на устройстве. Очистите данные приложения в настройках телефона.');
        return;
    }
    if (id) { emailConfirmation.stop(); authPassword.value = ''; }
    // Offline startup can use this device's last authenticated data
    // while Supabase is still trying to refresh an expired access token.
    if (_event === 'INITIAL_SESSION' && !id && readCachedAccount()?.id === activeUser) return;
    languagePreferences.bindUser(session?.user);
    if (id) setTimeout(() => languagePreferences.sync(), 0);
    activeUserEmail = session?.user?.email || '';
    if (id === activeUser) return;
    activeUser = id;
    mobileUI?.setAccount(id);
    const ticket = ++generation;
    resetScreen();
    reminderEngine?.setAccount(id);
    authScreen.hidden = false;
    authConfirm.hidden = true;
    authTitle.hidden = false;
    authForm.hidden = Boolean(id);
    authSwitch.hidden = Boolean(id);
    updateGoogleVisibility();
    if (!id) refreshGoogleProvider();
    retryLoad.hidden = switchAccount.hidden = true;
    authForm.reset();
    authPassword.type = 'password';
    passwordToggle.textContent = t('Показать пароль');
    passwordToggle.setAttribute('aria-pressed', 'false');
    if (id) authMessage.textContent = t('Открываем ваши записи…');
    else if (_event !== 'INITIAL_SESSION') authMessage.textContent = '';
    // Run database calls outside the Supabase auth callback.
    if (id) setTimeout(() => { if (ticket === generation) loadAccount(id, ticket); }, 0);
});
resetScreen();

authSwitch.addEventListener('click', () => {
    emailConfirmation.stop();
    registering = !registering;
    authMessage.textContent = '';
    authTitle.textContent = registering ? t('Регистрация') : t('Войти');
    authSubmit.textContent = registering ? t('Создать аккаунт') : t('Войти');
    authSwitch.textContent = registering ? t('Уже есть аккаунт? Войти') : t('Создать аккаунт');
    authPassword.autocomplete = registering ? 'new-password' : 'current-password';
});

authConfirmBack.addEventListener('click', () => {
    emailConfirmation.stop();
    authConfirm.hidden = true;
    authForm.hidden = false;
    authSwitch.hidden = false;
    updateGoogleVisibility();
    authTitle.hidden = false;
    authMessage.textContent = '';
    authPassword.value = '';

    registering = false;
    authTitle.textContent = t('Войти');
    authSubmit.textContent = t('Войти');
    authSwitch.textContent = t('Создать аккаунт');
    authPassword.autocomplete = 'current-password';
});
authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.querySelector('#auth-email').value.trim();
    const password = authPassword.value;
    const signUp = registering;
    authGoogle.disabled = authSubmit.disabled = authSwitch.disabled = true;
    authMessage.textContent = t('Подождите…');
    try {
        const { data, error } = signUp
            ? await supabase.auth.signUp({ email, password, options: { data: { todo_personal_language: getLanguage() }, emailRedirectTo: EMAIL_CONFIRMATION_URL } })
            : await supabase.auth.signInWithPassword({ email, password });
        if (error && error.code !== 'email_not_confirmed' && error.message !== 'Email not confirmed') authMessage.textContent = t(authErrorMessage(error));
        else if ((signUp && !error && !data.session) || error?.code === 'email_not_confirmed' || error?.message === 'Email not confirmed') {
    authForm.hidden = true;
    authSwitch.hidden = true;
    updateGoogleVisibility();
    authTitle.hidden = true;
    authMessage.textContent = '';
    authConfirmEmail.textContent = email;
    document.querySelector('#auth-confirm-instructions').textContent = isNativeApp()
        ? t('Откройте ссылку из письма: после подтверждения вы вернётесь в приложение.')
        : t('Откройте ссылку из письма, затем вернитесь и войдите.');
    authConfirm.hidden = false;
    authPassword.value = '';
    emailConfirmation.start(email, password);
}
    } catch (_) { authMessage.textContent = t('Нет соединения. Проверьте интернет и попробуйте снова.'); }
    finally { authGoogle.disabled = authSubmit.disabled = authSwitch.disabled = false; }
});
function showAccountMessage(message) {
    if (ready) mobileUI?.showMessage(message);
    else authMessage.textContent = t(message);
}
async function signOutAccount() {
    if (changingAccount) return;
    changingAccount = true;
    todoApp.inert = true;
    switchAccount.disabled = retryLoad.disabled = true;
    showAccountMessage(t('Сохраняем записи перед выходом…'));
    try {
        if (!await flushNotebook()) {
            const info = getSyncDetails();
            showAccountMessage(info?.conflict
                ? t('Перед выходом сравните две копии блокнота на экране «Сохранение».')
                : info?.localSaved
                    ? t('Записи сохранены на устройстве, но ещё не отправлены в аккаунт. Проверьте интернет, откройте «Сохранение» и нажмите «Синхронизировать сейчас». Затем повторите выход.')
                    : t('Не удалось сохранить последние изменения. Оставьте блокнот открытым, освободите место на устройстве и повторите сохранение.'));
            return;
        }
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) showAccountMessage(t('Не удалось выйти. Попробуйте снова.'));
    } catch (_) { showAccountMessage(t('Не удалось выйти. Проверьте соединение и попробуйте снова.')); }
    finally { changingAccount = false; todoApp.inert = !ready; switchAccount.disabled = retryLoad.disabled = false; }
}
logout.addEventListener('click', signOutAccount);

async function deleteAccount() {
    if (changingAccount || !activeUser) throw new Error(t('Не удалось удалить аккаунт. Попробуйте снова.'));
    const owner = activeUser;
    changingAccount = true;
    todoApp.inert = true;
    let deleted = false;
    try {
        await requestAccountDeletion(supabase, owner, () => activeUser);
        deleted = true;
        retiredAccounts.add(owner);
        // Stop writers before removing this account's snapshots and drafts.
        if (activeUser === owner) {
            ++generation;
            resetScreen();
            activeUser = null;
            activeUserEmail = '';
            languagePreferences.bindUser(null);
            mobileUI?.setAccount(null);
        }
        const cleaned = clearDeletedAccount(localStorage, owner);
        const remindersCleared = await reminderEngine?.setAccount(activeUser);
        if (!activeUser) {
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (error) throw error;
            authScreen.hidden = false;
            authConfirm.hidden = true;
            authTitle.hidden = false;
            authForm.hidden = authSwitch.hidden = false;
            authForm.reset();
            registering = false;
            authTitle.textContent = authSubmit.textContent = t('Войти');
            authSwitch.textContent = t('Создать аккаунт');
            authPassword.autocomplete = 'current-password';
            updateGoogleVisibility();
            authMessage.textContent = t(cleaned && remindersCleared !== false ? 'Аккаунт и записи удалены.' : 'Аккаунт удалён. Не удалось полностью очистить данные на устройстве. Очистите данные приложения в настройках телефона.');
        }
    } catch (_) {
        if (!deleted) throw new Error(t('Удаление не подтверждено. Проверьте интернет и повторите попытку.'));
        authScreen.hidden = false;
        authMessage.textContent = t('Аккаунт удалён. Закройте и снова откройте приложение, чтобы завершить выход.');
    } finally { changingAccount = false; todoApp.inert = !ready; }
}

async function refreshCloud() {
    if (!ready || polling || changingAccount || document.hidden || hasPendingChanges()) return;
    if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
    if (document.querySelector('.create-new-open, .edit-popup-open, .details-popup-open')) return;
    if (mobileUI?.isEditing()) return;
    polling = true;
    try {
        const state = await readCloudChanges();
        if (state && ready) applyState(state);
    } finally { polling = false; }
}
setInterval(refreshCloud, 10000);
window.addEventListener('focus', refreshCloud);
reminderEngine = createReminderEngine({
    native: isNativeApp(), plugin: LocalNotifications, storage: localStorage, localize: t,
    getRecords: () => ready && isLocallySaved() ? listEntries(todos, notes) : [],
    isRecordsReady: () => ready && isLocallySaved(),
    onDue: record => mobileUI?.notifyReminder(record),
    onOpen: record => mobileUI?.openReminder(record) ?? false,
    onStatus: value => mobileUI?.setReminderStatus(value)
});
mobileUI = createMobileNotebook({
    root: todoApp, todos, notes, changeLanguage,
    persist() {
        const saved = saveNotebook({ todos, notes });
        domManipulator.renderAllToDos(todos, display);
        domManipulator.renderProjectNames(todos, display);
        mobileUI?.render();
        reminderEngine.refresh();
        return saved;
    },
    logout: signOutAccount,
    deleteAccount,
    configureReminders: value => reminderEngine.configure(value),
    enableExactReminders: () => reminderEngine.enableExact(),
    refreshReminders: () => reminderEngine.refresh(),
    getSyncDetails,
    async syncNow() {
        const id = activeUser;
        await flushNotebook();
        if (id !== activeUser) return;
        const state = await readCloudChanges();
        if (state && ready && id === activeUser) applyState(state);
        mobileUI?.setStatus('', getSyncDetails());
    },
    inspectConflict,
    async resolveConflict(mode) {
        const id = activeUser;
        const state = await resolveConflict(mode);
        if (state && ready && id === activeUser) { applyState(state); flushNotebook(); }
    },
    canExportNotebook: !isNativeApp(),
    exportNotebook(recovery = false) {
        const data = recovery ? getRecoveryCopy() : getDraft();
        if (!data) throw new Error(t('Нет сохранённой копии для скачивания.'));
        if (isNativeApp()) throw new Error(t('Скачивание файла пока доступно в веб-версии. Резервная копия сохранена на этом устройстве.'));
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url;
        link.download = `todo-personal-${recovery ? 'recovery' : 'backup'}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    getAccount: () => activeUserEmail
});
mobileUI.setAccount(activeUser);
reminderEngine.setAccount(activeUser);
reminderEngine.start().catch(() => mobileUI.setReminderStatus({ native: isNativeApp(), enabled: false, scheduled: 0, error: t('Не удалось подключить уведомления Android. Попробуйте открыть приложение снова.') }));
setInterval(() => { if (!document.hidden) { reminderEngine.refresh(); languagePreferences.sync(); } }, 15000);
window.addEventListener('focus', () => reminderEngine.refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) reminderEngine.refresh(); });
if (!activeUser) {
    const cached = readCachedAccount();
    if (cached && localStorage.getItem(`todo-personal:local:${cached.id}`)) {
        activeUser = cached.id;
        activeUserEmail = cached.email;
        languagePreferences.bindUser({ id: cached.id }, { cached: true });
        const ticket = ++generation;
        resetScreen();
        mobileUI.setAccount(cached.id);
        reminderEngine.setAccount(cached.id);
        authScreen.hidden = false;
        authForm.hidden = true;
        authSwitch.hidden = true;
    updateGoogleVisibility();
        loadAccount(cached.id, ticket);
    }
}
window.addEventListener('resize', () => mobileUI.render());
const handleAuthLink = createAuthLinkHandler({ auth: supabase.auth, onStatus(result) {
    if (result === 'pending') authMessage.textContent = t('Завершаем вход…');
    if (result === 'error') {
        authConfirmBack.click();
        authMessage.textContent = t('Не удалось завершить вход. Проверьте соединение и попробуйте снова. Если подтверждаете почту, откройте ссылку из письма ещё раз.');
    }
} });
setupNativeApp({ ui: mobileUI, onAuthLink: handleAuthLink, onResume: async () => {
    await flushNotebook();
    reminderEngine.refresh();
    refreshCloud();
} }).catch(() => { mobileUI?.showMessage(t('Не удалось подключить функции Android. Закройте и снова откройте приложение.')); });

if (!isNativeApp() && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).then(async registration => {
            if (!registration.active) await navigator.serviceWorker.ready;
            mobileUI?.setOfflineReady(true);
        }).catch(() => mobileUI?.setOfflineReady(false));
    });
} else if (isNativeApp()) mobileUI.setOfflineReady(true);
window.addEventListener('online', () => { if (ready) refreshCloud(); });
