/* 
MIT License

Copyright (c) 2020 Johannes Endres

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
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

/* If an account is removed also remove its stored data and the app token */
browser.cloudFile.onAccountDeleted.addListener(async accountId => {
    browser.storage.local.remove([accountId]);
});

async function createOneFolder(accountData, folder) {
    const authHeader = "Basic " + btoa(accountData.username + ':' + accountData.password);

    // URL of the folder to create
    let url = accountData.serverUrl;
    url += webDavUrl;
    url += accountData.username;
    url += encodePath(folder);

    const headers = {
        "Authorization": authHeader
    };

    // Try to create the folder
    const fetchInfo = {
        method: "MKCOL",
        headers,
    };

    let response = await fetch(url, fetchInfo);
    return response.status;
}

async function recursivelyCreateFolder(accountData, folder) {
    // Looks clumsy, but *always* make sure recursion ends
    if ("/" === folder) {
        return false;
    } else {
        switch (await createOneFolder(accountData, folder)) {
            case 405: // Already exists
            case 201: // Created successfully
                return true;
            case 409: // Intermediate folder missing
                // Try to make parent folder
                if (await recursivelyCreateFolder(accountData, folder.split("/").slice(0, -1).join("/"))) {
                    // Try again
                    if (201 === await createOneFolder(accountData, folder)) {
                        return true;
                    }
                }
                break;
        }
    }
    return false;
}

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {
    const accountInfo = await browser.storage.local.get(account.id);
    if (!accountInfo || !(account.id in accountInfo)) {
        throw new Error("Upload failed: No account data");
    }

    // Make sure storageFolder exists
    // Creation implicitly checks for existence of folder, so the extra webservice call for checking first isn't necessary.
    const foldersOK = await recursivelyCreateFolder(accountInfo[account.id], accountInfo[account.id].storageFolder);
    if (!foldersOK) {
        throw new Error("Upload failed: Can't create folder");
    }

    let uploadInfo = {
        name,
        abortController: new AbortController()
    };
    uploads.set(id, uploadInfo);

    // Combine some things we will be needing
    const authHeader = "Basic " + btoa(accountInfo[account.id].username + ':' + accountInfo[account.id].password);

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

    let fetchInfo = {
        method: "PUT",
        headers,
        body: data,
        signal: uploadInfo.abortController.signal,
    };

    let response = await fetch(url, fetchInfo);
    delete uploadInfo.abortController;

    if (!response.ok) {
        // Don't bother to translate, TB will use its own message anyway
        throw new Error("Upload failed:" + response.statusText);
    }

    updateStorageInfo(account.id);

    // Create share link
    let shareFormData = "path=" + encodePath(accountInfo[account.id].storageFolder + "/" + name);
    shareFormData += "&shareType=3"; // 3 = public share

    if (accountInfo[account.id].useDlPassword) {
        shareFormData += "&password=" + encodeURIComponent(accountInfo[account.id].downloadPassword);
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

    const parsedResponse = await response.json();

    return { url: parsedResponse.ocs.data.url };
});

/** Try to delete a file */
browser.cloudFile.onFileDeleted.addListener(async (account, id) => {
    let uploadInfo = uploads.get(id);
    // If we don't have enough information about this upload, we can't delete it.
    if (!uploadInfo || !("name" in uploadInfo)) {
        return;
    }

    const accountInfo = await browser.storage.local.get(account.id);

    // Combine some things we will be needing
    const authHeader = "Basic " + btoa(accountInfo[account.id].username + ':' + accountInfo[account.id].password);

    // URL of the folder to create
    let url = accountInfo[account.id].serverUrl;
    url += webDavUrl;
    url += accountInfo[account.id].username;
    url += encodePath(accountInfo[account.id].storageFolder);
    url += '/' + encodePath(uploadInfo.name);

    const headers = {
        "Authorization": authHeader
    };

    const fetchInfo = {
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
    const uploadInfo = uploads.get(id);
    if (uploadInfo && uploadInfo.abortController) {
        uploadInfo.abortController.abort();
    }
});

async function updateStorageInfo(accountId) {
    const accountInfo = await browser.storage.local.get(accountId);

    // Combine some things we will be needing
    const authHeader = "Basic " + btoa(accountInfo[accountId].username + ':' + accountInfo[accountId].password);

    // URL of the user to check
    let url = accountInfo[accountId].serverUrl;
    url += userInfoUrl;
    url += accountInfo[accountId].username;
    url += "?format=json";

    const headers = {
        "Authorization": authHeader,
        "OCS-APIRequest": "true"
    };

    const fetchInfo = {
        method: "GET",
        headers,
    };

    let response = await fetch(url, fetchInfo);

    if (response.ok) {
        const data = await response.json();
        const spaceRemaining = data.ocs.data.quota.free;
        const spaceUsed = data.ocs.data.quota.used;
        browser.cloudFile.updateAccount(accountId, {
            spaceRemaining: spaceRemaining > 0 ? spaceRemaining : -1,
            spaceUsed: spaceUsed > 0 ? spaceUsed : -1,
        });
    }
}
