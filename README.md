# Nextcloud for Filelink

![Screenshot](https://raw.githubusercontent.com/nextcloud/nextcloud-filelink/master/screenshots/configured.png)

## Description

[Nextcloud](https://nextcloud.com) is the premiere and safest, Enterprise-ready, Open Source File Sync and Share solution

["Nextcloud for Filelink"](https://github.com/nextcloud/nextcloud-filelink) is a Thunderbird extension which makes it easy to send large attachments with Thunderbird by uploading them first to a Nextcloud server and by then inserting the link into the body of your email.

It is currently possible to upload files as large as 1GB.

## Maintainers

* Olivier Paroz (@oparoz)

### Alumni

* Philipp Kewisch
* Mark James
* Guillaume Viguier-Just (@guillaumev)

## Installation

1. Zip all files from this repository such that the install.rdf and chrome.manifest are located in the root folder of the zip file
1. Change the file extension from .zip to .xpi
1. Open your Thunderbird, navigate to `Tools -> Add-Ons`, choose "Install Add-On From File..." and select the .xpi file
1. After installation restart Thunderbird

## Nextcloud configuration

1. Make sure that you have checked "Allow users to share via link" in the **"Sharing"** section of the admin page of your Nextcloud installation. If you also have checked-in the **"Enforce password protection"** option, make sure to fill **"Password for uploaded files"** field in next step
1. By default your mail attachments will be saved in a folder called `Mail-attachments`. You currently need to create that folder

*Note: It's also possible to use a different folder name. Simply type the name of the folder you want to use when setting up the provider in Thunderbird*

## Thunderbird configuration

![Screenshot](https://raw.githubusercontent.com/nextcloud/nextcloud-filelink/master/screenshots/setup.png)

1. Navigate to `Edit -> Preferences -> Attachments` 
1. Choose the `Outgoing` tab
1. Click the Add button. The "Set up Filelink" panel will open.
1. Select the desired service provider from the drop-down list.
1. Select Nextcloud from the list and type in the URL to your server as well as your login and password

*Note: If you want to send your email attachments to a different folder, you will have to modify the path given in "Storage path"*

Once setup is complete, Thunderbird will always ask you if you want to upload big attachments to Nextcloud.

## Requirements

* Nextcloud: 11.0.2 and newer
* Thunderbird: 17.0 and newer

## Known issues

* It's not possible to use the same Filelink provider more than once
* You need to create the folder in Nextcloud yourself
* Stats will be wrong if the account's storage space is unlimited
* You can only create public links
* Public links will always have the same password
* You cannot edit your Filelink account. You have to delete and re-create it if you need a change (password, folder, link password, port, etc.)

## License

Licensed under the GNU AGPL version 3 or any later version

## Contribution Guidelines

All contributions to this repository from February, 10 2017 on are considered to be
licensed under the AGPLv3 or any later version.

"Nextcloud for Filelink" doesn't require a CLA (Contributor License Agreement).
The copyright belongs to all the individual contributors. Therefore we recommend
that every contributor adds following line to the header of a file, if they
changed it substantially:

```
@copyright Copyright (c) <year>, <your name> (<your email address>)
```

Please read the [Code of Conduct](https://nextcloud.com/community/code-of-conduct/). This document offers some guidance to ensure Nextcloud participants can cooperate effectively in a positive and inspiring atmosphere, and to explain how together we can strengthen and support each other.

More information how to contribute: [https://nextcloud.com/contribute/](https://nextcloud.com/contribute/)