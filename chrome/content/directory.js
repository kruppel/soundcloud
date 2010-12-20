/*
Copyright (c) 2010, Pioneers of the Inevitable, Inc.
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

const initialized = "extensions.soundcloud.library.init";

if (typeof CloudDirectory == "undefined") {
  var CloudDirectory = {};
}

CloudDirectory.onLoad = function() {
  var self = this;

  this._strings = Cc["@mozilla.org/intl/stringbundle;1"]
                    .getService(Ci.nsIStringBundleService)
                    .createBundle("chrome://soundcloud/locale/overlay.properties");

  // Set the tab title
  document.title = this._strings.GetStringFromName("radioTabTitle");

  this._service = Cc['@songbirdnest.com/soundcloud;1']
                    .getService().wrappedJSObject;

  this._domEventListenerSet = new DOMEventListenerSet();

  // Wire up UI events
  this._logo = document.getElementById("soundcloud-logo");
  var onLogoClicked = function() { gBrowser.loadOneTab("http://soundcloud.com"); };
  this._domEventListenerSet.add(this._logo,
                                'click',
                                onLogoClicked,
                                false,
                                false);

  this._searchBox = document.getElementById("soundcloud-search-textbox");
  this._searchBtn = document.getElementById("soundcloud-search-btn");

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
                                'input',
                                onSearchInput,
                                false,
                                false);
  this._domEventListenerSet.add(this._searchBox,
                                'keydown',
                                onSearchKeydown,
                                false,
                                false);
  this._domEventListenerSet.add(this._searchBtn,
                                'command',
                                onSearchCommand,
                                false,
                                false);

  // Setup library
  this._library = this._service.library;

  this._directory = document.getElementById("soundcloud-directory");

  this.m_mgr = Cc["@songbirdnest.com/Songbird/PlaylistCommandsManager;1"]
              .createInstance(Ci.sbIPlaylistCommandsManager);

  const PlaylistCommandsBuilder = new Components.
    Constructor("@songbirdnest.com/Songbird/PlaylistCommandsBuilder;1",
                "sbIPlaylistCommandsBuilder", "init");

  this.m_cmd_Play = new PlaylistCommandsBuilder("play-soundcloud-cmd");
  this.m_cmd_Play.appendAction(null,
                               "soundcloud_cmd_play",
                               "&command.play",
                               "&command.tooltip.play",
                               plCmd_Play_TriggerCallback);
  this.m_cmd_Play.setCommandShortcut(null,
                                     "soundcloud_cmd_play",
                                     "&command.shortcut.key.play",
                                     "&command.shortcut.keycode.play",
                                     "&command.shortcut.modifiers.play",
                                     true);
  this.m_cmd_Play.setCommandEnabledCallback(null,
                                            "soundcloud_cmd_play",
                                            plCmd_IsAnyTrackSelected);
  this.m_mgr.publish("soundcloud-play@sb.com", this.m_cmd_Play);
  this.m_cmd_Download = new PlaylistCommandsBuilder("download-soundcloud-cmd");
  this.m_cmd_Download.appendAction(null,
                               "soundcloud_cmd_download",
                               "&command.download_button",
                               "&command.tooltip.download",
                               plCmd_Download_TriggerCallback);
  this.m_cmd_Download.setCommandShortcut(null,
                                     "soundcloud_cmd_download",
                                     "&command.shortcut.key.download",
                                     "&command.shortcut.keycode.download",
                                     "&command.shortcut.modifiers.download",
                                     true);
  this.m_cmd_Download.setCommandEnabledCallback(null,
                                            "soundcloud_cmd_download",
                                            plCmd_IsAnyTrackSelected);
  this.m_mgr.publish("soundcloud-download@sb.com", this.m_cmd_Download);
  this.m_soundcloudCommands = new PlaylistCommandsBuilder("soundcloud_cmds");
  this.m_soundcloudCommands.appendPlaylistCommands(null,
                                                   "soundcloud_cmd_play",
                                                   this.m_cmd_Play);
  this.m_soundcloudCommands.appendPlaylistCommands(null,
                                                   "soundcloud_cmd_download",
                                                   this.m_cmd_Download);
  this.m_soundcloudCommands.setVisibleCallback(plCmd_HideForToolbarCheck);
  this.m_mgr.publish("soundcloud-cmds@sb.com", this.m_soundcloudCommands);

  // Called when the play action is triggered
  function plCmd_Play_TriggerCallback(aContext, aSubMenuId, aCommandId, aHost) {
    // if something is selected, trigger the play event on the playlist
    if (plCmd_IsAnyTrackSelected(aContext, aSubMenuId, aCommandId, aHost)) {
      // Repurpose the command to act as a doubleclick
      unwrap(aContext.playlist).sendPlayEvent();
    }
  }

  // Called when the download action is triggered
  function plCmd_Download_TriggerCallback(aContext, aSubMenuId, aCommandId, aHost) {
    // if something is selected, trigger the download event on the playlist
    if (plCmd_IsAnyTrackSelected(aContext, aSubMenuId, aCommandId, aHost)) {
      var ddh = Cc["@songbirdnest.com/Songbird/DownloadDeviceHelper;1"]
                  .getService(Ci.sbIDownloadDeviceHelper);
      var downloadMediaList = ddh.getDownloadMediaList();
      var playlist = unwrap(aContext.playlist);
      var selectedEnum = playlist.mediaListView.selection.selectedIndexedMediaItems;
      while (selectedEnum.hasMoreElements()) {
        let curItem = selectedEnum.getNext();
        if (curItem) {
          let downloadURL = curItem.mediaItem.getProperty(SB_PROPERTY_DOWNLOAD_URL);
          if (downloadURL && downloadURL != "") {
            Cu.reportError(downloadURL);
            let item = CloudDirectory._library.createMediaItem(downloadURL);
            unwrap(downloadMediaList).downloadItem(item);
          }
        }
      }
    }
  }

  // Returns true when at least one track is selected in the playlist
  function plCmd_IsAnyTrackSelected(aContext, aSubMenuId, aCommandId, aHost) {
    return (unwrap(aContext.playlist).mediaListView.selection.count != 0);
  }

  function plCmd_HideForToolbarCheck(aContext, aHost) {
    return (aHost !== "toolbar");
  }

  // Bind the playlist widget to our library
  this._directory.bind(this._library.createView(), this.m_soundcloudCommands);

  // If this is the first time we've loaded the playlist, clear the 
  // normal columns and use the soundcloud ones
  if (!Application.prefs.getValue(initialized, false)) {
    Application.prefs.setValue(initialized, true);
    var colSpec = SBProperties.trackName + " 360 " +
                  SBProperties.duration + " 70 " +
                  SB_PROPERTY_USER + " 150 " +
                  SB_PROPERTY_PLAYS + " 60 " +
                  SB_PROPERTY_FAVS + " 60 " +
                  SBProperties.downloadButton + " 70 ";
    this._library.setProperty(SBProperties.columnSpec, colSpec);
    this._directory.clearColumns();
    this._directory.appendColumn(SBProperties.trackName, "360");
    this._directory.appendColumn(SBProperties.duration, "70");
    this._directory.appendColumn(SB_PROPERTY_USER, "150");
    this._directory.appendColumn(SB_PROPERTY_PLAYS, "60");
    this._directory.appendColumn(SB_PROPERTY_FAVS, "60");
    this._directory.appendColumn(SBProperties.downloadButton, "70");
  }
}

CloudDirectory.triggerSearch = function(event) {
  var self = this;

  // Reset the library
  this._library.clear();

  var query = encodeURIComponent(this._searchBox.value);
  var flags = {
    "q": query,
    "filter": "streamable",
    "offset": 0,
    "order": "hotness"
  };

  this._service.apiCall("tracks", flags, null);
}

CloudDirectory.onUnload = function() {
  if (this._directory) {
    this._directory.destroy();
    this._directory = null;
  }

  if (this._domEventListenerSet) {
    this._domEventListenerSet.removeAll();
    this._domEventListenerSet = null;
  }
}

/* Helper functions */
function unwrap(obj) {
  if (obj && obj.wrappedJSObject)
    obj = obj.wrappedJSObject;
  return obj;
}
