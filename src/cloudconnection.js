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

/** Map of all the uploads in the current Thunderbird session */
var uploads = new Map();

/** Configurable options and useful constants */
const apiTimeout = 3; // seconds

const apiBaseUrl = "/ocs/v1.php";
const userInfoUrl = "/cloud/users/";
const shareApiUrl = "/apps/files_sharing/api/v1/shares";
const appPasswordUrl = "/core/getapppassword";
const capabilitiesUrl = "/cloud/capabilities";
const defaultDavUrl = "/remote.php/dav/files/";

/**
 * encodeURI leaves some components unencoded, so we replace them manually
 *
 * @param {string} aStr 
 * @returns {string}
 */
function encodepath(aStr) {
    return encodeURI(aStr)
        .replace(/[,?:@&=+$#!'()*]/g,
            match => ('%' + match.charCodeAt(0).toString(16).toUpperCase()));
}

/**
 * This class encapsulates all calls to the Nextcloud or ownCloud web services (API and DAV)
 */
class CloudConnection {
    /**
     * Creates an object for communication with a Nextcloud/ownCloud instance. To use it
     * before account data is stored, supply all the optional parameters.
     *
     * @param {*} accountId Whatever Thunderbird uses as an account identifier
     * @param {*} [settings] An object containing all settings
     */
    constructor(accountId, settings) {
        this._accountId = accountId;
        this._complete = false;

        if (settings) {
            this._init(settings);
        }
    }

    /**
     * Gets free/used space from web service and sets the parameters in
     * Thunderbirds cloudFileAccount
     */
    async updateStorageInfo() {
        this._doApiCall(userInfoUrl + this._username)
            .then(data => {
                if (data && data.quota) {
                    browser.cloudFile.updateAccount(this._accountId,
                        {
                            spaceRemaining: data.quota.free >= 0 ? data.quota.free : -1,
                            spaceUsed: data.quota.used > 0 ? data.quota.used : -1,
                        });
                }
            });
    }

    /**
     * Store the current values of all properties in the local browser storage
     */
    async store() {
        browser.storage.local.set({
            [this._accountId]:
            {
                serverUrl: this._serverurl,
                username: this._username,
                password: this._password,
                storageFolder: this._storageFolder,
                useDlPassword: this._useDlPassword,
                downloadPassword: this._downloadPassword,
            },
        });
    }

    /**
     * Sets the "configured" property of Thunderbird's cloudFileAccount
     * according to actual state
     */
    async updateConfigured() {
        browser.cloudFile.updateAccount(this._accountId, { configured: this._complete, });
    }

    /**
     * Fetches a new app password from the Nextcloud/ownCloud web service and replaces
     * the current password with it
     */
    async convertToApppassword() {
        try {
            const data = await this._doApiCall(appPasswordUrl);

            if (data && data.apppassword) {
                this._password = data.apppassword;
            }
        } catch (error) {
            // Ignore any errors because we can still use the password from the form            
        }
        return this._password;
    }

    /**
     * Deletes a file uploaded in the same Thunderbird session
     *
     * @param {number} fileId Thunderbird's internal file id
     */
    async deleteFile(fileId) {
        const uploadInfo = uploads.get(fileId);
        // If we don't have enough information about this upload, we can't
        // delete it.
        if (!uploadInfo || !("name" in uploadInfo) || !uploadInfo.name) {
            return;
        }

        let path = encodepath(this._storageFolder + '/' + uploadInfo.name);
        // Check if file is shared
        let data = await this._doApiCall(shareApiUrl + '?path=' + path);
        // It's either not shared at all or just once (by us)
        if (!data || data.length === 1) {
            this._doDavCall(path, 'DELETE')
                .then(this.updateStorageInfo())
                .then(uploads.delete(fileId));
        }
    }

    /**
     * Create a complete folder path, returns true if that  path already exists
     *
     * @param {string} folder 
     */
    async _recursivelyCreateFolder(folder) {
        // Looks clumsy, but *always* make sure recursion ends
        if ("/" === folder) {
            return false;
        } else {
            let response = await this._doDavCall(encodepath(folder), 'MKCOL')
                .catch(e => { return { status: 666, }; });
            switch (response.status) {
                case 405: // Already exists
                case 201: // Created successfully
                    return true;
                case 409: // Intermediate folder missing
                    // Try to create parent folder
                    if (await this._recursivelyCreateFolder(folder.split("/").slice(0, -1).join("/"))) {
                        // Try again to create the initial folder
                        response = await this._doDavCall(encodepath(folder), 'MKCOL')
                            .catch(e => { return { status: 666, }; });
                        return (201 === response.status);
                    }
                    break;
            }
        }
        return false;
    }

    /**
     * Upload a single file
     *
     * @param {number} fileId The id Thunderbird uses to reference the upload
     * @param {string} fileName w/o path
     * @param {*} body File contents
     */
    async uploadFile(fileId, fileName, body) {
        // Make sure storageFolder exists. Creation implicitly checks for
        // existence of folder, so the extra webservice call for checking first
        // isn't necessary.
        if (!(await this._recursivelyCreateFolder(this._storageFolder))) {
            throw new Error("Upload failed: Can't create folder");
        }

        let uploadInfo = {
            name: fileName,
            abortController: new AbortController(),
        };
        uploads.set(fileId, uploadInfo);

        let fullpath = encodepath(this._storageFolder + '/' + fileName);
        let response = await this._doDavCall(fullpath, "PUT", body, uploadInfo.abortController)
            .catch(e => {
                if ("AbortError" === e.name) {
                    return { aborted: true, url: "", };
                } else {
                    throw e;
                }
            })
            .finally(delete uploadInfo.abortController);

        if (response.aborted) {
            return response;
        } else if (response.ok) {
            this.updateStorageInfo();

            // Create share link
            let shareFormData = "path=" + encodepath(this._storageFolder + "/" + fileName);
            shareFormData = "" + shareFormData + "&shareType=3"; // 3 = public share

            if (this._useDlPassword) {
                shareFormData += "&password=" + encodeURIComponent(this._downloadPassword);
            }

            let data = await this._doApiCall(shareApiUrl, 'POST', { "Content-Type": "application/x-www-form-urlencoded", }, shareFormData);
            if (data && data.url) {
                return { url: data.url, aborted: false, };
            }
            else {
                throw new Error("Sharing failed.");
            }
        }
        throw new Error("Upload failed.");
    }

    /**
     * Abort a running upload
     *
     * @param {number} fileId Thunderbird's upload reference number
     */
    static abortUpload(fileId) {
        const uploadInfo = uploads.get(fileId);
        if (uploadInfo && uploadInfo.abortController) {
            uploadInfo.abortController.abort();
        }
    }

    /**
     * Clean up if an account is deleted
     */
    async deleteAccount() {
        browser.storage.local.remove(this._accountId);
    }

    /**
     * Internal function to load properties with values
     *
     * @param {*} settings An object containing settings for all
     * properties
     */
    _init(settings) {
        this._complete = true;
        /* Copy all account data to fields */
        this._serverurl = settings.serverUrl;
        this._complete = this._complete && Boolean(this._serverurl);

        this._username = settings.username;
        this._complete = this._complete && Boolean(this._username);

        this._password = settings.password;
        this._complete = this._complete && Boolean(this._password);

        this._storageFolder = settings.storageFolder;
        this._complete = this._complete && Boolean(this._storageFolder);

        this._useDlPassword = settings.useDlPassword;
        this._downloadPassword = settings.downloadPassword;
        if (this._useDlPassword) {
            this._complete = this._complete && Boolean(this._downloadPassword);
        }

        let auth = "Basic " + btoa(this._username + ':' + this._password);

        this._davHeaders = {
            "Authorization": auth,
            "User-Agent": "Filelink for *cloud",
            "Content-Type": "application/octet-stream",
        };

        this._apiHeaders = {
            "OCS-APIREQUEST": "true",
            "Authorization": auth,
            "User-Agent": "Filelink for *cloud",
        };
    }

    /**
     * Load account state from configuration storage
     */
    async setup() {
        this._complete = false;
        let accountInfo = await browser.storage.local.get(this._accountId);
        if (accountInfo && this._accountId in accountInfo) {
            this._init(accountInfo[this._accountId]);
        }
    }

    /**
     * Call a function of the Nextcloud/ownCloud web service API
     *
     * @param {string} suburl The function's URL relative to the API base URL
     * @param {string} [method='GET'] HTTP method of the function, default GET
     * @param {*} [additional_headers] Additional Headers this function
     * needs
     * @param {string} [body] Request body if the function needs it
     * @returns {*} A Promise that resolves to the data element of the
     * response
     */
    async _doApiCall(suburl, method, additional_headers, body) {
        if (!this._complete) {
            throw new Error("Account not configured");
        }

        let url = this._serverurl;
        url += apiBaseUrl;
        url += suburl;
        url += (suburl.includes('?') ? '&' : '?') + "format=json";

        let fetchInfo = {
            method: method ? method : 'GET',
            headers: additional_headers ? { ...this._apiHeaders, ...additional_headers, } : this._apiHeaders,
        };
        if (undefined !== body) {
            fetchInfo.body = body;
        }
        let controller = new AbortController();
        let timeout = setTimeout(() => controller.abort(), 1000 * apiTimeout);
        fetchInfo.signal = controller.signal;

        return fetch(url, fetchInfo)
            .then(clearTimeout(timeout))
            .then(response => response.json())
            .then(
                // json was parseable
                parsed => (parsed && parsed.ocs && parsed.ocs.data) ? parsed.ocs.data : {},
                // Problem parsing json?
                e => {
                    if (e.message.startsWith("JSON.parse")) {
                        return {};
                    } else {
                        throw e;
                    }
                });
    }

    /**
     * Calls one function of the WebDAV service
     *
     * @param {string} path the full file path of the object
     * @param {string} [method=GET] the HTTP METHOD to use, default GET
     * @param {*} [body] Body of the request, eg. file contents
     * @param {*} [abortController] An AbortController to abort the network transaction
     * @returns {*}  A Promise that resolves to the Response object
     */
    async _doDavCall(path, method, body, abortController) {
        if (!this._complete) {
            throw new Error("Account not configured");
        }

        if (!this._davUrl) {
            // Fetch URL from capabilities
            let data = await this._doApiCall(capabilitiesUrl);
            if (data && data.capabilities && data.capabilities.core && data.capabilities.core["webdav-root"]) {
                this._davUrl = "/" + data.capabilities.core["webdav-root"];
            } else {
                // Use default from docs instead
                this._davUrl = defaultDavUrl + this._username;
            }
        }

        let url = this._serverurl;
        url += this._davUrl;
        url += path;

        // If an AbortController was given, use it ...
        let controller = abortController;
        let timeout;
        if (!controller) {
            // ... otherwise create one that handles the timeout
            controller = new AbortController();
            timeout = setTimeout(() => controller.abort(),
                1000 * apiTimeout);
        }

        let fetchInfo = {
            signal: controller.signal,
            method,
            headers: this._davHeaders,
        };
        if (body) {
            fetchInfo.body = body;
        }

        return fetch(url, fetchInfo)
            .then(clearTimeout(timeout));
    }
}