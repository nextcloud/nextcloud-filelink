# FileLink Provider for Nextcloud

A MailExtension für Thunderbird (68+) that uploads large attachments to your Nextcloud instead of sending them by email.

Information for

* [Users](#user-guide)
* [Admins](#nextcloud-admin-guide)
* [Developers](#developer-guide)

## Requirements

* Nextcloud: 16 or newer (older versions might work, but are [not supported by Nextcloud](https://github.com/nextcloud/server/wiki/Maintenance-and-Release-Schedule))
* Thunderbird: 68+ (60.4 ESR might work too, but has not been tested)

## User guide

### Installation

FileLink Provider for Nextcloud will shortly be available from https://addons.thunderbird.net/de/thunderbird/. Until then download the [XPI file](https://gitlab.com/joendres/filelink-nextcloud/raw/master/web-ext-artifacts/filelink_provider_for_nextcloud-2.0.0.xpi) and install it manually.

### Password vs. App Token

FileLink Provider for Nextcloud tries, not to store your Nextcloud password, but to use an "App Token" instead. There ist two ways to get such a token:

1. Open your Nextcloud account in the browser and go to Settings -> -> Security -> App Token and at the bottom of the page generate a new one. Copy&paste it into the "App token" field of the configuration in Thunderbird.

1. Type your password into the Filelink configuration page in Thunderbird. Upon saving, the Add-On will *try* to get a token from your Nextcloud and use it instead of your password. You will notice the change, because afterwards the password field is completely filled with dots (app tokens are quite long).\
**BUT!** if getting the token fails for any reason (eg. Nextcloud not reachable, timeout, wrong username, ...), the Add-On will *store your Nextcloud password unencrypted*.

_Summary:_ Letting the Add-On get an a app token is more convenient, but may fail resulting in your *password beeng stored unencrypted*. Supplying your own token is a little bit more secure, but inconvenient.

### Upload problems

If all uploads fail, it's usually a problem with the settings, either in Thunderbird (doublecheck everything in Settings -> Prefrences -> Attachments) or in your Nextcloud (point your admin to the [Admin guide](#nextcloud-admin-guide)).

If the Add-On still fails, please check, if it's a known ~bug. Feel free to open a new issue otherwise.

## Nextcloud admin guide

Some settings in Nextcloud are relevant for this Add-On:

* **Settings -> Sharing -> Allow apps to use the Share API** has to be enabled (*mandatory*)
* **Settings -> Sharing -> Allow allow users tor share via link** has to be enabled (*mandatory*)
* **Settings -> Sharing -> Allow allow users tor share via link -> Enforce password protection** might result in confusing error messages to users. Be prepared for questions, if you enable this. (*optionally off*)

## Developer guide

If you'd like to contribute to the project, help with testing on different platforms or have any comments, just contact [me](@joendres).

### Dev resources

* [Nextcloud Client APIs](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/index.html)
* [Thunderbird WebExtension APIs](https://thunderbird-webextensions.readthedocs.io/en/latest/index.html) 
* [Example extensions for Thunderbird WebExtensions APIs](https://github.com/thundernest/sample-extensions)
* [What you need to know about making add-ons for Thunderbird](https://developer.thunderbird.net/add-ons/)
* [Getting started with web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext) If you are developing Webextensions, you wnt this tool. For debugging just set the ```firefox``` config option to your thunderbird binary.

## References

* Based on [FileLink Provider for Dropbox](https://github.com/darktrojan/dropbox) by [Geoff Lankow](https://darktrojan.github.io/)
* Icons from [Nextcloud for Filelink](https://github.com/nextcloud/nextcloud-filelink) by [Olivier Paroz] (https://github.com/oparoz) and [Guillaume Viguier-Just](https://github.com/guillaumev).
* Code and inspiration from Nextcloud for Filelink and [FileLink Provider for OwnCloud](https://github.com/thosmos/filelink-owncloud).