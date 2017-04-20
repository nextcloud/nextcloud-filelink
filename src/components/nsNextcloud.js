/* global Components, Services */
/**
 * @copyright Copyright (c) 2017, Olivier Paroz (github@oparoz.com)
 * @copyright Copyright (c) 2017, Philipp Kewisch
 * @copyright Copyright (c) 2017, Mark James
 * @copyright Copyright (c) 2017, Guillaume Viguier-Just (@guillaumev)
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

/**
 * This file implements the nsIMsgCloudFileProvider interface.
 *
 * This component handles the Nextcloud implementation of the nsIMsgCloudFileProvider interface.
 */

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/oauth.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/gloda/log4moz.js");
Cu.import("resource:///modules/cloudFileAccounts.js");

const kRestBase = "/ocs/v1.php";
const kAuthPath = kRestBase + "/cloud/user";
const kShareApp = kRestBase + "/apps/files_sharing/api/v1/shares";
const kWebDavPath = "/remote.php/webdav";

function wwwFormUrlEncode (aStr) {
	return encodeURIComponent(aStr)
		.replace(/!/g, '%21')
		.replace(/'/g, '%27')
		.replace(/\(/g, '%28')
		.replace(/\)/g, '%29')
		.replace(/\*/g, '%2A')
		.replace(/\@/g, '%40');
}

/**
 * Our Nextcloud Provider
 */
function Nextcloud () {
	//this.log = Log4Moz.getConfiguredLogger("Nextcloud", Log4Moz.Level.Info, Log4Moz.Level.Debug,
	// Log4Moz.Level.Debug);
	this.log = Log4Moz.getConfiguredLogger("Nextcloud");
}

Nextcloud.prototype = {
	/* nsISupports */
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgCloudFileProvider]),

	classID: Components.ID("{ad8c3b77-7dc8-41d1-8985-5be88b254ff3}"),

	get type () {
		return "Nextcloud";
	},
	get displayName () {
		return this._displayName;
	},
	get serviceURL () {
		return this._serverUrl;
	},
	get iconClass () {
		return "chrome://nextcloud/content/nextcloud.png";
	},
	get accountKey () {
		return this._accountKey;
	},
	get lastError () {
		return this._lastErrorText;
	},
	get settingsURL () {
		return "chrome://nextcloud/content/settings.xhtml";
	},
	get managementURL () {
		return "chrome://nextcloud/content/management.xhtml";
	},

	/**
	 * If the provider doesn't have an API for creating an account, perhaps
	 * there's a url we can load in a content tab that will allow the user
	 * to create an account.
	 */
	get createNewAccountUrl () {
		return "";
	},

	_displayName: "Nextcloud",
	_accountKey: false,
	_serverUrl: "",
	_serverPort: 443,
	_storageFolder: "",
	_userName: "",
	_password: "",
	_protectUploads: "",
	_prefBranch: null,
	_loggedIn: false,
	_authToken: "",
	_userInfo: null,
	_file: null,
	_requestDate: null,
	_successCallback: null,
	_connection: null,
	_request: null,
	_uploadingFile: null,
	_uploader: null,
	_lastErrorStatus: 0,
	_lastErrorText: "",
	_maxFileSize: -1,
	_totalStorage: -1,
	_fileSpaceUsed: -1,
	_uploads: [],
	_urlsForFiles: {},
	_uploadInfo: {}, // upload info keyed on aFiles.

	/**
	 * Initialize this instance of Nextcloud, setting the accountKey.
	 *
	 * @param aAccountKey The account key that this instance of the nsIMsgCloudFileProvider should
	 *     be associated with.
	 */
	init: function nsNc_init (aAccountKey) {
		this._accountKey = aAccountKey;
		this._prefBranch = Services.prefs.getBranch("mail.cloud_files.accounts." +
			aAccountKey + ".");

		if (this._prefBranch.getCharPref("displayName") != "") {
			this._displayName = this._prefBranch.getCharPref("displayName");
		}

		this._serverUrl = this._prefBranch.getCharPref("server");
		this._serverPort = this._prefBranch.getIntPref("port");
		this._userName = this._prefBranch.getCharPref("username");

		if (this._prefBranch.prefHasUserValue("storageFolder")) {
			this._storageFolder = this._prefBranch.getCharPref("storageFolder");
		} else {
			this._storageFolder = "/Mail-attachments";
		}

		if (this._prefBranch.prefHasUserValue("protectUploads")) {
			this._protectUploads = this._prefBranch.getCharPref("protectUploads");
		}
	},

	/**
	 * Attempts to upload a file to Nextcloud.
	 *
	 * @param aFile the nsILocalFile to be uploaded
	 * @param aCallback an nsIRequestObserver for listening for the starting
	 *                  and ending states of the upload.
	 */
	uploadFile: function nsNc_uploadFile (aFile, aCallback) {
		if (Services.io.offline) {
			throw Ci.nsIMsgCloudFileProvider.offlineErr;
		}

		this.log.info("uploading " + aFile.leafName);

		// Some ugliness here - we stash requestObserver here, because we might
		// use it again in _getUserInfo.
		this.requestObserver = aCallback;

		// if we're uploading a file, queue this request.
		if (this._uploadingFile && this._uploadingFile != aFile) {
			let uploader = new NextcloudFileUploader(this, aFile, this._uploaderCallback
				.bind(this), aCallback);
			this._uploads.push(uploader);
			return;
		}
		this._file = aFile;
		this._uploadingFile = aFile;

		let successCallback = this._finishUpload.bind(this, aFile, aCallback);
		if (!this._loggedIn) {
			return this._logonAndGetUserInfo(successCallback, null, true);
		}

		this.log.info("getting user info");

		if (!this._userInfo) {
			return this._getUserInfo(successCallback);
		}
		successCallback();
	},

	/**
	 * Attempts to cancel a file upload.
	 *
	 * @param aFile the nsILocalFile to cancel the upload for.
	 */
	cancelFileUpload: function nsNc_cancelFileUpload (aFile) {
		if (this._uploadingFile.equals(aFile)) {
			this._uploader.cancel();
		} else {
			for (let i = 0; i < this._uploads.length; i++)
				if (this._uploads[i].file.equals(aFile)) {
					this._uploads[i].requestObserver.onStopRequest(
						null, null, Ci.nsIMsgCloudFileProvider.uploadCanceled
					);
					this._uploads.splice(i, 1);
					return;
				}
		}
	},

	/**
	 * For some nsILocalFile, return the associated sharing URL.
	 *
	 * @param aFile the nsILocalFile to retrieve the URL for
	 */
	urlForFile: function nsNc_urlForFile (aFile) {
		return this._urlsForFiles[aFile.path];
	},

	/**
	 * Updates the profile information for the account associated with the
	 * account key.
	 *
	 * @param aWithUI a boolean for whether or not we should display authorization
	 *                UI if we don't have a valid token anymore, or just fail out.
	 * @param aCallback an nsIRequestObserver for observing the starting and
	 *                  ending states of the request.
	 */
	refreshUserInfo: function nsNc_refreshUserInfo (aWithUI, aCallback) {
		if (Services.io.offline) {
			throw Ci.nsIMsgCloudFileProvider.offlineErr;
		}
		this.requestObserver = aCallback;
		aCallback.onStartRequest(null, null);
		if (!this._loggedIn) {
			return this._logonAndGetUserInfo(null, null, aWithUI);
		}
		if (!this._userInfo) {
			return this._getUserInfo();
		}
		return this._userInfo;
	},

	/**
	 * Allows for the creation of a new user on the Nextcloud instance.
	 *
	 * This implementation does not implement the createNewAccount
	 * function defined in nsIMsgCloudFileProvider.idl.
	 */
	createNewAccount: function nsNc_createNewAccount (aEmailAddress, aPassword, aFirstName, aLastName) {
		return Cr.NS_ERROR_NOT_IMPLEMENTED;
	},

	/**
	 * If the user already has an account on a Nextcloud instance, we can get the user to just login
	 *
	 * This function does not appear to be called from the BigFiles UI, and
	 * might be excisable.
	 */
	createExistingAccount: function nsNc_createExistingAccount (aRequestObserver) {
		// XXX: replace this with a better function
		let successCb = function () {
			let folderExists = function (exists) {
				if (exists) {
					aRequestObserver.onStopRequest(null, this, Cr.NS_OK);
				}
				else {
					aRequestObserver.onStopRequest(null, this, Ci.nsIMsgCloudFileProvider.authErr);
				}
			}.bind(this);
			this._checkFolderExists(folderExists);
		}.bind(this);

		let failureCb = function () {
			aRequestObserver.onStopRequest(null, this, Ci.nsIMsgCloudFileProvider.authErr);
		}.bind(this);

		this.logon(successCb, failureCb, true);
	},

	/**
	 * For a particular error, return a URL if Nextcloud has a page for handling
	 * that particular error.
	 *
	 * @param aError the error to get the URL for
	 */
	providerUrlForError: function nsNc_providerUrlForError (aError) {
		return "";
	},

	/**
	 * If we don't know the limit, this will return -1.
	 */
	get fileUploadSizeLimit () {
		return this._maxFileSize;
	},
	get remainingFileSpace () {
		return this._totalStorage > 0 ? this._totalStorage - this._fileSpaceUsed : -1;
	},
	get fileSpaceUsed () {
		return this._fileSpaceUsed;
	},

	/**
	 * Attempt to delete an upload file if we've uploaded it.
	 *
	 * @param aFile the file that was originall uploaded
	 * @param aCallback an nsIRequestObserver for monitoring the starting and
	 *                  ending states of the deletion request.
	 */
	deleteFile: function nsNc_deleteFile (aFile, aCallback) {
		return Cr.NS_ERROR_NOT_IMPLEMENTED;
	},

	/**
	 * Returns the saved password for this account if one exists, or prompts
	 * the user for a password. Returns the empty string on failure.
	 *
	 * @param aUsername the username associated with the account / password.
	 * @param aNoPrompt a boolean for whether or not we should suppress
	 *                  the password prompt if no password exists.  If so,
	 *                  returns the empty string if no password exists.
	 */
	getPassword: function (aUsername, aNoPrompt) {
		this.log.info("Getting password for user: " + aUsername);

		if (aNoPrompt) {
			this.log.info("Suppressing password prompt");
		}

		let passwordURI = this._serverUrl;
		let logins = Services.logins.findLogins({}, passwordURI, null, passwordURI);
		for (let loginInfo of logins) {
			if (loginInfo.username == aUsername) {
				return loginInfo.password;
			}
		}
		if (aNoPrompt) {
			return "";
		}

		// OK, let's prompt for it.
		let win = Services.wm.getMostRecentWindow(null);

		let authPrompter = Services.ww.getNewAuthPrompter(win);
		let password = {value: ""};
		// Use the service name in the prompt text
		let userPos = this._serverUrl.indexOf("//") + 2;
		let userNamePart = encodeURIComponent(this._userName) + '@';
		let serverUrl =
			this._serverUrl.substr(0, userPos) + userNamePart + this._serverUrl.substr(userPos);
		let messengerBundle = Services.strings.createBundle(
			"chrome://messenger/locale/messenger.properties");
		let promptString = messengerBundle.formatStringFromName("passwordPrompt",
			[
				this._userName,
				this.displayName
			],
			2);

		if (authPrompter.promptPassword(
				this.displayName,
				promptString,
				serverUrl,
				authPrompter.SAVE_PASSWORD_PERMANENTLY,
				password)) {
			return password.value;
		}

		return "";
	},

	/**
	 * This function is used by our testing framework to override the default
	 * URL's that Nextcloud connects to.
	 */
	overrideUrls: function nsNc_overrideUrls (aNumUrls, aUrls) {
		this._serverUrl = aUrls[0];
	},

	/**
	 * logon to the Nextcloud account.
	 *
	 * @param successCallback - called if logon is successful
	 * @param failureCallback - called back on error.
	 * @param aWithUI if false, logon fails if it would have needed to put up UI.
	 *                This is used for things like displaying account settings,
	 *                where we don't want to pop up the oauth ui.
	 */
	logon: function nsNc_logon (successCallback, failureCallback, aWithUI) {
		this.log.info("Logging in, aWithUI = " + aWithUI);

		if (this._password == undefined || !this._password)
			this._password = this.getPassword(this._userName, !aWithUI);

		this.log.info("Sending login information...");

		let args = "?format=json";
		let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Ci.nsIXMLHttpRequest);

		req.open("GET", this._serverUrl + ":" + this._serverPort + kAuthPath + args, true);
		req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		req.setRequestHeader("OCS-APIREQUEST", "true");
		req.setRequestHeader("Authorization",
			"Basic " + btoa(this._userName + ':' + this._password));

		req.onerror = function () {
			this.log.info("logon failure");

			failureCallback();
		}.bind(this);

		req.onload = function () {
			if (req.status >= 200 && req.status < 400) {
				try {
					this.log.info("auth token response = " + req.responseText);

					let docResponse = JSON.parse(req.responseText);
					//this.log.info("login response parsed = " + docResponse);
					let statuscode = docResponse.ocs.meta.statuscode;

					this.log.info("statuscode = " + statuscode);

					if (statuscode == 100) {
						this._loggedIn = true;
						successCallback();
					}
					else {
						this._loggedIn = false;
						this._lastErrorText = docResponse.ocs.meta.message;
						this._lastErrorStatus = docResponse.ocs.meta.statuscode;
						failureCallback();
					}
				} catch (e) {
					this.log.error(e);
					this._loggedIn = false;
					failureCallback();
				}
			}
			else {
				failureCallback();
			}
		}.bind(this);

		req.send();
		this.log.info("Login information sent!");
	},

	/**
	 * The callback passed to an NextcloudFileUploader, which is fired when
	 * NextcloudFileUploader exits.
	 *
	 * @param aRequestObserver the request observer originally passed to
	 *                         uploadFile for the file associated with the
	 *                         NextcloudFileUploader
	 * @param aStatus the result of the upload
	 * @private
	 */
	_uploaderCallback: function nsNc__uploaderCallback (aRequestObserver, aStatus) {
		aRequestObserver.onStopRequest(null, null, aStatus);
		this._uploadingFile = null;
		this._uploads.shift();
		if (this._uploads.length > 0) {
			let nextUpload = this._uploads[0];
			this.log.info("chaining upload, file = " + nextUpload.file.leafName);
			this._uploadingFile = nextUpload.file;
			this._uploader = nextUpload;
			try {
				this.uploadFile(nextUpload.file, nextUpload.callback);
			}
			catch (ex) {
				nextUpload.callback(nextUpload.requestObserver, Cr.NS_ERROR_FAILURE);
			}
		}
		else
			this._uploader = null;
	},

	/**
	 * Ensures that we can actually upload the file (we haven't exceeded file size or quota
	 * limitations), and then attempts to kick-off the upload.
	 *
	 * @param aFile the nsILocalFile to upload
	 * @param aCallback an nsIRequestObserver for monitoring the starting and
	 *                  ending states of the upload.
	 * @private
	 */
	_finishUpload: function nsNc_finishUpload (aFile, aCallback) {
		let exceedsQuota = Ci.nsIMsgCloudFileProvider.uploadWouldExceedQuota;
		if ((this._totalStorage > 0) && (aFile.fileSize > this.remainingFileSpace)) {
			return aCallback.onStopRequest(null, null, exceedsQuota);
		}

		delete this._userInfo; // forces us to update userInfo on every upload.

		if (!this._uploader) {
			this._uploader = new NextcloudFileUploader(this, aFile, this._uploaderCallback
				.bind(this), aCallback);
			this._uploads.unshift(this._uploader);
		}

		this._uploadingFile = aFile;
		this._uploader.uploadFile();
	},

	/**
	 * A private function used to retrieve the profile information for the
	 * user account associated with the accountKey.
	 *
	 * @param successCallback the function called if information retrieval
	 *                        is successful
	 * @param failureCallback the function called if information retrieval fails
	 * @private
	 */
	_getUserInfo: function nsNc_getUserInfo (successCallback, failureCallback) {
		if (!successCallback) {
			successCallback = function () {
				this.requestObserver
					.onStopRequest(null, null,
						this._loggedIn ? Cr.NS_OK : Ci.nsIMsgCloudFileProvider.authErr);
			}.bind(this);
		}

		if (!failureCallback) {
			failureCallback = function () {
				this.requestObserver
					.onStopRequest(null, null, Ci.nsIMsgCloudFileProvider.authErr);
			}.bind(this);
		}

		let body = '<propfind xmlns="DAV:">' +
			'<prop>' +
			'<quota-available-bytes/>' +
			'<quota-used-bytes/>' +
			'</prop>' +
			'</propfind>';

		let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(
			Ci.nsIXMLHttpRequest);

		req.open("PROPFIND", this._serverUrl + ":" + this._serverPort + kWebDavPath, true,
			this._userName, this._password);
		req.onerror = function () {
			this.log.info("logon failure");
			failureCallback();
		}.bind(this);

		req.onload = function () {
			if (req.status >= 200 && req.status < 400) {
				this._fileSpaceUsed = this._getQuota(req.responseXML, "quota-used-bytes");
				if (this._fileSpaceUsed < 0) {
					this._fileSpaceUsed = -1;
				}

				let spaceAvailable = this._getQuota(req.responseXML, "quota-available-bytes");

				if (spaceAvailable && spaceAvailable > -1) { // positive numbers
					this._totalStorage = spaceAvailable + this._fileSpaceUsed;
				} else if (!spaceAvailable && spaceAvailable !== 0) { // 0 and unequal 0
					this._totalStorage = -1;
				} else if (!spaceAvailable || spaceAvailable < 0) { // 0 or negative
					this._totalStorage = 0;
				}
				successCallback();
			} else {
				failureCallback();
			}
		}.bind(this);

		req.send(body);
	},

	/**
	 * Retrieves quota information from a WebDAV response
	 *
	 * @param req
	 * @param davVariable
	 * @returns {NodeList|number}
	 * @private
	 */
	_getQuota: function nsNc_getUserQuota (req, davVariable) {
		let quota = req.documentElement.getElementsByTagNameNS("DAV:", davVariable);
		return quota && quota.length && Number(quota[0].textContent) || -1;
	},

	/**
	 * A private function which makes sure that the folder entered in the
	 * settings screen exists on the server.
	 *
	 * @param callback callback function called with true or false as an argument
	 * @private
	 */
	_checkFolderExists: function nsNc_checkFolderExists (callback) {
		if (this._storageFolder !== '/') {
			let body = '<propfind xmlns="DAV:">' +
				'<prop>' +
				'<resourcetype />' +
				'</prop>' +
				'</propfind>';

			let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
				.createInstance(Ci.nsIXMLHttpRequest);

			req.open("PROPFIND", this._serverUrl + kWebDavPath +
				("/" + this._storageFolder + "/").replace(/\/+/g, '/'), true, this._userName,
				this._password);
			req.onerror = function () {
				this.log.info("Failed to check if folder exists");
				callback(false);
			}.bind(this);

			req.onload = function () {
				if (req.status === 207) {
					return callback(true);
				}
				else {
					return callback(false);
				}
			}.bind(this);

			req.send(body);
		}
		else {
			return callback(true);
		}
	},

	/**
	 * A private function that first ensures that the user is logged in, and then
	 * retrieves the user's profile information.
	 *
	 * @param aSuccessCallback the function called on successful information
	 *                         retrieval
	 * @param aFailureCallback the function called on failed information retrieval
	 * @param aWithUI a boolean for whether or not we should display authorization
	 *                UI if we don't have a valid token anymore, or just fail out.
	 * @private
	 */
	_logonAndGetUserInfo: function nsNc_logonAndGetUserInfo (aSuccessCallback,
															 aFailureCallback,
															 aWithUI) {
		if (!aFailureCallback) {
			aFailureCallback = function () {
				this.requestObserver.onStopRequest(null, null, Ci.nsIMsgCloudFileProvider.authErr);
			}.bind(this);
		}

		return this.logon(function () {
			this._getUserInfo(aSuccessCallback, aFailureCallback);
		}.bind(this), aFailureCallback, aWithUI);
	},
};

/**
 * Uploads a file to the Nextcloud server
 *
 * @type {{nextcloud: null, file: null, callback: null, request: null, _fileUploadTS: {},
 *     uploadFile: NextcloudFileUploader.nsNCFU_uploadFile, cancel:
 *     NextcloudFileUploader.nsNCFU_cancel, _getShareUrl:
 *     NextcloudFileUploader.nsNCFU__getShareUrl}}
 */
function NextcloudFileUploader (aNextcloud, aFile, aCallback, aRequestObserver) {
	this.nextcloud = aNextcloud;
	this.log = this.nextcloud.log;
	this.log.info("new NextcloudFileUploader file = " + aFile.leafName);
	this.file = aFile;
	this.callback = aCallback;
	this.requestObserver = aRequestObserver;
}

NextcloudFileUploader.prototype = {
	nextcloud: null,
	file: null,
	callback: null,
	request: null,
	_fileUploadTS: {}, // timestamps to prepend, avoiding filename conflict

	/**
	 * Kicks off the upload request for the file associated with this Uploader.
	 */
	uploadFile: function nsNCFU_uploadFile () {
		this.requestObserver.onStartRequest(null, null);
		this._fileUploadTS[this.file.path] = new Date().getTime();

		this.log.info(
			"Ready to upload file " + wwwFormUrlEncode(this.file.leafName) +
			" to folder " + this.nextcloud._storageFolder
		);

		let folder = ("/" + this.nextcloud._storageFolder + "/").replace(/\/+/g, '/');

		let url = this.nextcloud._serverUrl +
			":" +
			this.nextcloud._serverPort +
			kWebDavPath +
			folder +
			this._fileUploadTS[this.file.path] +
			"_" +
			this.file.leafName;

		let fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
			Ci.nsIFileInputStream);
		fstream.init(this.file, -1, 0, 0);

		let bufStream = Cc["@mozilla.org/network/buffered-input-stream;1"].createInstance(
			Ci.nsIBufferedInputStream);
		bufStream.init(fstream, this.file.fileSize);
		bufStream = bufStream.QueryInterface(Ci.nsIInputStream);
		let contentLength = fstream.available();

		let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(
			Ci.nsIXMLHttpRequest);

		req.open("PUT", url, true, this._userName, this._password);

		req.onerror = function () {
			this.log.info("Could not upload file");
			if (this.callback) {
				this.callback(this.requestObserver,
					Ci.nsIMsgCloudFileProvider.uploadErr);
			}
		}.bind(this);

		req.onload = function () {
			if (req.status >= 200 && req.status < 400) {
				this._getShareUrl(this.file, this.callback);
			}
			else {
				if (this.callback)
					this.callback(this.requestObserver,
						Ci.nsIMsgCloudFileProvider.uploadErr);
			}
		}.bind(this);

		req.setRequestHeader("Content-Length", contentLength);
		req.send(bufStream);
	},

	/**
	 * Cancels the upload request for the file associated with this Uploader.
	 */
	cancel: function nsNCFU_cancel () {
		this.callback(this.requestObserver, Ci.nsIMsgCloudFileProvider.uploadCanceled);
		if (this.request) {
			let req = this.request;
			if (req.channel) {
				this.log.info("Cancelling channel upload");
				delete this.callback;
				req.channel.cancel(Cr.NS_BINDING_ABORTED);
			}
			this.request = null;
		}
	},

	/**
	 * Private function which attempts to retrieve the sharing URL for the file which was uploaded
	 * via this Uploader.
	 *
	 * @param aFile file which was just uploaded
	 * @param aCallback an nsIRequestObserver which monitors the start and end states of the URL
	 *     retrieval request.
	 * @private
	 */
	_getShareUrl: function nsNCFU_getShareUrl (aFile, aCallback) {
		//let url = this.nextcloud._serverUrl + ":" + this.nextcloud._serverPort + kWebDavPath;
		this.file = aFile;
		let shareType = 3;
		let args = "?format=json";
		let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Ci.nsIXMLHttpRequest);
		let path = wwwFormUrlEncode(
			("/" + this.nextcloud._storageFolder + "/").replace(/\/+/g, '/') +
			this._fileUploadTS[this.file.path] + "_" + this.file.leafName);

		let formData = "shareType=" + shareType + "&path=" + path;
		// Request a password for the link if it has been defined during setup time
		if (this.nextcloud._protectUploads.length) {
			formData += "&password=" + wwwFormUrlEncode(this.nextcloud._protectUploads);
		}

		req.open("POST",
			this.nextcloud._serverUrl + ":" + this.nextcloud._serverPort + kShareApp + args,
			true,
			this.nextcloud._userName,
			this.nextcloud._password
		);
		req.withCredentials = true;
		req.setRequestHeader('Content-Type', "application/x-www-form-urlencoded");
		req.setRequestHeader("Content-Length", String(formData.length));
		req.setRequestHeader("OCS-APIREQUEST", "true");
		req.setRequestHeader("Authorization",
			"Basic " + btoa(this.nextcloud._userName + ':' + this.nextcloud._password));

		req.onload = function () {

			this.log.debug("Raw response: " + req.responseText);

			if (req.status >= 200 && req.status < 400) {
				try {
					let response = JSON.parse(req.responseText);
					if (typeof response.ocs.data.url !== "undefined") {
						this.nextcloud._urlsForFiles[this.file.path] = response.ocs.data.url;
						if (!this.nextcloud._protectUploads.length) {
							let arg_separator = this.nextcloud._urlsForFiles[this.file.path].lastIndexOf(
								"?") > 0 ? "&" : "/";
							this.nextcloud._urlsForFiles[this.file.path] +=
								arg_separator + "download";
						}
						aCallback(this.requestObserver, Cr.NS_OK);
					} else {
						aCallback(this.requestObserver, Ci.nsIMsgCloudFileProvider.uploadErr);
					}
				} catch (e) {
					this.log.error(e);
					aCallback(this.requestObserver, Ci.nsIMsgCloudFileProvider.uploadErr);
				}
			} else {
				this.log.info("Could not retrieve share URL");
				aCallback(this.requestObserver, Cr.NS_ERROR_FAILURE);
			}
		}.bind(this);

		req.onerror = function (e) {
			this.log.debug("Other error: " + e);
			aCallback(this.requestObserver, Cr.NS_ERROR_FAILURE);
		}.bind(this);
		this.log.debug("Raw formData: " + formData);
		req.send(formData);
	}
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([Nextcloud]);
