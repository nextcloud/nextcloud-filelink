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

/* global DavUploader  */
/* global encodepath  */
/* global daysFromTodayIso */

//#region  Configurable options and useful constants
const apiTimeout = 3; // seconds

const apiUrlBase = "/ocs/v1.php";
const apiUrlUserInfo = "/cloud/users/";
const apiUrlShares = "/apps/files_sharing/api/v1/shares";
const apiUrlGetApppassword = "/core/getapppassword";
const apiUrlCapabilities = "/cloud/capabilities";
const davUrlDefault = "/remote.php/dav/files/";

//#endregion

/**
 * This class encapsulates all calls to the Nextcloud or ownCloud web services
 * (API and DAV)
 */
class CloudConnection {
    //#region Constructors, load & store
    /**
     *
     * @param {*} accountId Whatever Thunderbird uses as an account identifier
     */
    constructor(accountId) {
        this._accountId = accountId;
        this._apiHeaders = {
            "OCS-APIREQUEST": "true",
            "User-Agent": "Filelink for *cloud",
        };
        this._davUrl = null;
    }

    /**
     * Store the current values of all properties in the local browser storage
     */
    async store() {
        browser.storage.local.set({ [this._accountId]: this, });
    }

    /**
    * Load account state from configuration storage
    */
    async load() {
        const id = this._accountId;
        const accountInfo = await browser.storage.local.get(id);
        for (const key in accountInfo[id]) {
            this[key] = accountInfo[id][key];
        }
        // This isn't strictly necessary for new account since store() does it,
        // but accounts configured with an older version of the Add On don't
        // contain the headers
        return this;
    }
    //#endregion

    //#region Event Handlers
    /**
     * Upload a single file
     *
     * @param {number} fileId The id Thunderbird uses to reference the upload
     * @param {string} fileName w/o path
     *      @param {File} fileObject the local file as a File object
     */
    async uploadFile(fileId, fileName, fileObject) {
        // Get the servers actual DAV URL
        if (!this._davUrl) {
            // Fetch URL from capabilities
            let data = await this._doApiCall(apiUrlCapabilities);
            if (data && data.capabilities && data.capabilities.core && data.capabilities.core["webdav-root"]) {
                this._davUrl = "/" + data.capabilities.core["webdav-root"];
            } else {
                // Use default from docs instead
                this._davUrl = davUrlDefault + this.username;
            }
        }

        const uploader = new DavUploader(
            this.serverUrl, this.username, this.password, this._davUrl, this.storageFolder);
        const response = await uploader.uploadFile(fileId, fileName, fileObject);

        if (response.aborted) {
            return response;
        } else if (response.ok) {
            this.updateFreeSpaceInfo();
            return { url: (await this._getShareLink(fileName)) + "/download", aborted: false, };
        }
        throw new Error("Upload failed.");
    }

    /**
     * Clean up if an account is deleted
     */
    async deleteAccount() {
        browser.storage.local.remove(this._accountId);
    }
    //#endregion

    //#region Public Methods
    /**
     * Gets free/used space from web service and sets the parameters in
     * Thunderbirds cloudFileAccount
     */
    async updateFreeSpaceInfo() {
        this._doApiCall(apiUrlUserInfo + this.username)
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
     * Sets the "configured" property of Thunderbird's cloudFileAccount
     * according to actual state
     */
    async updateConfigured() {
        browser.cloudFile.updateAccount(this._accountId, { configured: this._isComplete(), });
    }

    /**
     * Fetches a new app password from the Nextcloud/ownCloud web service and
     * replaces the current password with it
     */
    async convertToApppassword() {
        try {
            const data = await this._doApiCall(apiUrlGetApppassword);

            if (data && data.apppassword) {
                this.password = data.apppassword;
            }
        } catch (error) {
            // Ignore any errors because we can still use the password from the
            // form            
        }
        return this.password;
    }
    //#endregion

    //#region Internal helpers
    /**
     * Check if all necessary data is present
     */
    _isComplete() {
        return Boolean(this.serverUrl) &&
            Boolean(this.username) &&
            Boolean(this.password) &&
            Boolean(this.storageFolder) &&
            (this.useDlPassword ? Boolean(this.downloadPassword) : true) &&
            (this.useExpiry ? Boolean(this.expiryDays) : true);
    }

    /**
     * Get a share link for the file, reusing an existing one with the same
     * parameters
     * @param {string} fileName The name of the file to share
     * @returns {string} The share link
     */
    async _getShareLink(fileName) {
        let expireDate = "The Spanish Inquisition";
        if (this.useExpiry) {
            expireDate = daysFromTodayIso(this.expiryDays);
        }

        //  Check if the file is already shared ...
        let shareinfo = await this._doApiCall(apiUrlShares + "?path=" +
            encodepath(this.storageFolder + "/" + fileName));
        let existingShare = shareinfo.find(share =>
            /// ... and if it's a public share ...
            (share.share_type === 3) &&
            // ... with the same password (if any) ... CAUTION: Nextcloud has
            // password===null, ownCloud has password===undefined if no password
            // is set
            (this.useDlPassword ? share.password === this.downloadPassword : !share.password) &&
            // ... and the same expiration date
            ((!this.useExpiry && share.expiration === null) ||
                (share.expiration !== null && this.useExpiry && share.expiration.startsWith(expireDate))));

        if (existingShare && existingShare.url) {
            return existingShare.url;
        } else {
            let shareFormData = "path=" + encodepath(this.storageFolder + "/" + fileName);
            shareFormData = "" + shareFormData + "&shareType=3"; // 3 = public share

            if (this.useDlPassword) {
                shareFormData += "&password=" + encodeURIComponent(this.downloadPassword);
            }

            // Nextcloud's docs don't mention this, but it works.
            if (this.useExpiry) {
                shareFormData += "&expireDate=" + expireDate;
            }

            let data = await this._doApiCall(apiUrlShares, 'POST', { "Content-Type": "application/x-www-form-urlencoded", }, shareFormData);
            if (data && data.url) {
                return data.url;
            }
            else {
                throw new Error("Sharing failed.");
            }
        }
    }
    //#endregion

    //#region Wrappers for web service calls
    /**
     * Call a function of the Nextcloud/ownCloud web service API
     *
     * @param {string} suburl The function's URL relative to the API base URL
     * @param {string} [method='GET'] HTTP method of the function, default GET
     * @param {*} [additional_headers] Additional Headers this function needs
     * @param {string} [body] Request body if the function needs it
     * @returns {*} A Promise that resolves to the data element of the response
     */
    async _doApiCall(suburl, method, additional_headers, body) {
        if (!this._isComplete()) {
            throw new Error("Account not configured");
        }

        let url = this.serverUrl;
        url += apiUrlBase;
        url += suburl;
        url += (suburl.includes('?') ? '&' : '?') + "format=json";

        let headers = {
            ...this._apiHeaders,
            "Authorization": "Basic " + btoa(this.username + ':' + this.password),
        };
        if (additional_headers) {
            headers = { ...headers, ...additional_headers, };
        }

        let fetchInfo = {
            method: method ? method : 'GET',
            headers,
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
    //#endregion
}