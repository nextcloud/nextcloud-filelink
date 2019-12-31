var uploads = new Map();

const apiBaseUrl = "/ocs/v2.php";
const userInfoUrl = apiBaseUrl + "/cloud/users/";
const shareApiUrl = apiBaseUrl + "/apps/files_sharing/api/v1/shares";
const webDavUrl = "/remote.php/dav/files/";

/** Whenever TB starts, all the providers are in configured:false state */
browser.storage.local.get().then(
    data => {
        for (const key in data) {
            browser.cloudFile.updateAccount(key, { configured: true });
            updateStorageInfo(key);
        }
    }
);

/** encodeURIComponent does not encode every char that needs it, but / must not be encoded */
function encodePath(aStr) {
    return encodeURIComponent(aStr)
        .replace(/[!'()*]/g, c => {
            return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        })
        .replace(/%2F/gi, '/');
}

/* If an account is removed also remove its stored data */
browser.cloudFile.onAccountDeleted.addListener(async accountId => {
    browser.storage.local.remove([accountId]);
});

async function createOneFolder(accountData, folder) {
    let authHeader = "Basic " + btoa(accountData.username + ':' + accountData.password);

    // URL of the folder to create
    let url = accountData.serverUrl;
    url += webDavUrl;
    url += accountData.username;
    url += encodePath(folder);

    let headers = {
        "Authorization": authHeader
    };

    // Try to create the folder
    let fetchInfo = {
        method: "MKCOL",
        headers,
    };

    let response = await fetch(url, fetchInfo);
    return response.status;
}

async function recursivelyCreateFolder(accountData, folder) {
    // Looks clumsy, but *always* make sure recursion ends
    if (folder == "/") {
        return false
    } else {
        switch (await createOneFolder(accountData, folder)) {
            case 405: // Already exists
            case 201: // Created successfully
                return true;
                break;
            case 409: // Intermediate folder missing
                // Try to make parent folder
                if (await recursivelyCreateFolder(accountData, folder.split("/").slice(0, -1).join("/"))) {
                    // Try again
                    if (201 == await createOneFolder(accountData, folder)) {
                        return true
                    }
                }
                break;
        }
    }
    return false;
}

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {
    let accountInfo = await browser.storage.local.get(account.id);
    if (!accountInfo || !(account.id in accountInfo)) {
        throw new Error("Upload failed: No account data");
    };

    // Make sure storageFolder exists
    // Creation implicitly checks for existence of folder, so the extra webservice call for checking first isn't necessary.
    let foldersOK = await recursivelyCreateFolder(accountInfo[account.id], accountInfo[account.id].storageFolder);
    if (!foldersOK) {
        throw new Error("Upload failed: Can't create folder");
    }

    let uploadInfo = {
        name,
        abortController: new AbortController()
    };
    uploads.set(id, uploadInfo);

    // Combine some things we will be needing
    let authHeader = "Basic " + btoa(accountInfo[account.id].username + ':' + accountInfo[account.id].password);

    let headers = {
        // Content-Type is not yet necessary, but we will use the same headers for upload
        "Content-Type": "application/octet-stream",
        "Authorization": authHeader
    };

    //  Upload URL
    let url = accountInfo[account.id].serverUrl;
    url += webDavUrl;
    url += accountInfo[account.id].username;
    url += encodePath(accountInfo[account.id].storageFolder);
    url += '/' + encodePath(name);

    fetchInfo = {
        method: "PUT",
        headers,
        body: data,
        signal: uploadInfo.abortController.signal,
    };

    response = await fetch(url, fetchInfo);
    delete uploadInfo.abortController;

    if (!response.ok) {
        // Don't bother to translate, TB will use its own message anyway
        throw new Error("Upload failed:" + response.statusText);
    }

    updateStorageInfo(account.id);

    // Create share link
    let shareFormData = "path=" + encodePath(accountInfo[account.id].storageFolder + "/" + name);
    shareFormData += "&shareType=3"; // 3 == public share

    if (accountInfo[account.id].useDlPassword) {
        shareFormData += "&password=" + encodeURIComponent(accountInfo[account.id].downloadPassword)
    }

    url = accountInfo[account.id].serverUrl + shareApiUrl + "?format=json";

    headers = {
        'Content-Type': "application/x-www-form-urlencoded",
        "OCS-APIREQUEST": "true",
        "Authorization": authHeader
    };

    fetchInfo = {
        method: "POST",
        headers,
        body: shareFormData,
    };

    response = await fetch(url, fetchInfo);

    if (!response.ok) {
        // Don't bother to translate, TB will use its own message anyway
        throw new Error("Sharing failed:" + response.statusText);
    }

    let parsedResponse = await response.json();

    return { url: parsedResponse.ocs.data.url };
});

/** Try to delete a file */
browser.cloudFile.onFileDeleted.addListener(async (account, id) => {
    let uploadInfo = uploads.get(id);
    // If we don't have enough information about this upload, we can't delete it.
    if (!uploadInfo || !("name" in uploadInfo)) {
        return;
    }

    let accountInfo = await browser.storage.local.get(account.id);

    // Combine some things we will be needing
    let authHeader = "Basic " + btoa(accountInfo[account.id].username + ':' + accountInfo[account.id].password);

    // URL of the folder to create
    let url = accountInfo[account.id].serverUrl;
    url += webDavUrl;
    url += accountInfo[account.id].username;
    url += encodePath(accountInfo[account.id].storageFolder);
    url += '/' + encodePath(uploadInfo.name);

    let headers = {
        "Authorization": authHeader
    };

    let fetchInfo = {
        method: "DELETE",
        headers,
    };
    // Just do it, nothing we can do about errors
    await fetch(url, fetchInfo);

    uploads.delete(id);

    updateStorageInfo(account.id);
});

/** Copy & Paste from Dropbox extension */
browser.cloudFile.onFileUploadAbort.addListener((account, id) => {
    let uploadInfo = uploads.get(id);
    if (uploadInfo && uploadInfo.abortController) {
        uploadInfo.abortController.abort();
    }
});

async function updateStorageInfo(accountId) {
    let accountInfo = await browser.storage.local.get(accountId);

    // Combine some things we will be needing
    let authHeader = "Basic " + btoa(accountInfo[accountId].username + ':' + accountInfo[accountId].password);

    // URL of the user to check
    let url = accountInfo[accountId].serverUrl;
    url += userInfoUrl;
    url += accountInfo[accountId].username;
    url += "?format=json"

    let headers = {
        "Authorization": authHeader,
        "OCS-APIRequest": "true"
    };

    let fetchInfo = {
        method: "GET",
        headers,
    };

    let response = await fetch(url, fetchInfo);

    if (response.ok) {
        let data = await response.json();
        let spaceRemaining = data.ocs.data.quota.free;
        let spaceUsed = data.ocs.data.quota.used;
        browser.cloudFile.updateAccount(accountId, {
            spaceRemaining: spaceRemaining > 0 ? spaceRemaining : -1,
            spaceUsed: spaceUsed > 0 ? spaceUsed : -1,
        })
    }
}
