"use strict";

const accountId = new URL(location.href).searchParams.get("accountId");
const accountForm = document.querySelector("#accountForm");
const serverUrl = document.querySelector("#serverUrl");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const storageFolder = document.querySelector("#storageFolder");
const saveButton = document.querySelector("#saveButton");
const resetButton = document.querySelector("#resetButton");
const service_url = document.querySelector("#service_url");
const useDlPassword = document.querySelector("#useDlPassword");
const downloadPassword = document.querySelector("#downloadPassword");

(() => {
    // Fill in form fields
    setStoredData();

    // Add localized strings
    for (const element of document.querySelectorAll("[data-message]")) {
        element.textContent = browser.i18n.getMessage(element.dataset.message);
    };
    // Add text from other sources
    service_url.setAttribute("href", browser.runtime.getManifest().cloud_file.service_url);

    browser.cloudFile.getAccount(accountId).then(
        theAccount => {
            document.querySelector("#provider-name").textContent = theAccount.name;
            // Update the free space gauge
            const free = theAccount.spaceRemaining;
            const used = theAccount.spaceUsed;
            if (free >= 0 && used >= 0) {
                const full = (free + used) / (1024.0 * 1024.0 * 1024.0); // Convert bytes to gigabytes
                free /= 1024.0 * 1024.0 * 1024.0;
                document.querySelector("#freespacelabel").textContent = browser.i18n.getMessage("freespace", [
                    free > 100 ? free.toFixed() : free.toPrecision(2),
                    full > 100 ? full.toFixed() : full.toPrecision(2)]);
                const meter = document.querySelector("#freespace");
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
})();

async function setStoredData() {
    downloadPassword.disabled = true;
    downloadPassword.required = false;

    const accountInfo = await browser.storage.local.get([accountId]);
    if (accountId in accountInfo) {
        for (const key in accountInfo[accountId]) {
            const element = document.getElementById(key);
            if (element && accountInfo[accountId].hasOwnProperty(key)) {
                element.value = accountInfo[accountId][key];
                element.dataset.stored = accountInfo[accountId][key];
            }
        };
        useDlPassword.checked = accountInfo[accountId].useDlPassword;
        useDlPassword.dataset.stored = accountInfo[accountId].useDlPassword;
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
};

/** Convert the given password into an app password */
async function convertPassword() {
    let retval = {
        password: password.value,
        loginOk: false,
    };

    const url = serverUrl.value + "/ocs/v2.php/core/getapppassword?format=json";

    const headers = {
        "Authorization": "Basic " + btoa(username.value + ':' + password.value),
        "OCS-APIRequest": "true",
        "User-Agent": "Filelink for Nextcloud",
    };

    const fetchInfo = {
        method: "GET",
        headers,
    };

    const response = await fetch(url, fetchInfo);
    const ocsData = (await response.json()).ocs.data;
    if (200 === response.status && ocsData.apppassword) {
        retval.password = ocsData.apppassword;
        retval.loginOk = true;
    } else if (403 === response.status) {
        // It's already a valid token, don't change
        retval.loginOk = true;
    };

    return retval;
}

/** Handler for Save button */
saveButton.onclick = async () => {
    document.getElementById("provider-management").classList.add('busy');
    saveButton.disabled = resetButton.disabled = true;
    let states = {};
    for (let element of document.querySelectorAll("input")) {
        states[element.id] = element.disabled;
        element.disabled = true;
    };

    // Sanitize input
    for (const element of document.querySelectorAll("input")) {
        element.value = element.value.trim();
    };
    serverUrl.value = serverUrl.value.replace(/\/+$/, "");

    storageFolder.value = storageFolder.value.replace(/\/+$/, "");
    if (!storageFolder.value.startsWith("/")) {
        storageFolder.value = "/" + storageFolder.value;
    }

    /* Convert password to app token using nextcloud web service */
    if (password.value !== password.dataset.stored) {
        password.value = (await convertPassword()).password;
    }

    // Store account data
    await browser.storage.local.set({
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

    for (const elementId in states) {
        document.getElementById(elementId).disabled = states[elementId];
    };
    document.getElementById("provider-management").classList.remove('busy');
};