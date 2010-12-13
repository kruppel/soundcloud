var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu.import("resource://app/jsmodules/DOMUtils.jsm");
Cu.import("resource://app/jsmodules/SBDataRemoteUtils.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/WindowUtils.jsm");

if (typeof(gMM) == "undefined")
  var gMM = Cc["@songbirdnest.com/Songbird/Mediacore/Manager;1"]
              .getService(Ci.sbIMediacoreManager);

if (typeof SoundCloudWaveform == "undefined") {
  var SoundCloudWaveform = {};
}

SoundCloudWaveform.onLoad =
function SoundClouWaveform_onLoad() {
  var self = this;
  gMM.addListener(this);

  this._cursor = document.getElementById("wf-cursor");
  this._waveform = document.getElementById("waveform");

  this._currentItem = gMM.sequencer.currentItem;
  if (this._currentItem) {
    var img = this._currentItem.getProperty(SB_PROPERTY_WAVEFORM);
    if (img != null)
      this._waveform.src = img;
  }

  var dataRemoteListener = {
    observe: function(aSubject, aTopic, aData) {
      self.onPositionChanged();
    }
  };

  this.remote_position = SBNewDataRemote("metadata.position", null);
  this.remote_position.bindObserver(dataRemoteListener, true);
  this.remote_length = SBNewDataRemote("metadata.length", null);
  this.remote_length.bindObserver(dataRemoteListener, true);
}

SoundCloudWaveform.onPositionChanged =
function SoundCloudWaveform_onPositionChanged() {
  var percent = this.remote_position.intValue /
                this.remote_length.intValue *
                100;
  this._cursor.style.width = percent + "%";
}

SoundCloudWaveform.onMediacoreEvent =
function SoundCloudWaveform_onMediacoreEvent(aEvent) {
  switch(aEvent.type) {
    case Ci.sbIMediacoreEvent.BEFORE_TRACK_CHANGE:
      break;
    case Ci.sbIMediacoreEvent.TRACK_CHANGE:
      this._currentItem = gMM.sequencer.currentItem;
      var img = this._currentItem.getProperty(SB_PROPERTY_WAVEFORM);
      if (img != null)
        this._waveform.src = img;
      break;
    case Ci.sbIMediacoreEvent.SEQUENCE_CHANGE:
      dump("\nSEQUENCECHANGE\nposition: " + gMM.sequencer.viewPosition +
           "index: " + gMM.sequencer.currentItem + "\n");
      break;
    case Ci.sbIMediacoreEvent.VIEW_CHANGE:
      dump("\nVIEWCHANGE\nposition: " + gMM.sequencer.viewPosition +
           "index: " + gMM.sequencer.currentItem + "\n");
      break;
    default:
      break;
  }
}

SoundCloudWaveform.onUnload =
function SoundCloudWaveform_onUnload(aEvent) {
  gMM.removeListener(this);
}

window.addEventListener("load",
                        function(e) { SoundCloudWaveform.onLoad(e); }, false);
window.addEventListener("unload",
                        function(e) { SoundCloudWaveform.onUnload(e); }, false);
