let accountId = new URL(location.href).searchParams.get("accountId");
let accountForm = document.querySelector("#accountForm");
let serverUrl = document.querySelector("#serverUrl");
let username = document.querySelector("#username");
let password = document.querySelector("#password");
let storageFolder = document.querySelector("#storageFolder");
let saveButton = document.querySelector("#saveButton");
let resetButton = document.querySelector("#resetButton");
let service_url = document.querySelector("#service_url");

(() => {
    // Add localized strings
    for (let element of document.querySelectorAll("[data-message]")) {
        element.textContent = browser.i18n.getMessage(element.dataset.message);
    };
    // Add text from other sources
    service_url.setAttribute("href", browser.runtime.getManifest().cloud_file.service_url);
    browser.cloudFile.getAccount(accountId).then(
        theAccount => {
            document.querySelector("#provider-name").textContent = theAccount.name;
        });
    // Make form active
    for (const inp of document.querySelectorAll("input")) {
        inp.oninput = activateSave;
    }
    // Fill in form fields
    setStoredData();
})();

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
    if (accountForm.checkValidity()) {
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
