# __*cloud__ - FileLink for Nextcloud and ownCloud

A MailExtension für Thunderbird (68+) that uploads large attachments to your
Cloud and generates a link you can send by mail instead of the file.

Information for

* [Users](#user-guide)
* [Admins](#cloud-admin-guide)
* [Developers](#developer-guide)

## Requirements

* Nextcloud: 16 or newer (older versions might work, but are [not supported by
  Nextcloud](https://github.com/nextcloud/server/wiki/Maintenance-and-Release-Schedule))
* ownCloud: 10+ (older versions might work, but are [not supported by
  ownCloud](https://github.com/owncloud/core/wiki/maintenance-and-release-schedule)
* Thunderbird: 68+ (60.4 ESR might work too, but has not been tested)

## User guide

### Installation

__*cloud__ is available via [Thunderbird's Add-on
repository](https://addons.thunderbird.net/thunderbird/addon/filelink-nextcloud-owncloud/).
1. Install it directly from the Add-ons management within Thunderbird.
1. Go to Settings -> Attachments -> Sending to configure your Nextcloud or
   ownCloud account.

### Password vs. App Token

Instead of storing your password it's more secure to use an "App Token " with
__*cloud__. There are two ways to get such a token:

* *If you are using Nextcloud or ownCloud:* Open your account in the browser and
  go to Settings -> Security -> App Token and at the bottom of the page generate
  a new one. Copy&paste it into the "App token" field of the configuration in
  Thunderbird.

* *Only if you are using Nextcloud:* Type your regular user password into the
  Attachments Preferences page in Thunderbird. Upon saving, the Add-On will
  *try* to get a token from your Nextcloud and use it instead of your password.
  You will notice the change, because afterwards the password field is filled
  with dots completely (app tokens are quite long).\
  **BUT!** if getting the token fails for any reason (eg. your Nextcloud not
  reachable, timeout, wrong username, ...), the Add-On will *store your password
  unencrypted*.

### Known issues

#### Existing files are overwritten with new contents

If you upload a file with a name that already exists in the server directory,
that file is overwritten with the contents of the local file. *Share links from
previous mails stay active and point to the new file.* This even happens, if you
choose a file from a different local directory (with the same file name),
because all files are uploaded to the same server directory.

There are plans to change this behavior, but that may take some time.

**Workaround:** Use different local file names.

#### Only one download password for all uploads

In Thunderbird's concept of Filelink Add Ons the preferences panel is the only
means of user interaction. So there is currently no supported way to ast the
user for an individual download password or show a generated one. It might be
feasible by unofficial methods. But that solution might break, whenever
Thunderbirds API changes -- and as of early 2020 it changes frequently.

**Workaround:** Change the download password in the preferences pane or use
multiple accounts with different passwords.

#### Upload problems

* The *download* password has to comply to the rules for passwords on your
  cloud, otherwise the *upload* will fail. There are default rules of Nextcloud
  and ownCloud, and your admin might have configured some different rules. 
* If all uploads fail, might be a problem with the settings in your Nextcloud or
  ownCloud (point your admin to the [Admin guide](#nextcloud-admin-guide)).
* If the Add-On still fails, please check if it's a known ~Bug. Feel free to
  open a new issue otherwise.

#### Old files are not deleted 

Thunderbird and __*cloud__ don't know, if a shared file has been downloaded, so
the cannot clean up obsolete files. So files are only deleted in one situation:
if the attachment is removed from the mail message after upload.

## Cloud admin guide

Some settings in Nextcloud/ownCloud are relevant for this Add-On:

* **Settings -> Sharing -> Allow apps to use the Share API** has to be enabled
  (*mandatory*)
* **Settings -> Sharing -> Allow users tor share via link** has to be enabled
  (*mandatory*)
* **Settings -> Sharing -> Allow users tor share via link -> Enforce password
  protection** might result in confusing error messages to users, because the
  *upload* in Thunderbird fails if an invalid password is requested. Be prepared
  for questions, if you enable this. (*optionally off*)

## Developer guide

The project lives on gitlab: https://gitlab.com/joendres/filelink-nextcloud. If
you'd like to contribute to the project, help with testing on different
platforms, have a feature suggestion or any other comment, just contact
[me](@joendres).

### Dev resources

* [Nextcloud Client
  APIs](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/index.html)
* [ownCloud External
  API](https://doc.owncloud.com/server/developer_manual/core/apis/ocs/notifications/ocs-endpoint-v1.html)
* [Thunderbird WebExtension
  APIs](https://thunderbird-webextensions.readthedocs.io/en/latest/index.html) 
* [Example extensions for Thunderbird WebExtensions
  APIs](https://github.com/thundernest/sample-extensions)
* [What you need to know about making add-ons for
  Thunderbird](https://developer.thunderbird.net/add-ons/), not complete at all.
* [Getting started with
  web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext)
  If you are developing Webextensions, you want to use this tool. For debugging
  just set the ```firefox``` config option to your thunderbird binary.

## References

* Based on [FileLink Provider for
  Dropbox](https://github.com/darktrojan/dropbox) by [Geoff
  Lankow](https://darktrojan.github.io/)
* Inspired by [Nextcloud for
  Filelink](https://github.com/nextcloud/nextcloud-filelink) by [Olivier
  Paroz](https://github.com/oparoz) and [Guillaume
  Viguier-Just](https://github.com/guillaumev).