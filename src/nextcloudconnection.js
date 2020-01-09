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

const apiBaseUrl = "/ocs/v2.php";
const userInfoUrl = "/cloud/users/";
const shareApiUrl = "/apps/files_sharing/api/v1/shares";
const appPasswordUrl = "/core/getapppassword";
const davBaseUrl = "/remote.php/dav/files/";

/**
 * Some Utility function
 */
class utils {
    /**
     * Timeout as a Promise
     *
     * @param {number} seconds - The timeout to use in seconds
     * @returns {Object} - A promise that rejects after the requested number of
     * seconds
     */
    static timeout(seconds) {
        return new Promise(function (resolve, reject) {
            setTimeout(() => reject(new Error("Timeout")), seconds * 1000);
        });
    }

    /**
     * encodeURI leaves some components unencoded, so we replace them manually
     *
     * @param {string} aStr 
     * @returns {string}
     */
    static encodepath(aStr) {
        return encodeURI(aStr)
            .replace(/[,?:@&=+$#!'()*]/g,
                match => ('%' + match.charCodeAt(0).toString(16).toUpperCase()));
    }
}

/**
 * Encapsulates all calls to the Nextcloud web services (API and DAV)
 */
class NextcloudConnection {
    /**
     * Creates an object for communication with a Nextcloud instance. To use it
     * before account data is stored, supply all the optional parameters.
     *
     * @param {*} accountId - Whatever Thunderbird uses as an account identifier
     * @param {*} settings - An object containing all settings
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
        this._doApiCall(userInfoUrl + this._username, 'GET')
            .then(data => browser.cloudFile.updateAccount(this._accountId,
                {
                    spaceRemaining: data.free >= 0 ? data.free : -1,
                    spaceUsed: data.used > 0 ? data.used : -1,
                })
            );
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
     * Fetches a new app password from the Nextcloud web service and replaces
     * the current password with it
     */
    async convertToApppassword() {
        const data = await this._doApiCall(appPasswordUrl, "GET");
        if (data && data.apppassword) {
            this._password = data.apppassword;
        }
        return this._password;
    }

    /**
     * Deletes a file uploaded in the same Thunderbird session
     *
     * @param {number} fileId - Thunderbird's internal file id
     */
    async deleteFile(fileId) {
        const uploadInfo = uploads.get(fileId);
        // If we don't have enough information about this upload, we can't
        // delete it.
        if (!uploadInfo || !("name" in uploadInfo) || !uploadInfo.name) {
            return;
        }

        this._doDavCall(utils.encodepath(this._storageFolder) + '/' + utils.encodepath(uploadInfo.name), 'DELETE')
            .then(this.updateStorageInfo())
            .then(uploads.delete(fileId));
    }

    /**
     * Internal utility to create a complete folder path, returns true if that
     * path already exists
     *
     * @param {string} folder 
     */
    async _recursivelyCreateFolder(folder) {
        // Looks clumsy, but *always* make sure recursion ends
        if ("/" === folder) {
            return false;
        } else {
            switch (await this._doDavCall(utils.encodepath(folder), 'MKCOL')) {
                case 405: // Already exists
                case 201: // Created successfully
                    return true;
                case 409: // Intermediate folder missing
                    // Try to create parent folder
                    if (await this._recursivelyCreateFolder(folder.split("/").slice(0, -1).join("/"))) {
                        // Try again to create the initial folder
                        return (201 === await this._doDavCall(utils.encodepath(folder), 'MKCOL'));
                    }
                    break;
                default: break;
            }
        }
        return false;
    }

    /**
     * Upload a single file
     *
     * @param {number} fileId - The id Thunderbird uses to reference the upload
     * @param {string} fileName - w/o path
     * @param {*} body - File contents
     */
    async uploadFile(fileId, fileName, body) {
        // Make sure storageFolder exists. Creation implicitly checks for
        // existence of folder, so the extra webservice call for checking first
        // isn't necessary.
        const foldersOK = await this._recursivelyCreateFolder(this._storageFolder);
        if (!foldersOK) {
            throw new Error("Upload failed: Can't create folder");
        }

        let uploadInfo = {
            name: fileName,
            abortController: new AbortController(),
        };
        uploads.set(fileId, uploadInfo);

        //  Upload URL
        let url = this._serverurl;
        url += davBaseUrl;
        url += this._username;
        url += utils.encodepath(this._storageFolder);
        url += '/' + utils.encodepath(fileName);

        let fetchInfo = {
            method: "PUT",
            headers: this._davHeaders,
            body,
            signal: uploadInfo.abortController.signal,
        };

        let response = await fetch(url, fetchInfo);

        delete uploadInfo.abortController;

        if (response.ok) {
            this.updateStorageInfo();

            // Create share link
            let shareFormData = "path=" + utils.encodepath(this._storageFolder + "/" + fileName);
            shareFormData = "" + shareFormData + "&shareType=3"; // 3 = public share

            if (this._useDlPassword) {
                shareFormData += "&password=" + encodeURIComponent(this._downloadPassword);
            }

            let data = await this._doApiCall(shareApiUrl, 'POST', { "Content-Type": "application/x-www-form-urlencoded", }, shareFormData);
            if (data && data.url) {
                return { url: data.url, };
            }
            else {
                // We might want to delete the file
                throw new Error("Sharing failed.");
            }
        }
        throw new Error("Upload failed.");
    }

    /**
     * Abort a running upload
     *
     * @param {number} fileId - Thunderbird's upload reference number
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
     * @param {Object} settings - An object containing settings for all
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
            "User-Agent": "Filelink for Nextcloud",
            "Content-Type": "application/octet-stream",
        };

        this._apiHeaders = {
            "OCS-APIREQUEST": "true",
            "Authorization": auth,
            "User-Agent": "Filelink for Nextcloud",
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
     * Call a function of the Nextcloud web service API
     *
     * @param {string} suburl - The function's URL relative to the API base URL
     * @param {string} [method='GET'] - HTTP method of the function
     * @param {Object} [additional_headers] - Additional Headers this function
     * needs
     * @param {string} [body] - Request body if the function needs it
     * @returns {Object} - A Promise that resolves to the data element of the
     * response
     */
    async _doApiCall(suburl, method, additional_headers, body) {
        if (!this._complete) {
            throw new Error("Account not configured");
        }

        let fetchInfo = {
            method: method ? method : 'GET',
            headers: additional_headers ? { ...this._apiHeaders, ...additional_headers, } : this._apiHeaders,
        };
        if (undefined !== body) {
            fetchInfo = { ...fetchInfo, body, };
        }

        let url = this._serverurl;
        url += apiBaseUrl;
        url += suburl;
        url += "?format=json";

        let response = await Promise.race([
            fetch(url, fetchInfo),
            utils.timeout(apiTimeout),
        ]);
        if (response.ok) {
            let parsed = await response.json();
            return (parsed && parsed.ocs && parsed.ocs.data) ? parsed.ocs.data : undefined;
        }
        return undefined;
    }

    /**
     * Calls one function of the WebDAV service
     *
     * @param {string} path - the full file path of the object
     * @param {string} [method=GET] - the HTTP METHOD to use
     * @returns {number} - The HTTP status of the response
     */
    async _doDavCall(path, method) {
        if (!this._complete) {
            throw new Error("Account not configured");
        }

        let fetchInfo = {
            method,
            headers: this._davHeaders,
        };

        let url = this._serverurl;
        url += davBaseUrl;
        url += this._username;
        url += path;

        return Promise.race([
            fetch(url, fetchInfo),
            utils.timeout(apiTimeout),
        ]).then(response => {
            return response.status;
        });
    }
}