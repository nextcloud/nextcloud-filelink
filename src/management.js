/* MIT License

Copyright (c) 2020 Johannes Endres

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */

/* global NextcloudConnection */

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
    // Fill in form fields
    setStoredData();

    // Add localized strings
    for (const element of document.querySelectorAll("[data-message]")) {
        element.textContent = browser.i18n.getMessage(element.dataset.message);
    }

    // Add text from other sources
    service_url.setAttribute("href", browser.runtime.getManifest().cloud_file.service_url);

    browser.cloudFile.getAccount(accountId).then(
        theAccount => {
            document.querySelector("#provider-name").textContent = theAccount.name;

            // Update the free space gauge
            let free = theAccount.spaceRemaining;
            const used = theAccount.spaceUsed;
            if (free >= 0 && used >= 0) {
                const full = (free + used) / (1024.0 * 1024.0 * 1024.0); // Convert bytes to gigabytes
                free /= 1024.0 * 1024.0 * 1024.0;
                document.querySelector("#freespacelabel").textContent = browser.i18n.getMessage("freespace", [
                    free > 100 ? free.toFixed() : free.toPrecision(2),
                    full > 100 ? full.toFixed() : full.toPrecision(2),]);
                const meter = document.querySelector("#freespace");
                meter.max = full;
                meter.value = free;
                meter.low = full / 20;
                document.querySelector("#freespaceGauge").hidden = false;
            }
        });

    // Make form active
    for (const inp of document.querySelectorAll("input")) {
        inp.oninput = activateButtons;
    }
})();

/**
 * Load stored account data into form
 */
async function setStoredData() {
    downloadPassword.disabled = true;
    downloadPassword.required = false;

    const accountInfo = await browser.storage.local.get(accountId);
    if (accountId in accountInfo) {
        for (const key in accountInfo[accountId]) {
            const element = document.getElementById(key);
            if (element && accountInfo[accountId].hasOwnProperty(key)) {
                element.value = accountInfo[accountId][key];
                element.dataset.stored = accountInfo[accountId][key];
            }
        }
        useDlPassword.checked = accountInfo[accountId].useDlPassword;
        useDlPassword.dataset.stored = accountInfo[accountId].useDlPassword;
        downloadPassword.disabled = !useDlPassword.checked;
        downloadPassword.required = useDlPassword.checked;
    }
}

/** 
 * Handler for input event of all inputs: Only activate the buttons, if the form
 * input is OK
 */
function activateButtons() {
    if (accountForm.checkValidity()) {
        saveButton.disabled = false;
    } else {
        saveButton.disabled = true;
    }
    resetButton.disabled = false;
}

/**
 *  enable/disable download password field according to checkbox state
 */
useDlPassword.onclick = async () => {
    downloadPassword.disabled = !useDlPassword.checked;
    downloadPassword.required = !downloadPassword.disabled;
    accountForm.checkValidity();
};

/** 
 * Handler for Cancel button, restores saved values
 */
resetButton.onclick = async () => {
    setStoredData();
    resetButton.disabled = saveButton.disabled = true;
};

/** Handler for Save button */
saveButton.onclick = async () => {
    document.getElementById("provider-management").classList.add('busy');
    saveButton.disabled = resetButton.disabled = true;
    let states = {};
    for (let element of document.querySelectorAll("input")) {
        states[element.id] = element.disabled;
        element.disabled = true;
    }

    // Sanitize input
    for (const element of document.querySelectorAll("input")) {
        element.value = element.value.trim();
    }
    serverUrl.value = serverUrl.value.replace(/\/+$/, "");

    storageFolder.value = "/" + storageFolder.value.split('/').filter(e => "" !== e).join('/');

    // Copy data into a connection object
    const ncc = new NextcloudConnection(accountId,
        {
            serverUrl: serverUrl.value,
            username: username.value,
            password: password.value,
            storageFolder: storageFolder.value,
            useDlPassword: useDlPassword.checked,
            downloadPassword: downloadPassword.value,
        });

    // If user typed new password, try to convert it into app password
    if (password.value !== password.dataset.stored) {
        password.value = await ncc.convertToApppassword();
    }

    // Store account data
    ncc.store();

    browser.cloudFile.updateAccount(accountId, {
        configured: true,
    });

    // Re-activate form
    for (const elementId in states) {
        document.getElementById(elementId).disabled = states[elementId];
    }
    document.getElementById("provider-management").classList.remove('busy');
};