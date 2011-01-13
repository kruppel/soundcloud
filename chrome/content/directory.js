/*
Copyright (c) 2011, Pioneers of the Inevitable, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice,
  this list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
  * Neither the name of Pioneers of the Inevitable, Songbird, nor the names
  of its contributors may be used to endorse or promote products derived
  from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://app/jsmodules/DOMUtils.jsm");
Cu.import("resource://app/components/kPlaylistCommands.jsm");
Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");

if (typeof(gBrowser) == "undefined")
  var gBrowser = Cc["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Ci.nsIWindowMediator)
                   .getMostRecentWindow("Songbird:Main").window.gBrowser;

if (typeof CloudDirectory == "undefined") {
  var CloudDirectory = {};
}

CloudDirectory.onLoad = function CloudDirectory_onLoad() {
  var self = this;

  this._strings = Cc["@mozilla.org/intl/stringbundle;1"]
                    .getService(Ci.nsIStringBundleService)
                    .createBundle("chrome://soundcloud/locale/overlay.properties");

  this._service = Cc["@songbirdnest.com/soundcloud/service;1"]
                    .getService(Ci.sbISoundCloudService);;

  this._domEventListenerSet = new DOMEventListenerSet();

  // Wire up UI events
  this._logo = document.getElementById("soundcloud-logo");
  var onLogoClicked = function() { gBrowser.loadOneTab("http://soundcloud.com"); };
  this._domEventListenerSet.add(this._logo,
                                "click",
                                onLogoClicked,
                                false,
                                false);

  this._searchBox = document.getElementById("soundcloud-search-textbox");
  this._searchBtn = document.getElementById("soundcloud-search-btn");

  this._searchBox.value = decodeURIComponent(this._service.lastSearch);
  if (this._searchBox.value.length > 0)
    this._searchBtn.disabled = false;

  var onSearchInput = function(aEvent) {
    self._searchBtn.disabled = aEvent.target.value.length == 0;
  };

  var onSearchKeydown = function(aEvent) {
    if (aEvent.keyCode == KeyEvent.DOM_VK_RETURN ||
        aEvent.keyCode == KeyEvent.DOM_VK_ENTER)
      self._searchBtn.click();
  };

  var onSearchCommand = function() { self.triggerSearch(); };

  this._domEventListenerSet.add(this._searchBox,
                                "input",
                                onSearchInput,
                                false,
                                false);
  this._domEventListenerSet.add(this._searchBox,
                                "keydown",
                                onSearchKeydown,
                                false,
                                false);
  this._domEventListenerSet.add(this._searchBtn,
                                "command",
                                onSearchCommand,
                                false,
                                false);

  this._directory = document.getElementById("soundcloud-directory");
  var search = document.getElementById("soundcloud-box");

  // Setup library
  var uri = gBrowser.currentURI.spec;
  var idx = uri.indexOf("type");
  if (idx != -1) {
    var type = uri.slice(idx + 5);
    switch(type) {
      case "dashboard":
        this._library = this._service.dashboard;
        this._library.clear();
        this._service.getDashboard();
        document.title =
          this._strings.GetStringFromName("soundcloud.dashboard.title");
        search.hidden = true;
        break;
      case "favorites":
        this._library = this._service.favorites;
        this._library.clear();
        this._service.getFavorites();
        document.title =
          this._strings.GetStringFromName("soundcloud.favorites.title");
        search.hidden = true;
        break;
      default:
        this._library = this._service.library;
        document.title =
          this._strings.GetStringFromName("soundcloud.search.title");
    }
  } else {
    this._library = this._service.library;
    document.title = this._strings.GetStringFromName("soundcloud.search.title");
  }

  // Get playlist commands
  var mgr = Cc["@songbirdnest.com/Songbird/PlaylistCommandsManager;1"]
              .createInstance(Ci.sbIPlaylistCommandsManager);
  var cmds = mgr.request("soundcloud-cmds@sb.com");
  // Bind the playlist widget to our library
  this._directory.bind(this._library.createView(), cmds);

  var colSpec = SBProperties.trackName + " 300 " +
                SBProperties.duration + " 70 " +
                SB_PROPERTY_USER + " 150 " +
                SB_PROPERTY_PLAYS + " 60 " +
                SB_PROPERTY_FAVS + " 60 " +
                SB_PROPERTY_DOWNLOAD_IMAGE + " 60 " +
                SB_PROPERTY_CREATION_DATE + " 135 ";
  this._library.setProperty(SBProperties.columnSpec, colSpec);
  this._directory.clearColumns();
  this._directory.appendColumn(SBProperties.trackName, "300");
  this._directory.appendColumn(SBProperties.duration, "70");
  this._directory.appendColumn(SB_PROPERTY_USER, "150");
  this._directory.appendColumn(SB_PROPERTY_PLAYS, "60");
  this._directory.appendColumn(SB_PROPERTY_FAVS, "60");
  this._directory.appendColumn(SB_PROPERTY_DOWNLOAD_IMAGE, "60");
  this._directory.appendColumn(SB_PROPERTY_CREATION_DATE, "135");

  // Add listener for playlist "Download" clicks
  if ((typeof(gBrowser) != "undefined") && gBrowser) {
    this._directory.addEventListener("PlaylistCellClick", function(e) {
      return self.downloadClick(e);
    }, false);
  }
}

CloudDirectory.triggerSearch = function CloudDirectory_triggerSearch(aEvent) {
  // Reset the library
  this._library.clear();

  var params = "";
  var query = encodeURIComponent(this._searchBox.value);
  var flags = {
    "q": query,
    "filter": "streamable",
    "order": "hotness"
  };

  for (var flag in flags) {
    if (flag != "q")
      params += "&" + flag + "=" + flags[flag];
  }

  this._service.getTracks(query, params, 0);
}

CloudDirectory.downloadClick = function CloudDirectory_downloadClick(aEvent) {
  var prop = aEvent.getData("property");
  var item = aEvent.getData("item");

  if (item.getProperty(prop) != "" && prop == SB_PROPERTY_DOWNLOAD_IMAGE) {
    var ddh = Cc["@songbirdnest.com/Songbird/DownloadDeviceHelper;1"]
                .getService(Ci.sbIDownloadDeviceHelper);
    var ios = Cc["@mozilla.org/network/io-service;1"]
                .getService(Ci.nsIIOService);
    var downloads = this._service.downloads;

    var url = item.getProperty(SB_PROPERTY_DOWNLOAD_URL);
    var properties = {};
    properties[SBProperties.trackName] =
        item.getProperty(SBProperties.trackName);
    properties[SBProperties.trackType] = "soundcloud";
    var propertyArray = SBProperties.createArray(properties);
    var downloadItem =
        downloads.createMediaItem(ios.newURI(url, null, null),
                                  propertyArray);
    downloadItem.setProperty(SB_PROPERTY_WAVEFORM,
                             item.getProperty(SB_PROPERTY_WAVEFORM));
    ddh.downloadItem(downloadItem);
  }
}

CloudDirectory.onUnload = function CloudDirectory_onUnload() {
  if (this._directory) {
    this._directory.destroy();
    this._directory = null;
  }

  if (this._domEventListenerSet) {
    this._domEventListenerSet.removeAll();
    this._domEventListenerSet = null;
  }
}
