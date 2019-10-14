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

let form = document.querySelector("form");
let webdavUrl = form.querySelector(`input[name="webdavUrl"]`);
let username = form.querySelector(`input[name="username"]`);
let token = form.querySelector(`input[name="token"]`);
let path = form.querySelector(`input[name="path"]`);
let button = form.querySelector("button");
let accountId = new URL(location.href).searchParams.get("accountId");

(() => {
  for (let element of document.querySelectorAll("[data-message]")) {
    element.textContent = browser.i18n.getMessage(element.dataset.message);
  }
})();


browser.storage.local.get([accountId]).then(accountInfo => {
  if (accountId in accountInfo) {
    if ("webdavUrl" in accountInfo[accountId]) {
      webdavUrl.value = accountInfo[accountId].webdavUrl;
    }
    if ("username" in accountInfo[accountId]) {
      username.value = accountInfo[accountId].username;
    }
    if ("token" in accountInfo[accountId]) {
      token.value = accountInfo[accountId].token;
    }
    if ("path" in accountInfo[accountId]) {
      path.value = accountInfo[accountId].path;
    }
  }
});

button.onclick = async () => {

  if (!form.checkValidity()) {
    console.log("form is invalid");
    return;
  }

  webdavUrl.disabled = username.disabled = token.disabled = path.disabled = button.disabled = true;
  let webdavUrl_value = webdavUrl.value;
  if (!webdavUrl_value.endsWith("/")) {
    webdavUrl_value += "/";
    webdavUrl.value = webdavUrl_value;
  }
  let path_value = path.value;
  if (!path_value.endsWith("/")) {
    path_value += "/";
    path.value = path_value;
  }
  if (!path_value.startsWith("/")) {
    path_value = "/" + path_value;
    path.value = path_value;
  }

  let start = Date.now();
  await browser.storage.local.set({
    [accountId]: {
      webdavUrl: webdavUrl_value,
      username: username.value,
      token: token.value,
      path: path_value
    },
  });
  await browser.cloudFile.updateAccount(accountId, { configured: true });
  setTimeout(() => {
    webdavUrl.disabled = username.disabled = token.disabled = path.disabled = button.disabled = false;
  }, Math.max(0, start + 500 - Date.now()));
};

// let notAuthed = document.getElementById("notAuthed");
// let authed = document.getElementById("authed");
// let loading = document.getElementById("provider-loading");
// let spaceBox = document.getElementById("provider-spacebox");


// browser.storage.local.get([accountId]).then(accountInfo => {
//   if (accountId in accountInfo) {
//     if ("webdavUrl" in accountInfo[accountId]) {
//       webdavUrl.value = accountInfo[accountId].webdavUrl;
//     }
//   }
// });

// clickMe.onclick = async () => {
//   /*await browser.runtime.sendMessage({
//     action: "authorize",
//     accountId,
//     url: url.value,
//   });
//   updateUI();*/
//   console.log(username.value);
//   console.log(password.value);
// };

// async function updateUI() {
//   let account = await browser.cloudFile.getAccount(accountId);
//   if (account.configured) {
//     notAuthed.hidden = true;
//     authed.hidden = false;
//     spaceBox.hidden = true;
//     loading.hidden = false;

//     if (account.uploadSizeLimit == -1) {
//       account = await browser.runtime.sendMessage({ accountId, action: "updateAccountInfo" });
//     }

//     foo(account.spaceUsed / (account.spaceUsed + account.spaceRemaining));

//     document.getElementById("file-space-used").textContent = formatFileSize(account.spaceUsed);
//     document.getElementById("remaining-file-space").textContent = formatFileSize(account.spaceRemaining);
//     document.querySelector("svg > text").textContent = formatFileSize(account.spaceUsed + account.spaceRemaining);

//     spaceBox.hidden = false;
//     loading.hidden = true;
//   } else {
//     notAuthed.hidden = false;
//     authed.hidden = true;
//   }
// }

// function foo(fraction) {
//   if (fraction < 0 || fraction > 1) {
//     throw new Error("Invalid fraction");
//   }

//   let path = document.querySelector("path#thisone");
//   let angle = 2 * Math.PI * fraction;

//   let x1 = 100 + Math.sin(angle) * 100;
//   let y1 = 100 - Math.cos(angle) * 100;
//   let x2 = 100 + Math.sin(angle) * 40;
//   let y2 = 100 - Math.cos(angle) * 40;

//   let gcOutside = fraction <= 0.5 ? 0 : 1;
//   let gcInside = fraction <= 0.5 ? 0 : 1;

//   path.setAttribute("d", `M 100,0 A 100,100 0 ${gcOutside} 1 ${x1},${y1} L ${x2},${y2} A 40,40 0 ${gcInside} 0 100,60 Z`);
// }

// function formatFileSize(bytes) {
//   let value = bytes;
//   let unit = "B";
//   if (value > 999) {
//     value /= 1024;
//     unit = "kB";
//   }
//   if (value >= 999.5) {
//     value /= 1024;
//     unit = "MB";
//   }
//   if (value >= 999.5) {
//     value /= 1024;
//     unit = "GB";
//   }

//   if (value < 100 && unit != "B") {
//     value = value.toFixed(1);
//   } else {
//     value = value.toFixed(0);
//   }
//   return `${value} ${unit}`;
// }
