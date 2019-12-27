let accountId = new URL(location.href).searchParams.get("accountId");
let accountData = document.getElementById("accountData");
let server = document.getElementById("server");
let port = document.getElementById("port");
let username = document.getElementById("username");
let storageFolder = document.getElementById("storageFolder");
let saveButton = document.getElementById("saveButton");
let cancelButton = document.getElementById("cancelButton");

(() => {
    for (let element of document.querySelectorAll("[data-message]")) {
        element.textContent = browser.i18n.getMessage(element.dataset.message);
    }
})();

browser.cloudFile.getAccount(accountId).then(
    theAccount => {
        document.getElementById("serviceName").textContent = theAccount.name;
        // TODO Move this to form changed handler
        if (theAccount.configured) {
            cancelButton.hidden = false;
        };
    });
setStoredData(accountId);

async function setStoredData(aID) {
    accountInfo = await browser.storage.local.get([aID]);
    if (aID in accountInfo) {
        for (const key in accountInfo[aID]) {
            let element = document.getElementById(key);
            if (element && accountInfo[aID].hasOwnProperty(key)) {
                element.value = accountInfo[aID][key];
            }
        }
    }
}

cancelButton.onclick = setStoredData(accountId);

/** Handler for Save button */
saveButton.onclick = async () => {
    // Only accept valid form data
    // TODO implement Check
    if (!accountData.checkValidity()) {
        return;
    }

    // Disable input while handling it
    for (let element of document.getElementsByTagName("input")) {
        element.disabled = true;
    };

    // sanitize input
    let server_url = server.value.trim().replace(/\/+$/, "");
    server.value = server_url;

    // Store account data
    let start = Date.now();
    await browser.storage.local.set({
        [accountId]:
        {
            server: server_url,
            port: port.value,
            username: username.value,
            storageFolder: storageFolder.value,
        },
    });
    await browser.cloudFile.updateAccount(accountId, { configured: true });
    setTimeout(() => {
        for (let element of document.getElementsByTagName("input")) {
            element.disabled = false;
        }
    }, Math.max(0, start + 500 - Date.now()));
};
