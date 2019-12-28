var uploads = new Map();

const kRestBase = "/ocs/v2.php";
const kAuthPath = kRestBase + "/cloud/user";
const kShareApp = kRestBase + "/apps/files_sharing/api/v1/shares";
const kWebDavPath = "/remote.php/dav/files/";

/** encodeURIComponent does not encode every char that needs it */
function wwwFormUrlEncode(aStr) {
    return encodeURIComponent(aStr)
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A')
        .replace(/\@/g, '%40');
}

/* If an account is removed also remove its stored data */
browser.cloudFile.onAccountDeleted.addListener(async accountId => {
    browser.storage.local.remove([accountId]);
});

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {

    let accountInfo = await browser.storage.local.get(account.id);

    let uploadInfo = {
        name,
        abortController: new AbortController()
    };
    uploads.set(id, uploadInfo);

    // Combine some things we will be needing
    let serverUrl = accountInfo[account.id].server + ':' + accountInfo[account.id].port;
    let authHeader = "Basic " + btoa(accountInfo[account.id].username + ':' + accountInfo[account.id].password);

    // URL of the folder to create
    let url = serverUrl;
    url += kWebDavPath;
    url += accountInfo[account.id].username;
    url += accountInfo[account.id].storageFolder;

    let headers = {
        "Content-Type": "application/octet-stream",
        "Authorization": authHeader
    };

    let fetchInfo = {
        method: "MKCOL",
        headers,
        signal: uploadInfo.abortController.signal,
    };
    // Just do it, handle errors later
    let response = await fetch(url, fetchInfo);

    //  Uplaod URL
    url += '/' + wwwFormUrlEncode(name);
    fetchInfo = {
        method: "PUT",
        headers,
        body: data,
        signal: uploadInfo.abortController.signal,
    };

    response = await fetch(url, fetchInfo);

    if (!response.ok) {
        // Don't bother to translate, TB will use its own message anyway
        throw new Error("Upload failed:" + response.statusText);
    }

    // Create share link
    let shareFormData = "path=" + wwwFormUrlEncode(accountInfo[account.id].storageFolder + "/" + name);
    shareFormData += "&shareType=3";

    url = serverUrl + kShareApp + "?format=json";

    headers = {
        'Content-Type': "application/x-www-form-urlencoded",
        "OCS-APIREQUEST": "true",
        "Authorization": authHeader
    };

    fetchInfo = {
        method: "POST",
        headers,
        body: shareFormData,
        signal: uploadInfo.abortController.signal,
    };

    response = await fetch(url, fetchInfo);

    if (!response.ok) {
        // Don't bother to translate, TB will use its own message anyway
        throw new Error("Sharing failed:" + response.statusText);
    }

    delete uploadInfo.abortController;

    let parsedResponse = await response.json();

    return { url: parsedResponse.ocs.data.url };
});

// TODO Test this. I have no idea when TB calls it
/** Try to delete a file */
browser.cloudFile.onFileDeleted.addListener(async (account, id) => {
    let uploadInfo = uploads.get(id);
    // If we don't have enough information about this upload, we can't delete it.
    if (!uploadInfo || !("name" in uploadInfo)) {
        return;
    }

    let accountInfo = await browser.storage.local.get(account.id);

    // Combine some things we will be needing
    let serverUrl = accountInfo[account.id].server + ':' + accountInfo[account.id].port;
    let authHeader = "Basic " + btoa(accountInfo[account.id].username + ':' + accountInfo[account.id].password);

    // URL of the folder to create
    let url = serverUrl;
    url += kWebDavPath;
    url += accountInfo[account.id].username;
    url += accountInfo[account.id].storageFolder;
    url += '/' + wwwFormUrlEncode(name);

    let headers = {
        "Authorization": authHeader
    };

    let fetchInfo = {
        method: "DELETE",
        headers,
    };
    // Just do it, nothing we can do about errors
    fetch(url, fetchInfo);

    uploads.delete(id);
});

/** Copy & Paste from Dropbox extension */
browser.cloudFile.onFileUploadAbort.addListener((account, id) => {
    let uploadInfo = uploads.get(id);
    if (uploadInfo && uploadInfo.abortController) {
        uploadInfo.abortController.abort();
    }
});  