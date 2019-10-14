let form = document.querySelector("form");
let url = form.querySelector(`input[name="url"]`);
let username = form.querySelector(`input[name="username"]`);
let password = form.querySelector(`input[name="password"]`);

let accountId = new URL(location.href).searchParams.get("accountId");

let notAuthed = document.getElementById("notAuthed");
let clickMe = document.getElementById("clickMe");
let authed = document.getElementById("authed");
let loading = document.getElementById("provider-loading");
let spaceBox = document.getElementById("provider-spacebox");

(() => {
  for (let element of document.querySelectorAll("[data-message]")) {
    element.textContent = browser.i18n.getMessage(element.dataset.message);
  }
  updateUI();
})();

browser.storage.local.get([accountId]).then(accountInfo => {
  if (accountId in accountInfo) {
    if ("url" in accountInfo[accountId]) {
      url.value = accountInfo[accountId].url;
    }
  }
});

clickMe.onclick = async () => {
  /*await browser.runtime.sendMessage({
    action: "authorize",
    accountId,
    url: url.value,
  });
  updateUI();*/
  console.log(username.value);
  console.log(password.value);
};

async function updateUI() {
  let account = await browser.cloudFile.getAccount(accountId);
  if (account.configured) {
    notAuthed.hidden = true;
    authed.hidden = false;
    spaceBox.hidden = true;
    loading.hidden = false;

    if (account.uploadSizeLimit == -1) {
      account = await browser.runtime.sendMessage({ accountId, action: "updateAccountInfo" });
    }

    foo(account.spaceUsed / (account.spaceUsed + account.spaceRemaining));

    document.getElementById("file-space-used").textContent = formatFileSize(account.spaceUsed);
    document.getElementById("remaining-file-space").textContent = formatFileSize(account.spaceRemaining);
    document.querySelector("svg > text").textContent = formatFileSize(account.spaceUsed + account.spaceRemaining);

    spaceBox.hidden = false;
    loading.hidden = true;
  } else {
    notAuthed.hidden = false;
    authed.hidden = true;
  }
}

function foo(fraction) {
  if (fraction < 0 || fraction > 1) {
    throw new Error("Invalid fraction");
  }

  let path = document.querySelector("path#thisone");
  let angle = 2 * Math.PI * fraction;

  let x1 = 100 + Math.sin(angle) * 100;
  let y1 = 100 - Math.cos(angle) * 100;
  let x2 = 100 + Math.sin(angle) * 40;
  let y2 = 100 - Math.cos(angle) * 40;

  let gcOutside = fraction <= 0.5 ? 0 : 1;
  let gcInside = fraction <= 0.5 ? 0 : 1;

  path.setAttribute("d", `M 100,0 A 100,100 0 ${gcOutside} 1 ${x1},${y1} L ${x2},${y2} A 40,40 0 ${gcInside} 0 100,60 Z`);
}

function formatFileSize(bytes) {
  let value = bytes;
  let unit = "B";
  if (value > 999) {
    value /= 1024;
    unit = "kB";
  }
  if (value >= 999.5) {
    value /= 1024;
    unit = "MB";
  }
  if (value >= 999.5) {
    value /= 1024;
    unit = "GB";
  }

  if (value < 100 && unit != "B") {
    value = value.toFixed(1);
  } else {
    value = value.toFixed(0);
  }
  return `${value} ${unit}`;
}
