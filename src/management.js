let accountId = new URL(location.href).searchParams.get("accountId");
let accountForm = document.querySelector("#accountForm");
let serverUrl = document.querySelector("#serverUrl");
let username = document.querySelector("#username");
let password = document.querySelector("#password");
let storageFolder = document.querySelector("#storageFolder");
let saveButton = document.querySelector("#saveButton");
let resetButton = document.querySelector("#resetButton");
let service_url = document.querySelector("#service_url");
let useDlPassword = document.querySelector("#useDlPassword");
let downloadPassword = document.querySelector("#downloadPassword");

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
            // Update the free space gauge
            let free = theAccount.spaceRemaining;
            let used = theAccount.spaceUsed;
            if (free >= 0 && used >= 0) {
                let full = (free + used) / (1024.0 * 1024.0 * 1024.0); // Convert bytes to gigabytes
                free /= 1024.0 * 1024.0 * 1024.0;
                document.querySelector("#freespacelabel").textContent = browser.i18n.getMessage("freespace", [
                    free > 100 ? free.toFixed() : free.toPrecision(2),
                    full > 100 ? full.toFixed() : full.toPrecision(2)]);
                let meter = document.querySelector("#freespace");
                meter.max = full;
                meter.value = free;
                meter.low = full / 20;
                document.querySelector("#freespaceGauge").hidden = false;
            }
        });
    // Make form active
    for (const inp of document.querySelectorAll("input")) {
        inp.oninput = activateSave;
    }
    // Fill in form fields
    setStoredData();
})();

async function setStoredData() {
    useDlPassword.checked = false;
    downloadPassword.disabled = true;
    downloadPassword.required = false;

    accountInfo = await browser.storage.local.get([accountId]);
    if (accountId in accountInfo) {
        for (const key in accountInfo[accountId]) {
            let element = document.getElementById(key);
            if (element && accountInfo[accountId].hasOwnProperty(key)) {
                element.value = accountInfo[accountId][key];
            }
        };
        useDlPassword.checked = accountInfo[accountId].useDlPassword;
        downloadPassword.disabled = !useDlPassword.checked;
        downloadPassword.required = useDlPassword.checked;
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

useDlPassword.onclick = async () => {
    downloadPassword.disabled = !useDlPassword.checked;
    downloadPassword.required = !downloadPassword.disabled;
    accountForm.checkValidity();
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
        element.value = element.value.trim();
    };
    serverUrl.value = serverUrl.value.replace(/\/+$/, "");

    storageFolder.value = storageFolder.value.replace(/\/+$/, "");
    if (!storageFolder.value.startsWith("/")) {
        storageFolder.value = "/" + storageFolder.value;
    }

    // Store account data
    await browser.storage.local.set({
        // TODO fetch all input fields
        [accountId]:
        {
            serverUrl: serverUrl.value,
            username: username.value,
            password: password.value,
            storageFolder: storageFolder.value,
            useDlPassword: useDlPassword.checked,
            downloadPassword: downloadPassword.value,
        },
    });
    await browser.cloudFile.updateAccount(accountId, {
        configured: true,
        // Default upload limit of Nextcloud
        uploadSizeLimit: 512 * 1024 * 1024,
    });
};