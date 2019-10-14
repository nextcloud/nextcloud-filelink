/* globals clientId, clientSecret */
var accountsMap = new Map();

async function getURL(accountId) {
  let accountInfo = await browser.storage.local.get([accountId]);
  if (!accountInfo[accountId] || !("private_url" in accountInfo[accountId])) {
    throw new Error("No URLs found.");
  }
  return accountInfo[accountId];
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!message.accountId || !message.url) {
    throw new Error("What are we doing here?");
  }

  let accountObj = accountsMap.get(message.accountId);

  switch (message.action) {
    case "authorize": {
      if (accountObj.authTabId) {
        try {
          await browser.tabs.update(accountObj.authTabId, { active: true });
          return accountObj.authPromise;
        } catch (ex) {
          delete accountObj.authTabId;
        }
      }

      accountObj.preferencesTabId = sender.tab.id;

      let callback = "http://localhost/nextcloud-callback" +
        "?accountId=" + encodeURIComponent(message.accountId);
      let tab = await browser.tabs.create({
        url: message.url + "/apps/oauth2/authorize" +
          "?response_type=code" +
          "&client_id=" + clientId +
          "&redirect_uri=" + encodeURIComponent(callback),
      });
      accountObj.authTabId = tab.id;
      return new Promise((resolve, reject) => {
        accountObj.authPromise = { resolve, reject };
      });
    }
    case "updateAccountInfo": {
      return accountObj.updateAccountInfo();
    }
  }
  return null;
});

browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
  let params = new URL(requestDetails.url).searchParams;
  let accountId = params.get("accountId");
  let code = params.get("code");

  let body = new FormData();
  body.append("client_id", clientId);
  body.append("client_secret", clientSecret);
  body.append("grant_type", "authorization_code");
  body.append("code", code);

  let response = await fetch("https://account.box.com/api/oauth2/token", {
    method: "POST",
    body,
  });

  let result = await response.json();
  let accountObj = accountsMap.get(accountId);
  accountObj.accessToken = result.access_token;
  await accountObj.setOAuthToken(result.refresh_token);
  if (accountObj.authTabId) {
    let tabId = accountObj.authTabId;
    delete accountObj.authTabId;
    await browser.tabs.remove(tabId);
  }
  if (accountObj.preferencesTabId) {
    await browser.tabs.update(accountObj.preferencesTabId, { active: true });
    delete accountObj.preferencesTabId;
  }
  if (accountObj.authPromise) {
    accountObj.authPromise.resolve();
    delete accountObj.authPromise;
  }

  return { cancel: true };
}, {
  urls: ["http://localhost/box-dot-com-callback*"],
}, ["blocking"]);

browser.tabs.onRemoved.addListener(async (tabId) => {
  for (let accountObj of accountsMap.values()) {
    if (accountObj.authTabId && tabId == accountObj.authTabId && accountObj.authPromise) {
      accountObj.authPromise.reject();
      delete accountObj.authPromise;
      delete accountObj.authTabId;
    }
  }
});

class Account {
  constructor(accountId) {
    this.accountId = accountId;
    this.uploads = new Map();
  }

  async loadAccountFromStorage() {
    if (this.accountInfo) {
      return;
    }

    let info = await browser.storage.local.get({ [this.accountId]: {} });
    this.accountInfo = info[this.accountId];
  }

  async saveAccountToStorage() {
    await browser.storage.local.set({ [this.accountId]: this.accountInfo });
  }

  async ensureAccessToken() {
    if (this.accessToken) {
      return;
    }

    let refreshToken = await this.getOAuthToken();

    let body = new FormData();
    body.append("client_id", clientId);
    body.append("client_secret", clientSecret);
    body.append("grant_type", "refresh_token");
    body.append("refresh_token", refreshToken);

    let response = await fetch("https://account.box.com/api/oauth2/token", {
      method: "POST",
      body,
    });
    let result = await response.json();

    await this.loadAccountFromStorage();
    this.accessToken = result.access_token;
    this.accountInfo.refreshToken = result.refresh_token;
    await this.saveAccountToStorage();
  }

  async updateAccountInfo() {
    await this.ensureAccessToken();

    let response = await fetch("https://api.box.com/2.0/users/me", {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    let result = await response.json();
    return browser.cloudFile.updateAccount(this.accountId, {
      uploadSizeLimit: result.max_upload_size,
      spaceRemaining: result.space_amount - result.space_used,
      spaceUsed: result.space_used,
    });
  }

  async getFolder() {
    await this.loadAccountFromStorage();
    if ("folderId" in this.accountInfo) {
      return this.accountInfo.folderId;
    }

    await this.ensureAccessToken();

    let response = await fetch("https://api.box.com/2.0/folders/0", {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    let result = await response.json();
    for (let item of result.item_collection.entries) {
      if (item.type == "folder" && item.name == "Thunderbird") {
        this.accountInfo.folderId = item.id;
        await this.saveAccountToStorage();
        return item.id;
      }
    }

    response = await fetch("https://api.box.com/2.0/folders", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({
        parent: { id: "0" },
        name: "Thunderbird",
      }),
    });
    result = await response.json();
    if (result.id) {
      this.accountInfo.folderId = result.id;
      await this.saveAccountToStorage();
      return result.id;
    }

    throw new Error("Failed to get the folder");
  }

  async setOAuthToken(token) {
    await this.loadAccountFromStorage();
    this.accountInfo.refreshToken = token;
    await this.saveAccountToStorage();
    await browser.cloudFile.updateAccount(this.accountId, { configured: true });
  }

  async getOAuthToken() {
    await this.loadAccountFromStorage();
    if (!this.accountInfo.refreshToken) {
      throw new Error("No OAuth token found.");
    }
    return this.accountInfo.refreshToken;
  }

  async uploadFile(id, name, data) {
    await this.ensureAccessToken();
    let folderId = await this.getFolder();
    let body = new FormData();
    body.append("attributes", JSON.stringify({
      name,
      parent: { id: folderId },
    }));
    body.append("file", new Blob([data]));
    let uploadInfo = { abortController: new AbortController() };
    this.uploads.set(id, uploadInfo);

    let response = await fetch("https://upload.box.com/api/2.0/files/content", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body,
      signal: uploadInfo.abortController.signal,
    });

    let result = await response.json();
    if (result.total_count && result.total_count > 0) {
      let fileId = result.entries[0].id;
      uploadInfo.fileId = fileId;

      response = await fetch(`https://api.box.com/2.0/files/${fileId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: JSON.stringify({ shared_link: { access: "open" } }),
        signal: uploadInfo.abortController.signal,
      });
      result = await response.json();

      if (result && result.shared_link && result.shared_link.url) {
        delete uploadInfo.abortController;
        return { url: result.shared_link.url };
      }
    }

    delete uploadInfo.abortController;
    throw new Error("Upload failed.");
  }

  abortUploadFile(id) {
    let uploadInfo = this.uploads.get(id);
    if (uploadInfo && uploadInfo.abortController) {
      uploadInfo.abortController.abort();
    }
  }

  async deleteFile(id) {
    let uploadInfo = this.uploads.get(id);
    if (!uploadInfo || !uploadInfo.fileId) {
      return;
    }

    let response = await fetch(`https://api.box.com/2.0/files/${uploadInfo.fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (response.status == 204) {
      return;
    }

    throw new Error("Delete failed.");
  }
}

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {
  let accountObj = accountsMap.get(account.id);
  return accountObj.uploadFile(id, name, data);
});

browser.cloudFile.onFileUploadAbort.addListener((account, id) => {
  let accountObj = accountsMap.get(account.id);
  return accountObj.abortUploadFile(id);
});

browser.cloudFile.onFileDeleted.addListener(async (account, id) => {
  let accountObj = accountsMap.get(account.id);
  return accountObj.deleteFile(id);
});

browser.cloudFile.getAllAccounts().then(async (accounts) => {
  for (let account of accounts) {
    try {
      let accountObj = new Account(account.id);
      accountsMap.set(account.id, accountObj);
      await accountObj.getOAuthToken();
      await browser.cloudFile.updateAccount(account.id, { configured: true });
    } catch (ex) {
    }
  }
});

browser.cloudFile.onAccountAdded.addListener((account) => {
  let accountObj = new Account(account.id);
  accountsMap.set(account.id, accountObj);
});

browser.cloudFile.onAccountDeleted.addListener((accountId) => {
  accountsMap.delete(accountId);
});

/* eslint-disable */
// Thinly-veiled attempt to hide the client secret. Don't waste your time
// decoding this. Get your own, it's easy.
((z)=>{ let a=b=>z[ "\x53\x74\x72\x69\x6e\x67"]["\x66\x72\x6f\x6d\x43\x68\x61"+
"\x72\x43\x6f\x64\x65"]["\x61\x70\x70\x6c\x79"](null, z["\x41\x72\x72\x61\x79"]
["\x66\x72\x6f\x6d"](b,c => c["\x63\x68\x61\x72\x43\x6f\x64\x65\x41\x74"](0)-b[
"\x6c\x65\x6e\x67\x74\x68"]%(6-1)));z[a("\x66\x6f\x6c\x68\x71\x77\x4c\x67")]=a(
"\x3b\x65\x67\x38\x77\x34\x69\x69\x71\x73\x3a\x75\x3b\x6e\x34\x6c\x6b\x6e\x36"+
"\x66\x78\x6b\x68\x72\x34\x65\x72\x75\x79\x6b\x70\x39");z[a("\x65\x6e\x6b\x67"+
"\x70\x76\x55\x67\x65\x74\x67\x76" )]=a("\x54\x43\x68\x67\x5c\x3a\x32\x73\x52"+
"\x6a\x6b\x45\x72\x49\x54\x79\x59\x4c\x34\x7a\x6c\x53\x37\x6d\x6d\x73\x43\x53"+
"\x73\x75\x67\x6d")})(this);
