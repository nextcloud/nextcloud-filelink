/* If an account is removed also remove its stored data */
browser.cloudFile.onAccountDeleted.addListener(async accountId => {
    browser.storage.local.remove([accountId]);
});