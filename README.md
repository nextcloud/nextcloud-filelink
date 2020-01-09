# FileLink for Nextcloud

A MailExtension für Thunderbird (68+) that uploads large attachments to your
Nextcloud instead of sending them by email.

Information for

* [Users](#user-guide)
* [Admins](#nextcloud-admin-guide)
* [Developers](#developer-guide)

## Requirements

* Nextcloud: 16 or newer (older versions might work, but are [not supported by
  Nextcloud](https://github.com/nextcloud/server/wiki/Maintenance-and-Release-Schedule))
* Thunderbird: 68+ (60.4 ESR might work too, but has not been tested)

## User guide

### Installation

FileLink for Nextcloud will shortly be available from
https://addons.thunderbird.net/de/thunderbird/. Until then download the [XPI
file](https://gitlab.com/joendres/filelink-nextcloud/raw/master/web-ext-artifacts/filelink_provider_for_nextcloud-2.0.5.xpi)
and install it manually.

### Password vs. App Token

Instead of storing your password it's more secure to use an "App Token " with
FileLink for Nextcloud. There are two ways to get such a token:

* Open your Nextcloud account in the browser and go to Settings -> Security ->
  App Token and at the bottom of the page generate a new one. Copy&paste it into
  the "App token" field of the configuration in Thunderbird.

* Type your password into the Attachments Preferences page in Thunderbird. Upon
  saving, the Add-On will *try* to get a token from your Nextcloud and use it
  instead of your password. You will notice the change, because afterwards the
  password field is completely filled with dots (app tokens are quite long).\
  **BUT!** if getting the token fails for any reason (eg. Nextcloud not
  reachable, timeout, wrong username, ...), the Add-On will *store your
  Nextcloud password unencrypted*.

_Summary:_ Letting the Add-On get an a app token is more convenient, but may
fail resulting in your *password beeng stored unencrypted*. Supplying your own
token is a little bit more secure, but inconvenient.

### Known issues

#### Old files are not deleted 

Cloudfile (AKA Filelink) Add-Ins don't delete files by themselves, but on
Thunderbird's request. Currently Thunderbird only requests deletion of files, if
the attachment is removed from the mail message after upload.

Thunderbird and Filelink for Nextcloud don't know, if a shared file has been
downloaded, so the cannot clean up obsolete files.

#### Only one download password for all uploads

In Thunderbird's concept of Filelink Add Ons the preferences panel is the only
means of user interaction. So there is currently no supported way to ast the
user for an individual download password or show a generated one. It might be
feasible by unofficial methods. But that soution migth break, whenever
Thunderbirds API changes -- and as of early 2020 it changes frequently.

#### Upload problems

If all uploads fail, it's usually a problem with the settings, either in
Thunderbird (doublecheck everything in Settings -> Preferences -> Attachments)
or in your Nextcloud (point your admin to the [Admin
guide](#nextcloud-admin-guide)).

If the Add-On still fails, please check if it's a known ~Bug. Feel free to open
a new issue otherwise.

## Nextcloud admin guide

Some settings in Nextcloud are relevant for this Add-On:

* **Settings -> Sharing -> Allow apps to use the Share API** has to be enabled
  (*mandatory*)
* **Settings -> Sharing -> Allow users tor share via link** has to be enabled
  (*mandatory*)
* **Settings -> Sharing -> Allow users tor share via link -> Enforce password
  protection** might result in confusing error messages to users. Be prepared
  for questions, if you enable this. (*optionally off*)

## Developer guide

The project lives on gitlab: https://gitlab.com/joendres/filelink-nextcloud. If
you'd like to contribute to the project, help with testing on different
platforms, have a feature suggestion or any other comment, just contact
[me](@joendres).

### Dev resources

* [Nextcloud Client
  APIs](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/index.html)
* [Thunderbird WebExtension
  APIs](https://thunderbird-webextensions.readthedocs.io/en/latest/index.html) 
* [Example extensions for Thunderbird WebExtensions
  APIs](https://github.com/thundernest/sample-extensions)
* [What you need to know about making add-ons for
  Thunderbird](https://developer.thunderbird.net/add-ons/)
* [Getting started with
  web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext)
  If you are developing Webextensions, you want to use this tool. For debugging
  just set the ```firefox``` config option to your thunderbird binary.

## References

* Based on [FileLink Provider for
  Dropbox](https://github.com/darktrojan/dropbox) by [Geoff
  Lankow](https://darktrojan.github.io/)
* Icons from [Nextcloud for
  Filelink](https://github.com/nextcloud/nextcloud-filelink) by [Olivier
  Paroz](https://github.com/oparoz) and [Guillaume
  Viguier-Just](https://github.com/guillaumev).
* Code and inspiration from Nextcloud for Filelink and [FileLink Provider for
  OwnCloud](https://github.com/thosmos/filelink-owncloud).