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

Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
Cu.import("resource://app/components/kPlaylistCommands.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");

if (typeof(mainWindow) == "undefined")
  var mainWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Ci.nsIWindowMediator)
                     .getMostRecentWindow("Songbird:Main").window;

if (typeof(gBrowser) == "undefined")
  var gBrowser = Cc["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Ci.nsIWindowMediator)
                   .getMostRecentWindow("Songbird:Main").window.gBrowser;

if (typeof(ioService) == "undefined")
  var ioService = Cc["@mozilla.org/network/io-service;1"]
                    .getService(Ci.nsIIOService);

if (typeof(gMetrics) == "undefined")
  var gMetrics = Cc["@songbirdnest.com/Songbird/Metrics;1"]
                   .createInstance(Ci.sbIMetrics);

const initialized = "extensions.soundcloud.library.plsinit";

if (typeof CloudDirectory == "undefined") {
  var CloudDirectory = {};
}

CloudDirectory.init = function() {
    this.radioLib =  null;
    this.tracksFound = 0;

    var servicePaneStrings = Cc["@mozilla.org/intl/stringbundle;1"]
        .getService(Ci.nsIStringBundleService)
        .createBundle("chrome://soundcloud/locale/overlay.properties");

    // Set the tab title
    document.title = servicePaneStrings.GetStringFromName("radioTabTitle");

    this._strings = document.getElementById("soundcloud-strings");

    this._service = Cc['@songbirdnest.com/soundcloud;1']
                      .getService().wrappedJSObject;

    // Setup SoundCloud references
    this.radioLib = this._service.library;

    // Bind the playlist widget to our library
    this.playlist = document.getElementById("soundcloud-directory");
    this.playlist.bind(this.radioLib.createView());

    // If this is the first time we've loaded the playlist, clear the 
    // normal columns and use the soundcloud ones
    if (!Application.prefs.getValue(initialized, false)) {
      Application.prefs.setValue(initialized, true);
      var colSpec = SOCL_title + " 358 " + SOCL_time + " 71 " +
                    SOCL_user + " 150 " + SOCL_plays + " 45 " +
                    SOCL_favs + " 45 ";// + SOCL_url + " 290 ";
      this.radioLib.setProperty(SBProperties.columnSpec, colSpec);
      this.playlist.clearColumns();
      this.playlist.appendColumn(SOCL_title, "358");
      this.playlist.appendColumn(SOCL_time, "71");
      this.playlist.appendColumn(SOCL_user, "150");
      this.playlist.appendColumn(SOCL_plays, "45");
      this.playlist.appendColumn(SOCL_favs, "45");
      //this.playlist.appendColumn(SOCL_dl, "60");
      //this.playlist.appendColumn(SOCL_url, "290");  
    }
}

CloudDirectory.unload = function() {
}

CloudDirectory.loadTable = function(trackList) {
    // Make the progress meter spin
    var el = mainWindow.document
                       .getElementById("sb-status-bar-status-progressmeter");
    el.mode = "undetermined";
 
    if (trackList != null) {
      var trackArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                         .createInstance(Ci.nsIMutableArray);
      var propertiesArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                              .createInstance(Ci.nsIMutableArray);

      for (var i=0; i<trackList.length; i++) {
        var title = trackList[i].title;
        var duration = trackList[i].duration * 1000;
        var username = trackList[i].user.username;
        var pcount = trackList[i].playback_count;
        var fcount = trackList[i].favoritings_count;
        var uri = trackList[i].uri;
        var streamURL = trackList[i].stream_url;
        var streamable = trackList[i].streamable;
        var downloadable = trackList[i].downloadable;

      if (!streamable) continue;

      var props =
          Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
            .createInstance(Ci.sbIMutablePropertyArray);

      props.appendProperty(SOCL_title, title);
      props.appendProperty(SOCL_time, duration);
      props.appendProperty(SOCL_user, username);
      props.appendProperty(SOCL_plays, pcount);
      props.appendProperty(SOCL_favs, fcount);
      /*
      if (downloadable) {
        var downloadURL = trackList[i].download_url;
        props.appendProperty("http://songbirdnest.com/data/1.0#downloadURL", downloadURL);
        props.appendProperty(SOCL_dl, "1|0|0");
        trackArray.appendElement(ioService.newURI(downloadURL, null, null),
                                 false);
       } else {
      */
      trackArray.appendElement(
        ioService.newURI(streamURL, null, null),
        false);
      //}

      propertiesArray.appendElement(props, false);
      /*
      trackArray.appendElement(
        ioService.newURI(soundcloudTrackURL, null, null),
        false);
      */
      }

      CloudDirectory.radioLib.batchCreateMediaItemsAsync(libListener,
                                                         trackArray, 
                                                         propertiesArray, false);
      /*
      var deck = document.getElementById("loading-deck");
      deck.selectedIndex = 1;
      */
    }
}

CloudDirectory.inputSearch = function(event) {
    var value = event.target.value; 
    document.getElementById("soundcloud-search-btn").disabled = value.length == 0;
}

CloudDirectory.getTracksFound = function() {
    return this.tracksFound;
}

CloudDirectory.setTracksFound = function(tracks) {
    this.tracksFound += tracks;
}

CloudDirectory.resetTracksFound = function() {
    this.tracksFound = 0;
}

CloudDirectory.triggerSearch = function(event) {
    if (event.keyCode == 13)
      document.getElementById('soundcloud-search-btn').click();
}

var libListener = {
  onProgress: function(i) {},
  onComplete: function(array, result) {
    // Reset the progress meter
    var el = mainWindow.document
                       .getElementById("sb-status-bar-status-progressmeter");
    el.mode = "";
    CloudDirectory.setTracksFound(array.length);

    SBDataSetStringValue("faceplate.status.type",
                         "playable");
				
    SBDataSetStringValue("faceplate.status.override.text",
                         CloudDirectory.getTracksFound() + " " +
                         CloudDirectory._strings.getString("tracksFound"));
				
  }
}
