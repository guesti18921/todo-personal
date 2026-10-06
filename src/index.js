import { openNotebook, closeNotebook, savePart, onSaveStatus, flushNotebook, hasPendingChanges, isLocallySaved, readCloudChanges, getDraft, discardDraftAndReload } from './notebookStore.js';
import { supabase } from './supabaseClient.js';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createReminderEngine } from './reminderEngine.js';
import { listEntries, createMobileNotebook } from './mobileNotebook.js';
import { isNativeApp, setupNativeApp } from './nativeApp.js';
import { readCachedAccount } from './localAccount.js';
import { AUTH_REDIRECT_URL, createAuthLinkHandler } from './authDeepLink.js';
let mobileUI = null;
let reminderEngine = null;
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
const logout = document.querySelector('#logout-btn');
let registering = false;
let activeUser = null;
let activeUserEmail = '';
let generation = 0;
let ready = false;
let polling = false;
let changingAccount = false;

const bar = document.createElement('div');
bar.className = 'sync-bar';
bar.style.cssText = 'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:1000;max-width:96vw;padding:8px 12px;background:#f7f7f7;color:#501f3a;border:1px solid #c38d9e;border-radius:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:13px sans-serif;';
bar.hidden = true;
const status = document.createElement('span');
status.setAttribute('role', 'status');
bar.append(status);
function action(label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'padding:5px 8px;background:#c38d9e;color:white;border:0;border-radius:3px;cursor:pointer;font:inherit;';
    button.addEventListener('click', handler);
    bar.append(button);
    return button;
}
const retrySave = action('Retry save', () => { flushNotebook(); });
retrySave.hidden = true;
action('Download draft', () => {
    const draft = getDraft();
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'notebook-draft.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
action('Load cloud copy', async () => {
    if (hasPendingChanges() && !window.confirm('This replaces your unsaved edits with the cloud copy. Download your draft first. Continue?')) return;
    todoApp.inert = true;
    try {
        const state = await discardDraftAndReload();
        if (state && ready) applyState(state);
    } catch (error) { status.textContent = error.message; }
    finally { todoApp.inert = !ready; }
});
document.body.append(bar);
onSaveStatus(message => {
    status.textContent = message;
    mobileUI?.setStatus(message);
    retrySave.hidden = ['Saved', 'Saving...', 'Saved locally'].includes(message);
});

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
    bar.hidden = true;
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
retryLoad.type = 'button';
retryLoad.textContent = 'Retry loading notebook';
retryLoad.hidden = true;
authMessage.after(retryLoad);
retryLoad.addEventListener('click', () => { if (activeUser) loadAccount(activeUser, generation); });

async function loadAccount(id, ticket) {
    retryLoad.disabled = true;
    authMessage.textContent = 'Loading your notebook...';
    try {
        const state = await openNotebook(id);
        if (ticket !== generation || !state) return;
        applyState(state);
        ready = true;
        reminderEngine?.refresh();
        authScreen.hidden = true;
        todoApp.hidden = false;
        todoApp.inert = false;
        bar.hidden = false;
        retryLoad.hidden = true;
        setTimeout(refreshCloud, 0);
    } catch (error) {
        if (ticket !== generation) return;
        closeNotebook();
        authMessage.textContent = `Could not load notebook: ${error.message}`;
        retryLoad.hidden = false;
    } finally {
        if (ticket === generation) retryLoad.disabled = false;
    }
}
supabase.auth.onAuthStateChange((_event, session) => {
    const id = session?.user?.id || null;
    // Offline Android startup can use this device's last authenticated data
    // while Supabase is still trying to refresh an expired access token.
    if (_event === 'INITIAL_SESSION' && !id && isNativeApp() && readCachedAccount()?.id === activeUser) return;
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
    retryLoad.hidden = true;
    authForm.reset();
    authMessage.textContent = id ? 'Loading your notebook...' : '';
    // Run database calls outside the Supabase auth callback.
    if (id) setTimeout(() => { if (ticket === generation) loadAccount(id, ticket); }, 0);
});
resetScreen();

authSwitch.addEventListener('click', () => {
    registering = !registering;
    authMessage.textContent = '';
    authTitle.textContent = registering ? 'Sign up' : 'Sign in';
    authSubmit.textContent = registering ? 'Create account' : 'Sign in';
    authSwitch.textContent = registering ? 'Already have an account? Sign in' : 'Create an account';
    authPassword.autocomplete = registering ? 'new-password' : 'current-password';
});

authConfirmBack.addEventListener('click', () => {
    authConfirm.hidden = true;
    authForm.hidden = false;
    authSwitch.hidden = false;
    authTitle.hidden = false;
    authMessage.textContent = '';
    authPassword.value = '';

    registering = false;
    authTitle.textContent = 'Sign in';
    authSubmit.textContent = 'Sign in';
    authSwitch.textContent = 'Create an account';
    authPassword.autocomplete = 'current-password';
});
authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.querySelector('#auth-email').value.trim();
    const password = authPassword.value;
    const signUp = registering;
    authSubmit.disabled = authSwitch.disabled = true;
    authMessage.textContent = 'Please wait...';
    try {
        const { data, error } = signUp
            ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: isNativeApp() ? AUTH_REDIRECT_URL : location.origin + location.pathname } })
            : await supabase.auth.signInWithPassword({ email, password });
        if (error) authMessage.textContent = error.message;
        else if (signUp && !data.session) {
    authForm.hidden = true;
    authSwitch.hidden = true;
    authTitle.hidden = true;
    authMessage.textContent = '';
    authConfirmEmail.textContent = email;
    document.querySelector('#auth-confirm-instructions').textContent = isNativeApp()
        ? 'Open the link in the email to confirm your account and return to this app automatically.'
        : 'Open the link in the email to confirm your account. Then come back and sign in.';
    authConfirm.hidden = false;
}
    } catch (_) { authMessage.textContent = 'Connection failed. Please try again.'; }
    finally { authSubmit.disabled = authSwitch.disabled = false; }
});
logout.addEventListener('click', async () => {
    if (changingAccount) return;
    changingAccount = true;
    todoApp.inert = true;
    try {
        if (!await flushNotebook()) {
            window.alert('Your latest edits are not saved to the cloud. Retry saving or download your draft before leaving.');
            return;
        }
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) window.alert(error.message);
    } catch (error) { window.alert(error.message); }
    finally { changingAccount = false; todoApp.inert = !ready; }
});
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
    native: isNativeApp(), plugin: LocalNotifications, storage: localStorage,
    getRecords: () => ready && isLocallySaved() ? listEntries(todos, notes) : [],
    onDue: record => mobileUI?.notifyReminder(record),
    onStatus: value => mobileUI?.setReminderStatus(value)
});
mobileUI = createMobileNotebook({
    root: todoApp, todos, notes,
    persist() {
        savePart('todos', todos);
        savePart('notes', notes);
        domManipulator.renderAllToDos(todos, display);
        domManipulator.renderProjectNames(todos, display);
        mobileUI?.render();
        reminderEngine.refresh();
        return isLocallySaved();
    },
    logout: () => logout.click(),
    configureReminders: value => reminderEngine.configure(value),
    enableExactReminders: () => reminderEngine.enableExact(),
    refreshReminders: () => reminderEngine.refresh(),
    getAccount: () => activeUserEmail
});
mobileUI.setAccount(activeUser);
reminderEngine.setAccount(activeUser);
reminderEngine.start().catch(() => mobileUI.setReminderStatus({ native: isNativeApp(), enabled: false, scheduled: 0, error: 'Не удалось подключить уведомления Android. Попробуйте открыть приложение снова.' }));
setInterval(() => { if (!document.hidden) reminderEngine.refresh(); }, 15000);
window.addEventListener('focus', () => reminderEngine.refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) reminderEngine.refresh(); });
if (isNativeApp() && !activeUser) {
    const cached = readCachedAccount();
    if (cached && localStorage.getItem(`todo-personal:local:${cached.id}`)) {
        activeUser = cached.id;
        activeUserEmail = cached.email;
        const ticket = ++generation;
        resetScreen();
        mobileUI.setAccount(cached.id);
        reminderEngine.setAccount(cached.id);
        authScreen.hidden = false;
        authForm.hidden = true;
        authSwitch.hidden = true;
        loadAccount(cached.id, ticket);
    }
}
window.addEventListener('resize', () => mobileUI.render());
const handleAuthLink = createAuthLinkHandler({ auth: supabase.auth, onStatus(result) {
    if (result === 'pending') authMessage.textContent = 'Confirming your account...';
    if (result === 'error') {
        authConfirmBack.click();
        authMessage.textContent = 'Could not complete confirmation. The link may have expired, or the connection failed. Try the link again or sign in if your email is already confirmed.';
    }
} });
setupNativeApp({ ui: mobileUI, onAuthLink: handleAuthLink, onResume: async () => {
    await flushNotebook();
    reminderEngine.refresh();
    refreshCloud();
} }).catch(error => { status.textContent = `Android integration unavailable: ${error.message}`; });
