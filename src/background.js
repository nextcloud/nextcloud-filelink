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

/* global CloudConnection */

/** Whenever TB starts, all the providers are in state configured:false */
(() => {
    browser.storage.local.get().then(
        allAccounts => {
            for (const accountId in allAccounts) {
                const ncc = new CloudConnection(accountId);
                ncc.load()
                    .then(() => ncc.updateConfigured())
                    .then(() => ncc.updateFreeSpaceInfo());
            }
        });
})();

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {
    const ncc = new CloudConnection(account.id);
    return ncc.load().then(() => ncc.uploadFile(id, name, data));
});

browser.cloudFile.onFileUploadAbort.addListener(
    (account, fileId) => {
        /* global allAbortControllers */
        // defined in davuploader.js
        const abortController = allAbortControllers.get(fileId);
        if (abortController) {
            abortController.abort();
        }
    });

/** Don't delete any files because we want to reuse uploads. Just ignore the
 * event by adding an empty listener because Thunderbird will show error
 * messages if there is no listener. */
browser.cloudFile.onFileDeleted.addListener(async () => { });

/** Nothing to be done, so don't add a listener */
// browser.cloudFile.onAccountAdded.addListener(async account => { */

browser.cloudFile.onAccountDeleted.addListener(async accountId => {
    const ncc = new CloudConnection(accountId);
    ncc.load().then(() => ncc.deleteAccount());
});
