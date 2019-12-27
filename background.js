var uploads = new Map();

const kRestBase = "/ocs/v1.php";
const kAuthPath = kRestBase + "/cloud/user";
const kShareApp = kRestBase + "/apps/files_sharing/api/v1/shares";
const kWebDavPath = "/remote.php/dav/files/";
// const kWebDavPath = "/remote.php/webdav";

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

    let uploadInfo = { abortController: new AbortController() };
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
        throw new Error("Upload failed.");
    }

    // TODO Create share link
    let shareFormData = "path=";

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

    return { aborted: true };
});

browser.cloudFile.onFileUploadAbort.addListener((account, id) => {
    let uploadInfo = uploads.get(id);
    if (uploadInfo && uploadInfo.abortController) {
        uploadInfo.abortController.abort();
    }
});  