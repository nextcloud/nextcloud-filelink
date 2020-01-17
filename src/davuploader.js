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

/* global encodepath */

/** AbortControllers for all active uploads */
var allAbortControllers = new Map();

const davTimeout = 3; // seconds

/**
 * This class encapsulates communication with a WebDAV service
 */
class DavUploader {
    /**
     *
     * @param {string} server_url The URL of the server
     * @param {string} user The username
     * @param {string} password the password
     * @param {string} [dav_url="/"] The url path to the webdav service
     */
    constructor(server_url, user, password, dav_url = "/", folder = "/") {
        this._serverurl = server_url;
        this._username = user;
        this._password = password;
        this._storageFolder = folder;
        this._davUrl = dav_url;

        let auth = "Basic " + btoa(this._username + ':' + this._password);

        this._davHeaders = {
            "Authorization": auth,
            "User-Agent": "Filelink for *cloud",
            "Content-Type": "application/octet-stream",
        };
    }

    /**
     * Upload one file to the storage folder
     *
     * @param {number} fileId The id Thunderbird uses to reference the upload
     * @param {string} fileName w/o path
     * @param {File} fileObject the local file as a File object
     */
    async uploadFile(fileId, fileName, fileObject) {
        let response = {};

        const stat = await this._getRemoteFileInfo(fileName);

        if (!stat) {
            // There is no conflicting file in the cloud
            return this._doUpload(fileId, fileName, fileObject);
        } else {
            // There is a file of the same name
            if ((Math.abs(stat.mtime - fileObject.lastModified) < 1000 &&
             stat.size === fileObject.size)) {
                // It's the same as the local file
                return { ok: true, };
            } else {
                // It's different, move it out of the way
                await this._moveFileToDir(fileName, "old_shares/" + (stat.mtime / 1000 | 0));
                return this._doUpload(fileId, fileName, fileObject);
            }
        }
    }

    //#region Helpers for uploadFile
    /**
     * Create a complete folder path, returns true if that path already exists
     *
     * @param {string} folder 
     * @returns {bool} if creation succeeded
     */
    async _recursivelyCreateFolder(folder) {
        // Looks clumsy, but *always* make sure recursion ends
        if ("/" === folder) {
            return false;
        } else {
            let response = await this._doDavCall(folder, 'MKCOL')
                .catch(e => { return { status: 666, }; });
            switch (response.status) {
                case 405: // Already exists
                case 201: // Created successfully
                    return true;
                case 409: // Intermediate folder missing
                    // Try to create parent folder
                    if (await this._recursivelyCreateFolder(folder.split("/").slice(0, -1).join("/"))) {
                        // Try again to create the initial folder
                        response = await this._doDavCall(folder, 'MKCOL')
                            .catch(e => { return { status: 666, }; });
                        return (201 === response.status);
                    }
                    break;
            }
        }
        return false;
    }

    /**
     * Fetches information about a remote file
     * @param {File} file The file to check on the cloud
     * @returns {Promise} A promise resolving to an object containing mtime and
     * size or an empty object if the file doesn't exit
     */
    async _getRemoteFileInfo(fileName) {
        const response = await this._doDavCall(this._storageFolder + '/' + fileName, "PROPFIND");
        // something with the right name exists ...
        if (response.ok && response.status < 300) {
            const xmlDoc = new DOMParser().parseFromString(await response.text(), 'application/xml');
            // ... and it's a file ...
            if (null === xmlDoc.getElementsByTagName("d:resourcetype")[0].firstChild) {
                return {
                    mtime: (new Date(xmlDoc.getElementsByTagName("d:getlastmodified")[0].textContent)).getTime(),
                    size: Number(xmlDoc.getElementsByTagName("d:getcontentlength")[0].textContent),
                };
            }
        }
        return null;
    }

    /**
     * Moves a file to a new destination or name
     * @param {string} fileName The file's path and name relative to the storage
     * folder
     * @param {string} newPath The new path and name
     */
    async _moveFileToDir(fileName, newPath) {
        const dest_header = {
            "Destination":
                this._davUrl + encodepath(this._storageFolder + "/" + newPath + "/" + fileName),
        };
        if (await this._recursivelyCreateFolder(this._storageFolder + "/" + newPath)) {
            return this._doDavCall(this._storageFolder + "/" + fileName, "MOVE", null, null, dest_header);
        } else {
            throw new Error("Couldn't create backup folder.");
        }
    }

    /**
     * Set the mtime, so later checks for identity with local file succeed
     * @param {string} fileName The name of the file to change
     * @param {number} newMtime The mtime to set ont the file as a unix
     * timestamp (seconds)
     */
    async _setMtime(fileName, newMtime) {
        const body =
            `<d:propertyupdate xmlns:d="DAV:">
                <d:set>
                    <d:prop>
                        <d:lastmodified>${newMtime}</d:lastmodified>
                    </d:prop>
                </d:set>
            </d:propertyupdate>`;

        this._doDavCall(this._storageFolder + '/' + fileName, "PROPPATCH", body);
    }

    /**
     *
     * @param {number} fileId Thunderbird's internal file if
     * @param {string} fileName The name in the cloud
     * @param {File} fileObject The File object to upload
     * @returns {Promise} A Promise that resolves to the http response
     */
    async _doUpload(fileId, fileName, fileObject) {
        // Make sure storageFolder exists. Creation implicitly checks for
        // existence of folder, so the extra webservice call for checking first
        // isn't necessary.
        if (!(await this._recursivelyCreateFolder(this._storageFolder))) {
            throw new Error("Upload failed: Can't create folder");
        }

        // Some bookkeeping to enable aborting upload
        let abortController = new AbortController();
        allAbortControllers.set(fileId, abortController);

        return this._doDavCall(this._storageFolder + '/' + fileName, "PUT", fileObject, abortController)
            .then(response => {
                if (response.ok) {
                    this._setMtime(fileName, fileObject.lastModified / 1000 | 0);
                }
                return response;
            })
            .catch(e => {
                if ("AbortError" === e.name) {
                    return { aborted: true, url: "", };
                } else {
                    throw e;
                }
            })
            .finally(whatever => {
                allAbortControllers.delete(fileId);
                return whatever;
            });
    }
    //#endregion

    /**
     * Calls one function of the WebDAV service
     *
     * @param {string} path the full file path of the object
     * @param {string} [method=GET] the HTTP METHOD to use, default GET
     * @param {*} [body] Body of the request, eg. file contents
     * @param {*} [abortController] An AbortController to abort the network
     * transaction
     * @returns {*}  A Promise that resolves to the Response object
     */
    async _doDavCall(path, method, body, abortController, additional_headers) {
        let url = this._serverurl;
        url += this._davUrl;
        url += encodepath(path);

        // If an AbortController was given, use it ...
        let controller = abortController;
        let timeout;
        if (!controller) {
            // ... otherwise create one that handles the timeout
            controller = new AbortController();
            timeout = setTimeout(() => controller.abort(),
                1000 * davTimeout);
        }

        let fetchInfo = {
            signal: controller.signal,
            method,
            headers: additional_headers ? { ...this._davHeaders, ...additional_headers, } : this._davHeaders,
        };
        if (body) {
            fetchInfo.body = body;
        }

        return fetch(url, fetchInfo)
            .then(clearTimeout(timeout));
    }
}