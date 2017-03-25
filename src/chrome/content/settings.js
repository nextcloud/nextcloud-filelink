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
 * Captures the settings provided by the user
 *
 * @returns {{displayName: {type: string, value: (string|string|string|Number)}, server: {type:
 *     string, value: *}, port: {type: string, value: (string|string|string|Number)},
 *     storageFolder: {type: string, value: (string|string|string|Number)}, username: {type:
 *     string, value: (string|string|string|Number)}, protectUploads: {type: string, value:
 *     (string|string|string|Number)}}}
 */
function extraArgs () {
	let displayName = document.getElementById("displayName").value;
	let serverValue = document.getElementById("server").value.trim().replace(/\/+$/, "");
	let portValue = document.getElementById("port").value;
	let storageFolderValue = document.getElementById("storageFolder").value;
	let userValue = document.getElementById("username").value;
	let protectUploadsValue = document.getElementById("protectUploads").value;

	return {
		"displayName": {
			type: "char",
			value: displayName
		},
		"server": {
			type: "char",
			value: serverValue
		},
		"port": {
			type: "int",
			value: portValue
		},
		"storageFolder": {
			type: "char",
			value: storageFolderValue
		},
		"username": {
			type: "char",
			value: userValue
		},
		"protectUploads": {
			type: "char",
			value: protectUploadsValue
		}
	};
}
