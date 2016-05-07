const { storage } = require("sdk/simple-storage");
const base64 = require("sdk/base64");

const transition = {
    // change the old video storage model used in 1.0 to the new one
    // this function assumes the old model is in use.
    update_storage_model: () => {
        if (storage.backup) {  // we are downgrading from version 2.0 or above
            storage.videos = storage.backup;
            storage.backup = undefined;
            return;
        }
        if (Array.isArray(storage.videos)) {
            return;
        }
        let videos = [];
        for (let key in storage.videos) {
            videos = videos.concat(storage.videos[key]);
        }
        let durations = [];
        // copy video duration since api_util.activity.normalize wipes the
        // property to empty string
        for (let video of videos) {
            let video_duration = video.duration;
            if (video_duration === undefined) {
                video_duration = "";
            }
            durations.push(video_duration);
        }
        videos.map(api_util.activity.normalize);
        for (let i = 0; i < durations.length; i++) {
            videos[i].duration = durations[i];
        }
        storage.videos = videos;
    },
    // go back to the old model used by 1.0. This wipes currently unwatched
    // videos and clear the "video_count" property of every channel object.
    // The unwatched object would be stored in a property called "backup", so
    // versions > 1.0 can use that to downgrade more easily.
    revert_storage_model: () => {
        storage.backup = storage.videos;
        storage.videos = {};
        for (let channel of storage.subscriptions) {
            channel.video_count = 0;
        }
    },
    // returns whether the legacy (1.0) model is in use
    legacy_in_use: () => {
        return !Array.isArray(storage.videos);
    }
};