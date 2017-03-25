/* global Components, pv */
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

function onLoadProvider (provider) {
	let messenger = Components.classes["@mozilla.org/messenger;1"]
		.createInstance(Components.interfaces.nsIMessenger);

	let fileSpaceUsed = document.getElementById("file-space-used");
	let fileSpaceUsedSwatch = document.getElementById("file-space-used-swatch");
	let remainingFileSpace = document.getElementById("remaining-file-space");
	let remainingFileSpaceSwatch = document.getElementById("remaining-file-space-swatch");
	let totalSpace = provider.fileSpaceUsed + provider.remainingFileSpace;
	let pieScale = 2 * Math.PI / totalSpace;
	let spaceDiv = document.getElementById("provider-space-visuals");
	let service = document.getElementById("service");

	fileSpaceUsed.textContent = messenger.formatFileSize(provider.fileSpaceUsed);
	fileSpaceUsedSwatch.style.backgroundColor = pv.Colors.category20.values[0];
	remainingFileSpace.textContent = messenger.formatFileSize(provider.remainingFileSpace);
	remainingFileSpaceSwatch.style.backgroundColor = pv.Colors.category20.values[1];
	service.setAttribute("href", provider.serviceURL);
	service.appendChild(document.createTextNode(provider.displayName));

	let vis = new pv.Panel()
		.canvas(spaceDiv)
		.width(150)
		.height(150);

	vis.add(pv.Wedge)
		.data([provider.fileSpaceUsed, provider.remainingFileSpace])
		.left(75)
		.top(75)
		.innerRadius(30)
		.outerRadius(65)
		.angle(function (d) {
			return d * pieScale;
		});

	vis.add(pv.Label)
		.left(75)
		.top(75)
		.font("14px Sans-Serif")
		.textAlign("center")
		.textBaseline("middle")
		.text(messenger.formatFileSize(totalSpace));

	vis.render();
}
