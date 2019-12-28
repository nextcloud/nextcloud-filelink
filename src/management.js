let accountId = new URL(location.href).searchParams.get("accountId");
let accountData = document.getElementById("accountData");
let serverUrl = document.getElementById("serverUrl");
let username = document.getElementById("username");
let password = document.getElementById("password");
let storageFolder = document.getElementById("storageFolder");
let saveButton = document.getElementById("saveButton");
let resetButton = document.getElementById("resetButton");

(() => {
    for (let element of document.querySelectorAll("[data-message]")) {
        element.textContent = browser.i18n.getMessage(element.dataset.message);
    }
})();

browser.cloudFile.getAccount(accountId).then(
    theAccount => {
        document.getElementById("provider-name").textContent = theAccount.name;
    });
setStoredData();

for (const inp of document.querySelectorAll("input")) {
    inp.oninput = activateSave;
}

async function setStoredData() {
    accountInfo = await browser.storage.local.get([accountId]);
    if (accountId in accountInfo) {
        // Disable input while handling it
        for (let element of document.querySelectorAll("input")) {
            element.disabled = true;
        };
        for (const key in accountInfo[accountId]) {
            let element = document.getElementById(key);
            if (element && accountInfo[accountId].hasOwnProperty(key)) {
                element.value = accountInfo[accountId][key];
            }
        }
        // Disable input while handling it
        for (let element of document.querySelectorAll("input")) {
            element.disabled = false;
        };
    }
}

/** Only activate the Save button, if the form input is OK */
function activateSave() {
    if (accountData.checkValidity()) {
        saveButton.disabled = false;
    } else {
        saveButton.disabled = true;
    };
    resetButton.disabled = false;
}

/** Handler for Cancel button, restores saved values */
resetButton.onclick = async () => {
    setStoredData();
    resetButton.disabled = saveButton.disabled = true;
}

/** Handler for Save button */
saveButton.onclick = async () => {

    saveButton.disabled = resetButton.disabled = true;

    // Sanitize input
    for (let element of document.querySelectorAll("input")) {
        element.disabled = true;
        element.value = element.value.trim();
    };
    serverUrl.value = serverUrl.value.replace(/\/+$/, "");

    storageFolder.value = storageFolder.value.replace(/\/+$/, "");
    if (!storageFolder.value.startsWith("/")) {
        storageFolder.value = "/" + storageFolder.value;
    }

    // Store account data
    let start = Date.now();
    await browser.storage.local.set({
        [accountId]:
        {
            serverUrl: serverUrl.value,
            username: username.value,
            password: password.value,
            storageFolder: storageFolder.value,
        },
    });
    await browser.cloudFile.updateAccount(accountId, {
        configured: true,
        // Default upload limit of Nextcloud
        uploadSizeLimit: 512 * 1024 * 1024,
    });
    setTimeout(() => {
        for (let element of document.querySelectorAll("input")) {
            element.disabled = false;
        };
        saveButton.disabled = resetButton.disabled = true;
    }, Math.max(0, start + 500 - Date.now()));
};
