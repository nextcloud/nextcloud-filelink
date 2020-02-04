/**
 * @copyright Copyright (c) 2020, Thomas Spellman (thos37@gmail.com)
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

var uploads = new Map();

// browser.cloudFile.onAccountAdded.addListener(async (account) => {
//   //console.log("Account Added", account.id)
// })

async function getAccountInfo(accountId) {
  let accountInfo = await browser.storage.local.get([accountId]);
  if (!accountInfo[accountId] || !("webdavUrl" in accountInfo[accountId])) {
    throw new Error("No Accounts found.");
  }
  return accountInfo[accountId];
}

browser.cloudFile.onFileUpload.addListener(async (account, params) => {

  let { id, name, data } = params;

  name = "" + Date.now() + "_" + name;

  console.log("onFileUpload", id, account, name);

  let accountInfo = await getAccountInfo(account.id);

  //console.log("accountInfo", accountInfo);

  let uploadInfo = {
    id,
    name,
    abortController: new AbortController(),
  };

  uploads.set(id, uploadInfo);

  let {webdavUrl, username, token, path} = accountInfo;

  const authHeader = "Basic " + btoa(username + ":" + token);

  let url = webdavUrl + path + encodeURIComponent(name);

  let headers = {
    "Content-Type": "application/octet-stream",
    Authorization: authHeader
  };
  let fetchInfo = {
    method: "PUT",
    headers,
    body: data,
    signal: uploadInfo.abortController.signal,
  };

  //console.log("uploading to ", url, fetchInfo);

  let response = await fetch(url, fetchInfo);

  //console.log("file upload response", response);

  delete uploadInfo.abortController;
  if (response.status > 299) {
    throw new Error("response was not ok: server status code: " + response.status + ", response message: " + response.statusText);
  }

  const serverUrl = webdavUrl.substr(0, webdavUrl.indexOf("remote.php"));
  const shareUrl = serverUrl + "ocs/v1.php/apps/files_sharing/api/v1/shares?format=json";

  uploadInfo.abortController = new AbortController();
  uploads.set(id, uploadInfo);
  
  headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    Authorization: authHeader,
    "OCS-APIRequest": true
  };

  fetchInfo = {
    method: "POST",
    headers,
    body: "shareType=3&path=" + encodeURIComponent(path + name),
    signal: uploadInfo.abortController.signal,
  };

  console.log("requesting public link", shareUrl, fetchInfo);

  response = await fetch(shareUrl, fetchInfo);

  //console.log("public link response", response);

  if(response.ok)
  {
    let respJson = await response.json();

    uploadInfo.shareID = respJson.ocs.data.id;
    uploads.set(id, uploadInfo);

    return {url: respJson.ocs.data.url + "/download"};
  }
  else
    return {aborted: true}

});

browser.cloudFile.onFileUploadAbort.addListener((account, id) => {
  //console.log("aborting upload", id);
  let uploadInfo = uploads.get(id);
  if (uploadInfo && uploadInfo.abortController) {
    uploadInfo.abortController.abort();
  }
});

browser.cloudFile.onFileDeleted.addListener(async (account, id) => {
  //console.log("delete upload", id);
  let uploadInfo = uploads.get(id);
  if (!uploadInfo) {
    return;
  }

  // FIXME how do we get a confirmation popup in TB MailExtensions?
  // let wishDelete = confirm("Do you wish to delete the file on the server?");
  // if(!wishDelete){
  //   return;
  // }

  let accountInfo = await getAccountInfo(account.id);

  let {shareID} = uploadInfo;
  let {webdavUrl, username, token} = accountInfo;

  const authHeader = "Basic " + btoa(username + ":" + token);

  const serverUrl = webdavUrl.substr(0, webdavUrl.indexOf("remote.php"));
  const shareUrl = serverUrl + "ocs/v1.php/apps/files_sharing/api/v1/shares/" + shareID;

  let headers = {
    Authorization: authHeader,
    "OCS-APIRequest": true
  };

  let fetchInfo = {
    headers,
    method: "DELETE",
  };

  //console.log("sending delete", url, fetchInfo);

  let response = await fetch(shareUrl, fetchInfo);

  //console.log("delete response", response);

  uploads.delete(id);
  
  if (response.status > 299) {
    throw new Error("response was not ok: server status code: " + response.status + ", response message: " + response.statusText);
  }

});

browser.cloudFile.getAllAccounts().then(async (accounts) => {
  let allAccountsInfo = await browser.storage.local.get();
  for (let account of accounts) {
    await browser.cloudFile.updateAccount(account.id, {
      configured: account.id in allAccountsInfo,
    });
  }
});
